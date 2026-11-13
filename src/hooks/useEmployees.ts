import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";

export interface EmployeeRole {
  id: string;
  name: string;
  code: string;
  description: string | null;
  permissions: any;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  user_id: string;
  establishment_id: string;
  role_id: string;
  full_name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  custom_permissions?: any;
  created_at: string;
  updated_at: string;
  employee_roles?: EmployeeRole;
  users?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

export interface CreateEmployeeData {
  user_id: string;
  establishment_id: string;
  role_id: string;
  full_name: string;
  cpf?: string;
  phone?: string;
  email?: string;
}

export const useEmployeeRoles = () => {
  const rolesQuery = useQuery({
    queryKey: ["employee_roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_roles")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as EmployeeRole[];
    },
  });

  return {
    roles: rolesQuery.data || [],
    isLoading: rolesQuery.isLoading,
    refetch: rolesQuery.refetch,
  };
};

export const useEmployees = () => {
  const queryClient = useQueryClient();
  // Usar o contexto do estabelecimento em vez de ler do localStorage diretamente
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || null;

  const employeesQuery = useQuery({
    queryKey: ["employees", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return [];

      // Buscar funcionários com roles
      const { data: employeesData, error: employeesError } = await supabase
        .from("employees")
        .select(`
          *,
          employee_roles (*)
        `)
        .eq("establishment_id", establishmentId)
        .order("full_name");

      if (employeesError) throw employeesError;
      if (!employeesData) return [];

      // Buscar dados dos usuários separadamente
      const userIds = [...new Set(employeesData.map((emp: any) => emp.user_id).filter(Boolean))];
      
      let usersMap: Record<string, { id: string; email: string; full_name: string | null }> = {};
      
      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from("users")
          .select("id, email, full_name")
          .in("id", userIds);

        if (usersError) {
          console.warn("Erro ao buscar dados dos usuários:", usersError);
        } else if (usersData) {
          usersMap = usersData.reduce((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {} as Record<string, { id: string; email: string; full_name: string | null }>);
        }
      }

      // Combinar dados
      const employees = employeesData.map((emp: any) => ({
        ...emp,
        users: usersMap[emp.user_id] || null,
      }));

      return employees as Employee[];
    },
    enabled: !!establishmentId,
  });

  const createEmployee = useMutation({
    mutationFn: async (employeeData: CreateEmployeeData) => {
      const { data: employee, error } = await supabase
        .from("employees")
        .insert([employeeData])
        .select(`
          *,
          employee_roles (*)
        `)
        .single();

      if (error) throw error;

      // Buscar dados do usuário separadamente
      let userData = null;
      if (employee.user_id) {
        const { data: user } = await supabase
          .from("users")
          .select("id, email, full_name")
          .eq("id", employee.user_id)
          .single();
        userData = user;
      }

      // Invalidar cache do current_employee_role para o estabelecimento onde o funcionário foi criado
      // Isso garante que se o funcionário criado for o próprio usuário logado, o role será atualizado
      queryClient.invalidateQueries({ 
        queryKey: ["current_employee_role", employeeData.establishment_id] 
      });

      return {
        ...employee,
        users: userData,
      } as Employee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Funcionário criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar funcionário");
    },
  });

  const updateEmployee = useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string; role_id?: string; full_name?: string; cpf?: string; phone?: string; email?: string; is_active?: boolean }) => {
      const { data: employee, error } = await supabase
        .from("employees")
        .update(updateData)
        .eq("id", id)
        .select(`
          *,
          employee_roles (*)
        `)
        .single();

      if (error) throw error;

      // Buscar dados do usuário separadamente
      let userData = null;
      if (employee.user_id) {
        const { data: user } = await supabase
          .from("users")
          .select("id, email, full_name")
          .eq("id", employee.user_id)
          .single();
        userData = user;
      }

      // Invalidar cache do current_employee_role para o estabelecimento do funcionário atualizado
      // Isso garante que se o funcionário atualizado for o próprio usuário logado, o role será atualizado
      queryClient.invalidateQueries({ 
        queryKey: ["current_employee_role", employee.establishment_id] 
      });

      return {
        ...employee,
        users: userData,
      } as Employee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Funcionário atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar funcionário");
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("employees")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Funcionário excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir funcionário");
    },
  });

  return {
    employees: employeesQuery.data || [],
    isLoading: employeesQuery.isLoading,
    refetch: employeesQuery.refetch,
    createEmployee: createEmployee.mutateAsync,
    updateEmployee: updateEmployee.mutateAsync,
    deleteEmployee: deleteEmployee.mutateAsync,
    isCreating: createEmployee.isPending,
  };
};

type StaffRoleRow = Employee & { employee_roles: EmployeeRole; custom_permissions?: unknown };

async function resolveStaffRoleForEstablishment(
  userId: string,
  establishmentId: string,
): Promise<StaffRoleRow | null> {
  const { data: employee, error } = await supabase
    .from("employees")
    .select("id, user_id, establishment_id, role_id, full_name, cpf, phone, email, is_active, custom_permissions, created_at, updated_at")
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Erro ao buscar funcionário:", error);
    return null;
  }

  if (employee?.role_id) {
    const { data: role, error: roleError } = await supabase
      .from("employee_roles")
      .select("*")
      .eq("id", employee.role_id)
      .maybeSingle();
    if (roleError || !role) return null;
    return { ...(employee as Employee), employee_roles: role as EmployeeRole };
  }

  const { data: establishment } = await supabase
    .from("establishments")
    .select("company_id")
    .eq("id", establishmentId)
    .maybeSingle();

  if (!establishment?.company_id) return null;

  const { data: membership } = await supabase
    .from("user_companies")
    .select("role, is_active")
    .eq("user_id", userId)
    .eq("company_id", establishment.company_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) return null;

  const roleCode =
    membership.role === "owner" ? "owner" : membership.role === "admin" ? "manager" : "manager";

  const { data: role } = await supabase
    .from("employee_roles")
    .select("*")
    .eq("code", roleCode)
    .maybeSingle();

  const fallbackRole =
    role ??
    (await supabase.from("employee_roles").select("*").eq("code", "manager").maybeSingle()).data;

  if (!fallbackRole) return null;

  return {
    id: `company-member-${establishmentId}`,
    user_id: userId,
    establishment_id: establishmentId,
    role_id: fallbackRole.id,
    full_name: "",
    cpf: null,
    phone: null,
    email: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    employee_roles: fallbackRole as EmployeeRole,
    custom_permissions: null,
  };
}

// Hook para obter o role do usuário atual no estabelecimento
export const useCurrentEmployeeRole = () => {
  // Usar o contexto do estabelecimento em vez de ler do localStorage diretamente
  // Isso garante que a query seja refetchada quando o estabelecimento mudar
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || null;

  const { data, isLoading } = useQuery({
    queryKey: ["current_employee_role", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return null;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: adminUser } = await supabase
        .from("admin_users")
        .select("is_super_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminUser?.is_super_admin === true) {
        return null;
      }

      return resolveStaffRoleForEstablishment(user.id, establishmentId);
    },
    enabled: !!establishmentId,
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  return {
    employee: data || null,
    role: data?.employee_roles || null,
    customPermissions: data?.custom_permissions || null,
    isLoading,
  };
};

