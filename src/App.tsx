import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChannelQueriesInvalidationListener } from "@/components/ChannelQueriesInvalidationListener";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { RoleProtectedRoute } from "./components/layout/RoleProtectedRoute";
import { SuperAdminRoute } from "./components/layout/SuperAdminRoute";
import { EstablishmentRoute } from "./components/layout/EstablishmentRoute";
import Dashboard from "./pages/Dashboard";
import OccupancyMap from "./pages/OccupancyMap";
import AvailabilityMap from "./pages/AvailabilityMap";
import Reservations from "./pages/Reservations";
import PendingReservations from "./pages/PendingReservations";
import ActivityLogs from "./pages/ActivityLogs";
import ReservationDetails from "./pages/ReservationDetails";
import WebCheckin from "./pages/WebCheckin";
import {
  getWebCheckinRoutePrefix,
  isKnownPmsHostname,
  isWebCheckinPublicHostname,
  shouldWaitForWebCheckinHostDetection,
} from "./lib/webCheckinPublicUrl";
import { useSiteSettings } from "./hooks/useSiteSettings";
import { useHostnameResolution } from "./hooks/useHostnameResolution";
import { WebCheckinDedicatedAppRoutes } from "./components/routing/WebCheckinDedicatedAppRoutes";
import UnconfiguredHostname from "./pages/UnconfiguredHostname";
import GuestDashboard from "./pages/GuestDashboard";
import GuestResetPassword from "./pages/GuestResetPassword";
import PublicPolicies from "./pages/PublicPolicies";
import PublicCancellationPolicy from "./pages/PublicCancellationPolicy";
import Clients from "./pages/Clients";
import ClientDeduplication from "./pages/ClientDeduplication";
import CrmDashboard from "./pages/crm/CrmDashboard";
import CrmContacts from "./pages/crm/CrmContacts";
import CrmContact360 from "./pages/crm/CrmContact360";
import CrmPipeline from "./pages/crm/CrmPipeline";
import CrmCentral from "./pages/crm/CrmCentral";
import CrmSegments from "./pages/crm/CrmSegments";
import CrmCampaigns from "./pages/crm/CrmCampaigns";
import CrmAutomations from "./pages/crm/CrmAutomations";
import CrmCompanies from "./pages/crm/CrmCompanies";
import CrmLoyalty from "./pages/crm/CrmLoyalty";
import CrmReports from "./pages/crm/CrmReports";
import Units from "./pages/Units";
import Financial from "./pages/Financial";
import Maintenance from "./pages/Maintenance";
import Pricing from "./pages/Pricing";
import PMSRateSystem from "./pages/PMSRateSystem";
import ChannelManager from "./pages/ChannelManager";
import Settings from "./pages/Settings";
import StayReviews from "./pages/StayReviews";
import ReviewPage from "./pages/ReviewPage";
import ThankYouPage from "./pages/ThankYouPage";
import Profile from "./pages/Profile";
import Employees from "./pages/Employees";
import SuperAdmin from "./pages/SuperAdmin";
import UserDashboard from "./pages/UserDashboard";
import EstablishmentDashboard from "./pages/EstablishmentDashboard";
import OwnerDashboard from "./pages/OwnerDashboard";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import QuotePaymentPage from "./pages/QuotePaymentPage";
import CheckinChargePaymentPage from "./pages/CheckinChargePaymentPage";
import QuoteRoomSelection from "./pages/QuoteRoomSelection";
import PublicReservation from "./pages/PublicReservation";
import BookingEnginePage from "./booking-engine";
import CategoryDetailPage from "./booking-engine/CategoryDetailPage";
import ReservationDetailPage from "./booking-engine/ReservationDetailPage";
import Quotes from "./pages/Quotes";
import PaymentSuccess from "./pages/PaymentSuccess";
import Documentation from "./pages/Documentation";
import BookingEngineSettings from "./pages/BookingEngineSettings";
import PublicReservationSettings from "./pages/PublicReservationSettings";
import CheckinChargeSettings from "./pages/CheckinChargeSettings";
import HelpCheckinCharge from "./pages/HelpCheckinCharge";
import CustomDomainDetector from "./components/booking-engine/CustomDomainDetector";
import { EstablishmentProvider } from "./contexts/EstablishmentContext";
import { StripeProvider } from "./components/stripe/StripeProvider";
import { useSiteMeta } from "./hooks/useSiteMeta";
import "./i18n/config";
import { useEffect, lazy, Suspense } from "react";
import { startMonitoring, stopMonitoring } from "./lib/monitoring";

