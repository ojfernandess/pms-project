import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { improveSlug, slugFromName } from "@/lib/slugUtils";

export const useEstablishments = (companyId?: string) => {
  const queryClient = useQueryClient();

  const establishmentsQuery = useQuery({
    queryKey: ["establishments", companyId],
    queryFn: async () => {
      let query = supabase.from("establishments").select("*");

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query.order("name");

      if (error) {
        toast.error("Erro ao carregar estabelecimentos");
        throw error;
      }
      return data || [];
    },
    // Permitir buscar todos se não passar companyId (para Super Admin)
    enabled: true,
  });

  const createEstablishment = useMutation({
    mutationFn: async (establishment: {
      company_id: string;
      name: string;
      type: string;
      is_active?: boolean;
      manager_user_id?: string;
      slug?: string | null;
    }) => {
      // Buscar usuário logado (será usado como padrão se manager_user_id não for fornecido)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }
      
      // Determinar qual usuário será o gerente
      const managerUserId = establishment.manager_user_id || user.id;

      // Remover manager_user_id do objeto antes de inserir (não é uma coluna da tabela)
      const { manager_user_id, slug: rawSlug, ...rest } = establishment;
      let slug: string | null = rawSlug?.trim() ? improveSlug(rawSlug) : (establishment.name ? slugFromName(establishment.name) : null) || null;
      if (slug) {
        const { data: existing } = await supabase.from("establishments").select("id").eq("slug", slug).maybeSingle();
        if (existing) {
          let n = 2;
          while (true) {
            const { data: dup } = await supabase.from("establishments").select("id").eq("slug", `${slug}-${n}`).maybeSingle();
            if (!dup) { slug = `${slug}-${n}`; break; }
            n++;
          }
        }
      }
      const establishmentData = { ...rest, slug: slug || null };

      const { data, error } = await supabase
        .from("establishments")
        .insert([establishmentData])
        .select()
        .single();

      if (error) throw error;

      // Criar configurações iniciais do hotel com o nome do estabelecimento
      try {
        // Verificar se já existe configuração para este estabelecimento
        const { data: existingSettings } = await supabase
          .from("hotel_settings")
          .select("id")
          .eq("establishment_id", data.id)
          .maybeSingle();

        if (existingSettings) {
          // Atualizar se já existir
          await supabase
            .from("hotel_settings")
            .update({
              name: establishment.name,
              hotel_type: establishment.type,
            })
            .eq("id", existingSettings.id);
        } else {
          // Inserir se não existir
          await supabase.from("hotel_settings").insert([
            {
              establishment_id: data.id,
              name: establishment.name,
              hotel_type: establishment.type,
            },
          ]);
        }
      } catch (err: any) {
        // Ignorar erro de duplicata (409 Conflict ou 23505)
        if (err.code !== "23505" && err.code !== "PGRST204" && err.status !== 409) {
          console.warn("Erro ao criar configurações iniciais:", err);
        }
      }

      // Adicionar o usuário como gerente do estabelecimento
      try {
        // Buscar o role_id do gerente
        const { data: managerRole, error: roleError } = await supabase
          .from("employee_roles")
          .select("id")
          .eq("code", "manager")
          .single();

        if (roleError) {
          console.warn("Erro ao buscar role de gerente:", roleError);
        } else if (managerRole) {
          // Buscar dados do usuário selecionado (ou usuário logado) na tabela users
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("full_name, email, cpf, phone")
            .eq("id", managerUserId)
            .single();

          if (userError) {
            console.warn("Erro ao buscar dados do usuário:", userError);
          }

          // Buscar email do usuário
          let managerEmail = userData?.email;
          if (!managerEmail && managerUserId === user.id) {
            // Se for o usuário logado, usar o email do auth
            managerEmail = user.email;
          } else if (!managerEmail) {
            // Se não encontrar, usar um placeholder (o email deve estar na tabela users)
            managerEmail = "gerente@exemplo.com";
          }

          // Criar funcionário como gerente
          const { error: employeeError } = await supabase
            .from("employees")
            .insert([
              {
                user_id: managerUserId,
                establishment_id: data.id,
                role_id: managerRole.id,
                full_name: userData?.full_name || managerEmail || "Gerente",
                email: managerEmail,
                cpf: userData?.cpf || null,
                phone: userData?.phone || null,
                is_active: true,
              },
            ]);

          if (employeeError) {
            console.warn("Erro ao adicionar usuário como gerente:", employeeError);
            // Não lançar erro, apenas logar, pois o estabelecimento já foi criado
          }
        }
      } catch (err) {
        console.warn("Erro ao adicionar usuário como gerente:", err);
        // Não lançar erro, apenas logar, pois o estabelecimento já foi criado
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishments"] });
      queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Estabelecimento criado com sucesso! Você foi adicionado como gerente.");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar estabelecimento");
    },
  });

  const updateEstablishment = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      if (updates.slug !== undefined) {
        updates.slug = updates.slug?.trim() ? improveSlug(updates.slug) : null;
        if (updates.slug) {
          const { data: existing } = await supabase.from("establishments").select("id").eq("slug", updates.slug).neq("id", id).maybeSingle();
          if (existing) {
            let n = 2;
            while (true) {
              const { data: dup } = await supabase.from("establishments").select("id").eq("slug", `${updates.slug}-${n}`).neq("id", id).maybeSingle();
              if (!dup) { updates.slug = `${updates.slug}-${n}`; break; }
              n++;
            }
          }
        }
      }
      const { data, error } = await supabase
        .from("establishments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishments"] });
      toast.success("Estabelecimento atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar estabelecimento");
    },
  });

  const deleteEstablishment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("establishments").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishments"] });
      toast.success("Estabelecimento excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir estabelecimento");
    },
  });

  return {
    establishments: establishmentsQuery.data || [],
    isLoading: establishmentsQuery.isLoading,
    refetch: establishmentsQuery.refetch,
    createEstablishment: createEstablishment.mutateAsync,
    updateEstablishment: updateEstablishment.mutateAsync,
    deleteEstablishment: deleteEstablishment.mutateAsync,
    isCreating: createEstablishment.isPending,
  };
};

