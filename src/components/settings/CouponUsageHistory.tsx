import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Search, Calendar, DollarSign, FileText, Tag } from "lucide-react";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface CouponUsage {
  id: string;
  reservation_code: string;
  reservation_id: string;
  coupon_code: string;
  coupon_name: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  apply_to: "total" | "nights";
  total_amount: number; // Valor após desconto
  original_amount: number; // Valor original antes do desconto
  guest_name: string;
  guest_email: string;
  checkin_date: string;
  checkout_date: string;
  created_at: string;
  status: string;
}

export default function CouponUsageHistory() {
  const { selectedEstablishment } = useEstablishment();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUsage, setSelectedUsage] = useState<CouponUsage | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  // Buscar histórico de uso de cupons
  const { data: usageHistory, isLoading } = useQuery({
    queryKey: ["coupon_usage_history", selectedEstablishment?.id, searchTerm],
    queryFn: async () => {
      if (!selectedEstablishment?.id) return [];

      // Buscar reservas que usaram cupons
      let query = supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          total_amount,
          checkin_date,
          checkout_date,
          status,
          created_at,
          coupon_id,
          discount_coupons:coupon_id (
            id,
            code,
            name,
            discount_type,
            discount_value,
            apply_to
          ),
          clients:client_id (
            full_name,
            email
          )
        `)
        .eq("establishment_id", selectedEstablishment.id)
        .not("coupon_id", "is", null)
        .order("created_at", { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Transformar dados para o formato esperado
      const usage: CouponUsage[] = (data || []).map((reservation: any) => {
        const coupon = reservation.discount_coupons;
        const client = reservation.clients;

        // Calcular valor original baseado no tipo de desconto
        let originalAmount = reservation.total_amount;
        if (coupon) {
          if (coupon.discount_type === "fixed") {
            // Desconto fixo: valor original = valor final + desconto
            originalAmount = Number(reservation.total_amount) + Number(coupon.discount_value);
          } else if (coupon.discount_type === "percentage") {
            // Desconto porcentagem: valor original = valor final / (1 - porcentagem/100)
            const discountPercent = Number(coupon.discount_value) / 100;
            originalAmount = Number(reservation.total_amount) / (1 - discountPercent);
          }
        }

        return {
          id: reservation.id,
          reservation_code: reservation.reservation_code,
          reservation_id: reservation.id,
          coupon_code: coupon?.code || "N/A",
          coupon_name: coupon?.name || "Cupom não encontrado",
          discount_type: coupon?.discount_type || "percentage",
          discount_value: coupon?.discount_value || 0,
          apply_to: coupon?.apply_to || "total",
          total_amount: Number(reservation.total_amount),
          original_amount: originalAmount,
          guest_name: client?.full_name || "N/A",
          guest_email: client?.email || "N/A",
          checkin_date: reservation.checkin_date,
          checkout_date: reservation.checkout_date,
          created_at: reservation.created_at,
          status: reservation.status,
        };
      });

      return usage;
    },
    enabled: !!selectedEstablishment?.id,
  });

  const filteredHistory = usageHistory?.filter((usage) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      usage.reservation_code.toLowerCase().includes(term) ||
      usage.coupon_code.toLowerCase().includes(term) ||
      usage.coupon_name.toLowerCase().includes(term) ||
      usage.guest_name.toLowerCase().includes(term) ||
      usage.guest_email.toLowerCase().includes(term)
    );
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDiscount = (usage: CouponUsage) => {
    if (usage.discount_type === "percentage") {
      return `${usage.discount_value}%`;
    }
    return formatCurrency(usage.discount_value);
  };

  const calculateDiscountAmount = (usage: CouponUsage) => {
    return usage.original_amount - usage.total_amount;
  };

  const handleViewReservation = (reservationId: string) => {
    navigate(`/reservations/${reservationId}`);
  };

  const handleViewDetails = (usage: CouponUsage) => {
    setSelectedUsage(usage);
    setDetailsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Histórico de Uso de Cupons</h3>
          <p className="text-sm text-muted-foreground">
            Visualize todas as reservas que utilizaram cupons de desconto
          </p>
        </div>
      </div>

      {/* Barra de Busca */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código da reserva, cupom ou hóspede..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Tabela de Histórico */}
      {filteredHistory && filteredHistory.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data de Uso</TableHead>
                <TableHead>Código do Cupom</TableHead>
                <TableHead>Nome do Cupom</TableHead>
                <TableHead>Reserva</TableHead>
                <TableHead>Hóspede</TableHead>
                <TableHead className="text-right">Valor Original</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">Valor Final</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHistory.map((usage) => (
                <TableRow key={usage.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {format(new Date(usage.created_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono font-semibold">{usage.coupon_code}</span>
                    </div>
                  </TableCell>
                  <TableCell>{usage.coupon_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{usage.reservation_code}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{usage.guest_name}</span>
                      <span className="text-xs text-muted-foreground">{usage.guest_email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold">{formatCurrency(usage.original_amount)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <Badge variant="secondary" className="mb-1">
                        {formatDiscount(usage)}
                      </Badge>
                      <span className="text-sm text-green-600 font-semibold">
                        -{formatCurrency(calculateDiscountAmount(usage))}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-bold text-lg">{formatCurrency(usage.total_amount)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(usage)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewReservation(usage.reservation_id)}
                      >
                        Ver Reserva
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="p-12 text-center">
          <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h4 className="text-lg font-semibold mb-2">
            {searchTerm ? "Nenhum resultado encontrado" : "Nenhum cupom utilizado"}
          </h4>
          <p className="text-sm text-muted-foreground">
            {searchTerm
              ? "Tente ajustar os termos de busca"
              : "Ainda não há reservas que utilizaram cupons de desconto"}
          </p>
        </Card>
      )}

      {/* Dialog de Detalhes */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Uso do Cupom</DialogTitle>
            <DialogDescription>
              Informações completas sobre o uso do cupom na reserva
            </DialogDescription>
          </DialogHeader>

          {selectedUsage && (
            <div className="space-y-4">
              {/* Informações do Cupom */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">Código do Cupom</Label>
                  </div>
                  <p className="font-mono font-semibold text-lg">{selectedUsage.coupon_code}</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">Nome do Cupom</Label>
                  </div>
                  <p className="font-semibold text-lg">{selectedUsage.coupon_name}</p>
                </Card>
              </div>

              {/* Informações da Reserva */}
              <Card className="p-4">
                <h4 className="font-semibold mb-3">Informações da Reserva</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Código da Reserva</Label>
                    <p className="font-semibold">{selectedUsage.reservation_code}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Badge>{selectedUsage.status}</Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Check-in</Label>
                    <p className="font-semibold">
                      {format(new Date(selectedUsage.checkin_date), "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Check-out</Label>
                    <p className="font-semibold">
                      {format(new Date(selectedUsage.checkout_date), "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Informações do Hóspede */}
              <Card className="p-4">
                <h4 className="font-semibold mb-3">Informações do Hóspede</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome</Label>
                    <p className="font-semibold">{selectedUsage.guest_name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="font-semibold">{selectedUsage.guest_email}</p>
                  </div>
                </div>
              </Card>

              {/* Informações Financeiras */}
              <Card className="p-4 bg-gradient-to-br from-slate-50 to-slate-100">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Informações Financeiras
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Valor Original:</span>
                    <span className="font-semibold text-lg">
                      {formatCurrency(selectedUsage.original_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Tipo de Desconto:</span>
                    <Badge variant="secondary">{formatDiscount(selectedUsage)}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Valor do Desconto:</span>
                    <span className="font-semibold text-green-600 text-lg">
                      -{formatCurrency(calculateDiscountAmount(selectedUsage))}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-300 flex justify-between items-center">
                    <span className="text-sm font-semibold">Valor Final:</span>
                    <span className="font-bold text-xl text-blue-600">
                      {formatCurrency(selectedUsage.total_amount)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Data de Uso */}
              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Data de Uso</Label>
                    <p className="font-semibold">
                      {format(new Date(selectedUsage.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              </Card>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
                  Fechar
                </Button>
                <Button onClick={() => handleViewReservation(selectedUsage.reservation_id)}>
                  Ver Reserva Completa
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