const PaymentPage = lazy(() => import("./pages/PaymentPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutos
      onError: async (error) => {
        // Logar erros de queries automaticamente
        try {
          const { logError } = await import("@/lib/errorLogger");
          await logError({
            error: error instanceof Error ? error : new Error(String(error)),
            context: "react-query",
            severity: "medium",
          });
        } catch (logError) {
          console.warn("Erro ao fazer log de query error:", logError);
        }
      },
    },
    mutations: {
      onError: async (error) => {
        // Logar erros de mutations automaticamente
        try {
          const { logError } = await import("@/lib/errorLogger");
          await logError({
            error: error instanceof Error ? error : new Error(String(error)),
            context: "react-query.mutation",
            severity: "high",
          });
        } catch (logError) {
          console.warn("Erro ao fazer log de mutation error:", logError);
        }
      },
    },
  },
});

const AppContent = () => {
  // Iniciar monitoramento do sistema
  useEffect(() => {
    // Iniciar monitoramento periódico (a cada 5 minutos)
    startMonitoring(5 * 60 * 1000);
    
    // Cleanup ao desmontar
    return () => {
      stopMonitoring();
    };
  }, []);
  
  return (
    <BrowserRouter>
      <AppRoutesWithMeta />
    </BrowserRouter>
  );
};

