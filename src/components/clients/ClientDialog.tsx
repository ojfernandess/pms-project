import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";
import { formatCNPJ, formatCPF, formatCurrency, formatDate } from "@/lib/reservationUtils";
import { Loader2, Calendar, Bed, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  clientId?: string | null; // ID do cliente para visualização/edição
  mode?: "create" | "view" | "edit"; // Modo do diálogo
}

export const ClientDialog = ({ open, onOpenChange, onSuccess, clientId, mode = "create" }: ClientDialogProps) => {
  const { selectedEstablishment } = useEstablishment();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    document_number: "",
    document_type: "CPF",
    birth_date: "",
    nationality: "Brasil",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    notes: "",
  });

  // Buscar dados do cliente se clientId for fornecido
  const { data: clientData, isLoading: isLoadingClient } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!clientId && open,
  });

  // Buscar histórico de reservas do cliente
  const { data: clientReservations, isLoading: isLoadingReservations } = useQuery({
    queryKey: ["client_reservations", clientId, selectedEstablishment?.id],
    queryFn: async () => {
      if (!clientId) return [];
      
      const establishmentId = selectedEstablishment?.id;
      
      // Buscar reservas onde o cliente é responsável financeiro
      let clientQuery = supabase
        .from("reservations")
        .select(`
          *,
          rooms(room_number, name),
          room_categories(name),
          guest:clients!guest_id(full_name),
          financial_responsible:clients!client_id(full_name)
        `)
        .eq("client_id", clientId);
      
      if (establishmentId) {
        clientQuery = clientQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: clientReservations, error: clientError } = await clientQuery
        .order("checkin_date", { ascending: false });

      if (clientError) throw clientError;

      // Buscar reservas onde o cliente é hóspede
      let guestQuery = supabase
        .from("reservations")
        .select(`
          *,
          rooms(room_number, name),
          room_categories(name),
          guest:clients!guest_id(full_name),
          financial_responsible:clients!client_id(full_name)
        `)
        .eq("guest_id", clientId);
      
      if (establishmentId) {
        guestQuery = guestQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: guestReservations, error: guestError } = await guestQuery
        .order("checkin_date", { ascending: false });

      if (guestError) throw guestError;

      // Combinar e remover duplicatas (caso o cliente seja tanto responsável quanto hóspede)
      const allReservations = [...(clientReservations || []), ...(guestReservations || [])];
      const uniqueReservations = allReservations.filter((reservation, index, self) =>
        index === self.findIndex((r) => r.id === reservation.id)
      );

      return uniqueReservations.sort((a, b) => {
        const dateA = new Date(a.checkin_date).getTime();
        const dateB = new Date(b.checkin_date).getTime();
        return dateB - dateA; // Mais recente primeiro
      });
    },
    enabled: !!clientId && open,
  });

  // Carregar dados do cliente quando clientData estiver disponível
  useEffect(() => {
    if (clientData && open) {
      // Formatar data de nascimento para o formato do input date (YYYY-MM-DD)
      let formattedBirthDate = "";
      if (clientData.birth_date) {
        const date = new Date(clientData.birth_date);
        if (!isNaN(date.getTime())) {
          formattedBirthDate = date.toISOString().split('T')[0];
        }
      }
      
      setFormData({
        full_name: clientData.full_name || "",
        email: clientData.email || "",
        phone: clientData.phone || "",
        document_number: clientData.document_number || "",
        document_type: clientData.document_type || "CPF",
        birth_date: formattedBirthDate,
        nationality: clientData.nationality || "Brasil",
        address: clientData.address || "",
        city: clientData.city || "",
        state: clientData.state || "",
        postal_code: clientData.postal_code || "",
        notes: clientData.notes || "",
      });
    } else if (!clientId && open) {
      // Resetar formulário quando criar novo cliente
      setFormData({
        full_name: "",
        email: "",
        phone: "",
        document_number: "",
        document_type: "CPF",
        birth_date: "",
        nationality: "Brasil",
        address: "",
        city: "",
        state: "",
        postal_code: "",
        notes: "",
      });
    }
  }, [clientData, clientId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "view") return; // Não permitir submit no modo visualização
    
    setLoading(true);

    try {
      const establishmentId = selectedEstablishment?.id;
      
      if (clientId && mode === "edit") {
        // Atualizar cliente existente
        const { error } = await supabase
          .from("clients")
          .update({
            ...formData,
            establishment_id: establishmentId || undefined,
          })
          .eq("id", clientId);

        if (error) throw error;
        toast.success("Cliente atualizado com sucesso!");
      } else {
        // Criar novo cliente
        const { error } = await supabase.from("clients").insert([{
          ...formData,
          establishment_id: establishmentId || undefined,
        }]);

        if (error) throw error;
        toast.success("Cliente cadastrado com sucesso!");
      }

      onSuccess();
      
      if (!clientId) {
        // Resetar apenas se for criação
        setFormData({
          full_name: "",
          email: "",
          phone: "",
          document_number: "",
          document_type: "CPF",
          birth_date: "",
          nationality: "Brasil",
          address: "",
          city: "",
          state: "",
          postal_code: "",
          notes: "",
        });
      }
    } catch (error: any) {
      toast.error(error.message || `Erro ao ${clientId ? "atualizar" : "cadastrar"} cliente`);
    } finally {
      setLoading(false);
    }
  };

  const isViewMode = mode === "view";
  const dialogTitle = isViewMode 
    ? "Detalhes do Cliente" 
    : clientId 
    ? "Editar Cliente" 
    : "Novo Cliente";

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      unpaid: { label: "Não Pago", variant: "destructive" },
      pending: { label: "Pendente", variant: "secondary" },
      confirmed: { label: "Confirmada", variant: "default" },
      checkedin: { label: "Check-in", variant: "outline" },
      checkedout: { label: "Check-out", variant: "outline" },
      cancelled: { label: "Cancelada", variant: "destructive" },
      noshow: { label: "No Show", variant: "destructive" },
      blocked: { label: "Quarto Bloqueado", variant: "secondary" },
      preregistration: { label: "Pré-reserva", variant: "outline" },
    };

    const statusInfo = statusMap[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const handleViewReservation = (reservationCode: string) => {
    const currentId = selectedEstablishment?.numeric_id || selectedEstablishment?.id;
    if (currentId) {
      navigate(`/${currentId}/reservas/${reservationCode}`);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        {isLoadingClient ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Informações</TabsTrigger>
              {clientId && (
                <TabsTrigger value="reservations">
                  Histórico de Reservas
                  {clientReservations && clientReservations.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {clientReservations.length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="info" className="mt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                disabled={isViewMode}
                required={!isViewMode}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isViewMode}
              />
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                disabled={isViewMode}
              />
            </div>
            <div>
              <Label htmlFor="document_type">Tipo de Documento</Label>
              <Select
                value={formData.document_type}
                onValueChange={(value) => setFormData({ ...formData, document_type: value, document_number: "" })}
                disabled={isViewMode}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CPF">CPF</SelectItem>
                  <SelectItem value="CNPJ">CNPJ</SelectItem>
                  <SelectItem value="RG">RG</SelectItem>
                  <SelectItem value="Passaporte">Passaporte</SelectItem>
                  <SelectItem value="CNH">CNH</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="document_number">Número do Documento</Label>
              <Input
                id="document_number"
                value={formData.document_number}
                onChange={(e) => {
                  if (isViewMode) return;
                  let value = e.target.value;
                  // Aplicar máscara baseado no tipo de documento
                  if (formData.document_type === "CNPJ") {
                    value = formatCNPJ(value);
                  } else if (formData.document_type === "CPF") {
                    value = formatCPF(value);
                  }
                  setFormData({ ...formData, document_number: value });
                }}
                disabled={isViewMode}
                placeholder={
                  formData.document_type === "CNPJ" 
                    ? "00.000.000/0000-00" 
                    : formData.document_type === "CPF"
                    ? "000.000.000-00"
                    : "Digite o número do documento"
                }
                maxLength={formData.document_type === "CNPJ" ? 18 : formData.document_type === "CPF" ? 14 : undefined}
              />
            </div>
            <div>
              <Label htmlFor="birth_date">Data de Nascimento</Label>
              <Input
                id="birth_date"
                type="date"
                value={formData.birth_date}
                onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                disabled={isViewMode}
              />
            </div>
            <div>
              <Label htmlFor="nationality">Nacionalidade</Label>
              <Input
                id="nationality"
                value={formData.nationality}
                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                disabled={isViewMode}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                disabled={isViewMode}
              />
            </div>
            <div>
              <Label htmlFor="city">Cidade</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                disabled={isViewMode}
              />
            </div>
            <div>
              <Label htmlFor="state">Estado</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                disabled={isViewMode}
              />
            </div>
            <div>
              <Label htmlFor="postal_code">CEP</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                disabled={isViewMode}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                disabled={isViewMode}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isViewMode ? "Fechar" : "Cancelar"}
            </Button>
            {!isViewMode && (
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </div>
        </form>
            </TabsContent>

            {clientId && (
              <TabsContent value="reservations" className="mt-4">
                {isLoadingReservations ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : clientReservations && clientReservations.length > 0 ? (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Total de {clientReservations.length} reserva{clientReservations.length !== 1 ? "s" : ""} encontrada{clientReservations.length !== 1 ? "s" : ""}
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Check-in</TableHead>
                            <TableHead>Check-out</TableHead>
                            <TableHead>Quarto</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clientReservations.map((reservation: any) => (
                            <TableRow key={reservation.id}>
                              <TableCell className="font-medium">
                                {reservation.reservation_code}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  {formatDate(reservation.checkin_date)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  {formatDate(reservation.checkout_date)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Bed className="h-4 w-4 text-muted-foreground" />
                                  {reservation.rooms?.room_number || reservation.rooms?.name || "Não atribuído"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                                  {formatCurrency(reservation.total_amount || 0)}
                                </div>
                              </TableCell>
                              <TableCell>{getStatusBadge(reservation.status)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewReservation(reservation.reservation_code)}
                                >
                                  Ver Detalhes
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma reserva encontrada para este cliente.
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
