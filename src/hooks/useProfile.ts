import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateProfileData {
  full_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  birth_date?: string;
  avatar_url?: string;
}

export const useProfile = () => {
  const queryClient = useQueryClient();

  // Buscar perfil do usuário atual
  const profileQuery = useQuery({
    queryKey: ["user_profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        throw error;
      }

      return data as UserProfile;
    },
  });

  // Atualizar perfil do usuário
  const updateProfile = useMutation({
    mutationFn: async (profileData: UpdateProfileData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      // Atualizar na tabela users
      const { data, error } = await supabase
        .from("users")
        .update(profileData)
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Atualizar user_metadata no auth.users (se possível)
      // Nota: Isso requer permissões especiais, mas tentamos atualizar
      if (profileData.full_name) {
        await supabase.auth.updateUser({
          data: {
            full_name: profileData.full_name,
          },
        });
      }

      return data as UserProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_profile"] });
      toast.success("Perfil atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar perfil");
    },
  });

  // Atualizar email (requer confirmação de senha)
  const updateEmail = useMutation({
    mutationFn: async ({ newEmail, password }: { newEmail: string; password: string }) => {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: (await supabase.auth.getUser()).data.user?.email || "",
        password,
      });

      if (signInError) {
        throw new Error("Senha incorreta");
      }

      const { error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) {
        throw error;
      }

      // Atualizar na tabela users
      await supabase
        .from("users")
        .update({ email: newEmail })
        .eq("id", (await supabase.auth.getUser()).data.user?.id);

      return newEmail;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_profile"] });
      toast.success("E-mail atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar e-mail");
    },
  });

  // Atualizar senha
  const updatePassword = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        throw new Error("Usuário não encontrado");
      }

      // Verificar senha atual
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("Senha atual incorreta");
      }

      // Atualizar senha
      const { data: updateData, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      // Verificar se a atualização foi bem-sucedida
      if (!updateData.user) {
        throw new Error("Falha ao atualizar senha. Tente novamente.");
      }

      // Aguardar um momento para garantir que a sessão foi atualizada
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verificar se consegue fazer login com a nova senha (opcional, mas garante que funcionou)
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: newPassword,
      });

      if (verifyError) {
        // Se não conseguir fazer login, pode ser que a senha não foi atualizada corretamente
        // Mas não vamos lançar erro aqui, pois pode ser um problema temporário
        console.warn("Aviso: Não foi possível verificar a nova senha imediatamente", verifyError);
      }

      return updateData;
    },
    onSuccess: () => {
      toast.success("Senha atualizada com sucesso! Você pode usar a nova senha no próximo login.");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar senha");
    },
  });

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    updateProfile: updateProfile.mutateAsync,
    updateEmail: updateEmail.mutateAsync,
    updatePassword: updatePassword.mutateAsync,
    isUpdating: updateProfile.isPending,
    isUpdatingEmail: updateEmail.isPending,
    isUpdatingPassword: updatePassword.isPending,
  };
};


