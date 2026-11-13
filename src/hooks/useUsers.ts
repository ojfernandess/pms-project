import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useUsers = () => {
  const queryClient = useQueryClient();

  // Verificar se é super admin antes de buscar usuários
  const checkIsSuperAdmin = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return false;
      }

      const { data: adminUser, error } = await supabase
        .from("admin_users")
        .select("is_super_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao verificar super admin:", error);
        return false;
      }

      const isAdmin = adminUser?.is_super_admin === true;
      return isAdmin;
    } catch (error) {
      console.error("Erro na verificação de super admin:", error);
      return false;
    }
  };

  // Buscar todos os usuários da tabela public.users (apenas para super admins)
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      // Verificar se é super admin
      const isAdmin = await checkIsSuperAdmin();
      if (!isAdmin) {
        // Retornar array vazio em vez de lançar erro para não quebrar a UI
        return [];
      }

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao carregar usuários:", error);
        // Se for erro de permissão ou tabela não existe, retornar array vazio
        if (error.code === "PGRST116" || error.message?.includes("permission denied")) {
          console.warn("Tabela users pode não existir ou não ter permissão de acesso");
          return [];
        }
        throw error;
      }
      return data || [];
    },
    retry: false,
  });

  // Criar usuário via signup (que será sincronizado automaticamente via trigger)
  const createUser = useMutation({
    mutationFn: async ({
      email,
      password,
      full_name,
      cpf,
      phone,
      address,
      city,
      state,
      postal_code,
      country,
      birth_date,
      user_metadata,
    }: {
      email: string;
      password: string;
      full_name?: string;
      cpf?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
      birth_date?: string;
      user_metadata?: any;
    }) => {
      // Verificar se é super admin
      const isAdmin = await checkIsSuperAdmin();
      if (!isAdmin) {
        throw new Error("Acesso negado. Apenas super admins podem criar usuários.");
      }

      // Preparar user_metadata com nome completo
      const metadata = {
        ...user_metadata,
        full_name: full_name || undefined,
      };

      // Criar usuário via signup (requer confirmação de email desabilitada ou email já confirmado)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: metadata,
        },
      });

      if (error) throw error;
      
      // Aguardar um pouco para o trigger sincronizar
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Atualizar a tabela users com os dados de perfil
      if (data.user) {
        const profileData: any = {};
        if (full_name) profileData.full_name = full_name;
        if (cpf) profileData.cpf = cpf;
        if (phone) profileData.phone = phone;
        if (address) profileData.address = address;
        if (city) profileData.city = city;
        if (state) profileData.state = state;
        if (postal_code) profileData.postal_code = postal_code;
        if (country) profileData.country = country;
        if (birth_date) profileData.birth_date = birth_date;

        // Atualizar o registro na tabela users com os dados de perfil
        if (Object.keys(profileData).length > 0) {
          const { error: updateError } = await supabase
            .from("users")
            .update(profileData)
            .eq("id", data.user.id);

          if (updateError) {
            console.error("Erro ao atualizar perfil do usuário:", updateError);
          }
        }

        // Buscar o usuário criado na tabela public.users
        const { data: userData, error: fetchError } = await supabase
          .from("users")
          .select("*")
          .eq("id", data.user.id)
          .single();
        
        if (fetchError) throw fetchError;
        return userData;
      }
      
      throw new Error("Usuário criado mas não encontrado na tabela");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar usuário");
    },
  });

  // Atualizar usuário
  const updateUser = useMutation({
    mutationFn: async ({
      id,
      email,
      password,
      full_name,
      cpf,
      phone,
      address,
      city,
      state,
      postal_code,
      country,
      birth_date,
      user_metadata,
    }: {
      id: string;
      email?: string;
      password?: string;
      full_name?: string;
      cpf?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
      birth_date?: string;
      user_metadata?: any;
    }) => {
      // Verificar se é super admin
      const isAdmin = await checkIsSuperAdmin();
      if (!isAdmin) {
        throw new Error("Acesso negado. Apenas super admins podem atualizar usuários.");
      }

      // Atualizar dados na tabela public.users
      const updateData: any = {};
      if (email) updateData.email = email;
      if (full_name !== undefined) updateData.full_name = full_name;
      if (cpf !== undefined) updateData.cpf = cpf;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (city !== undefined) updateData.city = city;
      if (state !== undefined) updateData.state = state;
      if (postal_code !== undefined) updateData.postal_code = postal_code;
      if (country !== undefined) updateData.country = country;
      if (birth_date !== undefined) updateData.birth_date = birth_date;

      const { data, error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Atualizar senha se fornecida
      if (password && password.trim() !== "") {
        try {
          // Buscar o email do usuário para usar na atualização
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("email")
            .eq("id", id)
            .single();

          if (userError || !userData?.email) {
            throw new Error("Não foi possível encontrar o email do usuário");
          }

          // Usar a API Admin do Supabase para atualizar a senha
          // Chamar a API Admin através de uma requisição HTTP
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) throw new Error("Sessão expirada. Entre novamente para alterar a senha.");
          const response = await fetch(`${String(import.meta.env.VITE_PMS_API_URL || "").replace(/\/$/, "")}/auth/users/${id}/password`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ password }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Erro ao atualizar senha: ${response.status} ${response.statusText}`);
          }

          const result = await response.json();
          
          if (!result || !result.id) {
            throw new Error("Falha ao atualizar senha. Resposta inválida da API.");
          }

          toast.success("Senha atualizada com sucesso!");
        } catch (passwordUpdateError: any) {
          // Se falhar, ainda atualizamos os outros dados, mas avisamos sobre a senha
          console.error("Erro ao atualizar senha:", passwordUpdateError);
          toast.error("Dados atualizados, mas não foi possível atualizar a senha: " + (passwordUpdateError.message || "Erro desconhecido"));
        }
      }
      
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      // A mensagem de sucesso da senha já foi mostrada acima, se a senha foi atualizada
      if (!variables.password || variables.password.trim() === "") {
        toast.success("Usuário atualizado com sucesso!");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar usuário");
    },
  });

  // Deletar usuário (apenas da tabela public.users, o usuário do auth precisa ser deletado via Service Role)
  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      // Verificar se é super admin
      const isAdmin = await checkIsSuperAdmin();
      if (!isAdmin) {
        throw new Error("Acesso negado. Apenas super admins podem deletar usuários.");
      }

      // Deletar da tabela public.users (o CASCADE vai deletar automaticamente se configurado)
      const { error } = await supabase
        .from("users")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Nota: Deletar do auth.users requer Service Role
      // Por enquanto, apenas deletamos da tabela public.users
      console.warn("Deleção completa do usuário requer permissões de Service Role. O usuário foi removido da tabela public.users, mas pode ainda existir em auth.users.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir usuário");
    },
  });

  return {
    users: usersQuery.data || [],
    isLoading: usersQuery.isLoading,
    refetch: usersQuery.refetch,
    createUser: createUser.mutateAsync,
    updateUser: updateUser.mutateAsync,
    deleteUser: deleteUser.mutateAsync,
    isCreating: createUser.isPending,
  };
};

// Hook para verificar se é Super Admin
export const useIsSuperAdmin = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["is_super_admin"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: adminUser, error } = await supabase
        .from("admin_users")
        .select("is_super_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      // Se não encontrar registro ou houver erro, não é super admin
      if (error || !adminUser) return false;
      return adminUser.is_super_admin === true;
    },
  });

  return { isSuperAdmin: data || false, isLoading };
};

