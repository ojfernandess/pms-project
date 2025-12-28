import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { RoleProtectedRoute } from "./components/layout/RoleProtectedRoute";
import { SuperAdminRoute } from "./components/layout/SuperAdminRoute";
import { EstablishmentRoute } from "./components/layout/EstablishmentRoute";
import Dashboard from "./pages/Dashboard";
import OccupancyMap from "./pages/OccupancyMap";
import Reservations from "./pages/Reservations";
import PendingReservations from "./pages/PendingReservations";
import ActivityLogs from "./pages/ActivityLogs";
import ReservationDetails from "./pages/ReservationDetails";
import WebCheckin from "./pages/WebCheckin";
import GuestDashboard from "./pages/GuestDashboard";
import GuestResetPassword from "./pages/GuestResetPassword";
import PublicPolicies from "./pages/PublicPolicies";
import Clients from "./pages/Clients";
import ClientDeduplication from "./pages/ClientDeduplication";
import Units from "./pages/Units";
import Financial from "./pages/Financial";
import Maintenance from "./pages/Maintenance";
import Pricing from "./pages/Pricing";
import PMSRateSystem from "./pages/PMSRateSystem";
import ChannelManager from "./pages/ChannelManager";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Employees from "./pages/Employees";
import SuperAdmin from "./pages/SuperAdmin";
import UserDashboard from "./pages/UserDashboard";
import EstablishmentDashboard from "./pages/EstablishmentDashboard";
import OwnerDashboard from "./pages/OwnerDashboard";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import PaymentPage from "./pages/PaymentPage";
import PaymentSuccess from "./pages/PaymentSuccess";
import Documentation from "./pages/Documentation";
import { EstablishmentProvider } from "./contexts/EstablishmentContext";
import { StripeProvider } from "./components/stripe/StripeProvider";
import { useSiteMeta } from "./hooks/useSiteMeta";
import "./i18n/config";
import { useEffect } from "react";
import { startMonitoring, stopMonitoring } from "./lib/monitoring";

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
  useSiteMeta(); // Atualizar título e meta tags dinamicamente
  
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
          <Routes>
            <Route path="/login" element={<Auth />} />
            <Route path="/login/reset-password" element={<ResetPassword />} />
            <Route path="/auth" element={<Navigate to="/login" replace />} />
            <Route path="/auth/reset-password" element={<Navigate to="/login/reset-password" replace />} />
            <Route path="/logout" element={<Navigate to="/login" replace />} />
            <Route path="/admin-dashboard" element={<SuperAdminRoute><AppLayout><SuperAdmin /></AppLayout></SuperAdminRoute>} />
            <Route path="/super-admin" element={<SuperAdminRoute><AppLayout><SuperAdmin /></AppLayout></SuperAdminRoute>} />
            <Route path="/user-dashboard" element={<ProtectedRoute><AppLayout><UserDashboard /></AppLayout></ProtectedRoute>} />
            <Route path="/establishments" element={<ProtectedRoute><AppLayout><EstablishmentDashboard /></AppLayout></ProtectedRoute>} />
            {/* Rotas com establishmentId */}
            <Route path="/:establishmentId" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Dashboard /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/proprietario" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><OwnerDashboard /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/ocupacao" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><OccupancyMap /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/occupancy-map" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><OccupancyMap /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/reservas" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Reservations /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/reservas/pendencias" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><PendingReservations /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/reservas/:reservationCode" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><ReservationDetails /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/logs" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><ActivityLogs /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/web-checkin/:locator" element={<WebCheckin />} />
            <Route path="/web-checkin/reset-password" element={<GuestResetPassword />} />
            <Route path="/web-checkin" element={<WebCheckin />} />
            <Route path="/guest-dashboard" element={<GuestDashboard />} />
            <Route path="/payment/:paymentIntentId" element={<PaymentPage />} />
            <Route path="/payment/success/:paymentIntentId" element={<PaymentSuccess />} />
            <Route path="/payment/return" element={<PaymentSuccess />} />
            <Route path="/policies/:slug/:token" element={<PublicPolicies />} />
            <Route path="/policies/:token" element={<PublicPolicies />} />
            <Route path="/documentation" element={<ProtectedRoute><AppLayout><Documentation /></AppLayout></ProtectedRoute>} />
            <Route path="/:establishmentId/documentation" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Documentation /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/clientes" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Clients /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/clientes/centralizacao" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><ClientDeduplication /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/unidades" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Units /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/financeiro" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Financial /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/tarifario" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><PMSRateSystem /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/tarifario-legado" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Pricing /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/manutencao" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Maintenance /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/channel-manager" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><ChannelManager /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/configuracoes" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Settings /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/perfil" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Profile /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            <Route path="/:establishmentId/funcionarios" element={<ProtectedRoute><EstablishmentRoute><RoleProtectedRoute><AppLayout><Employees /></AppLayout></RoleProtectedRoute></EstablishmentRoute></ProtectedRoute>} />
            {/* Rotas legadas (redirecionar para user-dashboard se não tiver establishmentId) */}
            <Route path="/" element={<ProtectedRoute><Navigate to="/user-dashboard" replace /></ProtectedRoute>} />
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
        </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
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
