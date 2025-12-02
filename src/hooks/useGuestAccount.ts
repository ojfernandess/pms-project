import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GuestAccount {
  id: string;
  email: string;
  phone?: string;
  full_name: string;
  document_type?: string;
  document_number?: string;
  birth_date?: string;
  is_verified: boolean;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const useGuestAccount = () => {
  const queryClient = useQueryClient();

  // Criar conta de hóspede
  const createAccount = useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      full_name: string;
      phone?: string;
      document_type?: string;
      document_number?: string;
      birth_date?: string;
    }) => {
      // Verificar se email já existe
      const { data: existing } = await supabase
        .from("guest_accounts")
        .select("id")
        .eq("email", data.email.toLowerCase().trim())
        .maybeSingle();

      if (existing) {
        throw new Error("Este email já está cadastrado");
      }

      // Gerar token de verificação
      const verificationToken = crypto.randomUUID();
      const verificationTokenExpires = new Date();
      verificationTokenExpires.setHours(verificationTokenExpires.getHours() + 24);

      // Chamar função RPC para criar conta (faz hash da senha no backend)
      const { data: account, error } = await supabase.rpc("create_guest_account", {
        p_email: data.email.toLowerCase().trim(),
        p_password: data.password,
        p_full_name: data.full_name.trim(),
        p_phone: data.phone?.trim() || null,
        p_document_type: data.document_type || null,
        p_document_number: data.document_number?.trim() || null,
        p_birth_date: data.birth_date || null,
        p_verification_token: verificationToken,
        p_verification_token_expires_at: verificationTokenExpires.toISOString(),
      });

      if (error) {
        console.error("Erro detalhado ao criar conta:", error);
        throw new Error(error.message || "Erro ao criar conta");
      }
      
      // A função RPC retorna um array, pegar o primeiro resultado
      const accountData = Array.isArray(account) ? account[0] : account;
      if (!accountData) {
        throw new Error("Erro ao criar conta");
      }
      
      return accountData;
    },
    onSuccess: () => {
      toast.success("Conta criada com sucesso! Verifique seu email para ativar.");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar conta");
    },
  });

  // Login de hóspede (retorna token de sessão)
  const login = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { data: account, error: fetchError } = await supabase
        .from("guest_accounts")
        .select("*")
        .eq("email", credentials.email.toLowerCase().trim())
        .maybeSingle();

      if (fetchError || !account) {
        throw new Error("Email ou senha incorretos");
      }

      // Verificar se conta está bloqueada
      if (account.locked_until && new Date(account.locked_until) > new Date()) {
        throw new Error("Conta temporariamente bloqueada. Tente novamente mais tarde.");
      }

      // Verificar senha via RPC (faz comparação no backend e já atualiza tentativas)
      const { data: isValidPassword, error: verifyError } = await supabase.rpc(
        "verify_guest_password",
        {
          p_account_id: account.id,
          p_password: credentials.password,
        }
      );

      if (verifyError) {
        throw new Error(verifyError.message || "Erro ao verificar senha");
      }

      if (!isValidPassword) {
        throw new Error("Email ou senha incorretos");
      }

      // Buscar conta atualizada após login bem-sucedido
      const { data: updatedAccount } = await supabase
        .from("guest_accounts")
        .select("*")
        .eq("id", account.id)
        .single();

      // Gerar token de sessão (simplificado - em produção usar JWT adequado)
      const sessionToken = crypto.randomUUID();
      
      // Armazenar token no localStorage
      localStorage.setItem("guest_session_token", sessionToken);
      localStorage.setItem("guest_account_id", updatedAccount?.id || account.id);

      return { account: updatedAccount || account, token: sessionToken };
    },
    onSuccess: () => {
      toast.success("Login realizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao fazer login");
    },
  });

  // Verificar sessão atual
  const getCurrentSession = () => {
    const token = localStorage.getItem("guest_session_token");
    const accountId = localStorage.getItem("guest_account_id");
    return { token, accountId };
  };

  // Buscar conta atual
  const getCurrentAccount = (accountId: string) => {
    return useQuery({
      queryKey: ["guest_account", accountId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("guest_accounts")
          .select("*")
          .eq("id", accountId)
          .maybeSingle();

        if (error) throw error;
        return data;
      },
      enabled: !!accountId,
    });
  };

  // Vincular reserva à conta (quando hóspede insere localizador)
  const linkReservationToAccount = useMutation({
    mutationFn: async ({
      accountId,
      reservationId,
      locator,
    }: {
      accountId: string;
      reservationId?: string;
      locator: string;
    }) => {
      let finalReservationId = reservationId;

      // Se não tiver reservationId, buscar pelo locator
      if (!finalReservationId && locator) {
        console.log("🔍 Buscando reserva pelo locator:", locator.trim());
        
        // PRIORIDADE 1: Buscar web_checkin pelo locator para obter reservation_id
        // Isso é mais seguro porque o web_checkin já tem validação de locator
        const { data: webCheckin, error: webCheckinError } = await supabase
          .from("web_checkin")
          .select("reservation_id")
          .eq("locator", locator.trim())
          .maybeSingle();

        if (webCheckinError) {
          console.error("❌ Erro ao buscar web_checkin:", webCheckinError);
          console.error("   Código:", webCheckinError.code);
          console.error("   Mensagem:", webCheckinError.message);
        }

        if (webCheckin?.reservation_id) {
          finalReservationId = webCheckin.reservation_id;
          console.log("✅ Reserva encontrada via web_checkin:", finalReservationId);
        } else {
          console.log("⚠️ Web_checkin não encontrado pelo locator, tentando buscar pela reservation_code");
          
          // PRIORIDADE 2: Tentar buscar diretamente pela reservation_code na tabela reservations
          // Isso só funcionará se a política RLS permitir (apenas se houver web_checkin associado)
          const { data: reservationByCode, error: reservationCodeError } = await supabase
            .from("reservations")
            .select("id")
            .eq("reservation_code", locator.trim())
            .maybeSingle();

          if (reservationCodeError) {
            console.error("❌ Erro ao buscar reserva por código:", reservationCodeError);
            console.error("   Código:", reservationCodeError.code);
            console.error("   Mensagem:", reservationCodeError.message);
            console.error("   Detalhes:", reservationCodeError.details);
          }

          if (reservationByCode?.id) {
            finalReservationId = reservationByCode.id;
            console.log("✅ Reserva encontrada via reservation_code:", finalReservationId);
          } else {
            console.warn("⚠️ Reserva não encontrada por nenhum método");
            console.warn("   Locator usado:", locator.trim());
            console.warn("   Verifique se:");
            console.warn("   1. O locator está correto");
            console.warn("   2. Existe um web_checkin para esta reserva");
            console.warn("   3. A política RLS permite acesso");
          }
        }
      }

      if (!finalReservationId) {
        console.error("❌ Nenhuma reserva encontrada para o localizador:", locator);
        throw new Error(`Reserva não encontrada para o localizador "${locator}". Verifique se o código está correto.`);
      }

      console.log("🔍 Buscando dados completos da reserva:", finalReservationId);

      // Buscar dados da reserva
      const { data: reservation, error: resError } = await supabase
        .from("reservations")
        .select(`
          id,
          checkin_date,
          checkout_date,
          total_amount,
          status,
          room_id,
          category_id,
          establishment_id,
          rooms(room_number),
          room_categories(name)
        `)
        .eq("id", finalReservationId)
        .maybeSingle();

      if (resError) {
        console.error("❌ Erro ao buscar dados da reserva:", resError);
        console.error("   Código:", resError.code);
        console.error("   Mensagem:", resError.message);
        console.error("   Detalhes:", resError.details);
        throw new Error(`Erro ao buscar reserva: ${resError.message || "Reserva não encontrada ou sem permissão de acesso"}`);
      }

      if (!reservation) {
        console.error("❌ Reserva não encontrada após busca:", finalReservationId);
        throw new Error(`Reserva não encontrada ou você não tem permissão para acessá-la. ID: ${finalReservationId}`);
      }

      console.log("✅ Reserva encontrada com sucesso:", reservation.id);

      // Verificar se já existe histórico para esta reserva
      const { data: existingHistory } = await (supabase as any)
        .from("guest_stay_history")
        .select("guest_account_id, id")
        .eq("reservation_id", finalReservationId)
        .maybeSingle();

      // VALIDAÇÃO DE SEGURANÇA: Se a reserva já está vinculada a outra conta, bloquear
      if (existingHistory && existingHistory.guest_account_id !== accountId) {
        throw new Error("Esta reserva já está vinculada a outra conta. Por questões de segurança, não é possível realizar o check-in.");
      }

      if (!existingHistory) {
        // Criar histórico de estada
        const { error: historyError } = await supabase
          .from("guest_stay_history")
          .insert({
            guest_account_id: accountId,
            reservation_id: finalReservationId,
            establishment_id: reservation.establishment_id,
            checkin_date: reservation.checkin_date,
            checkout_date: reservation.checkout_date,
            room_number: (reservation.rooms as any)?.room_number,
            room_category_name: (reservation.room_categories as any)?.name,
            total_amount: reservation.total_amount,
            status: reservation.status === "checkedin" ? "completed" : "pending",
          });

        if (historyError) {
          console.error("Erro ao criar histórico:", historyError);
        }
      }

      return { success: true, reservation };
    },
    onSuccess: () => {
      toast.success("Reserva vinculada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["guest_stay_history"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao vincular reserva");
    },
  });

  // Buscar histórico de estadas
  const getStayHistory = (accountId: string) => {
    return useQuery({
      queryKey: ["guest_stay_history", accountId],
      refetchInterval: 30000, // Refetch a cada 30 segundos para atualizar status
      refetchOnWindowFocus: true,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("guest_stay_history")
          .select(`
            *,
            establishment:establishments(name),
            reservation:reservations(reservation_code, status)
          `)
          .eq("guest_account_id", accountId)
          .order("checkin_date", { ascending: false });

        if (error) throw error;
        
        // Para cada estadia, buscar o status do web_checkin
        const staysWithCheckinStatus = await Promise.all(
          (data || []).map(async (stay: any) => {
            if (!stay.reservation_id) return stay;
            
            // Buscar web_checkin relacionado à reserva
            const { data: webCheckin } = await supabase
              .from("web_checkin")
              .select("status, created_at, updated_at")
              .eq("reservation_id", stay.reservation_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            
            // Buscar status atual da reserva e dados de pagamento, incluindo checkout_date atualizado
            const { data: reservationData } = await supabase
              .from("reservations")
              .select("status, paid_amount, total_amount, checkin_date, checkout_date")
              .eq("id", stay.reservation_id)
              .maybeSingle();
            
            // Buscar taxas da reserva
            const { data: serviceFees } = await supabase
              .from("reservation_service_fees")
              .select("amount, quantity")
              .eq("reservation_id", stay.reservation_id);
            
            const serviceFeesTotal = (serviceFees || []).reduce((sum: number, fee: any) => {
              return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
            }, 0);
            
            // Determinar o status final baseado em pagamento (mesma lógica do PMS)
            let finalStatus = stay.status;
            if (reservationData?.status === "cancelled") {
              finalStatus = "cancelled";
            } else {
              const paidAmount = Number(reservationData?.paid_amount || 0);
              const baseTotalAmount = Number(reservationData?.total_amount || 0);
              const totalAmount = baseTotalAmount + serviceFeesTotal;
              
              if (paidAmount === 0) {
                finalStatus = "unpaid";
              } else if (paidAmount >= totalAmount && totalAmount > 0) {
                finalStatus = "confirmed";
              } else if (paidAmount > 0) {
                finalStatus = "pending";
              }
            }
            
            return {
              ...stay,
              // Usar datas atualizadas da reserva (importante para extensões)
              checkin_date: reservationData?.checkin_date || stay.checkin_date,
              checkout_date: reservationData?.checkout_date || stay.checkout_date,
              status: finalStatus,
              paid_amount: reservationData?.paid_amount || 0,
              total_amount: reservationData?.total_amount || 0,
              reservation_service_fees: serviceFees || [],
              webCheckinStatus: webCheckin?.status || null,
              webCheckinCompletedAt: webCheckin?.status === "completed" ? webCheckin.updated_at : null,
              // Garantir que o status da reserva está atualizado
              reservation: {
                ...stay.reservation,
                status: reservationData?.status || stay.reservation?.status,
              },
            };
          })
        );
        
        return staysWithCheckinStatus;
      },
      enabled: !!accountId,
    });
  };

  // Atualizar perfil do hóspede
  const updateProfile = useMutation({
    mutationFn: async ({
      accountId,
      fullName,
      email,
      phone,
    }: {
      accountId: string;
      fullName: string;
      email: string;
      phone?: string | null;
    }) => {
      // Verificar se o email já está em uso por outra conta
      const { data: existingAccount } = await supabase
        .from("guest_accounts")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .neq("id", accountId)
        .maybeSingle();

      if (existingAccount) {
        throw new Error("Este email já está cadastrado em outra conta");
      }

      // Atualizar perfil
      const { data, error } = await supabase
        .from("guest_accounts")
        .update({
          full_name: fullName.trim(),
          email: email.toLowerCase().trim(),
          phone: phone?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message || "Erro ao atualizar perfil");
      }

      return data;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["guest_account"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar perfil");
    },
  });

  // Atualizar senha do hóspede
  const updatePassword = useMutation({
    mutationFn: async ({
      accountId,
      currentPassword,
      newPassword,
    }: {
      accountId: string;
      currentPassword: string;
      newPassword: string;
    }) => {
      // Verificar senha atual via RPC
      const { data: isValidPassword, error: verifyError } = await supabase.rpc(
        "verify_guest_password",
        {
          p_account_id: accountId,
          p_password: currentPassword,
        }
      );

      if (verifyError) {
        throw new Error(verifyError.message || "Erro ao verificar senha atual");
      }

      if (!isValidPassword) {
        throw new Error("Senha atual incorreta");
      }

      // Atualizar senha via RPC (faz hash da nova senha no backend)
      const { data, error } = await supabase.rpc("update_guest_password", {
        p_account_id: accountId,
        p_new_password: newPassword,
      });

      if (error) {
        throw new Error(error.message || "Erro ao atualizar senha");
      }

      // A função retorna um booleano, mas vamos retornar sucesso
      return { success: true };
    },
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao alterar senha");
    },
  });

  // Logout
  const logout = () => {
    localStorage.removeItem("guest_session_token");
    localStorage.removeItem("guest_account_id");
    queryClient.clear();
    toast.success("Logout realizado com sucesso!");
  };

  return {
    createAccount,
    login,
    getCurrentSession,
    getCurrentAccount,
    linkReservationToAccount,
    getStayHistory,
    updateProfile,
    updatePassword,
    logout,
  };
};

