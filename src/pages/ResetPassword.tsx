import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { resolvePmsApiUrl } from "@/lib/runtimeConfig";

async function resetWithToken(token: string, password: string): Promise<{ error: { message: string } | null }> {
  const base = resolvePmsApiUrl().replace(/\/$/, "");
  const response = await fetch(`${base}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (response.ok) return { error: null };
  const body = await response.json().catch(() => ({} as { message?: string }));
  return { error: { message: body.message || "Link inválido ou expirado" } };
}

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useSiteSettings();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<"request" | "reset">("request");
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const checkRecoverySession = async () => {
      try {
        const queryToken = searchParams.get("token");
        const queryType = searchParams.get("type");
        if (queryToken && (queryType === "recovery" || !queryType)) {
          sessionStorage.setItem("pms.resetToken", queryToken);
          setStep("reset");
          toast.success("Link válido! Defina sua nova senha.");
          return;
        }

        const stored = sessionStorage.getItem("pms.resetToken");
        if (stored) {
          setStep("reset");
          return;
        }
        setStep("request");
      } catch (error) {
        console.error("Erro ao verificar sessão de recuperação:", error);
        setStep("request");
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkRecoverySession();
  }, [searchParams]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!email || !email.trim()) {
        toast.error("Por favor, insira seu email");
        setLoading(false);
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        toast.error("Por favor, insira um email válido");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login/reset-password`,
      });

      if (error) throw error;

      toast.success("Se o email estiver cadastrado, você receberá um link de recuperação em breve.");
      setEmail("");
    } catch (error: any) {
      console.error("Erro ao solicitar reset de senha:", error);
      toast.error(error.message || "Erro ao enviar email de recuperação");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!password || !confirmPassword) {
        toast.error("Por favor, preencha todos os campos");
        setLoading(false);
        return;
      }

      if (password.length < 8) {
        toast.error("A senha deve ter pelo menos 8 caracteres");
        setLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        toast.error("As senhas não coincidem");
        setLoading(false);
        return;
      }

      const resetToken = sessionStorage.getItem("pms.resetToken") || searchParams.get("token");
      if (!resetToken) {
        toast.error("Link inválido ou expirado. Solicite um novo link de recuperação.");
        setStep("request");
        setLoading(false);
        return;
      }

      const { error } = await resetWithToken(resetToken, password);
      if (error) throw error;
      sessionStorage.removeItem("pms.resetToken");

      toast.success("Senha alterada com sucesso! Redirecionando para login...");
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (error: any) {
      console.error("Erro ao resetar senha:", error);
      toast.error(error.message || "Erro ao alterar senha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Fundo moderno com gradiente e padrão geométrico */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        {/* Padrão geométrico decorativo */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
        </div>
      </div>

      {/* Card com Glassmorphism */}
      <div className="relative w-full max-w-md z-10">
        <div className="backdrop-blur-xl bg-white/80 dark:bg-gray-800/80 border border-white/20 rounded-2xl shadow-2xl p-8 space-y-6">
          {/* Logo */}
          {(settings?.logo_url || settings?.site_title) && (
            <div className="flex flex-col items-center gap-4">
              {settings?.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt="Logo"
                  className="h-16 w-16 rounded-xl object-contain shadow-lg"
                />
              ) : settings?.site_title ? (
                <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <Building2 className="h-8 w-8 text-white" />
                </div>
              ) : null}
            </div>
          )}

          {/* Loading enquanto verifica sessão */}
          {isCheckingSession ? (
            <div className="text-center space-y-4 py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
              <p className="text-gray-600 dark:text-gray-300">Verificando link de recuperação...</p>
            </div>
          ) : (
            <>
              {/* Título */}
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {step === "request" ? "Recuperar Senha" : "Nova Senha"}
                </h1>
                <p className="text-gray-600 dark:text-gray-300">
                  {step === "request"
                    ? "Digite seu email para receber o link de recuperação."
                    : "Digite sua nova senha abaixo."}
                </p>
              </div>

              {/* Formulário */}
              {step === "request" ? (
            <form onSubmit={handleRequestReset} className="space-y-5">
              {/* Campo Email */}
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-gray-700 dark:text-gray-300">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Botão */}
              <Button
                type="submit"
                className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                disabled={loading}
              >
                {loading ? (
                  "Enviando..."
                ) : (
                  <>
                    Enviar Link de Recuperação
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-5">
              {/* Campo Nova Senha */}
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-gray-700 dark:text-gray-300">
                  Nova Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="pl-10 pr-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Mínimo de 8 caracteres
                </p>
              </div>

              {/* Campo Confirmar Senha */}
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-gray-700 dark:text-gray-300">
                  Confirmar Nova Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="pl-10 pr-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Botão */}
              <Button
                type="submit"
                className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                disabled={loading}
              >
                {loading ? (
                  "Alterando..."
                ) : (
                  <>
                    Alterar Senha
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </form>
          )}

              {/* Link para voltar ao login */}
              <div className="text-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para o login
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Estilos para animação do blob */}
      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};

export default ResetPassword;

