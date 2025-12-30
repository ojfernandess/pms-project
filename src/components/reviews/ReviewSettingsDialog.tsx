import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStayReviews } from "@/hooks/useStayReviews";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ReviewSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId: string;
  establishmentName: string;
}

export function ReviewSettingsDialog({
  open,
  onOpenChange,
  establishmentId,
  establishmentName,
}: ReviewSettingsDialogProps) {
  const { useGetReviewSettings, updateReviewSettings } = useStayReviews();
  const { data: settings, isLoading } = useGetReviewSettings(establishmentId);

  const [formData, setFormData] = useState({
    is_enabled: false,
    review_type: "stars" as "stars" | "numeric" | "emoji",
    send_email_after_checkout: true,
    email_delay_hours: 24,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        is_enabled: settings.is_enabled,
        review_type: settings.review_type,
        send_email_after_checkout: settings.send_email_after_checkout,
        email_delay_hours: settings.email_delay_hours,
      });
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateReviewSettings.mutateAsync({
      establishmentId,
      ...formData,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configurações de Avaliação</DialogTitle>
          <DialogDescription>
            Configure as avaliações de estadia para {establishmentName}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="is_enabled">Habilitar Avaliações</Label>
                  <p className="text-sm text-muted-foreground">
                    Ative o sistema de avaliações para este estabelecimento
                  </p>
                </div>
                <Switch
                  id="is_enabled"
                  checked={formData.is_enabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_enabled: checked }))
                  }
                />
              </div>

              {formData.is_enabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="review_type">Tipo de Avaliação</Label>
                    <Select
                      value={formData.review_type}
                      onValueChange={(value: "stars" | "numeric" | "emoji") =>
                        setFormData((prev) => ({ ...prev, review_type: value }))
                      }
                    >
                      <SelectTrigger id="review_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stars">Estrelas (1-5)</SelectItem>
                        <SelectItem value="numeric">Notas Numéricas (1-10)</SelectItem>
                        <SelectItem value="emoji">Emojis (1-5)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Escolha como os hóspedes avaliarão sua estadia
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="send_email_after_checkout">
                        Enviar E-mail Após Check-out
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Enviar automaticamente e-mail solicitando avaliação após o check-out
                      </p>
                    </div>
                    <Switch
                      id="send_email_after_checkout"
                      checked={formData.send_email_after_checkout}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          send_email_after_checkout: checked,
                        }))
                      }
                    />
                  </div>

                  {formData.send_email_after_checkout && (
                    <div className="space-y-2">
                      <Label htmlFor="email_delay_hours">
                        Delay para Envio (horas)
                      </Label>
                      <Input
                        id="email_delay_hours"
                        type="number"
                        min="0"
                        max="168"
                        value={formData.email_delay_hours}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            email_delay_hours: parseInt(e.target.value) || 0,
                          }))
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        Quantas horas após o check-out o e-mail será enviado (0 = imediato)
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updateReviewSettings.isPending}>
                {updateReviewSettings.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

