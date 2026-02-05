import { useState } from "react";
import { useQuotes, QuoteStatus } from "@/hooks/useQuotes";
import { QuoteDialog } from "@/components/quotes/QuoteDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  MoreVertical,
  Mail,
  CheckCircle,
  XCircle,
  Copy,
  Trash2,
  Loader2,
  Calendar,
  DollarSign,
  User,
  Building,
  Globe,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { formatCurrency } from "@/lib/reservationUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const statusConfig: Record<QuoteStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" }> = {
  pending: { label: "Pendente", variant: "outline" },
  sent: { label: "Enviado", variant: "default" },
  accepted: { label: "Aceito", variant: "default" },
  rejected: { label: "Rejeitado", variant: "destructive" },
  expired: { label: "Expirado", variant: "secondary" },
  converted: { label: "Convertido", variant: "success" },
};

export default function Quotes() {
  const { quotes, isLoading, deleteQuote, convertQuoteToReservation, generatePaymentLink, isDeleting, isConverting, isGeneratingLink } = useQuotes();
  const { selectedEstablishment } = useEstablishment();
  const { settings: siteSettings } = useSiteSettings();
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    guest: "",
    checkin_start: "",
    checkin_end: "",
    checkout_start: "",
    checkout_end: "",
  });
  const navigate = useNavigate();

  const handleCopyPublicReservationLink = async () => {
    if (!selectedEstablishment) {
      toast.error("Selecione um estabelecimento primeiro");
      return;
    }

    // Buscar slug ou numeric_id do estabelecimento
    let establishmentSlug = selectedEstablishment.slug;
    if (!establishmentSlug && selectedEstablishment.numeric_id) {
      establishmentSlug = selectedEstablishment.numeric_id.toString();
    }

    if (!establishmentSlug) {
      // Se não tiver slug nem numeric_id, buscar do banco
      const { data: establishment } = await supabase
        .from("establishments")
        .select("slug, numeric_id")
        .eq("id", selectedEstablishment.id)
        .maybeSingle();

      if (establishment) {
        establishmentSlug = establishment.slug || establishment.numeric_id?.toString() || "";
      }
    }

    if (!establishmentSlug) {
      toast.error("Não foi possível gerar o link da página pública");
      return;
    }

    // Obter URL base
    let baseUrl = siteSettings?.pms_base_url || '';
    if (!baseUrl) {
      baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    }

    // Garantir que a URL tenha protocolo
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    const link = `${baseUrl}/reservar/${establishmentSlug}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link)
        .then(() => toast.success("Link da página pública de reservas copiado!"))
        .catch((err) => {
          console.error("Erro ao copiar link:", err);
          toast.error("Erro ao copiar link. Tente novamente.");
        });
    } else {
      // Fallback para navegadores mais antigos
      const textarea = document.createElement("textarea");
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        toast.success("Link da página pública copiado!");
      } catch (err) {
        console.error("Erro ao copiar link (fallback):", err);
        toast.error("Erro ao copiar link. Seu navegador não suporta cópia automática.");
      }
      document.body.removeChild(textarea);
    }
  };


  // Filtrar orçamentos
  const filteredQuotes = quotes.filter((quote) => {
    if (filters.guest && !quote.guest_name?.toLowerCase().includes(filters.guest.toLowerCase()) && 
        !quote.guest_email?.toLowerCase().includes(filters.guest.toLowerCase()) &&
        !quote.guest_phone?.toLowerCase().includes(filters.guest.toLowerCase())) {
      return false;
    }
    if (filters.checkin_start && quote.checkin_date < filters.checkin_start) return false;
    if (filters.checkin_end && quote.checkin_date > filters.checkin_end) return false;
    if (filters.checkout_start && quote.checkout_date < filters.checkout_start) return false;
    if (filters.checkout_end && quote.checkout_date > filters.checkout_end) return false;
    return true;
  });

  const handleCreateQuote = () => {
    setSelectedQuoteId(undefined);
    setQuoteDialogOpen(true);
  };

  const handleEditQuote = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    setQuoteDialogOpen(true);
  };

  const handleDeleteQuote = (quoteId: string) => {
    setQuoteToDelete(quoteId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!quoteToDelete) return;

    try {
      await deleteQuote(quoteToDelete);
      setDeleteDialogOpen(false);
      setQuoteToDelete(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao deletar orçamento");
    }
  };

  const handleConvertToReservation = async (quoteId: string) => {
    try {
      await convertQuoteToReservation(quoteId);
      toast.success("Orçamento convertido em reserva com sucesso");
    } catch (error: any) {
      toast.error(error.message || "Erro ao converter orçamento");
    }
  };

  const handleGeneratePaymentLink = async (quoteId: string) => {
    try {
      await generatePaymentLink(quoteId);
      toast.success("Link de pagamento gerado e enviado por email");
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar link de pagamento");
    }
  };

  const handleCopyPaymentLink = (quote: any) => {
    if (quote.payment_link) {
      navigator.clipboard.writeText(quote.payment_link);
      toast.success("Link copiado para a área de transferência");
    } else {
      toast.error("Link de pagamento não disponível");
    }
  };

  const handleViewReservation = async (quote: any) => {
    const reservationId = quote.reservation_id;
    
    if (!reservationId) {
      toast.error("Reserva não encontrada");
      return;
    }
    
    try {
      // Buscar o reservation_code da reserva
      const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .select("reservation_code, establishment_id")
        .eq("id", reservationId)
        .single();
      
      if (reservationError || !reservation) {
        toast.error("Erro ao buscar dados da reserva");
        return;
      }
      
      // Tentar usar o numeric_id do estabelecimento selecionado primeiro
      let establishmentNumericId = selectedEstablishment?.numeric_id;
      
      // Se não tiver no contexto, buscar do banco usando o establishment_id da reserva
      if (!establishmentNumericId) {
        const { data: establishment, error: establishmentError } = await supabase
          .from("establishments")
          .select("numeric_id")
          .eq("id", reservation.establishment_id)
          .single();
        
        if (establishmentError || !establishment) {
          toast.error("Erro ao buscar dados do estabelecimento");
          return;
        }
        
        establishmentNumericId = establishment.numeric_id;
      }
      
      const reservationCode = reservation.reservation_code || reservationId;
      
      if (establishmentNumericId && reservationCode) {
        console.log("Navegando para reserva:", { establishmentNumericId, reservationCode });
        navigate(`/${establishmentNumericId}/reservas/${reservationCode}`);
      } else {
        toast.error("Não foi possível encontrar a reserva");
      }
    } catch (error: any) {
      console.error("Erro ao buscar dados da reserva:", error);
      toast.error("Erro ao acessar a reserva");
    }
  };

  const clearFilters = () => {
    setFilters({
      guest: "",
      checkin_start: "",
      checkin_end: "",
      checkout_start: "",
      checkout_end: "",
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Orçamentos</h1>
          <p className="text-muted-foreground">Gerencie orçamentos e solicitações de reservas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCopyPublicReservationLink}>
            <Globe className="mr-2 h-4 w-4" />
            Copiar Link Página Pública
          </Button>
          <Button onClick={handleCreateQuote}>
            <Plus className="mr-2 h-4 w-4" />
            Criar Novo Orçamento
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filtros</h2>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Limpar
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label htmlFor="guest">Hóspede</Label>
            <Input
              id="guest"
              placeholder="Nome, email, telefone, etc..."
              value={filters.guest}
              onChange={(e) => setFilters({ ...filters, guest: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="checkin_start">Período (início)</Label>
            <Input
              id="checkin_start"
              type="date"
              value={filters.checkin_start}
              onChange={(e) => setFilters({ ...filters, checkin_start: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="checkin_end">Período (Fim)</Label>
            <Input
              id="checkin_end"
              type="date"
              value={filters.checkin_end}
              onChange={(e) => setFilters({ ...filters, checkin_end: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="checkout_start">Check-in</Label>
            <Input
              id="checkout_start"
              type="date"
              value={filters.checkout_start}
              onChange={(e) => setFilters({ ...filters, checkout_start: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="checkout_end">Check-out</Label>
            <Input
              id="checkout_end"
              type="date"
              value={filters.checkout_end}
              onChange={(e) => setFilters({ ...filters, checkout_end: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Tabela de Orçamentos */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum orçamento encontrado
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Acomodação</TableHead>
                <TableHead>Pessoas</TableHead>
                <TableHead>Ingressada</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reserva</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-mono">#{quote.quote_code}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{quote.guest_name || "--"}</div>
                      {quote.guest_email && (
                        <div className="text-sm text-muted-foreground">{quote.guest_email}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {quote.category?.name || "--"}
                  </TableCell>
                  <TableCell>
                    {quote.adults + quote.children}
                  </TableCell>
                  <TableCell>
                    {quote.created_at
                      ? format(new Date(quote.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : "--"}
                  </TableCell>
                  <TableCell>
                    {quote.checkin_date
                      ? (() => {
                          // Tratar data como local, não UTC
                          // Se vier como string YYYY-MM-DD, criar Date usando timezone local
                          const dateStr = quote.checkin_date;
                          if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            const [year, month, day] = dateStr.split('-').map(Number);
                            const localDate = new Date(year, month - 1, day);
                            return format(localDate, "dd/MM/yyyy", { locale: ptBR });
                          }
                          // Fallback para formato ISO
                          return format(new Date(dateStr + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR });
                        })()
                      : "--"}
                  </TableCell>
                  <TableCell>
                    {quote.checkout_date
                      ? (() => {
                          // Tratar data como local, não UTC
                          // Se vier como string YYYY-MM-DD, criar Date usando timezone local
                          const dateStr = quote.checkout_date;
                          if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            const [year, month, day] = dateStr.split('-').map(Number);
                            const localDate = new Date(year, month - 1, day);
                            return format(localDate, "dd/MM/yyyy", { locale: ptBR });
                          }
                          // Fallback para formato ISO
                          return format(new Date(dateStr + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR });
                        })()
                      : "--"}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(quote.total_amount || 0)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusConfig[quote.status]?.variant || "default"}>
                      {statusConfig[quote.status]?.label || quote.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {quote.reservation_id ? (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => handleViewReservation(quote)}
                      >
                        Ver Reserva
                      </Button>
                    ) : (
                      "--"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleEditQuote(quote.id)}>
                          Editar
                        </DropdownMenuItem>
                        {quote.status !== "converted" && (
                          <>
                            {!quote.payment_link && (
                              <DropdownMenuItem
                                onClick={() => handleGeneratePaymentLink(quote.id)}
                                disabled={isGeneratingLink}
                              >
                                <Mail className="mr-2 h-4 w-4" />
                                Gerar Link de Pagamento
                              </DropdownMenuItem>
                            )}
                            {quote.payment_link && (
                              <DropdownMenuItem onClick={() => handleCopyPaymentLink(quote)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copiar Link
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleConvertToReservation(quote.id)}
                              disabled={isConverting}
                            >
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Efetivar em Reserva
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteQuote(quote.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialog de Criação/Edição */}
      <QuoteDialog
        open={quoteDialogOpen}
        onOpenChange={setQuoteDialogOpen}
        onSuccess={() => {
          setQuoteDialogOpen(false);
          setSelectedQuoteId(undefined);
        }}
        quoteId={selectedQuoteId}
      />

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este orçamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

