import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEmployees, useEmployeeRoles, useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { useUsers } from "@/hooks/useUsers";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, Loader2, Users, Shield, AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";

const Employees = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { employees, isLoading, createEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const { roles } = useEmployeeRoles();
  const { users } = useUsers();
  const { role } = useCurrentEmployeeRole();
  const { canAccess } = usePermissions();

  // Verificar se tem permissão para acessar funcionários (apenas gerentes)
  if (role && role.code !== "manager" && !canAccess("employees")) {
    return (
      <div className="space-y-6">
        <Card className="p-12 text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-destructive" />
          <h2 className="text-2xl font-bold mb-2">Acesso Negado</h2>
          <p className="text-muted-foreground">
            Apenas gerentes podem gerenciar funcionários.
          </p>
        </Card>
      </div>
    );
  }

  const [createNewUser, setCreateNewUser] = useState(false);
  const [formData, setFormData] = useState({
    user_id: "",
    role_id: "",
    full_name: "",
    cpf: "",
    phone: "",
    email: "",
    password: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    country: "Brasil",
    birth_date: "",
    is_active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const establishmentId = localStorage.getItem("selectedEstablishmentId");
      if (!establishmentId) {
        toast.error("Nenhum estabelecimento selecionado");
        return;
      }

      if (selectedEmployeeId) {
        await updateEmployee({
          id: selectedEmployeeId,
          role_id: formData.role_id || undefined,
          full_name: formData.full_name || undefined,
          cpf: formData.cpf || undefined,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          is_active: formData.is_active,
        });
      } else {
        let userId = formData.user_id;

        // Se estiver criando um novo usuário, criar primeiro
        if (createNewUser) {
          if (!formData.email || !formData.password) {
            toast.error("E-mail e senha são obrigatórios para criar um novo usuário");
            return;
          }

          try {
            // Criar usuário via signup (não requer super admin)
            const { data: signupData, error: signupError } = await supabase.auth.signUp({
              email: formData.email,
              password: formData.password,
              options: {
                emailRedirectTo: `${window.location.origin}/auth`,
                data: {
                  full_name: formData.full_name || undefined,
                },
              },
            });

            if (signupError) throw signupError;
            if (!signupData.user) throw new Error("Erro ao criar usuário");

            // Aguardar um pouco para o trigger sincronizar
            await new Promise(resolve => setTimeout(resolve, 500));

            // Atualizar a tabela users com os dados de perfil
            const profileData: any = {};
            if (formData.full_name) profileData.full_name = formData.full_name;
            if (formData.cpf) profileData.cpf = formData.cpf;
            if (formData.phone) profileData.phone = formData.phone;
            if (formData.address) profileData.address = formData.address;
            if (formData.city) profileData.city = formData.city;
            if (formData.state) profileData.state = formData.state;
            if (formData.postal_code) profileData.postal_code = formData.postal_code;
            if (formData.country) profileData.country = formData.country;
            if (formData.birth_date) profileData.birth_date = formData.birth_date;

            if (Object.keys(profileData).length > 0) {
              const { error: updateError } = await supabase
                .from("users")
                .update(profileData)
                .eq("id", signupData.user.id);

              if (updateError) {
                console.error("Erro ao atualizar perfil do usuário:", updateError);
              }
            }

            // Buscar o usuário criado na tabela public.users
            const { data: userData, error: fetchError } = await supabase
              .from("users")
              .select("*")
              .eq("id", signupData.user.id)
              .single();
            
            if (fetchError) throw fetchError;
            if (!userData) throw new Error("Usuário criado mas não encontrado na tabela");

            userId = userData.id;
          } catch (error: any) {
            toast.error(error.message || "Erro ao criar usuário");
            throw error;
          }
        }

        if (!userId) {
          toast.error("Selecione um usuário ou crie um novo");
          return;
        }

        await createEmployee({
          user_id: userId,
          establishment_id: establishmentId,
          role_id: formData.role_id,
          full_name: formData.full_name,
          cpf: formData.cpf || undefined,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
        });
      }
      setDialogOpen(false);
      setCreateNewUser(false);
      setFormData({
        user_id: "",
        role_id: "",
        full_name: "",
        cpf: "",
        phone: "",
        email: "",
        password: "",
        address: "",
        city: "",
        state: "",
        postal_code: "",
        country: "Brasil",
        birth_date: "",
        is_active: true,
      });
      setSelectedEmployeeId(undefined);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar funcionário");
    }
  };

  const handleUserSelect = (userId: string) => {
    const selectedUser = users.find((u: any) => u.id === userId);
    if (selectedUser) {
      setFormData({
        ...formData,
        user_id: userId,
        full_name: selectedUser.full_name || "",
        cpf: selectedUser.cpf || "",
        phone: selectedUser.phone || "",
        email: selectedUser.email || "",
      });
    } else {
      setFormData({ ...formData, user_id: userId });
    }
  };

  const handleEdit = (employee: any) => {
    setSelectedEmployeeId(employee.id);
    setCreateNewUser(false);
    setFormData({
      user_id: employee.user_id,
      role_id: employee.role_id,
      full_name: employee.full_name,
      cpf: employee.cpf || "",
      phone: employee.phone || "",
      email: employee.email || "",
      password: "",
      address: "",
      city: "",
      state: "",
      postal_code: "",
      country: "Brasil",
      birth_date: "",
      is_active: employee.is_active,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteEmployee(deleteId);
      setDeleteDialogOpen(false);
      setDeleteId(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir funcionário");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Funcionários</h1>
          <p className="text-muted-foreground">Gerencie os funcionários do estabelecimento</p>
        </div>
        <Button
          onClick={() => {
            setSelectedEmployeeId(undefined);
            setCreateNewUser(false);
            setFormData({
              user_id: "",
              role_id: "",
              full_name: "",
              cpf: "",
              phone: "",
              email: "",
              password: "",
              is_active: true,
            });
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Funcionário
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground font-medium">Nenhum funcionário cadastrado</p>
            <p className="text-sm text-muted-foreground mt-1">Comece adicionando um funcionário</p>
          </div>
        ) : (
          <div className="p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee: any) => (
                  <TableRow key={employee.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{employee.full_name}</p>
                          {employee.cpf && (
                            <p className="text-xs text-muted-foreground">CPF: {employee.cpf}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {employee.employee_roles?.name || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{employee.email || employee.users?.email || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{employee.phone || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={employee.is_active ? "default" : "secondary"}>
                        {employee.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(employee)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setDeleteId(employee.id);
                              setDeleteDialogOpen(true);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Dialog: Funcionário */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>
              {selectedEmployeeId ? "Editar Funcionário" : "Novo Funcionário"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            {!selectedEmployeeId && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border rounded-lg bg-muted/50">
                <div className="flex-1">
                  <Label htmlFor="create_new_user" className="text-sm sm:text-base font-medium">
                    Cadastrar novo usuário
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {createNewUser 
                      ? "Preencha os dados abaixo para criar um novo usuário" 
                      : "Não encontrou o usuário? Crie um novo"}
                  </p>
                </div>
                <Switch
                  id="create_new_user"
                  checked={createNewUser}
                  onCheckedChange={(checked) => {
                    setCreateNewUser(checked);
                    if (checked) {
                      setFormData({ ...formData, user_id: "" });
                    }
                  }}
                />
              </div>
            )}

            {!createNewUser && !selectedEmployeeId && (
              <div>
                <Label htmlFor="user_id" className="text-sm">Usuário *</Label>
                <Select
                  value={formData.user_id}
                  onValueChange={handleUserSelect}
                  required={!createNewUser}
                  disabled={!!selectedEmployeeId}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Nenhum usuário encontrado. Ative a opção acima para criar um novo.
                      </div>
                    ) : (
                      users.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          <span className="text-sm">{user.full_name || user.email}</span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecione o usuário que será funcionário
                </p>
              </div>
            )}

            {createNewUser && !selectedEmployeeId && (
              <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <Users className="h-4 w-4 text-primary flex-shrink-0" />
                  <Label className="text-sm sm:text-base font-medium">Dados do Novo Usuário</Label>
                </div>
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="new_email" className="text-sm">E-mail *</Label>
                    <Input
                      id="new_email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required={createNewUser}
                      placeholder="usuario@exemplo.com"
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="password" className="text-sm">Senha *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required={createNewUser}
                      placeholder="Mínimo 6 caracteres"
                      minLength={6}
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="new_full_name" className="text-sm">Nome Completo</Label>
                    <Input
                      id="new_full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Digite o nome completo"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_cpf" className="text-sm">CPF</Label>
                    <Input
                      id="new_cpf"
                      value={formData.cpf}
                      onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                      placeholder="000.000.000-00"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_phone" className="text-sm">Telefone</Label>
                    <Input
                      id="new_phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="new_birth_date" className="text-sm">Data de Nascimento</Label>
                    <Input
                      id="new_birth_date"
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="new_address" className="text-sm">Endereço</Label>
                    <Input
                      id="new_address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Rua, número, complemento"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_city" className="text-sm">Cidade</Label>
                    <Input
                      id="new_city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Cidade"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_state" className="text-sm">Estado</Label>
                    <Input
                      id="new_state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      placeholder="UF"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_postal_code" className="text-sm">CEP</Label>
                    <Input
                      id="new_postal_code"
                      value={formData.postal_code}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                      placeholder="00000-000"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_country" className="text-sm">País</Label>
                    <Input
                      id="new_country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      placeholder="País"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedEmployeeId && (
              <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  <strong>Usuário:</strong> {users.find((u: any) => u.id === formData.user_id)?.full_name || users.find((u: any) => u.id === formData.user_id)?.email || "N/A"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Usuário não pode ser alterado</p>
              </div>
            )}
            <div>
              <Label htmlFor="role_id" className="text-sm">Função *</Label>
              <Select
                value={formData.role_id}
                onValueChange={(value) => setFormData({ ...formData, role_id: value })}
                required
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      <div>
                        <div className="font-medium text-sm">{role.name}</div>
                        {role.description && (
                          <div className="text-xs text-muted-foreground">{role.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!createNewUser && (
              <>
                <div>
                  <Label htmlFor="full_name" className="text-sm">Nome Completo *</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    placeholder="Digite o nome completo"
                    className="mt-1"
                  />
                </div>
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="cpf" className="text-sm">CPF</Label>
                    <Input
                      id="cpf"
                      value={formData.cpf}
                      onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                      placeholder="000.000.000-00"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-sm">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email" className="text-sm">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    E-mail de contato do funcionário (opcional)
                  </p>
                </div>
              </>
            )}
            {selectedEmployeeId && (
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Ativo</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-2 pt-4 border-t">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setDialogOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                className="w-full sm:w-auto"
              >
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog: Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este funcionário? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Employees;

