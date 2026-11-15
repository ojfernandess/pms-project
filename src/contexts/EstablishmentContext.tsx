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

  const { data: establishments = [], isLoading: establishmentsQueryLoading, refetch } = useQuery({
    queryKey: ["establishments", currentUserId],
    queryFn: async () => {
      // Buscar sessão primeiro (mais seguro que getUser direto)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) return [];

      const user = session.user;

      const { data: adminUser } = await supabase
        .from("admin_users")
        .select("is_super_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminUser?.is_super_admin === true) {
        const { data, error } = await supabase
          .from("establishments")
          .select("*")
          .eq("is_active", true)
          .order("name");

        if (error) throw error;
        return data || [];
      }

      // Primeiro, verificar se o usuário é funcionário (tem registros em employees)
      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("establishment_id")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (employeesError) {
        console.error("Erro ao buscar funcionários:", employeesError);
        // Se houver erro, continuar com a lógica antiga (proprietário)
      }

      // Se o usuário é funcionário, mostrar apenas estabelecimentos onde trabalha
      if (employees && employees.length > 0) {
        const establishmentIds = employees.map((emp: any) => emp.establishment_id);
        
        // Buscar apenas os estabelecimentos onde o usuário é funcionário
        const { data, error } = await supabase
          .from("establishments")
          .select("*")
          .in("id", establishmentIds)
          .eq("is_active", true)
          .order("name");

        if (error) throw error;
        return data || [];
      }

      // Se não é funcionário, buscar estabelecimentos das empresas do usuário (proprietário)
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
    retry: 1,
  });

  const selectedEstablishment =
    directlySelectedEstablishment ||
    establishments.find((e) => e.id === selectedEstablishmentId) ||
    null;

  const isLoading = !!currentUserId && establishmentsQueryLoading && !selectedEstablishment;

  // Verificar se o estabelecimento selecionado pertence ao usuário atual
  useEffect(() => {
    if (selectedEstablishmentId && establishments.length > 0) {
      const establishmentExists = establishments.some((e) => e.id === selectedEstablishmentId);
      if (!establishmentExists && directlySelectedEstablishment?.id !== selectedEstablishmentId) {
        setSelectedEstablishmentId(null);
        localStorage.removeItem("selectedEstablishmentId");
      }
    }
  }, [selectedEstablishmentId, establishments, directlySelectedEstablishment]);

  // Quando a lista carregar, trocar o snapshot direto pela linha da lista (dados frescos)
  useEffect(() => {
    if (!directlySelectedEstablishment || establishments.length === 0) return;
    const foundInList = establishments.find((e) => e.id === directlySelectedEstablishment.id);
    if (foundInList) {
      setDirectlySelectedEstablishment(null);
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