const AppRoutesWithMeta = () => {
  useSiteMeta();
  const { settings, isLoading: siteSettingsLoading } = useSiteSettings();
  const { resolution, isLoading: hostResolutionLoading, isError: hostResolutionError } =
    useHostnameResolution();
  const onWebCheckinHost = isWebCheckinPublicHostname(settings);
  const webCheckinPrefix = getWebCheckinRoutePrefix(settings);
  const extraWebCheckinPath =
    webCheckinPrefix && webCheckinPrefix !== "web-checkin" ? webCheckinPrefix : null;

  const waitingLegacy = shouldWaitForWebCheckinHostDetection(siteSettingsLoading, settings);
  const waitingHostApi = hostResolutionLoading && !onWebCheckinHost;

  if (waitingLegacy || waitingHostApi) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  const serverCheckin =
    !hostResolutionError &&
    resolution?.mode === "web_checkin" &&
    resolution.active !== false;
  const checkinHost = serverCheckin || onWebCheckinHost;

  const foreignHostBlocked =
    !hostResolutionError &&
    resolution &&
    !isKnownPmsHostname(settings) &&
    (resolution.mode === "unconfigured" ||
      resolution.mode === "suspended" ||
      (resolution.mode === "pending" && !resolution.active));

  if (foreignHostBlocked) {
    return <UnconfiguredHostname resolution={resolution} />;
  }

  if (checkinHost) {
    return <WebCheckinDedicatedAppRoutes />;
  }

  if (!hostResolutionError && resolution?.mode === "booking_engine" && resolution.active) {
    return (
      <Routes>
        {/* Checkout e páginas públicas ligadas ao motor (mesmo host personalizado) */}
        <Route path="/reservar/:establishmentSlug" element={<PublicReservation />} />
        <Route path="/categoria/:categoryId" element={<CategoryDetailPage />} />
        <Route path="/reserva/:reservationId" element={<ReservationDetailPage />} />
        <Route path="/politica/:policyId" element={<PublicCancellationPolicy />} />
        <Route path="/payment/checkin/:token" element={<CheckinChargePaymentPage />} />
        <Route path="/payment/:paymentIntentId" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>Carregando...</p></div>}><PaymentPage /></Suspense>} />
        <Route path="/payment/success/:paymentIntentId" element={<PaymentSuccess />} />
        <Route path="/payment/return" element={<PaymentSuccess />} />
        <Route path="/*" element={<BookingEnginePage />} />
      </Routes>
    );
  }

  return (
          <Routes>
            <Route path="/login" element={<Auth />} />
            <Route path="/login/reset-password" element={<ResetPassword />} />
            <Route path="/auth" element={<Navigate to="/login" replace />} />
            <Route path="/auth/reset-password" element={<Navigate to="/login/reset-password" replace />} />
            <Route path="/logout" element={<Navigate to="/login" replace />} />
            {/* Rota raiz - verificar se é domínio personalizado do booking engine (deve ser processada primeiro) */}
            <Route path="/" element={<CustomDomainDetector />} />
            <Route path="/admin-dashboard" element={<SuperAdminRoute><AppLayout><SuperAdmin /></AppLayout></SuperAdminRoute>} />
            <Route path="/super-admin" element={<SuperAdminRoute><AppLayout><SuperAdmin /></AppLayout></SuperAdminRoute>} />
            <Route path="/user-dashboard" element={<ProtectedRoute><AppLayout><UserDashboard /></AppLayout></ProtectedRoute>} />
            <Route path="/establishments" element={<ProtectedRoute><AppLayout><EstablishmentDashboard /></AppLayout></ProtectedRoute>} />
            {/* Rotas com establishmentId */}
            <Route path="/:establishmentId" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Dashboard /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/proprietario" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><OwnerDashboard /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/ocupacao" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><OccupancyMap /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/occupancy-map" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><OccupancyMap /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/disponibilidade" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><AvailabilityMap /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/availability-map" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><AvailabilityMap /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/reservas" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Reservations /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/reservas/pendencias" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><PendingReservations /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/reservas/:reservationCode" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><ReservationDetails /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/logs" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><ActivityLogs /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/web-checkin/:locator" element={<WebCheckin />} />
            <Route path="/web-checkin/reset-password" element={<GuestResetPassword />} />
            <Route path="/web-checkin" element={<WebCheckin />} />
            {extraWebCheckinPath ? (
              <>
                <Route path={`/${extraWebCheckinPath}/:locator`} element={<WebCheckin />} />
                <Route path={`/${extraWebCheckinPath}`} element={<WebCheckin />} />
              </>
            ) : null}
            <Route path="/guest-dashboard" element={<GuestDashboard />} />
            <Route path="/review/:locator" element={<ReviewPage />} />
            <Route path="/thank-you" element={<ThankYouPage />} />
            <Route path="/payment/checkin/:token" element={<CheckinChargePaymentPage />} />
            <Route path="/payment/:paymentIntentId" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>Carregando...</p></div>}><PaymentPage /></Suspense>} />
            <Route path="/payment/success/:paymentIntentId" element={<PaymentSuccess />} />
            <Route path="/payment/return" element={<PaymentSuccess />} />
            <Route path="/quote-payment/:paymentIntentId" element={<QuotePaymentPage />} />
            <Route path="/quote-room-selection/:selectionToken" element={<QuoteRoomSelection />} />
            {/* Motor de Reservas - Página Pública */}
            <Route path="/motor" element={<BookingEnginePage />} />
            <Route path="/motor/:companySlug" element={<BookingEnginePage />} />
            <Route path="/motor/:companySlug/categoria/:categoryId" element={<CategoryDetailPage />} />
            {/* Rota para categoria em domínio personalizado (sem /motor/) */}
            <Route path="/categoria/:categoryId" element={<CategoryDetailPage />} />
            {/* Rota para detalhes da reserva */}
            <Route path="/motor/:companySlug/reserva/:reservationId" element={<ReservationDetailPage />} />
            <Route path="/reserva/:reservationId" element={<ReservationDetailPage />} />
            <Route path="/reservar/:establishmentSlug" element={<PublicReservation />} />
            <Route path="/policies/:slug/:token" element={<PublicPolicies />} />
            <Route path="/policies/:token" element={<PublicPolicies />} />
            {/* Rota para política de cancelamento completa */}
            <Route path="/motor/:companySlug/politica/:policyId" element={<PublicCancellationPolicy />} />
            <Route path="/politica/:policyId" element={<PublicCancellationPolicy />} />
            <Route path="/documentation" element={<ProtectedRoute><AppLayout><Documentation /></AppLayout></ProtectedRoute>} />
            <Route path="/:establishmentId/documentation" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Documentation /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/clientes" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Clients /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/clientes/centralizacao" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><ClientDeduplication /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmDashboard /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/contatos" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmContacts /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/contatos/:contactId" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmContact360 /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/pipeline" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmPipeline /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/central" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmCentral /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/segmentos" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmSegments /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/campanhas" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmCampaigns /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/automacoes" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmAutomations /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/empresas" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmCompanies /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/fidelidade" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmLoyalty /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/crm/relatorios" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CrmReports /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/unidades" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Units /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/financeiro" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Financial /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/tarifario" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><PMSRateSystem /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/tarifario-legado" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Pricing /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/manutencao" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Maintenance /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/avaliacoes" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><StayReviews /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/channel-manager" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><ChannelManager /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/motor-reservas/configuracoes" element={<ProtectedRoute><RoleProtectedRoute><AppLayout><BookingEngineSettings /></AppLayout></RoleProtectedRoute></ProtectedRoute>} />
            <Route path="/pagina-publica/configuracoes" element={<ProtectedRoute><RoleProtectedRoute><AppLayout><PublicReservationSettings /></AppLayout></RoleProtectedRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/cobranca-checkin" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><CheckinChargeSettings /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/cobranca-checkin/ajuda" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><HelpCheckinCharge /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/configuracoes" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Settings /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/perfil" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Profile /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/funcionarios" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Employees /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/orcamentos" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Quotes /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            {/* Rotas legadas (redirecionar para user-dashboard se não tiver establishmentId) */}
            <Route path="/legacy-redirect" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/ocupacao" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/occupancy-map" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/reservas" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/unidades" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/financeiro" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/tarifario" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/manutencao" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/channel-manager" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/perfil" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="/funcionarios" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ChannelQueriesInvalidationListener />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <EstablishmentProvider>
        <StripeProvider>
        <AppContent />
        </StripeProvider>
      </EstablishmentProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
