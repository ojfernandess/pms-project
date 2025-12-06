import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserCompanies } from "@/hooks/useUserCompanies";
import { useEstablishments } from "@/hooks/useEstablishments";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useUserLimits } from "@/hooks/useUserLimits";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, Hotel, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const UserDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  // Passar undefined para que o hook busque do usuário logado automaticamente
  const { userCompanies, isLoading: isLoadingCompanies, refetch: refetchUserCompanies } = useUserCompanies(undefined);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const { establishments, isLoading: isLoadingEstablishments, createEstablishment } = useEstablishments(selectedCompanyId || undefined);
  const { userLimit } = useUserLimits(userId || undefined);
  const { setSelectedEstablishment } = useEstablishment();
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [establishmentDialogOpen, setEstablishmentDialogOpen] = useState(false);
  const [companyFormData, setCompanyFormData] = useState({ name: "", cnpj: "", email: "" });
  const [establishmentFormData, setEstablishmentFormData] = useState({ 
    name: "", 
    type: "hotel",
    manager_user_id: "__current_user__" 
  });
  
  // Buscar usuários da empresa selecionada para seleção de gerente
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchCompanyUsers = async () => {
      if (!selectedCompanyId) {
        setCompanyUsers([]);
        return;
      }
      
      // Buscar user_ids associados à empresa
      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select("user_id")
        .eq("company_id", selectedCompanyId);
      
      if (userCompaniesError) {
        console.error("Erro ao buscar usuários da empresa:", userCompaniesError);
        setCompanyUsers([]);
        return;
      }
      
      if (!userCompanies || userCompanies.length === 0) {
        setCompanyUsers([]);
        return;
      }
      
      // Extrair IDs únicos
      const userIds = [...new Set(userCompanies.map((uc: any) => uc.user_id))];
      
      // Buscar dados dos usuários na tabela public.users
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, email, full_name")
        .in("id", userIds);
      
      if (usersError) {
        console.error("Erro ao buscar dados dos usuários:", usersError);
        setCompanyUsers([]);
        return;
      }
      
      setCompanyUsers(users || []);
      
      // Se houver apenas um usuário, selecionar automaticamente
      if (users && users.length === 1) {
        setEstablishmentFormData(prev => ({ ...prev, manager_user_id: users[0].id }));
      } else {
        // Se não houver usuários ou houver múltiplos, usar padrão
        setEstablishmentFormData(prev => ({ 
          ...prev, 
          manager_user_id: prev.manager_user_id || "__current_user__" 
        }));
      }
    };
    
    fetchCompanyUsers();
  }, [selectedCompanyId]);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  // Refetch quando userId mudar
  useEffect(() => {
    if (userId) {
      refetchUserCompanies();
    }
  }, [userId, refetchUserCompanies]);

  // Buscar estabelecimentos onde o usuário é funcionário
  const [employeeEstablishmentIds, setEmployeeEstablishmentIds] = useState<Set<string>>(new Set());
  const [employeeCompanyIds, setEmployeeCompanyIds] = useState<Set<string>>(new Set());
  const [isLoadingEmployeeData, setIsLoadingEmployeeData] = useState(true);
  
  useEffect(() => {
    const fetchEmployeeData = async () => {
      setIsLoadingEmployeeData(true);
      if (!userId) {
        setEmployeeEstablishmentIds(new Set());
        setEmployeeCompanyIds(new Set());
        setIsLoadingEmployeeData(false);
        return;
      }

      try {
        // Buscar todos os estabelecimentos onde o usuário é funcionário
        const { data: employees, error: employeesError } = await supabase
          .from("employees")
          .select("establishment_id")
          .eq("user_id", userId)
          .eq("is_active", true);

        if (employeesError) {
          console.error("Erro ao buscar funcionários:", employeesError);
          setEmployeeEstablishmentIds(new Set());
          setEmployeeCompanyIds(new Set());
          setIsLoadingEmployeeData(false);
          return;
        }

        if (!employees || employees.length === 0) {
          setEmployeeEstablishmentIds(new Set());
          setEmployeeCompanyIds(new Set());
          setIsLoadingEmployeeData(false);
          return;
        }

        // Extrair IDs dos estabelecimentos
        const establishmentIds = employees.map((emp: any) => emp.establishment_id);
        setEmployeeEstablishmentIds(new Set(establishmentIds));

        // Buscar os estabelecimentos para obter os company_ids
        const { data: establishments, error: establishmentsError } = await supabase
          .from("establishments")
          .select("company_id, is_active")
          .in("id", establishmentIds)
          .eq("is_active", true);

        if (establishmentsError) {
          console.error("Erro ao buscar estabelecimentos:", establishmentsError);
          setEmployeeCompanyIds(new Set());
          setIsLoadingEmployeeData(false);
          return;
        }

        // Extrair company_ids únicos dos estabelecimentos onde é funcionário
        const companyIdsSet = new Set<string>();
        if (establishments) {
          establishments.forEach((est: any) => {
            if (est.company_id) {
              companyIdsSet.add(est.company_id);
            }
          });
        }

        setEmployeeCompanyIds(companyIdsSet);
      } catch (error) {
        console.error("Erro ao buscar dados do funcionário:", error);
        setEmployeeEstablishmentIds(new Set());
        setEmployeeCompanyIds(new Set());
      } finally {
        setIsLoadingEmployeeData(false);
      }
    };

    fetchEmployeeData();
  }, [userId]);

  // Determinar se o usuário é funcionário (tem estabelecimentos onde trabalha)
  const isEmployee = employeeEstablishmentIds.size > 0;

  // Filtrar empresas baseado se o usuário é funcionário ou proprietário
  // - Se o usuário É funcionário (tem registros em employees): mostrar APENAS empresas onde ele é funcionário
  // - Se o usuário NÃO é funcionário: mostrar todas as empresas (é proprietário)
  const companies = useMemo(() => {
    if (isLoadingEmployeeData) {
      // Enquanto carrega, não mostrar nada (ou mostrar loading)
      return [];
    }
    
    if (isEmployee) {
      // Usuário é funcionário: mostrar apenas empresas onde ele trabalha
      const filtered = userCompanies
        .map((uc: any) => uc.companies)
        .filter((company: any) => company && employeeCompanyIds.has(company.id));
      console.log("Funcionário - Empresas filtradas:", filtered.length, "de", userCompanies.length);
      return filtered;
    } else {
      // Usuário não é funcionário: mostrar todas as empresas (é proprietário)
      const all = userCompanies.map((uc: any) => uc.companies).filter(Boolean);
      console.log("Proprietário - Todas as empresas:", all.length);
      return all;
    }
  }, [isEmployee, employeeCompanyIds, userCompanies, isLoadingEmployeeData]);

  // Filtrar estabelecimentos:
  // - Se o usuário é funcionário: mostrar APENAS estabelecimentos onde ele é funcionário
  // - Se o usuário NÃO é funcionário: mostrar todos os estabelecimentos (é proprietário)
  const filteredEstablishments = isEmployee
    ? establishments.filter((est: any) => employeeEstablishmentIds.has(est.id))
    : establishments;

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    
    // Verificar se o usuário pode criar empresas
    const maxCompanies = userLimit?.max_companies ?? 1; // Se não tiver limite, assume 1 (comportamento padrão antigo)
    const currentCompaniesCount = companies.length;
    
    if (maxCompanies === 0) {
      toast.error("Você não tem permissão para criar empresas. Funcionários não podem criar empresas.");
      return;
    }
    
    if (currentCompaniesCount >= maxCompanies) {
      toast.error(`Você atingiu o limite máximo de empresas (${maxCompanies}). Entre em contato com o administrador para aumentar seu limite.`);
      return;
    }
    
    try {
      // Criar empresa
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert([companyFormData])
        .select()
        .single();

      if (companyError) throw companyError;

      // Associar empresa ao usuário (max_companies tem valor padrão de 1)
      const { error: userCompanyError } = await supabase
        .from("user_companies")
        .insert([{ user_id: userId, company_id: company.id }]);

      if (userCompanyError) throw userCompanyError;

      queryClient.invalidateQueries({ queryKey: ["user_companies"] });
      toast.success("Empresa criada com sucesso!");
      setCompanyDialogOpen(false);
      setCompanyFormData({ name: "", cnpj: "", email: "" });
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar empresa");
      console.error(error);
    }
  };

  const handleCreateEstablishment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) return;
    
    // Verificar se o usuário pode criar estabelecimentos
    const maxEstablishments = userLimit?.max_establishments ?? 1; // Se não tiver limite, assume 1 (comportamento padrão antigo)
    const currentEstablishmentsCount = establishments.length;
    
    if (maxEstablishments === 0) {
      toast.error("Você não tem permissão para criar estabelecimentos. Funcionários não podem criar estabelecimentos.");
      return;
    }
    
    if (currentEstablishmentsCount >= maxEstablishments) {
      toast.error(`Você atingiu o limite máximo de estabelecimentos para esta empresa (${maxEstablishments}). Entre em contato com o administrador para aumentar seu limite.`);
      return;
    }
    
    try {
      const establishment = await createEstablishment({
        company_id: selectedCompanyId,
        name: establishmentFormData.name,
        type: establishmentFormData.type,
        manager_user_id: establishmentFormData.manager_user_id === "__current_user__" ? undefined : (establishmentFormData.manager_user_id || undefined),
      });
      setEstablishmentDialogOpen(false);
      setEstablishmentFormData({ name: "", type: "hotel", manager_user_id: "__current_user__" });
      
      // Selecionar o estabelecimento criado e navegar para o PMS
      setSelectedEstablishment(establishment);
      navigate(`/${establishment.numeric_id}/reservas`);
      toast.success("Estabelecimento criado com sucesso!");
    } catch (error) {
      console.error(error);
    }
  };

  const handleSelectEstablishment = (establishment: any) => {
    setSelectedEstablishment(establishment);
    navigate(`/${establishment.numeric_id}/reservas`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Minhas Empresas</h1>
          <p className="text-muted-foreground">Gerencie suas empresas e estabelecimentos</p>
        </div>
        {(userLimit?.max_companies ?? 1) > 0 && (
          <Button onClick={() => setCompanyDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Empresa
          </Button>
        )}
      </div>

      {isLoadingCompanies || isLoadingEmployeeData ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : companies.length === 0 ? (
        <Card className="p-8 text-center">
          <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">Nenhuma empresa cadastrada</p>
          {(userLimit?.max_companies ?? 1) > 0 ? (
            <Button onClick={() => setCompanyDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Empresa
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Você não tem permissão para criar empresas</p>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company: any) => (
            <Card key={company.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{company.name}</h3>
                  {company.cnpj && (
                    <p className="text-sm text-muted-foreground">CNPJ: {company.cnpj}</p>
                  )}
                </div>
                <Badge variant={company.is_active ? "default" : "secondary"}>
                  {company.is_active ? "Ativa" : "Inativa"}
                </Badge>
              </div>

              <Button
                variant="outline"
                className="w-full mb-2"
                onClick={() => setSelectedCompanyId(company.id)}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Ver Estabelecimentos
              </Button>

              {selectedCompanyId === company.id && (
                <div className="mt-4 space-y-2">
                  {(userLimit?.max_establishments ?? 1) > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setEstablishmentFormData({ name: "", type: "hotel", manager_user_id: "__current_user__" });
                        setEstablishmentDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Estabelecimento
                    </Button>
                  )}

                  {isLoadingEstablishments ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : filteredEstablishments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Nenhum estabelecimento disponível
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filteredEstablishments.map((establishment: any) => (
                        <Card
                          key={establishment.id}
                          className="p-3 cursor-pointer hover:bg-muted transition-colors"
                          onClick={() => handleSelectEstablishment(establishment)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Hotel className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium text-sm">{establishment.name}</p>
                                <p className="text-xs text-muted-foreground capitalize">
                                  {establishment.type}
                                </p>
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCompany} className="space-y-4">
            <div>
              <Label htmlFor="company_name">Nome *</Label>
              <Input
                id="company_name"
                value={companyFormData.name}
                onChange={(e) => setCompanyFormData({ ...companyFormData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="company_cnpj">CNPJ</Label>
              <Input
                id="company_cnpj"
                value={companyFormData.cnpj}
                onChange={(e) => setCompanyFormData({ ...companyFormData, cnpj: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="company_email">E-mail</Label>
              <Input
                id="company_email"
                type="email"
                value={companyFormData.email}
                onChange={(e) => setCompanyFormData({ ...companyFormData, email: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCompanyDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={establishmentDialogOpen} onOpenChange={setEstablishmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Estabelecimento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateEstablishment} className="space-y-4">
            <div>
              <Label htmlFor="establishment_name">Nome *</Label>
              <Input
                id="establishment_name"
                value={establishmentFormData.name}
                onChange={(e) => setEstablishmentFormData({ ...establishmentFormData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="establishment_type">Tipo *</Label>
              <Select
                value={establishmentFormData.type}
                onValueChange={(value) => setEstablishmentFormData({ ...establishmentFormData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotel">Hotel</SelectItem>
                  <SelectItem value="apartment">Apartamento</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="manager_user_id">Gerente do Estabelecimento</Label>
              <Select
                value={establishmentFormData.manager_user_id}
                onValueChange={(value) => setEstablishmentFormData({ ...establishmentFormData, manager_user_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o gerente (opcional - padrão: você)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__current_user__">Usuário atual (padrão)</SelectItem>
                  {companyUsers.map((user: any) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Selecione o funcionário que será o gerente deste estabelecimento. Se não selecionar, você será o gerente.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEstablishmentDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar e Acessar PMS</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserDashboard;

