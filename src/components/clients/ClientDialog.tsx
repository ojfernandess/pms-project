import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";
import { formatCNPJ, formatCPF } from "@/lib/reservationUtils";

interface ClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const ClientDialog = ({ open, onOpenChange, onSuccess }: ClientDialogProps) => {
  const { selectedEstablishment } = useEstablishment();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const establishmentId = selectedEstablishment?.id;
      const { error } = await supabase.from("clients").insert([{
        ...formData,
        establishment_id: establishmentId || undefined,
      }]);

      if (error) throw error;

      toast.success("Cliente cadastrado com sucesso!");
      onSuccess();
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
    } catch (error: any) {
      toast.error(error.message || "Erro ao cadastrar cliente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="document_type">Tipo de Documento</Label>
              <Select
                value={formData.document_type}
                onValueChange={(value) => setFormData({ ...formData, document_type: value, document_number: "" })}
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
                  let value = e.target.value;
                  // Aplicar máscara baseado no tipo de documento
                  if (formData.document_type === "CNPJ") {
                    value = formatCNPJ(value);
                  } else if (formData.document_type === "CPF") {
                    value = formatCPF(value);
                  }
                  setFormData({ ...formData, document_number: value });
                }}
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
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="city">Cidade</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="state">Estado</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
