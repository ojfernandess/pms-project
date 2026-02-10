import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useHotelSettings = (establishmentId?: string) => {
  const queryClient = useQueryClient();

  // Usar establishmentId passado como parâmetro ou do localStorage
  const finalEstablishmentId = establishmentId || localStorage.getItem("selectedEstablishmentId") || undefined;

  // Buscar configurações do hotel (sempre retorna uma única configuração)
  const settingsQuery = useQuery({
    queryKey: ["hotel_settings", finalEstablishmentId],
    queryFn: async () => {
      try {
        let query = supabase.from("hotel_settings").select("*");
        if (finalEstablishmentId) {
          query = query.eq("establishment_id", finalEstablishmentId);
        }
        const { data, error } = await query.limit(1).maybeSingle();

        if (error) {
          // Se a tabela não existir (erro 406 ou similar), retornar null
          if (error.code === "PGRST116" || error.message?.includes("relation") || error.message?.includes("does not exist")) {
            console.warn("Tabela hotel_settings não encontrada. Execute a migration primeiro.");
            return null;
          }
          throw error;
        }
        return data || null;
      } catch (error: any) {
        // Tratar erros de tabela não encontrada
        if (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist")) {
          console.warn("Tabela hotel_settings não encontrada. Execute a migration primeiro.");
          return null;
        }
        throw error;
      }
    },
    retry: false, // Não tentar novamente se a tabela não existir
  });

  // Criar ou atualizar configurações do hotel
  const saveSettings = useMutation({
    mutationFn: async (settings: {
      name?: string;
      website?: string;
      email?: string;
      hotel_type?: string;
      phone?: string;
      whatsapp?: string;
      // Campos antigos mantidos para compatibilidade
      phone_ddi?: string;
      phone_number?: string;
      whatsapp_ddi?: string;
      whatsapp_number?: string;
      description?: string;
      street?: string;
      number?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      country?: string;
      zip_code?: string;
      logo_url?: string;
      photo_url?: string;
      signature_url?: string;
      checkin_time?: string;
      checkout_time?: string;
      auto_payment_ota?: boolean;
      auto_payment_carrier_id?: string;
      policies?: any;
      fiscal_document_type?: string;
      invoice_email?: string;
      establishment_cnpj?: string;
      show_establishment_cnpj?: boolean;
      enable_cleaning_notifications?: boolean;
      timezone?: string;
      public_pricing_plan_id?: string | null;
      establishment_photos?: string[];
    }) => {
      // Usar establishmentId passado como parâmetro ou do localStorage
      const currentEstablishmentId = establishmentId || localStorage.getItem("selectedEstablishmentId") || undefined;
      
      if (!currentEstablishmentId) {
        throw new Error("É necessário selecionar um estabelecimento para salvar as configurações");
      }
      
      // Preparar dados para atualização/inserção
      // IMPORTANTE: Mesclar apenas os campos fornecidos, preservando os existentes
      const newData: any = { ...settings };
      
      // Buscar nome do estabelecimento caso precise criar novo registro
      let establishmentName = newData.name;
      if (!establishmentName) {
        const { data: establishment } = await supabase
          .from("establishments")
          .select("name")
          .eq("id", currentEstablishmentId)
          .maybeSingle();
        establishmentName = establishment?.name || "Estabelecimento";
      }
      
      // Função auxiliar para buscar registro existente APENAS do estabelecimento atual
      const findExisting = async () => {
        const { data, error } = await supabase
          .from("hotel_settings")
          .select("*")
          .eq("establishment_id", currentEstablishmentId)
          .maybeSingle();
        
        if (error && error.code !== "PGRST116") {
          throw error;
        }
        return data;
      };
      
      // Função auxiliar para fazer UPDATE mesclando dados existentes com novos
      const performUpdate = async (existingRecord: any, newFields: any) => {
        // Mesclar dados existentes com novos campos
        // Preservar TODOS os campos existentes e apenas atualizar os fornecidos
        const mergedData: any = {
          ...existingRecord, // Preservar todos os campos existentes
          ...newFields,      // Sobrescrever apenas os campos fornecidos
          establishment_id: currentEstablishmentId, // Sempre garantir o establishment_id correto
        };
        
        // Se name não foi fornecido, preservar o existente
        if (!mergedData.name && existingRecord.name) {
          mergedData.name = existingRecord.name;
        }
        
        const { data, error } = await supabase
          .from("hotel_settings")
          .update(mergedData)
          .eq("id", existingRecord.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      };
      
      // Buscar registro existente do estabelecimento atual
      let existing = await findExisting();
      
      // Se encontrou registro do estabelecimento atual, fazer UPDATE mesclado
      if (existing) {
        try {
          return await performUpdate(existing, newData);
        } catch (error: any) {
          // Se erro de constraint, buscar novamente e tentar atualizar
          if (error.code === "23505" || error.message?.includes("duplicate key") || error.message?.includes("unique constraint")) {
            await new Promise(resolve => setTimeout(resolve, 100));
            existing = await findExisting();
            if (existing) {
              return await performUpdate(existing, newData);
            }
          }
          throw error;
        }
      }
      
      // Não encontrou registro, verificar novamente antes de INSERT
      await new Promise(resolve => setTimeout(resolve, 50));
      existing = await findExisting();
      
      if (existing) {
        // Registro foi criado entre as verificações, fazer UPDATE mesclado
        return await performUpdate(existing, newData);
      }
      
      // Realmente não existe, criar novo registro
      // Incluir todos os campos necessários para um novo registro
      const insertData: any = {
        ...newData,
        name: establishmentName,
        establishment_id: currentEstablishmentId,
      };
      
      try {
        const { data, error } = await supabase
          .from("hotel_settings")
          .insert([insertData])
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } catch (error: any) {
        // Se erro de constraint, buscar registro existente e fazer UPDATE mesclado
        if (error.code === "23505" || error.message?.includes("duplicate key") || error.message?.includes("unique constraint")) {
          await new Promise(resolve => setTimeout(resolve, 200));
          
          existing = await findExisting();
          if (existing) {
            // IMPORTANTE: Mesclar dados, não substituir tudo
            return await performUpdate(existing, newData);
          }
        }
        throw error;
      }
    },
    onSuccess: async (data) => {
      // Invalidar queries específicas do establishment_id
      const currentEstablishmentId = establishmentId || localStorage.getItem("selectedEstablishmentId") || undefined;
      queryClient.invalidateQueries({ queryKey: ["hotel_settings", currentEstablishmentId] });
      queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
      
      // Se o nome foi alterado e há establishment_id, atualizar também na tabela establishments
      if (currentEstablishmentId && data?.name) {
        try {
          await supabase
            .from("establishments")
            .update({ name: data.name })
            .eq("id", currentEstablishmentId);
          
          // Invalidar cache de establishments para atualizar a página "Minhas Empresas"
          queryClient.invalidateQueries({ queryKey: ["establishments"] });
        } catch (error) {
          console.warn("Erro ao atualizar nome do estabelecimento:", error);
          // Não bloquear o sucesso da operação principal
        }
      }
      
      toast.success("Configurações salvas com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar configurações");
    },
  });

  // Upload de imagem (logo, foto ou assinatura)
  const uploadImage = async (file: File, type: "logo" | "photo" | "signature"): Promise<string | null> => {
    try {
      // Validar tipo MIME suportado
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/svg+xml',
        'image/x-icon'
      ];

      // Verificar se o tipo MIME é suportado
      if (!allowedMimeTypes.includes(file.type)) {
        const errorMsg = `Formato de imagem não suportado: ${file.type || 'desconhecido'}. Formatos aceitos: JPEG, PNG, WebP, GIF, SVG ou ICO.`;
        toast.error(errorMsg);
        console.error("Formato não suportado:", file.type, "Arquivo:", file.name);
        return null;
      }

      const fileExt = file.name.split(".").pop()?.toLowerCase() || 'png';
      const fileName = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `hotel/${fileName}`;

      // Tentar fazer upload no Supabase Storage
      const bucketName = "hotel-assets";
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        // Verificar se é erro de tipo MIME não suportado
        if (uploadError.message?.includes('mime type') || uploadError.message?.includes('not supported')) {
          const errorMsg = `Formato de imagem não suportado pelo servidor. Use JPEG, PNG, WebP ou GIF.`;
          toast.error(errorMsg);
          console.error("Erro de tipo MIME:", uploadError);
          return null;
        }
        
        // Se o bucket não existir ou outro erro, usar data URL como fallback
        console.warn("Erro no upload, usando data URL como fallback:", uploadError);
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(file);
        });
      }

      const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error: any) {
      console.error("Erro ao fazer upload:", error);
      toast.error(error.message || "Erro ao fazer upload da imagem. Tente novamente.");
      
      // Em caso de erro, tentar retornar data URL como fallback apenas se não for erro de formato
      if (!error.message?.includes('mime type') && !error.message?.includes('not supported')) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(file);
        });
      }
      
      return null;
    }
  };

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    refetch: settingsQuery.refetch,
    saveSettings: saveSettings.mutateAsync,
    uploadImage,
    isSaving: saveSettings.isPending,
    settingsQuery, // Expor a query para verificar erros
  };
};

