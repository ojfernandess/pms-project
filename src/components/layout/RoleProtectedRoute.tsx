import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { useIsSuperAdmin } from "@/hooks/useUsers";
import { getFeatureFromPath, checkPermission } from "@/lib/permissions";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface RoleProtectedRouteProps {
  children: ReactNode;
}

export const RoleProtectedRoute = ({ children }: RoleProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { role, customPermissions, isLoading: roleLoading } = useCurrentEmployeeRole();
  const { isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasChecked, setHasChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    setHasChecked(false);
    setHasAccess(false);
  }, [location.pathname]);
  
  // Para rotas sem establishmentId (como /motor-reservas/configuracoes), buscar role de qualquer estabelecimento
  const isCompanyLevelRoute = location.pathname === "/motor-reservas/configuracoes" || 
                               location.pathname === "/pagina-publica/configuracoes";
  
  const { data: fallbackRole, isLoading: isLoadingFallbackRole } = useQuery({
    queryKey: ["fallback_employee_role", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Buscar qualquer employee ativo do usuário para obter o role
      const { data: employee, error } = await supabase
        .from("employees")
        .select(`
          *,
          employee_roles (*)
        `)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error("Erro ao buscar role fallback:", error);
        return null;
      }
      
      return employee as any;
    },
    enabled: isCompanyLevelRoute && !role && !!user?.id,
  });
  
  // Usar role do contexto ou fallback para rotas de empresa
  const effectiveRole = role || (isCompanyLevelRoute ? fallbackRole?.employee_roles : null);
  const effectiveCustomPermissions = customPermissions || (isCompanyLevelRoute ? fallbackRole?.custom_permissions : null);
  const effectiveRoleLoading = roleLoading || (isCompanyLevelRoute && isLoadingFallbackRole);

  useEffect(() => {
    if (authLoading || effectiveRoleLoading || superAdminLoading) return;

    // Se não estiver autenticado, redirecionar para login
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    // Super Admin tem acesso a tudo (exceto rotas específicas que serão verificadas)
    if (isSuperAdmin) {
      setHasAccess(true);
      setHasChecked(true);
      return;
    }

    // Verificar se a rota requer permissão específica
    const feature = getFeatureFromPath(location.pathname);
    
    // Se não tiver feature mapeada, permitir acesso (rotas públicas ou especiais)
    if (!feature) {
      setHasAccess(true);
      setHasChecked(true);
      return;
    }

    // REGRA ESPECIAL: Proprietários sempre têm acesso ao dashboard do proprietário
    if (feature === "owner_dashboard" && effectiveRole && effectiveRole.code === "owner") {
      setHasAccess(true);
      setHasChecked(true);
      return;
    }

    // Verificar permissão
    if (!effectiveRole) {
      // Se não tiver role e não for super admin, redirecionar
      setHasAccess(false);
      setHasChecked(true);
      // Redirecionar após um pequeno delay para mostrar mensagem
      setTimeout(() => {
        navigate("/user-dashboard", { replace: true });
      }, 2000);
        return;
      }

    // REGRA ESPECIAL: Motor de Reservas e Página Pública de Reservas
    // Essas são páginas de configuração de funcionalidades ativas
    // Permitir acesso se:
    // 1. Tiver permissão específica para a feature, OU
    // 2. Tiver permissão de "settings", OU
    // 3. For gerente (manager) - gerentes sempre têm acesso a configurações
    // 4. Tiver qualquer role válido (já que são páginas de configuração acessíveis a partir de Settings)
    if (feature === "booking_engine" || feature === "public_reservation_page") {
      // Gerentes sempre têm acesso
      if (effectiveRole && effectiveRole.code === "manager") {
        setHasAccess(true);
        setHasChecked(true);
        return;
      }
      
      // Se tiver role válido, permitir acesso (essas são páginas de configuração)
      // O acesso já foi validado na página de Settings
      if (effectiveRole) {
        // Verificar se tem permissão específica para essa feature
        const specificAccess = checkPermission(effectiveRole, feature, undefined, effectiveCustomPermissions);
        
        if (specificAccess) {
          setHasAccess(true);
          setHasChecked(true);
          return;
        }
        
        // Verificar permissão de "settings" como fallback
        const settingsAccess = checkPermission(effectiveRole, "settings", undefined, effectiveCustomPermissions);
        
        if (settingsAccess) {
          setHasAccess(true);
          setHasChecked(true);
          return;
        }
        
        // Se tiver role mas não tiver permissão específica nem de settings,
        // ainda permitir acesso (essas são páginas de configuração de funcionalidades)
        // que podem ser acessadas por qualquer usuário autenticado com role
        setHasAccess(true);
        setHasChecked(true);
        return;
      }
      
      // Se não tiver role, negar acesso
      setHasAccess(false);
      setHasChecked(true);
      setTimeout(() => {
        navigate("/user-dashboard", { replace: true });
      }, 2000);
      return;
    }

    // CRM: qualquer sub-rota aceita permissão `crm` (feature flag da empresa é checada no CrmFeatureGate)
    let access = checkPermission(effectiveRole, feature, undefined, effectiveCustomPermissions);
    if (!access && (feature === "crm" || feature.startsWith("crm_"))) {
      access = checkPermission(effectiveRole, "crm", undefined, effectiveCustomPermissions);
    }
    setHasAccess(access);
    setHasChecked(true);
    
    if (!access) {
      // Redirecionar após um pequeno delay para mostrar mensagem
      setTimeout(() => {
        navigate("/user-dashboard", { replace: true });
      }, 2000);
    }
  }, [user, authLoading, effectiveRoleLoading, superAdminLoading, effectiveRole, effectiveCustomPermissions, isSuperAdmin, location.pathname, navigate]);

  if (authLoading || effectiveRoleLoading || superAdminLoading || !hasChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Super Admin sempre tem acesso
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Se não tem acesso, mostrar mensagem de erro
    if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-destructive" />
          <h2 className="text-2xl font-bold mb-2">Acesso Negado</h2>
          <p className="text-muted-foreground mb-4">
            Você não tem permissão para acessar esta página.
          </p>
          <p className="text-sm text-muted-foreground">
            Redirecionando...
          </p>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};


