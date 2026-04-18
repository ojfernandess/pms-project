import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { toast } from "sonner";
import { Plus, Edit, Trash2, Copy, CheckCircle2, XCircle, Loader2, Tag, History } from "lucide-react";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CouponUsageHistory from "./CouponUsageHistory";

interface DiscountCoupon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  apply_to: "total" | "nights";
  max_uses: number | null;
  current_uses: number;
  min_stay_nights: number;
  min_amount: number | null;
  valid_from: string;
  valid_until: string | null;
  status: "active" | "inactive" | "expired";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function DiscountCouponsManager() {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<DiscountCoupon | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    discount_type: "percentage" as "fixed" | "percentage",
    discount_value: "",
    apply_to: "total" as "total" | "nights",
    max_uses: "",
    min_stay_nights: "1",
    min_amount: "",
    valid_from: format(new Date(), "yyyy-MM-dd"),
    valid_until: "",
    is_active: true,
  });

  // Buscar cupons
  const { data: coupons, isLoading } = useQuery({
    queryKey: ["discount_coupons", selectedEstablishment?.id],
    queryFn: async () => {
      if (!selectedEstablishment?.id) return [];

      const { data, error } = await supabase
        .from("discount_coupons")
        .select("*")
        .eq("establishment_id", selectedEstablishment.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as DiscountCoupon[];
    },
    enabled: !!selectedEstablishment?.id,
  });

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      description: "",
      discount_type: "percentage",
      discount_value: "",
      apply_to: "total",
      max_uses: "",
      min_stay_nights: "1",
      min_amount: "",
      valid_from: format(new Date(), "yyyy-MM-dd"),
      valid_until: "",
      is_active: true,
    });
    setSelectedCoupon(null);
  };

  const handleOpenDialog = (coupon?: DiscountCoupon) => {
    if (coupon) {
      setSelectedCoupon(coupon);
      setFormData({
        code: coupon.code,
        name: coupon.name,
        description: coupon.description || "",
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value.toString(),
        apply_to: coupon.apply_to,
        max_uses: coupon.max_uses?.toString() || "",
        min_stay_nights: coupon.min_stay_nights.toString(),
        min_amount: coupon.min_amount?.toString() || "",
        valid_from: coupon.valid_from.split("T")[0],
        valid_until: coupon.valid_until ? coupon.valid_until.split("T")[0] : "",
        is_active: coupon.is_active,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEstablishment?.id) {
      toast.error("Estabelecimento não selecionado");
      return;
    }

    try {
      const couponData: any = {
        establishment_id: selectedEstablishment.id,
        code: formData.code.toUpperCase().trim(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        discount_type: formData.discount_type,
        discount_value: parseFloat(formData.discount_value),
        apply_to: formData.apply_to,
        min_stay_nights: parseInt(formData.min_stay_nights) || 1,
        is_active: formData.is_active,
        valid_from: `${formData.valid_from}T00:00:00`,
        valid_until: formData.valid_until ? `${formData.valid_until}T23:59:59` : null,
      };

      if (formData.max_uses) {
        couponData.max_uses = parseInt(formData.max_uses);
      }

      if (formData.min_amount) {
        couponData.min_amount = parseFloat(formData.min_amount);
      }

      // Validar valor do desconto
      if (formData.discount_type === "percentage" && parseFloat(formData.discount_value) > 100) {
        toast.error("O desconto em porcentagem não pode ser maior que 100%");
        return;
      }

      if (selectedCoupon) {
        // Atualizar
        const { error } = await supabase
          .from("discount_coupons")
          .update(couponData)
          .eq("id", selectedCoupon.id);

        if (error) throw error;
        toast.success("Cupom atualizado com sucesso!");
      } else {
        // Criar
        const { error } = await supabase
          .from("discount_coupons")
          .insert(couponData);

        if (error) throw error;
        toast.success("Cupom criado com sucesso!");
      }

      queryClient.invalidateQueries({ queryKey: ["discount_coupons"] });
      handleCloseDialog();
    } catch (error: any) {
      console.error("Erro ao salvar cupom:", error);
      toast.error(error.message || "Erro ao salvar cupom");
    }
  };

  const handleDelete = async () => {
    if (!selectedCoupon) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("discount_coupons")
        .delete()
        .eq("id", selectedCoupon.id);

      if (error) throw error;

      toast.success("Cupom excluído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["discount_coupons"] });
      setDeleteDialogOpen(false);
      setSelectedCoupon(null);
    } catch (error: any) {
      console.error("Erro ao excluir cupom:", error);
      toast.error(error.message || "Erro ao excluir cupom");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  const getStatusBadge = (coupon: DiscountCoupon) => {
    const now = new Date();
    const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null;
    const isExpired = validUntil && validUntil < now;
    const isMaxUsesReached = coupon.max_uses && coupon.current_uses >= coupon.max_uses;

    if (!coupon.is_active) {
      return <Badge variant="secondary">Inativo</Badge>;
    }

    if (isExpired || isMaxUsesReached) {
      return <Badge variant="destructive">Expirado</Badge>;
    }

    return <Badge variant="success">Ativo</Badge>;
  };

  const formatDiscount = (coupon: DiscountCoupon) => {
    if (coupon.discount_type === "percentage") {
      return `${coupon.discount_value}%`;
    }
    return `R$ ${coupon.discount_value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
          <h3 className="text-lg font-semibold">Cupons de Desconto</h3>
          <p className="text-sm text-muted-foreground">
            Crie e gerencie cupons de desconto para aplicar em reservas
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Cupom
        </Button>
      </div>

      <Tabs defaultValue="coupons" className="w-full">
        <TabsList>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" />
            Histórico de Uso
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="coupons" className="space-y-6">

      {coupons && coupons.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Desconto</TableHead>
                <TableHead>Aplicar em</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell className="font-mono font-semibold">
                    <div className="flex items-center gap-2">
                      {coupon.code}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyCode(coupon.code)}
                        className="h-6 w-6 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{coupon.name}</TableCell>
                  <TableCell>{formatDiscount(coupon)}</TableCell>
                  <TableCell>
                    {coupon.apply_to === "total" ? "Valor Total" : "Diárias"}
                  </TableCell>
                  <TableCell>
                    {coupon.max_uses
                      ? `${coupon.current_uses}/${coupon.max_uses}`
                      : `${coupon.current_uses} (ilimitado)`}
                  </TableCell>
                  <TableCell>
                    {coupon.valid_until
                      ? format(new Date(coupon.valid_until), "dd/MM/yyyy", { locale: ptBR })
                      : "Sem limite"}
                  </TableCell>
                  <TableCell>{getStatusBadge(coupon)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(coupon)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCoupon(coupon);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
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
          <h4 className="text-lg font-semibold mb-2">Nenhum cupom criado</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Crie seu primeiro cupom de desconto para começar a oferecer promoções
          </p>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Criar Primeiro Cupom
          </Button>
        </Card>
      )}

      {/* Dialog de Criação/Edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCoupon ? "Editar Cupom" : "Novo Cupom de Desconto"}
            </DialogTitle>
            <DialogDescription>
              {selectedCoupon
                ? "Atualize as informações do cupom"
                : "Preencha os dados para criar um novo cupom de desconto"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="code">Código do Cupom *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="EX: DESCONTO10"
                  required
                  disabled={!!selectedCoupon}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedCoupon
                    ? "O código não pode ser alterado após criação"
                    : "Código único do cupom (será convertido para maiúsculas)"}
                </p>
              </div>

              <div>
                <Label htmlFor="name">Nome do Cupom *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Desconto de Verão"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição opcional do cupom"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="discount_type">Tipo de Desconto *</Label>
                <Select
                  value={formData.discount_type}
                  onValueChange={(value: "fixed" | "percentage") =>
                    setFormData({ ...formData, discount_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="discount_value">
                  Valor do Desconto *{" "}
                  {formData.discount_type === "percentage" ? "(%)" : "(R$)"}
                </Label>
                <Input
                  id="discount_value"
                  type="number"
                  step={formData.discount_type === "percentage" ? "0.01" : "0.01"}
                  min="0"
                  max={formData.discount_type === "percentage" ? "100" : undefined}
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                  placeholder={formData.discount_type === "percentage" ? "10" : "50.00"}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="apply_to">Aplicar Desconto em *</Label>
              <Select
                value={formData.apply_to}
                onValueChange={(value: "total" | "nights") =>
                  setFormData({ ...formData, apply_to: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Valor Total da Reserva</SelectItem>
                  <SelectItem value="nights">Valor das Diárias</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {formData.apply_to === "total"
                  ? "O desconto será aplicado sobre o valor total da reserva"
                  : "O desconto será aplicado sobre o valor de cada diária"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="max_uses">Máximo de Usos</Label>
                <Input
                  id="max_uses"
                  type="number"
                  min="1"
                  value={formData.max_uses}
                  onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                  placeholder="Ilimitado (deixe vazio)"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe vazio para uso ilimitado
                </p>
              </div>

              <div>
                <Label htmlFor="min_stay_nights">Mínimo de Noites *</Label>
                <Input
                  id="min_stay_nights"
                  type="number"
                  min="1"
                  value={formData.min_stay_nights}
                  onChange={(e) => setFormData({ ...formData, min_stay_nights: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="min_amount">Valor Mínimo da Reserva (R$)</Label>
                <Input
                  id="min_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.min_amount}
                  onChange={(e) => setFormData({ ...formData, min_amount: e.target.value })}
                  placeholder="Sem mínimo (deixe vazio)"
                />
              </div>

              <div>
                <Label htmlFor="valid_from">Válido a partir de *</Label>
                <Input
                  id="valid_from"
                  type="date"
                  value={formData.valid_from}
                  onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="valid_until">Válido até</Label>
              <Input
                id="valid_until"
                type="date"
                value={formData.valid_until}
                onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                min={formData.valid_from}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Deixe vazio para validade indefinida
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
              <Label htmlFor="is_active">Cupom ativo</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              <Button type="submit">
                {selectedCoupon ? "Atualizar" : "Criar"} Cupom
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cupom "{selectedCoupon?.code}"? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>

        <TabsContent value="history">
          <CouponUsageHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

