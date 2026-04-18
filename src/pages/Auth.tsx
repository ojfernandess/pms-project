import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useTranslation } from "react-i18next";

const Auth = () => {
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const { t } = useTranslation();
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
        toast.error(t("auth.errors.fillEmailPassword"));
        setLoading(false);
        return;
      }

      // Validar formato de email básico
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        toast.error(t("auth.errors.invalidEmail"));
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
        let errorMessage = t("auth.errors.invalidCredentials");
        if (error.message.includes("Invalid login credentials") || 
            error.message.includes("invalid_credentials") ||
            error.message.includes("Invalid login")) {
          errorMessage = t("auth.errors.wrongCredentials");
        } else if (error.message.includes("Email not confirmed")) {
          errorMessage = t("auth.errors.emailNotConfirmed");
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
        toast.error(t("auth.errors.authFailed"));
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
        toast.success(t("auth.success.loginSuccess"));
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

          toast.success(t("auth.success.loginSuccess"));
          navigate("/user-dashboard");
        } else {
          toast.success(t("auth.success.loginSuccess"));
          navigate("/user-dashboard");
        }
      }
    } catch (error: any) {
      console.error("Erro inesperado no login:", error);
      toast.error(error.message || t("auth.errors.unexpectedError"));
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex">
      {/* Lado Esquerdo - Imagem Grande */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Imagem de fundo com tema hotel/resort */}
        <div 
          className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600"
          style={{
            backgroundImage: `url("https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Overlay escuro para melhor contraste */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
        
        {/* Conteúdo sobre a imagem */}
        <div className="relative z-10 flex flex-col justify-center items-center h-full p-12 text-white">
          <div className="max-w-xl mx-auto text-center space-y-8">
            <div className="space-y-4">
              <h2 className="text-5xl md:text-6xl font-light tracking-tight text-white drop-shadow-2xl">
                {t("auth.hero.title")}
              </h2>
              <div className="w-24 h-px bg-white/50 mx-auto"></div>
              <p className="text-lg md:text-xl text-white/95 font-light leading-relaxed max-w-md mx-auto drop-shadow-lg">
                {t("auth.hero.subtitle")}
              </p>
            </div>
            
            <div className="pt-8 border-t border-white/30">
              <div className="flex flex-wrap justify-center gap-6 mb-4">
                <div className="text-center">
                  <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">{t("auth.features.webCheckin.label")}</p>
                  <p className="text-xs text-white/90 drop-shadow-sm">{t("auth.features.webCheckin.description")}</p>
                </div>
                <div className="w-px h-8 bg-white/30"></div>
                <div className="text-center">
                  <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">{t("auth.features.payments.label")}</p>
                  <p className="text-xs text-white/90 drop-shadow-sm">{t("auth.features.payments.description")}</p>
                </div>
                <div className="w-px h-8 bg-white/30"></div>
                <div className="text-center">
                  <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">{t("auth.features.reservations.label")}</p>
                  <p className="text-xs text-white/90 drop-shadow-sm">{t("auth.features.reservations.description")}</p>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-6">
                <div className="text-center">
                  <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">{t("auth.features.otas.label")}</p>
                  <p className="text-xs text-white/90 drop-shadow-sm">{t("auth.features.otas.description")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lado Direito - Painel Branco */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white relative">
        {/* Seletor de Idioma */}
        <div className="absolute top-6 right-6">
          <LanguageSelector />
        </div>

        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          {(settings?.logo_url || settings?.site_title) && (
            <div className="flex justify-center mb-6">
              {settings?.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt="Logo"
                  className="w-[200px] h-auto object-contain"
                />
              ) : settings?.site_title ? (
                <div className="flex items-center gap-3">
                  <div className="h-24 w-24 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                    <Building2 className="h-12 w-12 text-white" />
                  </div>
                  <h1 className="text-4xl font-bold text-gray-900">
                    {settings.site_title}
                  </h1>
                </div>
              ) : null}
            </div>
          )}
          
          {/* Título */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-gray-900">
              {t("auth.form.title")}
            </h1>
            <p className="text-gray-600 text-lg">
              {t("auth.form.subtitle")}
            </p>
          </div>

          {/* Formulário de Login */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Campo Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                {t("auth.form.email")}
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.form.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                  {t("auth.form.password")}
                </Label>
                <button
                  type="button"
                  onClick={() => navigate("/login/reset-password")}
                  className="text-sm text-blue-600 hover:text-blue-700 transition-colors font-medium"
                >
                  {t("auth.form.forgotPassword")}
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.form.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-12 pr-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
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
              className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                t("auth.form.loggingIn")
              ) : (
                <>
                  {t("auth.form.login")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          {/* Frase institucional */}
          {settings?.site_description && (
            <div className="text-center pt-4">
              <p className="text-sm text-gray-500 italic">
                {settings.site_description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
