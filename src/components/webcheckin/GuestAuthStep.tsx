import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, Lock, User, Phone, ArrowRight, Eye, EyeOff, Building2, Hash, Search } from "lucide-react";
import { useGuestAccount } from "@/hooks/useGuestAccount";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { toast } from "sonner";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useTranslation } from "react-i18next";

interface GuestAuthStepProps {
  onNext: (data: { accountId: string; locator?: string }) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  initialLocator?: string; // Localizador vindo da URL
}

export function GuestAuthStep({ onNext, initialLocator }: GuestAuthStepProps) {
  const navigate = useNavigate();
  const { createAccount, login, getCurrentSession } = useGuestAccount();
  const { settings } = useSiteSettings();
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);

  // Verificar se já está logado
  const session = getCurrentSession();
  const isAlreadyLoggedIn = !!session.accountId;

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registerFullName, setRegisterFullName] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [locator, setLocator] = useState(initialLocator || "");
  const [showAuthForm, setShowAuthForm] = useState(!!initialLocator); // Se tem localizador inicial, mostrar formulário direto

  // Atualizar localizador quando initialLocator mudar
  useEffect(() => {
    if (initialLocator) {
      setLocator(initialLocator);
      setShowAuthForm(true); // Se tem localizador na URL, mostrar formulário de autenticação direto
    }
  }, [initialLocator]);

  // Se já está logado, permitir continuar
  if (isAlreadyLoggedIn && session.accountId) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {t("webCheckin.auth.welcomeBack")}
          </h2>
          <p className="text-slate-600">
            {t("webCheckin.auth.alreadyAuthenticated")}
          </p>
        </div>
        <div className="flex justify-end pt-4">
          <Button 
            onClick={() => onNext({ 
              accountId: session.accountId!,
              locator: locator || initialLocator // Passar localizador se tiver
            })} 
            className="px-8"
          >
            {t("webCheckin.auth.continue")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  const handleLocatorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locator.trim()) {
      toast.error(t("webCheckin.auth.errors.enterLocator"));
      return;
    }
    setShowAuthForm(true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error(t("webCheckin.auth.errors.fillEmailPassword"));
      return;
    }

    login.mutate(
      { email: loginEmail, password: loginPassword },
      {
        onSuccess: (data) => {
          toast.success(t("webCheckin.auth.success.loginSuccess"));
          // Se tem localizador, passar junto; senão, passar apenas accountId para ir para dashboard
          if (locator.trim()) {
            onNext({ accountId: data.account.id, locator: locator.trim() });
          } else {
            // Sem localizador, ir para dashboard
            navigate("/guest-dashboard");
          }
        },
      }
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerEmail || !registerPassword || !registerFullName) {
      toast.error(t("webCheckin.auth.errors.fillRequired"));
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      toast.error(t("webCheckin.auth.errors.passwordsDontMatch"));
      return;
    }

    if (registerPassword.length < 6) {
      toast.error(t("webCheckin.auth.errors.passwordMinLength"));
      return;
    }

    createAccount.mutate(
      {
        email: registerEmail,
        password: registerPassword,
        full_name: registerFullName,
        phone: registerPhone || undefined,
      },
      {
        onSuccess: (account) => {
          toast.success(t("webCheckin.auth.success.accountCreated"));
          
          // Fazer login automático após cadastro
          login.mutate(
            { email: registerEmail, password: registerPassword },
            {
              onSuccess: (data) => {
                // Se tem localizador, passar junto; senão, passar apenas accountId para ir para dashboard
                if (locator.trim()) {
                  onNext({ accountId: data.account.id, locator: locator.trim() });
                } else {
                  // Sem localizador, ir para dashboard
                  navigate("/guest-dashboard");
                }
              },
            }
          );
        },
      }
    );
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
                Check-in Rápido
              </h2>
              <div className="w-24 h-px bg-white/50 mx-auto"></div>
              <p className="text-lg md:text-xl text-white/95 font-light leading-relaxed max-w-md mx-auto drop-shadow-lg">
                Complete seu check-in em minutos, sem filas e de onde estiver
              </p>
            </div>
            
            <div className="pt-8 border-t border-white/30">
              <div className="flex flex-wrap justify-center gap-6 mb-4">
                <div className="text-center">
                  <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Digital</p>
                  <p className="text-xs text-white/90 drop-shadow-sm">100% Online</p>
                </div>
                <div className="w-px h-8 bg-white/30"></div>
                <div className="text-center">
                  <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Rápido</p>
                  <p className="text-xs text-white/90 drop-shadow-sm">Em Minutos</p>
                </div>
                <div className="w-px h-8 bg-white/30"></div>
                <div className="text-center">
                  <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Seguro</p>
                  <p className="text-xs text-white/90 drop-shadow-sm">Dados Protegidos</p>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-6">
                <div className="text-center">
                  <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Recibo & NF</p>
                  <p className="text-xs text-white/90 drop-shadow-sm">Geração Rápida</p>
                </div>
                <div className="w-px h-8 bg-white/30"></div>
                <div className="text-center">
                  <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Extensão</p>
                  <p className="text-xs text-white/90 drop-shadow-sm">Solicite Online</p>
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
                  className="h-24 w-auto max-w-[300px] object-contain"
                />
              ) : settings?.site_title ? (
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                    <Building2 className="h-8 w-8 text-white" />
                  </div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    {settings.site_title}
                  </h1>
                </div>
              ) : null}
            </div>
          )}
          
          {/* Título */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-gray-900">
              {showAuthForm ? t("webCheckin.auth.welcome") : "Check-in Online"}
            </h1>
            <p className="text-gray-600 text-lg">
              {showAuthForm 
                ? t("webCheckin.auth.loginOrRegister")
                : t("webCheckin.auth.enterLocator")}
            </p>
          </div>

          {/* Campo de Localizador - Mostrar primeiro se não tiver mostrado o formulário */}
          {!showAuthForm && (
            <>
              <form onSubmit={handleLocatorSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="locator" className="text-sm font-semibold text-gray-700">
                    {t("webCheckin.auth.locatorLabel")}
                  </Label>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="locator"
                      type="text"
                      placeholder={t("webCheckin.auth.locatorPlaceholder")}
                      value={locator}
                      onChange={(e) => setLocator(e.target.value.toUpperCase())}
                      className="pl-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-center font-mono tracking-wider uppercase text-base"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    {t("webCheckin.auth.locatorHint")}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!locator.trim()}
                >
                  {t("webCheckin.auth.continueWithLocator")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </form>

              {/* Divisor */}
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">
                    {t("webCheckin.auth.or")}
                  </span>
                </div>
              </div>

              {/* Botão para login direto */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAuthForm(true);
                  setIsLogin(true);
                }}
                className="w-full h-14 rounded-xl border-2 border-gray-300 hover:bg-gray-50 transition-all"
              >
                {t("webCheckin.auth.alreadyHaveAccount")}
              </Button>
            </>
          )}

          {/* Tabs - Só mostrar se já inseriu o localizador */}
          {showAuthForm && (
          <Tabs value={isLogin ? "login" : "register"} onValueChange={(v) => setIsLogin(v === "login")}>
            <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
              <TabsTrigger 
                value="login" 
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-800"
              >
                {t("webCheckin.auth.login")}
              </TabsTrigger>
              <TabsTrigger 
                value="register"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-800"
              >
                {t("webCheckin.auth.register")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-6 mt-6">
              <form onSubmit={handleLogin} className="space-y-6">
                {/* Campo Email */}
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-semibold text-gray-700">
                    {t("webCheckin.auth.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder={t("webCheckin.auth.emailPlaceholder")}
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="pl-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                    />
                  </div>
                </div>

                {/* Campo Senha */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-sm font-semibold text-gray-700">
                      {t("webCheckin.auth.password")}
                    </Label>
                    <button
                      type="button"
                      onClick={() => navigate("/web-checkin/reset-password")}
                      className="text-sm text-blue-600 hover:text-blue-700 transition-colors font-medium"
                    >
                      {t("webCheckin.auth.forgotPassword")}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="login-password"
                      type={showLoginPassword ? "text" : "password"}
                      placeholder={t("webCheckin.auth.passwordPlaceholder")}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className="pl-12 pr-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showLoginPassword ? (
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
                  disabled={login.isPending}
                >
                  {login.isPending ? (
                    t("webCheckin.auth.loggingIn")
                  ) : (
                    <>
                      {t("webCheckin.auth.login")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="space-y-6 mt-6">
              <form onSubmit={handleRegister} className="space-y-6">
                {/* Campo Nome */}
                <div className="space-y-2">
                  <Label htmlFor="register-name" className="text-sm font-semibold text-gray-700">
                    {t("webCheckin.auth.fullName")} *
                  </Label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-name"
                      type="text"
                      placeholder={t("webCheckin.auth.fullNamePlaceholder")}
                      value={registerFullName}
                      onChange={(e) => setRegisterFullName(e.target.value)}
                      required
                      className="pl-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                    />
                  </div>
                </div>

                {/* Campo Email */}
                <div className="space-y-2">
                  <Label htmlFor="register-email" className="text-sm font-semibold text-gray-700">
                    {t("webCheckin.auth.email")} *
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-email"
                      type="email"
                      placeholder={t("webCheckin.auth.emailPlaceholder")}
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                      className="pl-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                    />
                  </div>
                </div>

                {/* Campo Telefone */}
                <div className="space-y-2">
                  <Label htmlFor="register-phone" className="text-sm font-semibold text-gray-700">
                    {t("webCheckin.auth.phone")}
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-phone"
                      type="tel"
                      placeholder={t("webCheckin.auth.phonePlaceholder")}
                      value={registerPhone}
                      onChange={(e) => setRegisterPhone(e.target.value)}
                      className="pl-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                    />
                  </div>
                </div>

                {/* Campo Senha */}
                <div className="space-y-2">
                  <Label htmlFor="register-password" className="text-sm font-semibold text-gray-700">
                    {t("webCheckin.auth.password")} *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-password"
                      type={showRegisterPassword ? "text" : "password"}
                      placeholder={t("webCheckin.auth.passwordPlaceholder")}
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      minLength={6}
                      required
                      className="pl-12 pr-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showRegisterPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">{t("webCheckin.auth.minPasswordLength")}</p>
                </div>

                {/* Campo Confirmar Senha */}
                <div className="space-y-2">
                  <Label htmlFor="register-confirm-password" className="text-sm font-semibold text-gray-700">
                    {t("webCheckin.auth.confirmPassword")} *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder={t("webCheckin.auth.passwordPlaceholder")}
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      minLength={6}
                      required
                      className="pl-12 pr-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Botão de Criar Conta */}
                <Button
                  type="submit"
                  className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={createAccount.isPending}
                >
                  {createAccount.isPending ? (
                    t("webCheckin.auth.creating")
                  ) : (
                    <>
                      {t("webCheckin.auth.createAccount")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          )}

          {/* Botão para voltar ao localizador */}
          {showAuthForm && (
            <div className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAuthForm(false);
                  setLocator("");
                }}
                className="w-full h-12 rounded-xl"
              >
                <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                {t("webCheckin.auth.backToLocator")}
              </Button>
            </div>
          )}

          {/* Frase motivadora */}
          <div className="text-center pt-4">
            <p className="text-sm text-gray-500 italic">
              {t("webCheckin.auth.motivationalText")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
