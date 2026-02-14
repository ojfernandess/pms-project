import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useCheckoutCleaning } from "@/hooks/useCheckoutCleaning";
import { AutoNoShowProcessor } from "@/components/cancellation/NoShowProcessor";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Hook para detectar check-outs que passaram do horário e criar notificações de limpeza
  useCheckoutCleaning();

  return (
    <div className="min-h-screen bg-background">
      {/* Processador automático de no-shows (executa a cada 60 minutos) */}
      <AutoNoShowProcessor intervalMinutes={60} />
      
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
