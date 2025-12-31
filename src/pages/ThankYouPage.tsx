import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Star, Home } from "lucide-react";

export default function ThankYouPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromReview = searchParams.get("from") === "review";

  useEffect(() => {
    // Scroll para o topo quando a página carregar
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center py-12 px-4">
      <Card className="p-8 sm:p-12 max-w-2xl w-full text-center shadow-xl">
        <div className="flex flex-col items-center space-y-6">
          {/* Ícone de sucesso animado */}
          <div className="relative">
            <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-20"></div>
            <div className="relative bg-green-500 rounded-full p-6">
              <CheckCircle2 className="h-16 w-16 text-white" />
            </div>
          </div>

          {/* Título */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
              Obrigado pela sua Avaliação!
            </h1>
            <p className="text-lg text-slate-600">
              Sua opinião é muito importante para nós
            </p>
          </div>

          {/* Mensagem de agradecimento */}
          <div className="bg-slate-50 rounded-lg p-6 space-y-4 max-w-md">
            <div className="flex items-center justify-center gap-2 text-yellow-500">
              <Star className="h-6 w-6 fill-yellow-500" />
              <Star className="h-6 w-6 fill-yellow-500" />
              <Star className="h-6 w-6 fill-yellow-500" />
              <Star className="h-6 w-6 fill-yellow-500" />
              <Star className="h-6 w-6 fill-yellow-500" />
            </div>
            <p className="text-slate-700 leading-relaxed">
              Agradecemos muito por ter dedicado um tempo para avaliar sua estadia. 
              Seu feedback nos ajuda a melhorar continuamente nossos serviços e proporcionar 
              uma experiência ainda melhor para todos os nossos hóspedes.
            </p>
            <p className="text-slate-600 text-sm">
              Esperamos recebê-lo novamente em breve!
            </p>
          </div>

          {/* Botões de ação */}
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Button
              onClick={() => navigate("/guest-dashboard")}
              className="w-full sm:w-auto"
              variant="default"
            >
              <Home className="mr-2 h-4 w-4" />
              Ir para o Dashboard
            </Button>
            <Button
              onClick={() => window.close()}
              className="w-full sm:w-auto"
              variant="outline"
            >
              Fechar
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

