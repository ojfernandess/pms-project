import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useHotelSettings = () => {
  const queryClient = useQueryClient();

  // Buscar configurações do hotel (sempre retorna uma única configuração)
  const settingsQuery = useQuery({
    queryKey: ["hotel_settings"],
    queryFn: async () => {
      try {
        const establishmentId = localStorage.getItem("selectedEstablishmentId");
        let query = supabase.from("hotel_settings").select("*");
        if (establishmentId) {
          query = query.eq("establishment_id", establishmentId);
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
      name: string;
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
    }) => {
      // Buscar establishment_id do localStorage
      const establishmentId = localStorage.getItem("selectedEstablishmentId");
      
      // Buscar configuração existente - sempre buscar primeiro para evitar constraint violations
      let query = supabase.from("hotel_settings").select("*");
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      } else {
        // Se não há establishment_id, buscar qualquer configuração (fallback)
        query = query.limit(1);
      }
      const { data: existing, error: queryError } = await query.maybeSingle();
      
      // Se houver erro na query (exceto "não encontrado"), lançar
      if (queryError && queryError.code !== "PGRST116") {
        throw queryError;
      }
      
      // Preparar dados para atualização/inserção
      const updateData = establishmentId 
        ? { ...settings, establishment_id: establishmentId }
        : settings;
      
      // Sempre tentar UPDATE primeiro se existe registro
      if (existing) {
        // Atualizar configuração existente
        const { data, error } = await supabase
          .from("hotel_settings")
          .update(updateData)
          .eq("id", existing.id)
          .select()
          .single();

        if (error) {
          // Se erro de constraint, pode ser que o establishment_id mudou
          // Tentar buscar novamente e atualizar
          if (error.code === "23505" && establishmentId) {
            const { data: retryExisting } = await supabase
              .from("hotel_settings")
              .select("*")
              .eq("establishment_id", establishmentId)
              .maybeSingle();
            
            if (retryExisting && retryExisting.id !== existing.id) {
              // Se encontrou outro registro com o mesmo establishment_id, atualizar esse
              const { data: updatedData, error: updateError } = await supabase
                .from("hotel_settings")
                .update(updateData)
                .eq("id", retryExisting.id)
                .select()
                .single();
              if (updateError) throw updateError;
              return updatedData;
            }
          }
          throw error;
        }
        return data;
      } else {
        // Não existe registro, tentar criar
        // Mas primeiro verificar se há algum registro (pode ser que a constraint única não permita múltiplos)
        const { data: anyExisting } = await supabase
          .from("hotel_settings")
          .select("*")
          .limit(1)
          .maybeSingle();
        
        if (anyExisting) {
          // Se existe qualquer registro, atualizar esse ao invés de criar novo
          const { data, error } = await supabase
            .from("hotel_settings")
            .update(updateData)
            .eq("id", anyExisting.id)
            .select()
            .single();

          if (error) throw error;
          return data;
        } else {
          // Não existe nenhum registro, criar novo
          const { data, error } = await supabase
            .from("hotel_settings")
            .insert([updateData])
            .select()
            .single();

          if (error) {
            // Se erro de constraint, pode ser que foi criado entre a verificação e o insert
            // Tentar buscar e atualizar
            if (error.code === "23505") {
              const { data: retryExisting } = await supabase
                .from("hotel_settings")
                .select("*");
              
              if (establishmentId) {
                const { data: byEstablishment } = await retryExisting.eq("establishment_id", establishmentId).maybeSingle();
                if (byEstablishment) {
                  const { data: updatedData, error: updateError } = await supabase
                    .from("hotel_settings")
                    .update(updateData)
                    .eq("id", byEstablishment.id)
                    .select()
                    .single();
                  if (updateError) throw updateError;
                  return updatedData;
                }
              }
              
              const { data: anyRecord } = await retryExisting.limit(1).maybeSingle();
              if (anyRecord) {
                const { data: updatedData, error: updateError } = await supabase
                  .from("hotel_settings")
                  .update(updateData)
                  .eq("id", anyRecord.id)
                  .select()
                  .single();
                if (updateError) throw updateError;
                return updatedData;
              }
            }
            throw error;
          }
          return data;
        }
      }
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
      
      // Se o nome foi alterado e há establishment_id, atualizar também na tabela establishments
      const establishmentId = localStorage.getItem("selectedEstablishmentId");
      if (establishmentId && data?.name) {
        try {
          await supabase
            .from("establishments")
            .update({ name: data.name })
            .eq("id", establishmentId);
          
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
      const fileExt = file.name.split(".").pop();
      const fileName = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `hotel/${fileName}`;

      // Tentar fazer upload no Supabase Storage
      const bucketName = "hotel-assets";
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        // Se o bucket não existir, usar data URL como fallback
        console.warn("Bucket não encontrado, usando data URL:", uploadError);
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
      // Em caso de erro, retornar data URL como fallback
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
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

