import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Establishment {
  id: string;
  numeric_id: number;
  name: string;
  type: string;
  company_id: string;
  is_active: boolean;
}

interface Company {
  id: string;
  name: string;
  cnpj?: string;
  email?: string;
  is_active: boolean;
}

interface EstablishmentContextType {
  selectedEstablishment: Establishment | null;
  setSelectedEstablishment: (establishment: Establishment | null) => void;
  establishments: Establishment[];
  isLoading: boolean;
  refetch: () => void;
}

const EstablishmentContext = createContext<EstablishmentContextType | undefined>(undefined);

export const EstablishmentProvider = ({ children }: { children: ReactNode }) => {
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string | null>(null);
  // Armazenar o estabelecimento completo quando selecionado diretamente
  // Isso garante que o estabelecimento esteja disponível mesmo antes de estar na lista
  const [directlySelectedEstablishment, setDirectlySelectedEstablishment] = useState<Establishment | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);

  // Inicializar e monitorar mudanças de autenticação
  useEffect(() => {
    let mounted = true;

    // Buscar sessão inicial primeiro (mais seguro que getUser direto)
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return;
        
        if (error) {
          // Se não há sessão, isso é esperado quando o usuário não está logado
          // Não logar como erro, apenas definir userId como null
          setCurrentUserId(null);
          previousUserIdRef.current = null;
          return;
        }

        const userId = session?.user?.id || null;
        previousUserIdRef.current = userId;
        setCurrentUserId(userId);
        
        // Se há um usuário, tentar carregar estabelecimento do localStorage
        if (userId) {
          try {
            const storedId = localStorage.getItem("selectedEstablishmentId");
            if (storedId) {
              setSelectedEstablishmentId(storedId);
            }
          } catch (error) {
            console.error("Erro ao acessar localStorage:", error);
          }
        }
      })
      .catch((error) => {
        if (!mounted) return;
        // Se não há sessão, isso é esperado quando o usuário não está logado
        // Não logar como erro crítico, apenas definir userId como null
        setCurrentUserId(null);
        previousUserIdRef.current = null;
      });

    // Listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      try {
        const userId = session?.user?.id || null;
        const previousUserId = previousUserIdRef.current;
        
        if (event === "SIGNED_OUT") {
          // Limpar tudo ao fazer logout
          setSelectedEstablishmentId(null);
          setDirectlySelectedEstablishment(null);
          try {
            localStorage.removeItem("selectedEstablishmentId");
          } catch (error) {
            console.error("Erro ao limpar localStorage:", error);
          }
          setCurrentUserId(null);
          previousUserIdRef.current = null;
        } else if (event === "SIGNED_IN") {
          // Se é um novo login (usuário diferente), limpar estabelecimento
          if (previousUserId && userId !== previousUserId) {
            setSelectedEstablishmentId(null);
            setDirectlySelectedEstablishment(null);
            try {
              localStorage.removeItem("selectedEstablishmentId");
            } catch (error) {
              console.error("Erro ao limpar localStorage:", error);
            }
          }
          setCurrentUserId(userId);
          previousUserIdRef.current = userId;
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          setCurrentUserId(session.user.id);
          previousUserIdRef.current = session.user.id;
        }
      } catch (error) {
        console.error("Erro no listener de autenticação do EstablishmentContext:", error);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // Executar apenas uma vez na montagem

  const { data: establishments = [], isLoading, refetch } = useQuery({
    queryKey: ["establishments", currentUserId],
    queryFn: async () => {
      // Buscar sessão primeiro (mais seguro que getUser direto)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) return [];

      const user = session.user;

      // Buscar empresas do usuário
      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select("company_id")
        .eq("user_id", user.id);

      if (userCompaniesError) throw userCompaniesError;
      if (!userCompanies || userCompanies.length === 0) return [];

      const companyIds = userCompanies.map((uc: any) => uc.company_id);

      // Buscar estabelecimentos das empresas do usuário
      const { data, error } = await supabase
        .from("establishments")
        .select("*")
        .in("company_id", companyIds)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUserId, // Só executar se houver um usuário logado
  });

  // Verificar se o estabelecimento selecionado pertence ao usuário atual
  useEffect(() => {
    if (selectedEstablishmentId && establishments.length > 0) {
      const establishmentExists = establishments.some((e) => e.id === selectedEstablishmentId);
      if (!establishmentExists) {
        // O estabelecimento selecionado não pertence ao usuário atual, limpar
        setSelectedEstablishmentId(null);
        localStorage.removeItem("selectedEstablishmentId");
      }
    }
  }, [selectedEstablishmentId, establishments]);

  // Se houver um estabelecimento selecionado diretamente, usar ele
  // Caso contrário, buscar na lista de estabelecimentos
  const selectedEstablishment = directlySelectedEstablishment || 
    establishments.find((e) => e.id === selectedEstablishmentId) || 
    null;
  
  // Quando a lista de estabelecimentos for carregada, verificar se o estabelecimento
  // selecionado diretamente está na lista e atualizar se necessário
  useEffect(() => {
    if (directlySelectedEstablishment && establishments.length > 0) {
      const foundInList = establishments.find((e) => e.id === directlySelectedEstablishment.id);
      if (foundInList) {
        // O estabelecimento está na lista, podemos usar o da lista
        // Isso garante que temos os dados mais atualizados
        setDirectlySelectedEstablishment(null);
      }
    }
  }, [directlySelectedEstablishment, establishments]);

  useEffect(() => {
    if (selectedEstablishmentId) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishmentId);
    } else {
      localStorage.removeItem("selectedEstablishmentId");
    }
  }, [selectedEstablishmentId]);

  const setSelectedEstablishment = (establishment: Establishment | null) => {
    if (establishment) {
      setSelectedEstablishmentId(establishment.id);
      // Armazenar o estabelecimento completo para uso imediato
      // Isso garante que o menu seja carregado mesmo antes da lista ser atualizada
      setDirectlySelectedEstablishment(establishment);
    } else {
      setSelectedEstablishmentId(null);
      setDirectlySelectedEstablishment(null);
    }
  };

  return (
    <EstablishmentContext.Provider
      value={{
        selectedEstablishment,
        setSelectedEstablishment,
        establishments,
        isLoading,
        refetch,
      }}
    >
      {children}
    </EstablishmentContext.Provider>
  );
};

export const useEstablishment = () => {
  const context = useContext(EstablishmentContext);
  if (context === undefined) {
    throw new Error("useEstablishment must be used within an EstablishmentProvider");
  }
  return context;
};

