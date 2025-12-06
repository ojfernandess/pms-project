import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Bed, 
  Calendar, 
  Users, 
  DollarSign, 
  Settings,
  Building2,
  ClipboardList,
  Wrench,
  Network,
  Shield,
  UserCog,
  FileText,
  BookOpen
} from "lucide-react";
import { NavLink, useParams } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUsers";
import { useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { checkPermission } from "@/lib/permissions";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useCompanyPmsCustomization } from "@/hooks/useCompanyPmsCustomization";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const getMenuItems = (t: (key: string) => string) => [
  { icon: LayoutDashboard, label: t("sidebar.dashboard"), path: "/", feature: "dashboard" },
  { icon: Bed, label: t("sidebar.occupancyMap"), path: "/ocupacao", feature: "occupancy_map" },
  { icon: Calendar, label: t("sidebar.reservations"), path: "/reservas", feature: "reservations" },
  { icon: Users, label: t("sidebar.clients"), path: "/clientes", feature: "clients" },
  { icon: Building2, label: t("sidebar.units"), path: "/unidades", feature: "units" },
  { icon: DollarSign, label: t("sidebar.financial"), path: "/financeiro", feature: "financial" },
  { icon: ClipboardList, label: t("sidebar.pricing"), path: "/tarifario", feature: "pricing" },
  { icon: Wrench, label: t("sidebar.maintenance"), path: "/manutencao", feature: "maintenance" },
  { icon: Network, label: t("sidebar.channelManager"), path: "/channel-manager", feature: "channel_manager" },
  { icon: FileText, label: t("sidebar.logs"), path: "/logs", feature: "logs" },
  { icon: Settings, label: t("sidebar.settings"), path: "/configuracoes", feature: "settings" },
  { icon: UserCog, label: t("sidebar.employees"), path: "/funcionarios", feature: "employees" },
  { icon: Building2, label: t("sidebar.myCompanies"), path: "/user-dashboard", feature: "user_dashboard" },
  { icon: BookOpen, label: "Documentação", path: "/documentation", feature: "documentation" },
];

export const Sidebar = ({ isOpen }: SidebarProps) => {
  const { isSuperAdmin } = useIsSuperAdmin();
  const { role, customPermissions } = useCurrentEmployeeRole();
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const { settings } = useSiteSettings();
  const { pmsLogoUrl, pmsCustomName, hasCustomization } = useCompanyPmsCustomization();
  const { t } = useTranslation();
  
  // Usar establishmentId da URL ou do contexto (numeric_id)
  const currentEstablishmentId = establishmentId || (selectedEstablishment?.numeric_id?.toString());
  
  // Se houver customização, usar apenas ela (sem fallback para site_settings)
  // Se não houver customização, usar site_settings
  const displayLogo = hasCustomization 
    ? (pmsLogoUrl || null)  // Se há customização, usar logo customizada ou null
    : (settings?.logo_url || null);  // Se não há customização, usar site_settings
  
  const displayName = hasCustomization
    ? (pmsCustomName || "PMS")  // Se há customização, usar nome customizado ou "PMS"
    : (settings?.site_title?.split(" - ")[0] || "PMS");  // Se não há customização, usar site_settings
  
  // Obter itens do menu com traduções
  const allMenuItems = getMenuItems(t);
  
  // Filtrar itens do menu baseado nas permissões
  const menuItems = allMenuItems.filter((item) => {
    // Super Admin tem acesso a tudo (exceto super-admin que é tratado separadamente)
    if (isSuperAdmin) {
      return item.path !== "/super-admin";
    }

    // Se não tiver role, não mostrar nada (exceto user-dashboard)
    if (!role) {
      return item.path === "/user-dashboard";
    }

    // Verificar permissão específica
    if (item.feature === "employees") {
      // Apenas gerentes podem ver funcionários
      return role.code === "manager";
    }

    if (item.feature === "logs") {
      // Gerentes e super admins podem ver logs
      return role.code === "manager" || isSuperAdmin;
    }

    if (item.feature === "settings") {
      // Apenas gerentes e super admins podem ver configurações
      return role.code === "manager" || isSuperAdmin;
    }

    if (item.feature === "user_dashboard") {
      // Sempre mostrar user-dashboard
      return true;
    }

    // Verificar permissão para o recurso (usando customPermissions se disponível)
    return checkPermission(role, item.feature, undefined, customPermissions);
  });

  // Adicionar item de Super Admin apenas se o usuário for super admin
  const finalMenuItems = [
    ...menuItems,
    ...(isSuperAdmin ? [{ icon: Shield, label: t("sidebar.superAdmin"), path: "/super-admin", feature: "super_admin" }] : []),
  ];

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 z-40",
        isOpen ? "w-64" : "w-16"
      )}
    >
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <AnimatePresence mode="wait">
          {displayLogo ? (
            <motion.img
              key={displayLogo}
              src={displayLogo}
              alt="Logo"
              className="h-10 w-10 rounded-lg object-contain flex-shrink-0"
              initial={{ opacity: 0, scale: 0.8, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: 10 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            />
          ) : (
            <motion.div
              key="default-icon"
              className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0"
              initial={{ opacity: 0, scale: 0.8, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: 10 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </motion.div>
          )}
        </AnimatePresence>
        {isOpen && (
          <AnimatePresence mode="wait">
            {displayName && (
              <motion.div
                key={displayName}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <h1 className="font-bold text-sidebar-foreground text-sm leading-tight">
                  {displayName}
                </h1>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
      
      <nav className="p-2 space-y-1">
        {finalMenuItems.map((item) => {
          // Se for user-dashboard ou super-admin, não adicionar establishmentId
          const isSpecialRoute = item.path === "/user-dashboard" || item.path === "/super-admin";
          const path = isSpecialRoute || !currentEstablishmentId 
            ? item.path 
            : `/${currentEstablishmentId}${item.path === "/" ? "" : item.path}`;
          
          return (
            <NavLink
              key={item.path}
              to={path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  "hover:bg-sidebar-accent text-sidebar-foreground",
                  isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {isOpen && <span className="text-sm font-medium">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};
