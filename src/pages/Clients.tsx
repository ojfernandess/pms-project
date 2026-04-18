import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientDialog } from "@/components/clients/ClientDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

const Clients = () => {
  const { selectedEstablishment } = useEstablishment();
  const { settings: siteSettings } = useSiteSettings();
  const navigate = useNavigate();
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "view" | "edit">("create");
  const { canCreate } = usePermissions();

  // Verificar se a funcionalidade de centralização está habilitada
  const isDeduplicationEnabled = isFeatureEnabledForEstablishment(
    siteSettings?.features_enabled?.client_deduplication,
    selectedEstablishment?.id
  );

  // Garantir que o establishmentId está disponível no localStorage
  useEffect(() => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
    }
  }, [selectedEstablishment]);

  const { data: clients, isLoading, refetch } = useQuery({
    queryKey: ["clients", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = selectedEstablishment?.id;
      let query = supabase.from("clients").select("*");
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar clientes");
        throw error;
      }

      return data;
    },
    enabled: !!selectedEstablishment?.id,
  });

  const filteredClients = clients?.filter(client =>
    client.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.document_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clientes</h1>
          <p className="text-muted-foreground">Gerencie o cadastro de hóspedes</p>
        </div>
        <div className="flex items-center gap-2">
          {isDeduplicationEnabled && (
            <Button
              variant="outline"
              onClick={() => {
                const currentId = establishmentId || selectedEstablishment?.numeric_id;
                if (currentId) {
                  navigate(`/${currentId}/clientes/centralizacao`);
                }
              }}
            >
              <Users className="h-4 w-4 mr-2" />
              Centralizar Clientes
            </Button>
          )}
          {canCreate("clients") && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
          )}
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou documento..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Carregando...
          </div>
        ) : filteredClients && filteredClients.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.full_name}</TableCell>
                  <TableCell>{client.email || "-"}</TableCell>
                  <TableCell>{client.phone || "-"}</TableCell>
                  <TableCell>{client.document_number || "-"}</TableCell>
                  <TableCell>{client.city || "-"}</TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setDialogMode("view");
                        setDialogOpen(true);
                      }}
                    >
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum cliente encontrado
          </div>
        )}
      </Card>

      <ClientDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedClientId(null);
            setDialogMode("create");
          }
        }}
        clientId={selectedClientId}
        mode={dialogMode}
        onSuccess={() => {
          refetch();
          setDialogOpen(false);
          setSelectedClientId(null);
          setDialogMode("create");
        }}
      />
    </div>
  );
};

export default Clients;
