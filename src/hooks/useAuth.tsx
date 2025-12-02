import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    // Buscar sessão inicial
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return;
        
        if (error) {
          console.error("Erro ao buscar sessão:", error);
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((error) => {
        if (!mounted) return;
        console.error("Erro inesperado ao buscar sessão:", error);
        setSession(null);
        setUser(null);
        setLoading(false);
      });

    // Configurar listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        try {
          // Limpar dados do usuário anterior quando fizer logout ou trocar de usuário
          if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && user && session?.user?.id !== user.id)) {
            // Limpar localStorage
            localStorage.removeItem("selectedEstablishmentId");
            // Limpar todas as queries do React Query
            queryClient.clear();
          }
          
          // Atualizar sessão e usuário
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);

          // Se o token foi renovado, garantir que a sessão está atualizada
          if (event === "TOKEN_REFRESHED" && session) {
            // A sessão já foi atualizada acima, apenas garantir que está sincronizada
            console.log("Token renovado com sucesso");
          }
        } catch (error) {
          console.error("Erro no listener de autenticação:", error);
          if (!mounted) return;
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [user, queryClient]);

  const signOut = async () => {
    // Limpar localStorage antes de fazer logout
    localStorage.removeItem("selectedEstablishmentId");
    // Limpar todas as queries do React Query
    queryClient.clear();
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return { user, session, loading, signOut };
};
