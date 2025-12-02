import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useUserCompanies } from "@/hooks/useUserCompanies";
import { useEstablishments } from "@/hooks/useEstablishments";
import { Plus, Hotel, Building2, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const EstablishmentDashboard = () => {
  const navigate = useNavigate();
  const { establishments: contextEstablishments, isLoading: isLoadingContext } = useEstablishment();
  const [userId, setUserId] = useState<string | null>(null);
  const { userCompanies } = useUserCompanies(userId || undefined);
  const { createEstablishment } = useEstablishments();
  const { setSelectedEstablishment } = useEstablishment();
  const [establishmentDialogOpen, setEstablishmentDialogOpen] = useState(false);
  const [establishmentFormData, setEstablishmentFormData] = useState({ 
    name: "", 
    type: "hotel",
    company_id: "",
    manager_user_id: "__current_user__"
  });
  
  // Buscar usuários da empresa selecionada para seleção de gerente
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchCompanyUsers = async () => {
      if (!establishmentFormData.company_id) {
        setCompanyUsers([]);
        return;
      }
      
      // Buscar user_ids associados à empresa
      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select("user_id")
        .eq("company_id", establishmentFormData.company_id);
      
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
  }, [establishmentFormData.company_id]);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, []);

  // Extrair empresas dos userCompanies
  const companies = userCompanies.map((uc: any) => uc.companies).filter(Boolean);

  const handleCreateEstablishment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!establishmentFormData.company_id) {
      toast.error("Selecione uma empresa");
      return;
    }
    try {
      const establishment = await createEstablishment({
        company_id: establishmentFormData.company_id,
        name: establishmentFormData.name,
        type: establishmentFormData.type,
        manager_user_id: establishmentFormData.manager_user_id === "__current_user__" ? undefined : (establishmentFormData.manager_user_id || undefined),
      });
      setEstablishmentDialogOpen(false);
      setEstablishmentFormData({ name: "", type: "hotel", company_id: "", manager_user_id: "__current_user__" });
      
      // Selecionar o estabelecimento criado e navegar para o PMS
      setSelectedEstablishment(establishment);
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar estabelecimento");
      console.error(error);
    }
  };

  const handleSelectEstablishment = (establishment: any) => {
    setSelectedEstablishment(establishment);
    navigate("/");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Meus Estabelecimentos</h1>
          <p className="text-muted-foreground">Selecione um estabelecimento para acessar o PMS</p>
        </div>
        {companies.length > 0 && (
          <Button onClick={() => setEstablishmentDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Estabelecimento
          </Button>
        )}
      </div>

      {isLoadingContext ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : contextEstablishments.length === 0 ? (
        <Card className="p-8 text-center">
          <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">Nenhum estabelecimento cadastrado</p>
          <Button onClick={() => setEstablishmentDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Primeiro Estabelecimento
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contextEstablishments.map((establishment: any) => (
            <Card
              key={establishment.id}
              className="p-6 cursor-pointer hover:bg-muted transition-colors"
              onClick={() => handleSelectEstablishment(establishment)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Hotel className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{establishment.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">
                      {establishment.type}
                    </p>
                  </div>
                </div>
                <Badge variant={establishment.is_active ? "default" : "secondary"}>
                  {establishment.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">Clique para acessar</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={establishmentDialogOpen} onOpenChange={setEstablishmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Estabelecimento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateEstablishment} className="space-y-4">
            <div>
              <Label htmlFor="establishment_company">Empresa *</Label>
              <Select
                value={establishmentFormData.company_id}
                onValueChange={(value) => setEstablishmentFormData({ ...establishmentFormData, company_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company: any) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

export default EstablishmentDashboard;

