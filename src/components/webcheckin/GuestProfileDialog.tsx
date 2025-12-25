import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, User, Mail, Phone, Lock, AlertTriangle, Trash2 } from "lucide-react";
import { useGuestAccount } from "@/hooks/useGuestAccount";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

interface GuestProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
}

export function GuestProfileDialog({
  open,
  onOpenChange,
  accountId,
}: GuestProfileDialogProps) {
  const navigate = useNavigate();
  const { getCurrentAccount, updateProfile, updatePassword, deactivateAccount } = useGuestAccount();
  const { data: account, isLoading } = getCurrentAccount(accountId);

  // Estados do formulário de perfil
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Estados do formulário de senha
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);

  // Carregar dados do perfil quando o diálogo abrir
  useEffect(() => {
    if (open && account) {
      setFullName(account.full_name || "");
      setEmail(account.email || "");
      setPhone(account.phone || "");
    }
  }, [open, account]);

  // Resetar formulários quando fechar
  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
  }, [open]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast.error("O nome é obrigatório");
      return;
    }

    if (!email.trim()) {
      toast.error("O email é obrigatório");
      return;
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Email inválido");
      return;
    }

    try {
      await updateProfile.mutateAsync({
        accountId,
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim() || null,
      });
      onOpenChange(false);
    } catch (error: any) {
      // O erro já é tratado no hook com toast
      console.error("Erro ao atualizar perfil:", error);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error("Digite sua senha atual");
      return;
    }

    if (!newPassword) {
      toast.error("Digite a nova senha");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    try {
      await updatePassword.mutateAsync({
        accountId,
        currentPassword,
        newPassword,
      });
      
      // Limpar campos após sucesso
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      // O erro já é tratado no hook com toast
      console.error("Erro ao atualizar senha:", error);
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Perfil</DialogTitle>
          <DialogDescription>
            Atualize suas informações pessoais e senha
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Formulário de Perfil */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações Pessoais
            </h3>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="pl-10"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </form>
          </div>

          {/* Divisor */}
          <div className="border-t border-slate-200 my-6"></div>

          {/* Formulário de Senha */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Alterar Senha
            </h3>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Senha Atual *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Digite sua senha atual"
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="pl-10 pr-10"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Nova Senha *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Digite a senha novamente"
                    className="pl-10 pr-10"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={updatePassword.isPending}
              >
                {updatePassword.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Alterando...
                  </>
                ) : (
                  "Alterar Senha"
                )}
              </Button>
            </form>
          </div>

          {/* Divisor */}
          <div className="border-t border-slate-200 my-6"></div>

          {/* Seção de Exclusão de Conta - LGPD */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Excluir Conta
              </h3>
              <p className="text-sm text-slate-600 mt-2">
                Você pode solicitar a exclusão do acesso à sua conta conforme a LGPD.
              </p>
            </div>

            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm text-amber-800">
                <strong>Importante:</strong> Ao solicitar a exclusão, seu acesso ao portal do hóspede será removido, 
                mas os dados de suas reservas e histórico fiscal serão mantidos para cumprimento de obrigações legais 
                (ex: notas fiscais, registros contábeis).
              </AlertDescription>
            </Alert>

            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDeleteConfirmDialog(true)}
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Solicitar Exclusão de Conta
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Dialog de Confirmação de Exclusão */}
      <Dialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Exclusão de Conta
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm text-amber-800">
                <strong>O que será feito:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Seu acesso ao portal do hóspede será removido</li>
                  <li>Você não poderá mais fazer login</li>
                  <li>Seus dados pessoais de acesso serão desativados</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription className="text-sm text-blue-800">
                <strong>O que será mantido (obrigações legais):</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Dados de suas reservas</li>
                  <li>Histórico fiscal e notas fiscais</li>
                  <li>Registros contábeis necessários</li>
                </ul>
                <p className="mt-2 text-xs">
                  Estes dados são mantidos para cumprimento de obrigações legais e fiscais conforme a legislação brasileira.
                </p>
              </AlertDescription>
            </Alert>

            <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
              <input
                type="checkbox"
                id="confirmDelete"
                className="w-4 h-4 text-red-600 border-slate-300 rounded focus:ring-red-500 mt-0.5"
              />
              <label htmlFor="confirmDelete" className="text-sm text-slate-700 cursor-pointer">
                Entendo que meu acesso será removido e que os dados de reservas e histórico fiscal serão mantidos.
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirmDialog(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const checkbox = document.getElementById("confirmDelete") as HTMLInputElement;
                if (!checkbox?.checked) {
                  toast.error("Por favor, confirme que entendeu as consequências");
                  return;
                }

                try {
                  await deactivateAccount.mutateAsync(accountId);
                  setShowDeleteConfirmDialog(false);
                  onOpenChange(false);
                  // Redirecionar após um breve delay
                  setTimeout(() => {
                    navigate("/web-checkin");
                  }, 2000);
                } catch (error) {
                  // Erro já é tratado no hook
                }
              }}
              disabled={deactivateAccount.isPending}
              className="flex-1"
            >
              {deactivateAccount.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Confirmar Exclusão
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}


