import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEmployees, useEmployeeRoles, useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserLimits } from "@/hooks/useUserLimits";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Loader2, Users, Shield, AlertCircle, Key, UserPlus, User, Briefcase, Mail, Phone, FileText, MapPin, Building2, Calendar, Lock, CheckCircle2, XCircle, Sparkles, Send } from "lucide-react";
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
import { EmployeePermissionsDialog } from "@/components/employees/EmployeePermissionsDialog";
import { RolePermissionsDialog } from "@/components/employees/RolePermissionsDialog";
import { sendEmployeeAddedToEstablishmentEmail } from "@/lib/emailService";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useEstablishment } from "@/contexts/EstablishmentContext";

type EmployeeAuthStatus = {
  email: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  is_banned: boolean;
  email_confirmed: boolean;
  auth_label: "ativo" | "pendente" | "suspenso";
};

const Employees = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [rolePermissionsDialogOpen, setRolePermissionsDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>();
  const [selectedEmployeeForPermissions, setSelectedEmployeeForPermissions] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("employees");
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

  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();
  const { employees, isLoading, createEmployee, updateEmployee, deleteEmployee, refetch } = useEmployees();
  const { roles, isLoading: isLoadingRoles, refetch: refetchRoles } = useEmployeeRoles();
  const { role } = useCurrentEmployeeRole();
  const { canAccess } = usePermissions();
  const { createOrUpdateUserLimit } = useUserLimits();

  const [resendingUserId, setResendingUserId] = useState<string | null>(null);

  const establishmentIdForAuth =
    selectedEstablishment?.id ?? localStorage.getItem("selectedEstablishmentId") ?? null;

  const employeeUserIdsKey = useMemo(() => {
    const ids = employees
      .map((e) => e.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    return [...new Set(ids)].sort().join(",");
  }, [employees]);

  const { data: employeeAuthStatuses = {}, isLoading: isLoadingEmployeeAuth } = useQuery({
    queryKey: ["employee_auth_status", establishmentIdForAuth, employeeUserIdsKey],
    queryFn: async () => {
      if (!establishmentIdForAuth || !employeeUserIdsKey) return {};
      const user_ids = employeeUserIdsKey.split(",").filter(Boolean);
      if (user_ids.length === 0) return {};

      const { data, error } = await supabase.functions.invoke("employee-auth-admin", {
        body: {
          action: "auth_status_batch",
          establishment_id: establishmentIdForAuth,
          user_ids,
        },
      });

      if (error) throw error;
      if (data && typeof data === "object" && "error" in data && (data as { error: string }).error) {
        throw new Error(String((data as { error: string }).error));
      }

      return (
        (data as { statuses?: Record<string, EmployeeAuthStatus | null> })?.statuses ?? {}
      ) as Record<string, EmployeeAuthStatus | null>;
    },
    enabled: Boolean(establishmentIdForAuth && employeeUserIdsKey.length > 0),
  });
  
  // Buscar usuários de todas as empresas onde o gerente atual é gerente
  const { data: companyUsers = [], isLoading: isLoadingCompanyUsers } = useQuery({
    queryKey: ["company_users", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = selectedEstablishment?.id || localStorage.getItem("selectedEstablishmentId");
      if (!establishmentId) {
        return [];
      }

      // Buscar o usuário logado
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        return [];
      }

      // Buscar o role_id do gerente
      const { data: managerRole, error: roleError } = await supabase
        .from("employee_roles")
        .select("id")
        .eq("code", "manager")
        .maybeSingle();

      if (roleError || !managerRole) {
        console.error("Erro ao buscar role de gerente:", roleError);
        return [];
      }

      // Buscar todos os estabelecimentos onde o usuário atual é gerente
      const { data: managerEmployees, error: employeesError } = await supabase
        .from("employees")
        .select("establishment_id")
        .eq("user_id", currentUser.id)
        .eq("role_id", managerRole.id)
        .eq("is_active", true);

      if (employeesError) {
        console.error("Erro ao buscar estabelecimentos do gerente:", employeesError);
        return [];
      }

      if (!managerEmployees || managerEmployees.length === 0) {
        // Se não for gerente de nenhum estabelecimento, buscar apenas da empresa atual
        const { data: establishmentData, error: establishmentError } = await supabase
          .from("establishments")
          .select("company_id")
          .eq("id", establishmentId)
          .single();

        if (establishmentError || !establishmentData?.company_id) {
          return [];
        }

        const companyId = establishmentData.company_id;

        // Buscar user_ids associados à empresa via user_companies
        const { data: userCompanies, error: userCompaniesError } = await supabase
          .from("user_companies")
          .select("user_id")
          .eq("company_id", companyId)
          .eq("is_active", true);

        if (userCompaniesError || !userCompanies || userCompanies.length === 0) {
          return [];
        }

        const userIds = userCompanies.map((uc: any) => uc.user_id);

        const { data: users, error: usersError } = await supabase
          .from("users")
          .select("id, email, full_name, cpf, phone")
          .in("id", userIds);

        if (usersError) {
          return [];
        }

        return (users || []).map((user: any) => ({
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          cpf: user.cpf,
          phone: user.phone,
        }));
      }

      // Extrair IDs dos estabelecimentos
      const establishmentIds = managerEmployees.map((emp: any) => emp.establishment_id);

      // Buscar os estabelecimentos para obter os company_ids
      const { data: establishments, error: establishmentsError } = await supabase
        .from("establishments")
        .select("company_id")
        .in("id", establishmentIds);

      if (establishmentsError || !establishments || establishments.length === 0) {
        return [];
      }

      // Extrair company_ids únicos dos estabelecimentos onde é gerente
      const companyIds = [...new Set(
        establishments
          .map((est: any) => est.company_id)
          .filter(Boolean)
      )];

      if (companyIds.length === 0) {
        return [];
      }

      // Buscar user_ids associados a todas essas empresas via user_companies
      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select("user_id")
        .in("company_id", companyIds)
        .eq("is_active", true);

      if (userCompaniesError) {
        console.error("Erro ao buscar usuários das empresas:", userCompaniesError);
        return [];
      }

      if (!userCompanies || userCompanies.length === 0) {
        return [];
      }

      // Extrair os user_ids únicos
      const userIds = [...new Set(userCompanies.map((uc: any) => uc.user_id))];

      // Buscar os dados dos usuários
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, email, full_name, cpf, phone")
        .in("id", userIds);

      if (usersError) {
        console.error("Erro ao buscar dados dos usuários:", usersError);
        return [];
      }

      // Formatar os usuários
      return (users || []).map((user: any) => ({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        cpf: user.cpf,
        phone: user.phone,
      }));
    },
    enabled: !!(selectedEstablishment?.id || localStorage.getItem("selectedEstablishmentId")),
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const establishmentId = selectedEstablishment?.id || localStorage.getItem("selectedEstablishmentId");
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
            // Edge Function: createUser com confirmação de e-mail (template Confirm sign up).
            const { data: fnData, error: fnError } = await supabase.functions.invoke(
              "create-employee-auth",
              {
                body: {
                  email: formData.email,
                  password: formData.password,
                  full_name: formData.full_name || undefined,
                  establishment_id: establishmentId,
                },
              }
            );

            if (fnError) throw fnError;
            if (fnData && typeof fnData === "object" && "error" in fnData && fnData.error) {
              throw new Error(String((fnData as { error: string }).error));
            }

            const newUserId = (fnData as { user_id?: string })?.user_id;
            if (!newUserId) throw new Error("Erro ao criar usuário");

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
                .eq("id", newUserId);

              if (updateError) {
                console.error("Erro ao atualizar perfil do usuário:", updateError);
              }
            }

            // Buscar o usuário criado na tabela public.users
            const { data: userData, error: fetchError } = await supabase
              .from("users")
              .select("*")
              .eq("id", newUserId)
              .single();
            
            if (fetchError) throw fetchError;
            if (!userData) throw new Error("Usuário criado mas não encontrado na tabela");

            userId = userData.id;

            const authSent = (fnData as { auth_email_sent?: boolean })?.auth_email_sent;
            if (authSent) {
              toast.info(
                "Foi enviado o e-mail de confirmação da conta (template Confirm sign up / StayOS). Verifique o spam."
              );
            } else {
              toast.info(
                "Conta criada; se não chegar e-mail de confirmação, confira SITE_URL / AUTH_REDIRECT_URL na função create-employee-auth e as URLs em Authentication → URL Configuration."
              );
            }

            // Criar limite de usuário para impedir que funcionário crie empresas ou estabelecimentos
            // Funcionários criados por gerentes devem ter max_companies = 0 e max_establishments = 0
            try {
              await createOrUpdateUserLimit({
                user_id: userId,
                max_companies: 0, // Funcionário não pode criar empresas
                max_establishments: 0, // Funcionário não pode criar estabelecimentos
              });
            } catch (limitError: any) {
              console.error("Erro ao configurar limites do funcionário:", limitError);
              // Não bloquear a criação do funcionário se houver erro ao configurar limites
              // Mas avisar o usuário
              toast.warning("Funcionário criado, mas houve um aviso ao configurar permissões");
            }
          } catch (error: any) {
            toast.error(error.message || "Erro ao criar usuário");
            throw error;
          }
        }

        if (!userId) {
          toast.error("Selecione um usuário ou crie um novo");
          return;
        }

        // Buscar a empresa do estabelecimento para associar o funcionário
        const { data: establishmentData, error: establishmentError } = await supabase
          .from("establishments")
          .select("company_id")
          .eq("id", establishmentId)
          .single();

        if (establishmentError || !establishmentData?.company_id) {
          toast.error("Erro ao buscar dados do estabelecimento");
          return;
        }

        const companyId = establishmentData.company_id;

        // Se não foi criado um novo usuário, verificar se precisa configurar limites
        // Apenas se o usuário não tiver limites configurados e não tiver empresas associadas
        if (!createNewUser) {
          try {
            const { data: existingLimit } = await supabase
              .from("user_limits")
              .select("*")
              .eq("user_id", userId)
              .maybeSingle();

            // Verificar se o usuário já tem empresas associadas
            const { data: userCompanies } = await supabase
              .from("user_companies")
              .select("id")
              .eq("user_id", userId)
              .limit(1);

            // Se o usuário não tem limites configurados E não tem empresas associadas,
            // configurar limites para funcionário (não pode criar empresas ou estabelecimentos)
            // Se o usuário já tem empresas, não alteramos os limites (pode ser um proprietário)
            if (!existingLimit && (!userCompanies || userCompanies.length === 0)) {
              await createOrUpdateUserLimit({
                user_id: userId,
                max_companies: 0, // Funcionário não pode criar empresas
                max_establishments: 0, // Funcionário não pode criar estabelecimentos
              });
            }
          } catch (limitError: any) {
            console.error("Erro ao verificar/configurar limites do funcionário:", limitError);
            // Não bloquear a criação do funcionário se houver erro
          }
        }

        // Criar o funcionário
        await createEmployee({
          user_id: userId,
          establishment_id: establishmentId,
          role_id: formData.role_id,
          full_name: formData.full_name,
          cpf: formData.cpf || undefined,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
        });

        // Buscar dados do cargo para o e-mail
        let roleName = "";
        if (formData.role_id) {
          try {
            const { data: roleData } = await supabase
              .from("employee_roles")
              .select("name")
              .eq("id", formData.role_id)
              .maybeSingle();
            if (roleData) {
              roleName = roleData.name;
            }
          } catch (error) {
            console.error("Erro ao buscar nome do cargo:", error);
          }
        }

        // Buscar nome do estabelecimento e empresa
        let establishmentName = "";
        let companyName = "";
        try {
          const { data: estData } = await supabase
            .from("establishments")
            .select(`
              name,
              companies (
                name
              )
            `)
            .eq("id", establishmentId)
            .maybeSingle();
          
          if (estData) {
            establishmentName = estData.name || "";
            if (estData.companies) {
              const companies = Array.isArray(estData.companies) ? estData.companies[0] : estData.companies;
              companyName = companies?.name || "";
            }
          }
        } catch (error) {
          console.error("Erro ao buscar dados do estabelecimento:", error);
        }

        // Buscar e-mail do usuário se não foi fornecido no formulário
        let employeeEmail = formData.email;
        let employeeName = formData.full_name;
        
        // Se não temos e-mail do formulário, buscar do usuário
        if (!employeeEmail && userId) {
          try {
            // Buscar da tabela users
            const { data: userData } = await supabase
              .from("users")
              .select("email, full_name")
              .eq("id", userId)
              .maybeSingle();
            
            if (userData) {
              employeeEmail = userData.email || null;
              if (!employeeName && userData.full_name) {
                employeeName = userData.full_name;
              }
            }
            
            // Se ainda não encontrou e-mail, verificar se o usuário selecionado tem e-mail
            // (pode estar na lista de companyUsers)
            if (!employeeEmail) {
              const selectedUser = companyUsers?.find((u: any) => u.id === userId);
              if (selectedUser?.email) {
                employeeEmail = selectedUser.email;
                if (!employeeName && selectedUser.full_name) {
                  employeeName = selectedUser.full_name;
                }
              }
            }
          } catch (error) {
            console.error("Erro ao buscar e-mail do usuário:", error);
          }
        }

        // Log para debug
        console.log("📧 Dados para envio de e-mail:", {
          hasEmail: !!employeeEmail,
          employeeEmail: employeeEmail ? employeeEmail.substring(0, 10) + "..." : "não encontrado",
          employeeName,
          establishmentName,
          companyName,
          roleName,
        });

        // Enviar e-mail de notificação ao funcionário
        if (employeeEmail) {
          try {
            const emailResult = await sendEmployeeAddedToEstablishmentEmail({
              userId: userId,
              employeeName: employeeName || employeeEmail.split('@')[0],
              employeeEmail: employeeEmail,
              establishmentId: establishmentId,
              establishmentName: establishmentName,
              companyName: companyName,
              roleName: roleName,
            });
            
            if (emailResult) {
              console.log("✅ E-mail de notificação enviado com sucesso:", emailResult);
            } else {
              console.warn("⚠️ E-mail de notificação não foi enviado (retornou null)");
            }
          } catch (emailError: any) {
            console.error("❌ Erro ao enviar e-mail de notificação:", emailError);
            // Não bloquear a criação do funcionário se houver erro no e-mail
            toast.warning("Funcionário criado, mas houve um aviso ao enviar e-mail de notificação");
          }
        } else {
          console.warn("⚠️ E-mail do funcionário não encontrado. E-mail de notificação não será enviado.");
        }

        // Associar o funcionário à empresa do estabelecimento
        // Usar upsert para permitir que outras empresas também possam adicionar o mesmo funcionário
        // Se já existir associação com esta empresa, não dará erro (upsert)
        try {
          const { error: userCompanyError } = await supabase
            .from("user_companies")
            .upsert(
              {
                user_id: userId,
                company_id: companyId,
                max_companies: 0, // Funcionário não pode criar empresas
                max_establishments: 0, // Funcionário não pode criar estabelecimentos
                is_active: true,
              },
              {
                onConflict: "user_id,company_id", // Se já existir, atualiza
                ignoreDuplicates: false,
              }
            );

          if (userCompanyError) {
            console.error("Erro ao associar funcionário à empresa:", userCompanyError);
            // Não bloquear se já existir associação (pode ser que outra empresa já tenha adicionado)
            if (!userCompanyError.message.includes("duplicate") && !userCompanyError.message.includes("unique")) {
              toast.warning("Funcionário criado, mas houve um aviso ao associar à empresa");
            }
          }
        } catch (userCompanyError: any) {
          console.error("Erro ao associar funcionário à empresa:", userCompanyError);
          // Não bloquear a criação do funcionário se houver erro na associação
        }
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
    const selectedUser = companyUsers.find((u: any) => u.id === userId);
    if (selectedUser) {
      setFormData({
        ...formData,
        user_id: userId || "",
        full_name: selectedUser.full_name || "",
        cpf: selectedUser.cpf || "",
        phone: selectedUser.phone || "",
        email: selectedUser.email || "",
      });
    } else {
      setFormData({ ...formData, user_id: userId || "" });
    }
  };

  const handleEdit = (employee: any) => {
    setSelectedEmployeeId(employee.id);
    setCreateNewUser(false);
    setFormData({
      user_id: employee.user_id || "",
      role_id: employee.role_id || "",
      full_name: employee.full_name || "",
      cpf: employee.cpf || "",
      phone: employee.phone || "",
      email: employee.email || "",
      password: "",
      address: employee.address || "",
      city: employee.city || "",
      state: employee.state || "",
      postal_code: employee.postal_code || "",
      country: employee.country || "Brasil",
      birth_date: employee.birth_date || "",
      is_active: employee.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const handleResendConfirmation = async (employee: { user_id?: string }) => {
    const est = selectedEstablishment?.id ?? localStorage.getItem("selectedEstablishmentId");
    if (!est || !employee.user_id) {
      toast.error("Estabelecimento ou utilizador inválido");
      return;
    }
    setResendingUserId(employee.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("employee-auth-admin", {
        body: {
          action: "resend_confirmation",
          establishment_id: est,
          user_id: employee.user_id,
        },
      });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data && (data as { error: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      toast.success("E-mail de confirmação da conta reenviado (Confirm sign up). Peça para verificar o spam.");
      await queryClient.invalidateQueries({ queryKey: ["employee_auth_status"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao reenviar");
    } finally {
      setResendingUserId(null);
    }
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
          <p className="text-muted-foreground">Gerencie os funcionários e funções do estabelecimento</p>
        </div>
        {activeTab === "employees" && (
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
              address: "",
              city: "",
              state: "",
              postal_code: "",
              country: "Brasil",
              birth_date: "",
              is_active: true,
            });
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Funcionário
        </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="employees">
            <Users className="h-4 w-4 mr-2" />
            Funcionários
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Shield className="h-4 w-4 mr-2" />
            Controle de Funções
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-6">

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
                  <TableHead>Estabelecimento</TableHead>
                  <TableHead>Conta (Supabase Auth)</TableHead>
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
                    <TableCell>
                      {isLoadingEmployeeAuth ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (() => {
                        const auth = employeeAuthStatuses[employee.user_id];
                        if (!auth) {
                          return <span className="text-sm text-muted-foreground">—</span>;
                        }
                        const label =
                          auth.auth_label === "ativo"
                            ? "Confirmada"
                            : auth.auth_label === "suspenso"
                              ? "Suspensa"
                              : "Pendente confirmação";
                        const variant =
                          auth.auth_label === "suspenso"
                            ? "destructive"
                            : auth.auth_label === "ativo"
                              ? "default"
                              : "secondary";
                        return (
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant={variant}>
                              {label}
                            </Badge>
                            {auth.last_sign_in_at ? (
                              <span className="text-xs text-muted-foreground max-w-[10rem] leading-tight">
                                Último acesso:{" "}
                                {new Date(auth.last_sign_in_at).toLocaleString("pt-BR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sem login registado</span>
                            )}
                          </div>
                        );
                      })()}
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
                          {(() => {
                            const auth = employeeAuthStatuses[employee.user_id];
                            const canResend =
                              !isLoadingEmployeeAuth &&
                              !!auth &&
                              !auth.email_confirmed &&
                              !auth.is_banned &&
                              !!(auth.email || employee.email || employee.users?.email);
                            return (
                              <DropdownMenuItem
                                disabled={!canResend || resendingUserId === employee.user_id}
                                onClick={() => {
                                  if (canResend) void handleResendConfirmation(employee);
                                }}
                              >
                                {resendingUserId === employee.user_id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4 mr-2" />
                                )}
                                Reenviar link de confirmação
                              </DropdownMenuItem>
                            );
                          })()}
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedEmployeeForPermissions(employee);
                              setPermissionsDialogOpen(true);
                            }}
                          >
                            <Key className="h-4 w-4 mr-2" />
                            Editar Permissões
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
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                {selectedEmployeeId ? (
                  <Edit className="h-5 w-5 text-primary" />
                ) : (
                  <UserPlus className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold">
                  {selectedEmployeeId ? "Editar Funcionário" : "Novo Funcionário"}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedEmployeeId 
                    ? "Atualize as informações do funcionário" 
                    : "Adicione um funcionário e vincule-o à empresa"}
                </p>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 pt-4">
            {!selectedEmployeeId && (
              <div 
                className={`relative p-5 rounded-xl border-2 transition-all group ${
                  createNewUser 
                    ? "border-primary bg-primary/5 shadow-md" 
                    : "border-border bg-gradient-to-br from-muted/50 to-muted/30 hover:border-primary/50 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`p-3 rounded-lg transition-colors ${
                      createNewUser ? "bg-primary/20" : "bg-muted group-hover:bg-primary/10"
                    }`}>
                      <Sparkles className={`h-5 w-5 transition-colors ${
                        createNewUser ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Label htmlFor="create_new_user" className="text-base font-semibold cursor-pointer">
                          Cadastrar novo usuário
                        </Label>
                        {createNewUser && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {createNewUser 
                          ? "Preencha os dados abaixo para criar um novo usuário no sistema" 
                          : "Não encontrou o usuário na lista? Ative para criar um novo"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="create_new_user"
                    checked={createNewUser}
                    onCheckedChange={(checked) => {
                      setCreateNewUser(checked);
                      if (checked) {
                        setFormData((prev) => ({ ...prev, user_id: "" }));
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {!createNewUser && !selectedEmployeeId && (
              <div className="space-y-4 p-5 rounded-xl border bg-card">
                <div className="flex items-center gap-3 pb-3 border-b">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">Dados do Usuário</h3>
                    <p className="text-xs text-muted-foreground">Selecione um usuário da empresa</p>
                  </div>
                </div>
                {isLoadingCompanyUsers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">Carregando usuários...</span>
                  </div>
                ) : companyUsers.length === 0 ? (
                  <div className="p-4 border-2 border-dashed rounded-lg bg-muted/30 text-center">
                    <User className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">
                      Nenhum usuário cadastrado na empresa. Ative a opção acima para criar um novo usuário.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="user_id" className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      Usuário da Empresa *
                    </Label>
                    <Select
                      value={formData.user_id}
                      onValueChange={handleUserSelect}
                      required={!createNewUser}
                      disabled={!!selectedEmployeeId}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Selecione um usuário cadastrado na empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {companyUsers.map((user: any) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{user.full_name || "Sem nome"}</span>
                                <span className="text-xs text-muted-foreground">{user.email}</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Usuários podem ser funcionários de múltiplas empresas
                    </p>
                  </div>
                )}
              </div>
            )}

            {createNewUser && !selectedEmployeeId && (
              <div className="space-y-5 p-5 rounded-xl border bg-gradient-to-br from-primary/5 to-primary/0">
                <div className="flex items-center gap-3 pb-3 border-b">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <UserPlus className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">Dados do Novo Usuário</h3>
                    <p className="text-xs text-muted-foreground">Preencha os dados para criar um novo usuário</p>
                  </div>
                </div>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="new_email" className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      E-mail *
                    </Label>
                    <Input
                      id="new_email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required={createNewUser}
                      placeholder="usuario@exemplo.com"
                      className="h-11"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="password" className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      Senha *
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required={createNewUser}
                      placeholder="Mínimo 6 caracteres"
                      minLength={6}
                      className="h-11"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="new_full_name" className="text-sm font-medium mb-2 flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Nome Completo
                    </Label>
                    <Input
                      id="new_full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Digite o nome completo"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_cpf" className="text-sm font-medium mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      CPF
                    </Label>
                    <Input
                      id="new_cpf"
                      value={formData.cpf}
                      onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                      placeholder="000.000.000-00"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_phone" className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      Telefone
                    </Label>
                    <Input
                      id="new_phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      className="h-11"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="new_birth_date" className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Data de Nascimento
                    </Label>
                    <Input
                      id="new_birth_date"
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                      className="h-11"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="new_address" className="text-sm font-medium mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Endereço
                    </Label>
                    <Input
                      id="new_address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Rua, número, complemento"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_city" className="text-sm font-medium mb-2">Cidade</Label>
                    <Input
                      id="new_city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Cidade"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_state" className="text-sm font-medium mb-2">Estado</Label>
                    <Input
                      id="new_state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      placeholder="UF"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_postal_code" className="text-sm font-medium mb-2">CEP</Label>
                    <Input
                      id="new_postal_code"
                      value={formData.postal_code}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                      placeholder="00000-000"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_country" className="text-sm font-medium mb-2">País</Label>
                    <Input
                      id="new_country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      placeholder="País"
                      className="h-11"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedEmployeeId && (
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {companyUsers.find((u: any) => u.id === formData.user_id)?.full_name || companyUsers.find((u: any) => u.id === formData.user_id)?.email || "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Usuário não pode ser alterado</p>
                </div>
              </div>
            )}

            {/* Informações Profissionais */}
            <div className="space-y-4 p-5 rounded-xl border bg-card">
              <div className="flex items-center gap-3 pb-3 border-b">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Briefcase className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Informações Profissionais</h3>
                  <p className="text-xs text-muted-foreground">Defina a função do funcionário</p>
                </div>
              </div>
              <div>
                <Label htmlFor="role_id" className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Função *
                </Label>
                <Select
                  value={formData.role_id}
                  onValueChange={(value) => setFormData({ ...formData, role_id: value })}
                  required
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione a função" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-sm">{role.name}</div>
                            {role.description && (
                              <div className="text-xs text-muted-foreground">{role.description}</div>
                            )}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Informações Pessoais */}
            {!createNewUser && (
              <div className="space-y-4 p-5 rounded-xl border bg-card">
                <div className="flex items-center gap-3 pb-3 border-b">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <User className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">Informações Pessoais</h3>
                    <p className="text-xs text-muted-foreground">Dados pessoais do funcionário</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="full_name" className="text-sm font-medium mb-2 flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Nome Completo *
                    </Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                      placeholder="Digite o nome completo"
                      className="h-11"
                    />
                  </div>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="cpf" className="text-sm font-medium mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        CPF
                      </Label>
                      <Input
                        id="cpf"
                        value={formData.cpf}
                        onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                        placeholder="000.000.000-00"
                        className="h-11"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        Telefone
                      </Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(00) 00000-0000"
                        className="h-11"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      E-mail
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@exemplo.com"
                      className="h-11"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      E-mail de contato do funcionário (opcional)
                    </p>
                  </div>
                </div>
              </div>
            )}
            {selectedEmployeeId && (
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-3">
                  {formData.is_active ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <Label htmlFor="is_active" className="text-sm font-medium cursor-pointer">
                      Status do Funcionário
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {formData.is_active ? "Funcionário está ativo" : "Funcionário está inativo"}
                    </p>
                  </div>
                </div>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setDialogOpen(false)}
                className="w-full sm:w-auto h-11"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button 
                type="submit"
                className="w-full sm:w-auto h-11"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Permissões */}
      {selectedEmployeeForPermissions && (
        <EmployeePermissionsDialog
          open={permissionsDialogOpen}
          onOpenChange={setPermissionsDialogOpen}
          employee={selectedEmployeeForPermissions}
          onSuccess={async () => {
            // Recarregar lista de funcionários e invalidar cache de permissões
            refetch();
            // Se o funcionário editado for o usuário atual, invalidar cache de role
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user && selectedEmployeeForPermissions?.user_id === user.id) {
                queryClient.invalidateQueries({ queryKey: ["current_employee_role"] });
              }
            } catch (error) {
              console.error("Erro ao verificar usuário:", error);
            }
          }}
        />
      )}

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
        </TabsContent>

        <TabsContent value="roles" className="space-y-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">Controle de Funções</h2>
                  <p className="text-muted-foreground mt-1">
                    Gerencie as permissões padrão de cada função. As permissões definidas aqui serão aplicadas a todos os funcionários com essa função.
                  </p>
                </div>
              </div>

              {isLoadingRoles ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : roles.length === 0 ? (
                <div className="p-12 text-center">
                  <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground font-medium">Nenhuma função cadastrada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Função</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.map((role) => (
                        <TableRow key={role.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Shield className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{role.name}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{role.code}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {role.description || "-"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedRole(role);
                                setRolePermissionsDialogOpen(true);
                              }}
                            >
                              <Key className="h-4 w-4 mr-2" />
                              Editar Permissões
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </Card>

          {/* Dialog: Editar Permissões da Função */}
          {selectedRole && (
            <RolePermissionsDialog
              open={rolePermissionsDialogOpen}
              onOpenChange={setRolePermissionsDialogOpen}
              role={selectedRole}
              onSuccess={() => {
                refetchRoles();
                queryClient.invalidateQueries({ queryKey: ["employee_roles"] });
                queryClient.invalidateQueries({ queryKey: ["current_employee_role"] });
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Employees;

