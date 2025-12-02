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
          {/* Seletor de Idioma */}
          <div className="absolute top-4 right-4">
            <LanguageSelector />
          </div>
          
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

          {/* Welcome */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {showAuthForm ? t("webCheckin.auth.welcome") : t("webCheckin.title")}
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              {showAuthForm 
                ? t("webCheckin.auth.loginOrRegister")
                : t("webCheckin.auth.enterLocator")}
            </p>
          </div>

          {/* Campo de Localizador - Mostrar primeiro se não tiver mostrado o formulário */}
          {!showAuthForm && (
            <>
              <form onSubmit={handleLocatorSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="locator" className="text-gray-700 dark:text-gray-300">
                    {t("webCheckin.auth.locatorLabel")}
                  </Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="locator"
                      type="text"
                      placeholder={t("webCheckin.auth.locatorPlaceholder")}
                      value={locator}
                      onChange={(e) => setLocator(e.target.value.toUpperCase())}
                      className="pl-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-center font-mono tracking-wider uppercase"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("webCheckin.auth.locatorHint")}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  disabled={!locator.trim()}
                >
                  {t("webCheckin.auth.continueWithLocator")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </form>

              {/* Divisor */}
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
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
                className="w-full h-12 rounded-xl border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
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

            <TabsContent value="login" className="space-y-5 mt-6">
              <form onSubmit={handleLogin} className="space-y-5">
                {/* Campo Email */}
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-gray-700 dark:text-gray-300">
                    {t("webCheckin.auth.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder={t("webCheckin.auth.emailPlaceholder")}
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="pl-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </div>

                {/* Campo Senha */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-gray-700 dark:text-gray-300">
                      {t("webCheckin.auth.password")}
                    </Label>
                    <button
                      type="button"
                      onClick={() => navigate("/web-checkin/reset-password")}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                    >
                      {t("webCheckin.auth.forgotPassword")}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="login-password"
                      type={showLoginPassword ? "text" : "password"}
                      placeholder={t("webCheckin.auth.passwordPlaceholder")}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className="pl-10 pr-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
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

            <TabsContent value="register" className="space-y-5 mt-6">
              <form onSubmit={handleRegister} className="space-y-5">
                {/* Campo Nome */}
                <div className="space-y-2">
                  <Label htmlFor="register-name" className="text-gray-700 dark:text-gray-300">
                    {t("webCheckin.auth.fullName")} *
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-name"
                      type="text"
                      placeholder={t("webCheckin.auth.fullNamePlaceholder")}
                      value={registerFullName}
                      onChange={(e) => setRegisterFullName(e.target.value)}
                      required
                      className="pl-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </div>

                {/* Campo Email */}
                <div className="space-y-2">
                  <Label htmlFor="register-email" className="text-gray-700 dark:text-gray-300">
                    {t("webCheckin.auth.email")} *
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-email"
                      type="email"
                      placeholder={t("webCheckin.auth.emailPlaceholder")}
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                      className="pl-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </div>

                {/* Campo Telefone */}
                <div className="space-y-2">
                  <Label htmlFor="register-phone" className="text-gray-700 dark:text-gray-300">
                    {t("webCheckin.auth.phone")}
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-phone"
                      type="tel"
                      placeholder={t("webCheckin.auth.phonePlaceholder")}
                      value={registerPhone}
                      onChange={(e) => setRegisterPhone(e.target.value)}
                      className="pl-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </div>

                {/* Campo Senha */}
                <div className="space-y-2">
                  <Label htmlFor="register-password" className="text-gray-700 dark:text-gray-300">
                    {t("webCheckin.auth.password")} *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-password"
                      type={showRegisterPassword ? "text" : "password"}
                      placeholder={t("webCheckin.auth.passwordPlaceholder")}
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      minLength={6}
                      required
                      className="pl-10 pr-10 h-12 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      {showRegisterPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t("webCheckin.auth.minPasswordLength")}</p>
                </div>

                {/* Campo Confirmar Senha */}
                <div className="space-y-2">
                  <Label htmlFor="register-confirm-password" className="text-gray-700 dark:text-gray-300">
                    {t("webCheckin.auth.confirmPassword")} *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="register-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder={t("webCheckin.auth.passwordPlaceholder")}
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      minLength={6}
                      required
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

                {/* Botão de Criar Conta */}
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
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
                className="w-full"
              >
                <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                {t("webCheckin.auth.backToLocator")}
              </Button>
            </div>
          )}

          {/* Frase motivadora */}
          <div className="text-center pt-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
              {t("webCheckin.auth.motivationalText")}
            </p>
          </div>
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
}
