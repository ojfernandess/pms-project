import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const Auth = () => {
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validar campos antes de tentar login
      if (!email || !password) {
        toast.error("Por favor, preencha email e senha");
        setLoading(false);
        return;
      }

      // Validar formato de email básico
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        toast.error("Por favor, insira um email válido");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      // CRÍTICO: Se houver erro, não prosseguir e garantir que não há navegação
      if (error) {
        console.error("Erro de autenticação:", error);
        // Mensagens de erro mais específicas
        let errorMessage = "Credenciais inválidas. Verifique seu email e senha.";
        if (error.message.includes("Invalid login credentials") || 
            error.message.includes("invalid_credentials") ||
            error.message.includes("Invalid login")) {
          errorMessage = "Email ou senha incorretos. Verifique suas credenciais.";
        } else if (error.message.includes("Email not confirmed")) {
          errorMessage = "Por favor, confirme seu email antes de fazer login.";
        } else if (error.message) {
          errorMessage = error.message;
        }
        toast.error(errorMessage);
        setLoading(false);
        setPassword(""); // Limpar senha em caso de erro
        return; // CRÍTICO: Retornar aqui impede qualquer navegação
      }

      // Verificar se a sessão foi criada corretamente
      if (!data || !data.session || !data.user) {
        console.error("Falha na autenticação: sem sessão ou usuário", { data });
        toast.error("Falha na autenticação. Tente novamente.");
        setLoading(false);
        setPassword(""); // Limpar senha em caso de erro
        return; // CRÍTICO: Retornar aqui impede qualquer navegação
      }

      // Verificar se é Super Admin
      const { data: adminUser, error: adminError } = await supabase
        .from("admin_users")
        .select("is_super_admin")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (adminError) {
        console.error("Erro ao verificar admin:", adminError);
      }

      if (adminUser?.is_super_admin) {
        toast.success("Login realizado com sucesso!");
        navigate("/super-admin");
      } else {
        // Verificar se tem estabelecimentos
        const { data: userCompanies } = await supabase
          .from("user_companies")
          .select("company_id")
          .eq("user_id", data.user.id);

        if (userCompanies && userCompanies.length > 0) {
          const companyIds = userCompanies.map((uc: any) => uc.company_id);
          const { data: establishments } = await supabase
            .from("establishments")
            .select("id")
            .in("company_id", companyIds)
            .eq("is_active", true);

          toast.success("Login realizado com sucesso!");
          navigate("/user-dashboard");
        } else {
          toast.success("Login realizado com sucesso!");
          navigate("/user-dashboard");
        }
      }
    } catch (error: any) {
      console.error("Erro inesperado no login:", error);
      toast.error(error.message || "Erro ao fazer login. Tente novamente.");
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
          {/* Logo e Título */}
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

          {/* Welcome Back */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Bem-vindo de volta 👋
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Acesse sua conta para continuar a gestão do hotel.
            </p>
          </div>

          {/* Formulário de Login */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Campo Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700 dark:text-gray-300">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-gray-700 dark:text-gray-300">
                  Senha
                </Label>
                <button
                  type="button"
                  onClick={() => navigate("/auth/reset-password")}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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
            </div>

            {/* Botão de Login */}
            <Button
              type="submit"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              disabled={loading}
            >
              {loading ? (
                "Entrando..."
              ) : (
                <>
                  Entrar
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          {/* Frase institucional */}
          {settings?.site_description && (
            <div className="text-center pt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                {settings.site_description}
              </p>
            </div>
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

export default Auth;
