import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSiteSettings } from "./useSiteSettings";

/** Favicon neutro (data URI): evita que o navegador recaia em /favicon.ico ao remover ícones nas rotas do motor */
const NEUTRAL_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23f0f0f0'/%3E%3C/svg%3E";

/** Rotas do motor de reservas / páginas white-label: o favicon é controlado pelo motor, não pelo sistema */
function isBookingEngineRoute(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return (
    p.startsWith("/motor") ||
    p.startsWith("/reservar") ||
    p.startsWith("/categoria") ||
    p.startsWith("/reserva") ||
    p.startsWith("/politica")
  );
}

/**
 * Hook para atualizar dinamicamente o título e meta tags do site
 * Atualiza imediatamente ao carregar, garantindo que apenas as configurações do SuperAdmin sejam válidas
 * Nas rotas do motor de reservas, NÃO aplica favicon do sistema (evita flash; o motor aplica o do cliente).
 */
export const useSiteMeta = () => {
  const { pathname } = useLocation();
  const { settings } = useSiteSettings();
  const isMotor = isBookingEngineRoute(pathname);

  useEffect(() => {
    // Se não houver configurações ainda, aguardar
    if (!settings) return;

    // Atualizar título (sempre usar configuração do SuperAdmin)
    document.title = settings.site_title || "";

    // Atualizar ou criar meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute("content", settings.meta_description || settings.site_description || "");

    // Atualizar meta author
    let metaAuthor = document.querySelector('meta[name="author"]');
    if (!metaAuthor) {
      metaAuthor = document.createElement("meta");
      metaAuthor.setAttribute("name", "author");
      document.head.appendChild(metaAuthor);
    }
    metaAuthor.setAttribute("content", settings.site_title || "");

    // Favicon: nas rotas do motor (white-label) NUNCA usar o do sistema — só o motor aplica o do cliente.
    // Nas rotas do PMS: usar favicon do SuperAdmin ou fallback para /favicon.ico (public).
    const oldFavicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
    if (isMotor) {
      oldFavicons.forEach(fav => fav.remove());
      const placeholder = document.createElement("link");
      placeholder.setAttribute("rel", "icon");
      placeholder.setAttribute("href", NEUTRAL_FAVICON);
      document.head.appendChild(placeholder);
    } else {
      oldFavicons.forEach(fav => fav.remove());
      const pmsFaviconUrl = settings.favicon_url?.trim() || `${window.location.origin}/favicon.ico`;
      const favicon = document.createElement("link");
      favicon.setAttribute("rel", "icon");
      favicon.setAttribute("href", pmsFaviconUrl);
      document.head.appendChild(favicon);
    }

    // Função auxiliar para atualizar ou criar meta tags
    const updateMetaTag = (property: string, content: string, isName = false) => {
      const selector = isName 
        ? `meta[name="${property}"]` 
        : `meta[property="${property}"]`;
      
      let meta = document.querySelector(selector);
      if (!meta) {
        meta = document.createElement("meta");
        if (isName) {
          meta.setAttribute("name", property);
        } else {
          meta.setAttribute("property", property);
        }
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content || "");
    };

    // Função para garantir URL absoluta
    const ensureAbsoluteUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      
      // Se já é uma URL absoluta (começa com http:// ou https://), retornar como está
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
      }
      
      // Se é data URL (data:image/...), não funciona para Open Graph, retornar null
      if (url.startsWith("data:")) {
        console.warn("Data URLs não são suportadas para Open Graph. Use uma URL absoluta.");
        return null;
      }
      
      // Se é uma URL relativa, converter para absoluta usando window.location.origin
      if (url.startsWith("/")) {
        return `${window.location.origin}${url}`;
      }
      
      // Se começa com //, adicionar o protocolo
      if (url.startsWith("//")) {
        return `${window.location.protocol}${url}`;
      }
      
      // Para outros casos, assumir que é relativa e adicionar origin
      return `${window.location.origin}/${url}`;
    };

    // Obter URL base do site
    const siteUrl = window.location.origin;

    // Atualizar Open Graph tags
    updateMetaTag("og:title", settings.og_title || settings.site_title || "");
    updateMetaTag("og:description", settings.og_description || settings.site_description || "");
    updateMetaTag("og:type", "website");
    updateMetaTag("og:url", siteUrl);
    
    // Atualizar og:image apenas se houver imagem válida (não data URL)
    const ogImageUrl = ensureAbsoluteUrl(settings.og_image);
    if (ogImageUrl) {
      updateMetaTag("og:image", ogImageUrl);
      updateMetaTag("og:image:width", "1200");
      updateMetaTag("og:image:height", "630");
      updateMetaTag("og:image:type", "image/png");
    } else {
      // Remover og:image se não houver imagem válida
      const existingOgImage = document.querySelector('meta[property="og:image"]');
      if (existingOgImage) {
        existingOgImage.remove();
      }
    }

    // Atualizar Twitter Card tags
    updateMetaTag("twitter:card", "summary_large_image", true);
    updateMetaTag("twitter:title", settings.og_title || settings.site_title || "", true);
    updateMetaTag("twitter:description", settings.og_description || settings.site_description || "", true);
    if (ogImageUrl) {
      updateMetaTag("twitter:image", ogImageUrl, true);
    } else {
      // Remover twitter:image se não houver imagem válida
      const existingTwitterImage = document.querySelector('meta[name="twitter:image"]');
      if (existingTwitterImage) {
        existingTwitterImage.remove();
      }
    }
  }, [settings, pathname, isMotor]);
};

