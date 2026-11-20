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
  BookOpen,
  BarChart3,
  Star,
  Map,
  Receipt,
  ContactRound,
  Kanban,
  MessagesSquare,
  Megaphone,
  Filter,
  Workflow,
  Award,
} from "lucide-react";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#25D366" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
import { NavLink, useParams } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUsers";
import { useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { checkPermission } from "@/lib/permissions";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useCompanyPmsCustomization } from "@/hooks/useCompanyPmsCustomization";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const getMenuItems = (t: (key: string) => string) => [
  { icon: LayoutDashboard, label: t("sidebar.dashboard"), path: "/", feature: "dashboard" },
  { icon: BarChart3, label: "Dashboard Proprietário", path: "/proprietario", feature: "owner_dashboard" },
  { icon: Bed, label: t("sidebar.occupancyMap"), path: "/ocupacao", feature: "occupancy_map" },
  { icon: Map, label: "Mapa de Disponibilidades", path: "/disponibilidade", feature: "availability_map" },
  { icon: Calendar, label: t("sidebar.reservations"), path: "/reservas", feature: "reservations" },
  { icon: Receipt, label: "Orçamentos", path: "/orcamentos", feature: "quotes" },
  { icon: Users, label: t("sidebar.clients"), path: "/clientes", feature: "clients" },
  { icon: ContactRound, label: "CRM", path: "/crm", feature: "crm" },
  { icon: ContactRound, label: "CRM Contatos", path: "/crm/contatos", feature: "crm_contacts" },
  { icon: Kanban, label: "CRM Pipeline", path: "/crm/pipeline", feature: "crm_deals" },
  { icon: MessagesSquare, label: "CRM Central", path: "/crm/central", feature: "crm" },
  { icon: Filter, label: "CRM Segmentos", path: "/crm/segmentos", feature: "crm_campaigns" },
  { icon: Megaphone, label: "CRM Campanhas", path: "/crm/campanhas", feature: "crm_campaigns" },
  { icon: Workflow, label: "CRM Automações", path: "/crm/automacoes", feature: "crm_automations" },
  { icon: Building2, label: "CRM Empresas", path: "/crm/empresas", feature: "crm_b2b" },
  { icon: Award, label: "CRM Fidelidade", path: "/crm/fidelidade", feature: "crm_loyalty" },
  { icon: BarChart3, label: "CRM Relatórios", path: "/crm/relatorios", feature: "crm_reports" },
  { icon: Building2, label: t("sidebar.units"), path: "/unidades", feature: "units" },
  { icon: DollarSign, label: t("sidebar.financial"), path: "/financeiro", feature: "financial" },
  { icon: ClipboardList, label: t("sidebar.pricing"), path: "/tarifario", feature: "pricing" },
  { icon: Wrench, label: t("sidebar.maintenance"), path: "/manutencao", feature: "maintenance" },
  { icon: Star, label: "Avaliações", path: "/avaliacoes", feature: "stay_reviews" },
  { icon: Network, label: t("sidebar.channelManager"), path: "/channel-manager", feature: "channel_manager" },
  { icon: FileText, label: t("sidebar.logs"), path: "/logs", feature: "logs" },
  { icon: WhatsAppIcon, label: "Mensagens & Cobranças", path: "/cobranca-checkin", feature: "checkin_charge" },
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

    if (item.feature === "owner_dashboard") {
      // REGRA ESPECIAL: Apenas proprietários podem ver o dashboard do proprietário
      // Sempre mostrar para proprietários, independente de permissões configuradas
      if (role && role.code === "owner") {
        return true;
      }
      return false;
    }

    // Verificar feature flag para stay_reviews
    if (item.feature === "stay_reviews") {
      const isStayReviewsEnabled = isFeatureEnabledForEstablishment(
        settings?.features_enabled?.stay_reviews,
        selectedEstablishment?.id
      );
      if (!isStayReviewsEnabled) {
        return false;
      }
      // Se o feature flag estiver habilitado, verificar permissão
      return checkPermission(role, item.feature, undefined, customPermissions);
    }

    // Verificar feature flag para availability_map
    if (item.feature === "availability_map") {
      // Não mostrar se não houver estabelecimento selecionado
      if (!selectedEstablishment?.id) {
        return false;
      }
      
      const featureConfig = settings?.features_enabled?.availability_map;
      const isAvailabilityMapEnabled = isFeatureEnabledForEstablishment(
        featureConfig,
        selectedEstablishment.id
      );
      
      if (!isAvailabilityMapEnabled) {
        return false;
      }
      // Se o feature flag estiver habilitado, verificar permissão
      return checkPermission(role, item.feature, undefined, customPermissions);
    }

    // Cobrança de Check-in: habilitado por empresa (company_ids no Super Admin)
    if (item.feature === "checkin_charge") {
      if (!selectedEstablishment?.company_id) {
        return false;
      }
      const isCheckinChargeEnabled = isFeatureEnabledForEstablishment(
        (settings?.features_enabled as Record<string, unknown>)?.checkin_charge_enabled,
        selectedEstablishment.company_id,
        true
      );
      if (!isCheckinChargeEnabled) {
        return false;
      }
      return checkPermission(role, "settings", undefined, customPermissions);
    }

    // CRM: flag por empresa + permissões crm / crm_contacts / crm_deals / …
    if (
      item.feature === "crm" ||
      item.feature === "crm_contacts" ||
      item.feature === "crm_deals" ||
      item.feature === "crm_campaigns" ||
      item.feature === "crm_automations" ||
      item.feature === "crm_b2b" ||
      item.feature === "crm_loyalty" ||
      item.feature === "crm_reports"
    ) {
      if (!selectedEstablishment?.company_id) {
        return false;
      }
      const isCrmEnabled = isFeatureEnabledForEstablishment(
        (settings?.features_enabled as Record<string, unknown>)?.crm,
        selectedEstablishment.company_id,
        true
      );
      if (!isCrmEnabled) {
        return false;
      }
      const permFeature =
        item.feature === "crm_contacts"
          ? "crm_contacts"
          : item.feature === "crm_deals"
            ? "crm_deals"
            : item.feature === "crm_campaigns"
              ? "crm_campaigns"
              : item.feature === "crm_automations"
                ? "crm_automations"
                : item.feature === "crm_b2b"
                  ? "crm_b2b"
                  : item.feature === "crm_loyalty"
                    ? "crm_loyalty"
                    : item.feature === "crm_reports"
                      ? "crm_reports"
                      : "crm";
      return (
        checkPermission(role, permFeature, undefined, customPermissions) ||
        checkPermission(role, "crm", undefined, customPermissions)
      );
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
          // Se for user-dashboard ou super-admin, não adicionar establishmentId (são rotas globais)
          // Documentation pode ser acessada tanto globalmente quanto dentro de um estabelecimento
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
