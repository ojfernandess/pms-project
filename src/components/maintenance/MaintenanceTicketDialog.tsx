import { useState, useEffect, useMemo } from "react";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Loader2, ChevronRight, ChevronLeft, CheckCircle, Upload, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Função para converter URL antiga de "documents" para "maintenance"
// Também garante que URLs do bucket maintenance estejam corretas
const convertUrlToMaintenanceBucket = (url: string): string => {
  if (!url) return url;
  
  // Se a URL contém "/documents/", substituir por "/maintenance/"
  if (url.includes('/documents/')) {
    return url.replace(/\/documents\//g, '/maintenance/');
  }
  
  // Se já é uma URL do maintenance, retornar como está
  if (url.includes('/maintenance/')) {
    return url;
  }
  
  // Se for uma URL do Supabase Storage mas sem o bucket específico, tentar adicionar
  if (url.includes('/storage/v1/object/public/') && !url.includes('/maintenance/') && !url.includes('/documents/')) {
    const match = url.match(/\/storage\/v1\/object\/public\/(.+)$/);
    if (match && match[1] && !match[1].startsWith('maintenance/')) {
      return url.replace(/\/storage\/v1\/object\/public\//, '/storage/v1/object/public/maintenance/');
    }
  }
  
  return url;
};

// Componente para exibir thumbnail com tratamento de erro
const AttachmentThumbnail = ({ attachment }: { attachment: any }) => {
  const [imageError, setImageError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>(convertUrlToMaintenanceBucket(attachment.file_url));
  
  // Tentar gerar signed URL se a URL pública falhar
  useEffect(() => {
    const tryGenerateSignedUrl = async () => {
      if (imageError && attachment.file_url) {
        try {
          // Extrair o caminho do arquivo da URL (sem o prefixo "maintenance/" porque já especificamos o bucket)
          const extractFilePath = (url: string): string | null => {
            if (!url) return null;
            
            // Se já for um caminho relativo começando com "maintenance/", remover o prefixo
            if (url.startsWith("maintenance/")) {
              return url.replace(/^maintenance\//, "");
            }
            
            // Tentar extrair o caminho após /maintenance/ (pode aparecer uma ou duas vezes)
            // Formato esperado: /storage/v1/object/public/maintenance/maintenance/ticket_id/file.png
            // ou: /storage/v1/object/public/maintenance/ticket_id/file.png
            const match = url.match(/\/maintenance\/(.+)$/);
            if (match) {
              let path = match[1];
              // Se o path começa com "maintenance/", remover (duplicação)
              if (path.startsWith("maintenance/")) {
                path = path.replace(/^maintenance\//, "");
              }
              return path;
            }
            
            // Tentar extrair o caminho após /storage/v1/object/public/maintenance/
            const publicMatch = url.match(/\/storage\/v1\/object\/public\/maintenance\/(.+)$/);
            if (publicMatch) {
              let path = publicMatch[1];
              // Se o path começa com "maintenance/", remover (duplicação)
              if (path.startsWith("maintenance/")) {
                path = path.replace(/^maintenance\//, "");
              }
              return path;
            }
            
            return null;
          };
          
          const filePath = extractFilePath(attachment.file_url);
          if (filePath) {
            const { data: signedData, error } = await supabase.storage
              .from("maintenance")
              .createSignedUrl(filePath, 3600); // 1 hora
            
            if (!error && signedData) {
              setImageUrl(signedData.signedUrl);
              setImageError(false);
            }
          }
        } catch (error) {
          console.error("Erro ao gerar signed URL:", error);
        }
      }
    };
    
    if (imageError) {
      tryGenerateSignedUrl();
    }
  }, [imageError, attachment.file_url]);
  
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Silenciar o erro e apenas marcar como erro para mostrar placeholder
    e.preventDefault();
    setImageError(true);
  };
  
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Sempre permitir tentar abrir a URL, mesmo se a imagem falhou
    if (imageError) {
      e.preventDefault();
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
  };
  
  return (
    <div className="relative group">
      {imageError ? (
        <div className="w-full h-24 flex flex-col items-center justify-center bg-slate-100 rounded-md border border-slate-200">
          <ImageIcon className="h-5 w-5 text-slate-400 mb-1" />
          <span className="text-[10px] text-slate-500">Foto</span>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={attachment.file_name || "Anexo"}
          className="w-full h-24 object-cover rounded-md border border-slate-200"
          onError={handleImageError}
          loading="lazy"
        />
      )}
      <a
        href={imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md"
        onClick={handleClick}
      >
        <ImageIcon className="h-6 w-6 text-white" />
      </a>
    </div>
  );
};

interface MaintenanceTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  ticketId?: string; // Para edição
  initialRoomId?: string; // Para pré-selecionar um quarto
}

export const MaintenanceTicketDialog = ({
  open,
  onOpenChange,
  onSuccess,
  ticketId,
  initialRoomId,
}: MaintenanceTicketDialogProps) => {
  const { createTicket, updateTicket, isCreating, isUpdating } = useMaintenance();
  const { selectedEstablishment } = useEstablishment();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // Para modal simplificado em 3 passos
  const [files, setFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    room_id: "",
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    status: "open" as "open" | "in_progress" | "completed" | "cancelled",
    notes: "",
    ticket_type: "" as "" | "water" | "electrical" | "cleaning" | "other",
    initial_comment: "", // Comentário inicial ao criar o ticket
  });

  // Buscar quartos com categorias
  const { data: roomsData } = useQuery({
    queryKey: ["rooms_with_categories", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = selectedEstablishment?.id;
      
      // Buscar quartos com suas categorias
      let query = supabase
        .from("rooms")
        .select(`
          *,
          room_categories (*)
        `)
        .order("room_number");

      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });

  // Agrupar quartos por categoria
  const roomsByCategory = useMemo(() => {
    if (!roomsData) return [];

    const grouped: Record<string, { category: any; rooms: any[] }> = {};

    roomsData.forEach((room: any) => {
      const categoryId = room.category_id || "uncategorized";
      const category = room.room_categories;

      if (!grouped[categoryId]) {
        grouped[categoryId] = {
          category: category || { id: "uncategorized", name: "Sem Categoria" },
          rooms: [],
        };
      }

      grouped[categoryId].rooms.push(room);
    });

    // Ordenar quartos dentro de cada categoria por número
    Object.keys(grouped).forEach((categoryId) => {
      grouped[categoryId].rooms.sort((a, b) => {
        const numA = parseInt(a.room_number) || 0;
        const numB = parseInt(b.room_number) || 0;
        return numA - numB;
      });
    });

    // Converter para array e ordenar por nome da categoria
    return Object.values(grouped).sort((a, b) => {
      const nameA = a.category?.name || "";
      const nameB = b.category?.name || "";
      return nameA.localeCompare(nameB);
    });
  }, [roomsData]);

  // Funções de upload de arquivos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (ticketId: string): Promise<void> => {
    if (files.length === 0) return;

    setUploadingFiles(true);
    try {
      for (const file of files) {
        const fileExt = file.name.split(".").pop();
        // Não incluir "maintenance/" no caminho porque já especificamos o bucket no .from("maintenance")
        const fileName = `${ticketId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("maintenance")
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Erro ao fazer upload:", uploadError);
          toast.error(`Erro ao fazer upload de ${file.name}: ${uploadError.message}`);
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
      toast.error("Erro ao fazer upload de algumas fotos");
    } finally {
      setUploadingFiles(false);
    }
  };

  // Buscar ticket para edição
  useEffect(() => {
    if (ticketId && open) {
      const fetchTicket = async () => {
        const { data, error } = await supabase
          .from("maintenance_tickets")
          .select(`
            *,
            maintenance_ticket_attachments (*)
          `)
          .eq("id", ticketId)
          .single();

        if (error) {
          toast.error("Erro ao carregar ticket");
          return;
        }

        if (data) {
          setFormData({
            room_id: data.room_id,
            title: data.title,
            description: data.description,
            priority: data.priority,
            status: data.status,
            notes: data.notes || "",
          });
          setExistingAttachments(data.maintenance_ticket_attachments || []);
        }
      };

      fetchTicket();
    } else if (!ticketId && open) {
      // Reset form for new ticket
      setFormData({
        room_id: initialRoomId || "",
        title: "",
        description: "",
        priority: "medium",
        status: "open",
        notes: "",
        ticket_type: "",
      });
      setStep(1); // Reset para primeiro passo
      setFiles([]);
      setExistingAttachments([]);
    }
  }, [ticketId, open, initialRoomId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.room_id) {
        toast.error("Selecione um quarto");
        return;
      }

      if (!formData.title.trim()) {
        toast.error("Título é obrigatório");
        return;
      }

      if (!formData.description.trim()) {
        toast.error("Descrição é obrigatória");
        return;
      }

      // Garantir que title esteja preenchido (pode ter sido preenchido automaticamente no passo 2)
      const finalTitle = formData.title || formData.description.substring(0, 50);

      let createdTicketId: string | undefined;

      if (ticketId) {
        await updateTicket({
          id: ticketId,
          ...formData,
        });
        createdTicketId = ticketId;
      } else {
        // Buscar establishment_id do contexto ou do quarto selecionado
        let establishmentId = selectedEstablishment?.id || null;
        
        // Se não tiver no contexto, buscar do quarto
        if (!establishmentId && formData.room_id) {
          const { data: room } = await supabase
            .from("rooms")
            .select("establishment_id")
            .eq("id", formData.room_id)
            .single();
          
          if (room?.establishment_id) {
            establishmentId = room.establishment_id;
          }
        }
        
        const ticket = await createTicket({
          room_id: formData.room_id,
          establishment_id: establishmentId,
          title: finalTitle,
          description: formData.description,
          priority: formData.priority,
          notes: formData.notes || null,
        });
        createdTicketId = (ticket as any)?.id;
      }

      // Fazer upload de arquivos se houver
      if (files.length > 0 && createdTicketId) {
        await uploadFiles(createdTicketId);
      }

      // Criar comentário inicial se fornecido
      if (createdTicketId && formData.initial_comment?.trim() && !ticketId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          try {
            await supabase
              .from("maintenance_ticket_comments")
              .insert([{
                ticket_id: createdTicketId,
                comment: formData.initial_comment.trim(),
                created_by_user_id: user.id,
                created_by_guest_id: null,
              }]);
          } catch (commentError) {
            console.error("Erro ao criar comentário inicial:", commentError);
            // Não falhar a criação do ticket por causa do comentário
          }
        }
      }

      onSuccess();
      onOpenChange(false);
      setFiles([]);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar ticket");
    } finally {
      setLoading(false);
    }
  };

  // Sugerir prioridade baseado no tipo de problema
  const getSuggestedPriority = (type: string): "low" | "medium" | "high" | "urgent" => {
    if (type === "water") return "urgent";
    if (type === "electrical") return "high";
    if (type === "cleaning") return "low";
    return "medium";
  };

  // Modal simplificado em 3 passos (apenas para criação)
  if (!ticketId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Abrir Chamado</DialogTitle>
            <DialogDescription>
              Passo {step} de 3
            </DialogDescription>
          </DialogHeader>

          {/* Indicador de Progresso */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full transition-all",
                    s === step
                      ? "bg-blue-600 w-8"
                      : s < step
                      ? "bg-blue-600"
                      : "bg-slate-200"
                  )}
                />
                {s < 3 && (
                  <div
                    className={cn(
                      "h-0.5 w-8 transition-all",
                      s < step ? "bg-blue-600" : "bg-slate-200"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Passo 1: Selecionar Quarto */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="room_id" className="text-base font-semibold">
                    Selecione o Quarto
                  </Label>
                  <Select
                    value={formData.room_id}
                    onValueChange={(value) => {
                      setFormData({ ...formData, room_id: value });
                      setTimeout(() => setStep(2), 300);
                    }}
                    required
                  >
                    <SelectTrigger className="mt-2 h-12">
                      <SelectValue placeholder="Escolha um quarto..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {roomsByCategory.map((group) => (
                        <SelectGroup key={group.category?.id || "uncategorized"}>
                          <SelectLabel className="text-xs font-semibold text-slate-500 px-2 py-1.5">
                            {group.category?.name || "Sem Categoria"}
                          </SelectLabel>
                          {group.rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id} className="pl-6">
                              Quarto {room.room_number}
                              {room.floor && ` - Andar ${room.floor}`}
                              {room.status === "maintenance" && " (Em manutenção)"}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!formData.room_id}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Passo 2: Tipo do Problema */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="ticket_type" className="text-base font-semibold">
                    Tipo do Problema
                  </Label>
                  <Select
                    value={formData.ticket_type}
                    onValueChange={(value: "water" | "electrical" | "cleaning" | "other") => {
                      const priority = getSuggestedPriority(value);
                      setFormData({
                        ...formData,
                        ticket_type: value,
                        priority,
                        title: value === "water" ? "Problema com água"
                          : value === "electrical" ? "Problema elétrico"
                          : value === "cleaning" ? "Necessita limpeza"
                          : "Outro problema",
                      });
                    }}
                    required
                  >
                    <SelectTrigger className="mt-2 h-12">
                      <SelectValue placeholder="Selecione o tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="water">💧 Água</SelectItem>
                      <SelectItem value="electrical">⚡ Elétrica</SelectItem>
                      <SelectItem value="cleaning">🧹 Limpeza</SelectItem>
                      <SelectItem value="other">🔧 Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setStep(3)}
                    disabled={!formData.ticket_type}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Passo 3: Descrição e Prioridade */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="description" className="text-base font-semibold">
                    Descrição do Problema
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Descreva brevemente o problema..."
                    rows={4}
                    className="mt-2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="priority" className="text-base font-semibold">
                    Prioridade
                  </Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value: "low" | "medium" | "high" | "urgent") =>
                      setFormData({ ...formData, priority: value })
                    }
                    required
                  >
                    <SelectTrigger className="mt-2 h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">⚪ Baixa</SelectItem>
                      <SelectItem value="medium">🔵 Média</SelectItem>
                      <SelectItem value="high">🟠 Alta</SelectItem>
                      <SelectItem value="urgent">🔴 Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="initial_comment" className="text-base font-semibold">
                    Comentário Inicial (Opcional)
                  </Label>
                  <Textarea
                    id="initial_comment"
                    value={formData.initial_comment}
                    onChange={(e) =>
                      setFormData({ ...formData, initial_comment: e.target.value })
                    }
                    placeholder="Adicione informações adicionais ou observações sobre o problema..."
                    rows={3}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="photos" className="text-base font-semibold">
                    Anexar Fotos (Opcional)
                  </Label>
                  <div className="mt-2">
                    <Input
                      id="photos"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById("photos")?.click()}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Adicionar Fotos
                    </Button>
                    {files.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {files.map((file, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm text-slate-600">
                            <ImageIcon className="h-4 w-4" />
                            <span className="flex-1 truncate">{file.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(2)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || isCreating || uploadingFiles || !formData.description.trim()}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {loading || isCreating || uploadingFiles ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {uploadingFiles ? "Enviando fotos..." : "Criando..."}
                      </>
                    ) : (
                      <>
                        Criar Chamado
                        <CheckCircle className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // Modal completo para edição
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Ticket de Manutenção</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Quarto */}
            <div>
              <Label htmlFor="room_id">Quarto *</Label>
              <Select
                value={formData.room_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, room_id: value })
                }
                required
                disabled={!!ticketId} // Não permitir mudar quarto após criação
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um quarto" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {roomsByCategory.map((group) => (
                    <SelectGroup key={group.category?.id || "uncategorized"}>
                      <SelectLabel className="text-xs font-semibold text-slate-500 px-2 py-1.5">
                        {group.category?.name || "Sem Categoria"}
                      </SelectLabel>
                      {group.rooms.map((room) => (
                        <SelectItem key={room.id} value={room.id} className="pl-6">
                      {room.room_number} {room.floor && `- Andar ${room.floor}`}
                      {room.status === "maintenance" && " (Em manutenção)"}
                    </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prioridade */}
            <div>
              <Label htmlFor="priority">Prioridade *</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: "low" | "medium" | "high" | "urgent") =>
                  setFormData({ ...formData, priority: value })
                }
                required
              >
                <SelectTrigger>
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

            {/* Status (apenas para edição) */}
            {ticketId && (
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: "open" | "in_progress" | "completed" | "cancelled") =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="in_progress">Em Progresso</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Título */}
            <div className={ticketId ? "" : "col-span-2"}>
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Ex: Ar condicionado não funciona"
                required
              />
            </div>

            {/* Descrição */}
            <div className="col-span-2">
              <Label htmlFor="description">Descrição *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Descreva o problema detalhadamente..."
                rows={4}
                required
              />
            </div>

            {/* Observações */}
            <div className="col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Observações adicionais..."
                rows={3}
              />
            </div>

            {/* Anexos Existentes */}
            {existingAttachments.length > 0 && (
              <div className="col-span-2">
                <Label>Fotos Anexadas</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {existingAttachments.map((attachment) => (
                    <AttachmentThumbnail key={attachment.id} attachment={attachment} />
                  ))}
                </div>
              </div>
            )}

            {/* Upload de Novas Fotos */}
            <div className="col-span-2">
              <Label htmlFor="photos_edit">Adicionar Fotos</Label>
              <div className="mt-2">
                <Input
                  id="photos_edit"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("photos_edit")?.click()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Adicionar Fotos
                </Button>
                {files.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-slate-600">
                        <ImageIcon className="h-4 w-4" />
                        <span className="flex-1 truncate">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || isCreating || isUpdating || uploadingFiles}
            >
              {loading || isCreating || isUpdating || uploadingFiles ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {uploadingFiles ? "Enviando fotos..." : "Salvando..."}
                </>
              ) : ticketId ? (
                "Atualizar"
              ) : (
                "Criar Ticket"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

