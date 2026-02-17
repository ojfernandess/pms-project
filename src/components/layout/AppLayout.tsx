import { ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useCheckoutCleaning } from "@/hooks/useCheckoutCleaning";
import { AutoNoShowProcessor } from "@/components/cancellation/NoShowProcessor";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id ?? getSelectedEstablishmentId();

  // Só processar no-shows automaticamente se "Processamento Automático Ativo" estiver ligado para o estabelecimento
  const { data: noShowConfig } = useQuery({
    queryKey: ["no_show_schedule_config", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return null;
      const { data, error } = await (supabase as any)
        .from("no_show_schedule_config")
        .select("is_active")
        .eq("establishment_id", establishmentId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as { is_active: boolean } | null;
    },
    enabled: !!establishmentId,
  });

  const autoNoShowEnabled = noShowConfig?.is_active === true;

  // Hook para detectar check-outs que passaram do horário e criar notificações de limpeza
  useCheckoutCleaning();

  return (
    <div className="min-h-screen bg-background">
      {/* Processador automático de no-shows: só roda se "Processamento Automático Ativo" estiver ativo na configuração */}
      <AutoNoShowProcessor intervalMinutes={60} enabled={autoNoShowEnabled} />
      
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className={`transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};
