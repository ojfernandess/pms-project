import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SiteSettings {
  id: string;
  favicon_url: string | null;
  logo_url: string | null;
  site_title: string;
  site_description: string;
  meta_description: string;
  og_title: string;
  og_description: string;
  og_image: string | null;
  pms_base_url?: string | null;
  console_logs_enabled?: boolean;
  features_enabled?: {
    api_integrations?: boolean;
    stripe?: boolean;
    email?: boolean;
    web_checkin?: boolean;
    channel_manager?: boolean;
    stay_reviews?: boolean;
  } | null;
  created_at: string;
  updated_at: string;
}

const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export const useSiteSettings = () => {
  const queryClient = useQueryClient();

  // Buscar configurações do site
  const { data: settings, isLoading } = useQuery({
    queryKey: ["site_settings"],
    queryFn: async () => {
      // Tentar buscar configurações existentes
      let { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .eq("id", SITE_SETTINGS_ID)
        .maybeSingle();

      // Se não existir, retornar objeto vazio (configurações devem ser feitas no SuperAdmin)
      if (!data && (error?.code === 'PGRST116' || !error)) {
        // Retornar objeto vazio para forçar configuração no SuperAdmin
        // Não usar valores padrão hardcoded - apenas SuperAdmin pode definir
        return {
          id: SITE_SETTINGS_ID,
          favicon_url: null,
          logo_url: null,
          site_title: '',
          site_description: '',
          meta_description: '',
          og_title: '',
          og_description: '',
          og_image: null,
          features_enabled: {
            api_integrations: true,
            stripe: true,
            email: true,
            web_checkin: true,
            channel_manager: true,
            stay_reviews: false,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as SiteSettings;
      }

      if (error) {
        console.error("Erro ao buscar configurações do site:", error);
        throw error;
      }

      return data as SiteSettings;
    },
  });

  // Atualizar configurações do site
  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<SiteSettings>) => {
      const { data, error } = await supabase
        .from("site_settings")
        .update(updates)
        .eq("id", SITE_SETTINGS_ID)
        .select()
        .single();

      if (error) {
        console.error("Erro ao atualizar configurações do site:", error);
        throw error;
      }

      return data as SiteSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site_settings"] });
      toast.success("Configurações do site atualizadas com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar configurações do site");
    },
  });

  // Upload de imagem (favicon ou logo)
  const uploadImage = async (file: File, type: "favicon" | "logo" | "og_image"): Promise<string | null> => {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `site/${fileName}`;

      // Tentar fazer upload no Supabase Storage
      const bucketName = "hotel-assets";
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        // Verificar se é erro de bucket não encontrado
        if (uploadError.message?.includes("Bucket") || uploadError.message?.includes("bucket") || uploadError.message?.includes("not found")) {
          const errorMessage = `Bucket 'hotel-assets' não encontrado.\n\n` +
            `Por favor, crie o bucket no Supabase Dashboard:\n\n` +
            `1. Acesse Storage > Buckets\n` +
            `2. Clique em "New bucket"\n` +
            `3. Nome: "hotel-assets"\n` +
            `4. Public: true (público)\n` +
            `5. File size limit: 5242880 (5MB)\n` +
            `6. Allowed MIME types: image/jpeg, image/jpg, image/png, image/webp, image/gif, image/svg+xml, image/x-icon\n\n` +
            `Depois, configure as políticas de acesso:\n` +
            `- SELECT: bucket_id = 'hotel-assets' (público)\n` +
            `- INSERT: bucket_id = 'hotel-assets' (authenticated)\n` +
            `- UPDATE: bucket_id = 'hotel-assets' (authenticated)\n` +
            `- DELETE: bucket_id = 'hotel-assets' (authenticated)\n\n` +
            `Veja o arquivo APLICAR_MIGRATION_STORAGE_BUCKET_HOTEL_ASSETS.md para mais detalhes.`;
          
          // Para imagens OG, não usar data URL como fallback (não funciona com Open Graph)
          if (type === "og_image") {
            toast.error("Bucket não encontrado. A imagem OG precisa ser hospedada em uma URL pública. Configure o bucket 'hotel-assets' no Supabase.");
            console.error("Bucket não encontrado para imagem OG:", uploadError);
            return null;
          }
          
          toast.error("Bucket não encontrado. Usando data URL como fallback temporário.");
          console.warn("Bucket não encontrado, usando data URL:", uploadError);
          
          // Usar data URL como fallback temporário apenas para favicon e logo
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(reader.result as string);
            };
            reader.readAsDataURL(file);
          });
        }
        
        // Outros erros
        toast.error(`Erro ao fazer upload: ${uploadError.message}`);
        console.error("Erro ao fazer upload:", uploadError);
        return null;
      }

      const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      // Garantir que a URL seja absoluta
      const publicUrl = data.publicUrl;
      if (publicUrl && !publicUrl.startsWith("http://") && !publicUrl.startsWith("https://")) {
        // Se a URL não começar com http, adicionar o protocolo
        return `https:${publicUrl}`;
      }
      return publicUrl;
    } catch (error: any) {
      console.error("Erro ao fazer upload:", error);
      // Para imagens OG, não usar data URL como fallback (não funciona com Open Graph)
      if (type === "og_image") {
        toast.error("Erro ao fazer upload da imagem OG. A imagem precisa ser hospedada em uma URL pública.");
        return null;
      }
      // Em caso de erro, retornar data URL como fallback apenas para favicon e logo
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
    settings,
    isLoading,
    updateSettings: updateSettings.mutate,
    isUpdating: updateSettings.isPending,
    uploadImage,
  };
};

