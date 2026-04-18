import { Menu, User, Settings, LogOut, UserCircle, Building2, ChevronDown, Briefcase, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { LanguageSelector } from "./LanguageSelector";
import { useTranslation } from "react-i18next";
import { useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { useIsSuperAdmin } from "@/hooks/useUsers";
import { useUserCompanies } from "@/hooks/useUserCompanies";
import { useMemo } from "react";

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header = ({ onMenuClick }: HeaderProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment, establishments, setSelectedEstablishment } = useEstablishment();
  const { role } = useCurrentEmployeeRole();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { t } = useTranslation();
  const { userCompanies } = useUserCompanies();
  
  // Verificar se o usuário pode acessar configurações (apenas gerente ou super admin)
  const canAccessSettings = role?.code === "manager" || isSuperAdmin;
  
  // Usar establishmentId da URL ou do contexto (numeric_id)
  const currentEstablishmentId = establishmentId || (selectedEstablishment?.numeric_id?.toString());
  
  // Agrupar estabelecimentos por empresa
  const establishmentsByCompany = useMemo(() => {
    const grouped: Record<string, { company: any; establishments: Array<typeof selectedEstablishment> }> = {};
    
    establishments.forEach((est: any) => {
      if (!est.company_id) return;
      
      // Buscar a empresa correspondente
      const userCompany = userCompanies.find((uc: any) => uc.company_id === est.company_id);
      if (!userCompany?.companies) return;
      
      const company = userCompany.companies;
      
      if (!grouped[company.id]) {
        grouped[company.id] = {
          company,
          establishments: [],
        };
      }
      
      grouped[company.id].establishments.push(est);
    });
    
    return grouped;
  }, [establishments, userCompanies]);
  
  // Verificar se há mais de uma empresa com estabelecimentos
  const hasMultipleCompanies = Object.keys(establishmentsByCompany).length > 1;
  
  // Handler para trocar de estabelecimento
  const handleEstablishmentChange = (establishment: typeof selectedEstablishment) => {
    if (establishment) {
      setSelectedEstablishment(establishment);
      // Navegar para o dashboard do novo estabelecimento
      navigate(`/${establishment.numeric_id}`);
    }
  };
  
  // Extrair nome do usuário do email ou metadata
  const getUserName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return t("header.user");
  };

  // Obter iniciais para o avatar
  const getInitials = () => {
    const name = getUserName();
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const handleProfile = () => {
    if (currentEstablishmentId) {
      navigate(`/${currentEstablishmentId}/perfil`);
    } else {
      navigate("/user-dashboard");
    }
  };

  const handleSettings = () => {
    if (currentEstablishmentId) {
      navigate(`/${currentEstablishmentId}/configuracoes`);
    } else {
      navigate("/user-dashboard");
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSuperAdmin = () => {
    navigate("/super-admin");
  };
  
  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4 flex-1">
        <Button variant="ghost" size="icon" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        
        {/* Seletor de Estabelecimento */}
        {selectedEstablishment && establishments.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 h-9">
                <Building2 className="h-4 w-4" />
                <span className="font-medium">{selectedEstablishment.name}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={hasMultipleCompanies ? "w-72" : "w-56"}>
              <DropdownMenuLabel>
                {t("header.selectEstablishment") || "Selecionar Estabelecimento"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {hasMultipleCompanies ? (
                // Mostrar agrupado por empresa se houver múltiplas empresas
                Object.values(establishmentsByCompany).map(({ company, establishments: companyEstablishments }, companyIndex, companiesArray) => (
                  <div key={company.id}>
                    <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5" />
                        <span>{company.name}</span>
                      </div>
                    </DropdownMenuLabel>
                    {companyEstablishments.map((establishment) => (
                      <DropdownMenuItem
                        key={establishment.id}
                        onSelect={() => handleEstablishmentChange(establishment)}
                        className={`pl-6 ${selectedEstablishment.id === establishment.id ? "bg-accent" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>{establishment.name}</span>
                          {selectedEstablishment.id === establishment.id && (
                            <span className="ml-auto text-xs text-muted-foreground">✓</span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                    {companyIndex < companiesArray.length - 1 && (
                      <DropdownMenuSeparator />
                    )}
                  </div>
                ))
              ) : (
                // Mostrar lista simples se houver apenas uma empresa
                establishments.map((establishment) => (
                  <DropdownMenuItem
                    key={establishment.id}
                    onSelect={() => handleEstablishmentChange(establishment)}
                    className={selectedEstablishment.id === establishment.id ? "bg-accent" : ""}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <span>{establishment.name}</span>
                      {selectedEstablishment.id === establishment.id && (
                        <span className="ml-auto text-xs text-muted-foreground">✓</span>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <LanguageSelector />
        <NotificationsDropdown />
        
        {/* Botão Super Admin - apenas para super admins */}
        {isSuperAdmin && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSuperAdmin}
            className="h-9 w-9"
            title="Super Admin"
          >
            <Shield className="h-5 w-5 text-primary" />
          </Button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full h-9 w-9">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{getUserName()}</span>
                <span className="text-xs text-muted-foreground">{user?.email || t("header.noEmail")}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleProfile}>
              <UserCircle className="h-4 w-4 mr-2" />
              {t("header.myProfile")}
            </DropdownMenuItem>
            {canAccessSettings && (
              <DropdownMenuItem onSelect={handleSettings}>
                <Settings className="h-4 w-4 mr-2" />
                {t("header.settings")}
              </DropdownMenuItem>
            )}
            {canAccessSettings && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={handleSignOut} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              {t("header.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
