import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, X, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/lib/activityLogger";
import { useGuestAccount } from "@/hooks/useGuestAccount";

interface MaintenanceTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  webCheckin: any;
  token: string;
  onSuccess?: () => void;
}

export function MaintenanceTicketDialog({
  open,
  onOpenChange,
  reservation,
  webCheckin,
  token,
  onSuccess,
}: MaintenanceTicketDialogProps) {
  const queryClient = useQueryClient();
  const { getCurrentSession } = useGuestAccount();
  const session = getCurrentSession();
  const accountId = session?.accountId;
  const [loading, setLoading] = useState(false);
  const [ticketType, setTicketType] = useState<string>("general");
  const [priority, setPriority] = useState<string>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (ticketId: string): Promise<string[]> => {
    if (files.length === 0) return [];

    setUploadingFiles(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of files) {
        const fileExt = file.name.split(".").pop();
        const fileName = `maintenance/${ticketId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("maintenance")
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Erro ao fazer upload:", uploadError);
          continue;
        }

        // Verificar se o bucket é público ou privado para gerar URL correta
        const { data: buckets } = await supabase.storage.listBuckets();
        const maintenanceBucket = buckets?.find((b) => b.name === "maintenance");
        const isPublic = maintenanceBucket?.public ?? true; // Default para público se não conseguir verificar

        let fileUrl: string;
        
        if (isPublic) {
          // Se for público, usar URL pública
          const { data } = supabase.storage.from("maintenance").getPublicUrl(fileName);
          fileUrl = data.publicUrl;
        } else {
          // Se for privado, gerar signed URL válida por 1 ano
          const { data: signedData, error: signedError } = await supabase.storage
            .from("maintenance")
            .createSignedUrl(fileName, 31536000); // 1 ano em segundos
          
          if (signedError) {
            console.error("Erro ao gerar signed URL:", signedError);
            // Fallback: usar URL pública mesmo sendo privado
            const { data } = supabase.storage.from("maintenance").getPublicUrl(fileName);
            fileUrl = data.publicUrl;
          } else {
            fileUrl = signedData.signedUrl;
          }
        }

        uploadedUrls.push(fileUrl);

        // Criar registro de anexo
        await supabase.from("maintenance_ticket_attachments").insert({
          ticket_id: ticketId,
          file_url: fileUrl,
          file_type: file.type,
          file_name: file.name,
        });
      }
    } catch (error) {
      console.error("Erro ao fazer upload de arquivos:", error);
    } finally {
      setUploadingFiles(false);
    }

    return uploadedUrls;
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Por favor, informe um título para o chamado");
      return;
    }

    if (!description.trim()) {
      toast.error("Por favor, descreva o problema ou solicitação");
      return;
    }

    setLoading(true);
    try {
      // Garantir que temos o establishment_id antes de criar o ticket
      let establishmentId = reservation.establishment_id || webCheckin?.establishment_id || null;
      
      // Se não tiver establishment_id, buscar da reserva
      if (!establishmentId && reservation.id) {
        const { data: reservationData } = await supabase
          .from("reservations")
          .select("establishment_id")
          .eq("id", reservation.id)
          .single();
        
        if (reservationData?.establishment_id) {
          establishmentId = reservationData.establishment_id;
        }
      }
      
      console.log("🔧 Criando chamado de manutenção:", {
        reservationId: reservation.id,
        establishmentId,
        reservationEstablishmentId: reservation.establishment_id,
        webCheckinEstablishmentId: webCheckin?.establishment_id,
      });
      
      // Criar ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("maintenance_tickets")
        .insert({
          reservation_id: reservation.id,
          establishment_id: establishmentId,
          room_id: reservation.room_id,
          guest_account_id: accountId || null, // Adicionar guest_account_id para permitir notificações
          ticket_type: ticketType,
          priority: priority,
          title: title.trim(),
          description: description.trim(),
          status: "open",
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Fazer upload de arquivos
      if (files.length > 0) {
        await uploadFiles(ticket.id);
      }

      // Registrar log de atividade
      await logActivity({
        actionType: "maintenance_ticket_created",
        entityType: "maintenance_ticket",
        entityId: ticket.id,
        entityCode: null,
        description: `Chamado de manutenção criado: ${title}`,
        metadata: {
          ticket_type: ticketType,
          priority: priority,
          reservation_id: reservation.id,
          created_via: "web_checkin",
        },
      });

      // Criar notificação para chamado de manutenção criado pelo web check-in
      try {
        // Obter establishment_id do ticket criado (já deve ter sido salvo)
        const notificationEstablishmentId = ticket.establishment_id || establishmentId || null;
        
        if (notificationEstablishmentId) {
          // Buscar dados completos da reserva para obter nome do hóspede
          const { data: fullReservation } = await supabase
            .from("reservations")
            .select(`
              id,
              reservation_code,
              guest_id,
              client_id,
              guest:clients!guest_id(full_name, email),
              financial_responsible:clients!client_id(full_name, email)
            `)
            .eq("id", reservation.id)
            .single();
          
          const guestName = fullReservation?.guest?.full_name || 
                           fullReservation?.financial_responsible?.full_name || 
                           reservation.guest?.full_name || 
                           reservation.financial_responsible?.full_name || 
                           "Hóspede";
          
          const reservationCode = fullReservation?.reservation_code || 
                                 reservation.reservation_code || 
                                 "";
          
          const priorityMap: Record<string, "low" | "medium" | "high" | "urgent"> = {
            low: "low",
            medium: "medium",
            high: "high",
            urgent: "urgent",
          };
          
          console.log("🔔 Criando notificação de manutenção:", {
            establishmentId: notificationEstablishmentId,
            guestName,
            reservationCode,
            ticketId: ticket.id,
          });
          
          const { error: notificationError } = await supabase.rpc("create_notification_for_establishment", {
            p_establishment_id: notificationEstablishmentId,
            p_type: "maintenance_ticket",
            p_title: "Novo Chamado de Manutenção",
            p_message: `Chamado de manutenção criado por ${guestName} via web check-in: ${title}`,
            p_priority: priorityMap[priority] || "medium",
            p_metadata: {
              ticket_id: ticket.id,
              reservation_id: reservation.id,
              reservation_code: reservationCode,
              ticket_type: ticketType,
              priority: priority,
              created_via: "web_checkin",
            },
          });
          
          if (notificationError) {
            console.error("❌ Erro ao criar notificação:", notificationError);
          } else {
            console.log("✅ Notificação criada com sucesso");
          }
        } else {
          console.warn("⚠️ establishment_id não encontrado para criar notificação:", {
            ticketEstablishmentId: ticket.establishment_id,
            reservationEstablishmentId: reservation.establishment_id,
            webCheckinEstablishmentId: webCheckin?.establishment_id,
            localEstablishmentId: establishmentId,
          });
        }
      } catch (error) {
        console.error("❌ Erro ao criar notificação de chamado de manutenção:", error);
        // Não bloquear a criação do chamado se a notificação falhar
      }

      toast.success("Chamado de manutenção criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["maintenance_tickets"] });
      onSuccess?.();
      onOpenChange(false);

      // Reset form
      setTitle("");
      setDescription("");
      setFiles([]);
      setTicketType("general");
      setPriority("medium");
    } catch (error: any) {
      console.error("Erro ao criar chamado:", error);
      toast.error(error.message || "Erro ao criar chamado de manutenção");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Abrir Chamado de Manutenção</DialogTitle>
          <DialogDescription>
            Descreva o problema ou solicitação que precisa de atenção
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tipo de chamado */}
          <div>
            <Label>Tipo de Chamado</Label>
            <Select value={ticketType} onValueChange={setTicketType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Geral</SelectItem>
                <SelectItem value="plumbing">Hidráulica</SelectItem>
                <SelectItem value="electrical">Elétrica</SelectItem>
                <SelectItem value="cleaning">Limpeza</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Prioridade */}
          <div>
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Título */}
          <div>
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Vazamento no banheiro"
              className="mt-1"
              required
            />
          </div>

          {/* Descrição */}
          <div>
            <Label>Descrição *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o problema ou solicitação em detalhes..."
              className="mt-1 min-h-[120px]"
              required
            />
          </div>

          {/* Upload de arquivos */}
          <div>
            <Label>Anexar Fotos/Documentos</Label>
            <div className="mt-1 space-y-2">
              <Input
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-slate-50 rounded-md"
                    >
                      <span className="text-sm text-slate-700 truncate flex-1">
                        {file.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Aviso */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">
              Seu chamado será encaminhado para a equipe de manutenção. Você receberá
              atualizações por email.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || uploadingFiles}>
            {loading || uploadingFiles ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploadingFiles ? "Enviando arquivos..." : "Criando chamado..."}
              </>
            ) : (
              "Criar Chamado"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

