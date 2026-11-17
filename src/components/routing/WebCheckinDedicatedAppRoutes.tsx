import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import WebCheckin from "@/pages/WebCheckin";
import GuestDashboard from "@/pages/GuestDashboard";
import GuestResetPassword from "@/pages/GuestResetPassword";
import PublicPolicies from "@/pages/PublicPolicies";
import ReviewPage from "@/pages/ReviewPage";
import ThankYouPage from "@/pages/ThankYouPage";
import CheckinChargePaymentPage from "@/pages/CheckinChargePaymentPage";
import PaymentSuccess from "@/pages/PaymentSuccess";
import { RedirectStaffToPms } from "@/components/routing/RedirectStaffToPms";

const PaymentPage = lazy(() => import("@/pages/PaymentPage"));

const paymentFallback = (
  <div className="min-h-screen flex items-center justify-center">
    <p>Carregando…</p>
  </div>
);

/**
 * Rotas expostas no domínio dedicado do Web Check-in (ex. checkin.seudominio.com).
 * Equipe e Super Admin continuam em pms_base_url.
 */
export function WebCheckinDedicatedAppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WebCheckin />} />
      <Route path="/login" element={<RedirectStaffToPms />} />
      <Route path="/login/*" element={<RedirectStaffToPms />} />
      <Route path="/:locator" element={<WebCheckin />} />
      <Route path="/web-checkin" element={<WebCheckin />} />
      <Route path="/web-checkin/:locator" element={<WebCheckin />} />
      <Route path="/web-checkin/reset-password" element={<GuestResetPassword />} />
      <Route path="/guest-dashboard" element={<GuestDashboard />} />
      <Route path="/review/:locator" element={<ReviewPage />} />
      <Route path="/thank-you" element={<ThankYouPage />} />
      <Route path="/payment/checkin/:token" element={<CheckinChargePaymentPage />} />
      <Route
        path="/payment/:paymentIntentId"
        element={
          <Suspense fallback={paymentFallback}>
            <PaymentPage />
          </Suspense>
        }
      />
      <Route path="/payment/success/:paymentIntentId" element={<PaymentSuccess />} />
      <Route path="/payment/return" element={<PaymentSuccess />} />
      <Route path="/policies/:slug/:token" element={<PublicPolicies />} />
      <Route path="/policies/:token" element={<PublicPolicies />} />
      <Route path="*" element={<RedirectStaffToPms />} />
    </Routes>
  );
}