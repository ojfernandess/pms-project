import { useEffect } from "react";
import { useSiteSettings } from "./useSiteSettings";

/**
 * Hook para atualizar dinamicamente o título e meta tags do site
 * Atualiza imediatamente ao carregar, garantindo que apenas as configurações do SuperAdmin sejam válidas
 */
export const useSiteMeta = () => {
  const { settings } = useSiteSettings();

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

    // Atualizar ou criar favicon
    if (settings.favicon_url) {
      // Remover favicons antigos
      const oldFavicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
      oldFavicons.forEach(fav => fav.remove());

      // Criar novo favicon
      const favicon = document.createElement("link");
      favicon.setAttribute("rel", "icon");
      favicon.setAttribute("href", settings.favicon_url);
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

    // Atualizar Open Graph tags
    updateMetaTag("og:title", settings.og_title || settings.site_title || "");
    updateMetaTag("og:description", settings.og_description || settings.site_description || "");
    if (settings.og_image) {
      updateMetaTag("og:image", settings.og_image);
    }

    // Atualizar Twitter Card tags
    updateMetaTag("twitter:site", settings.site_title || "", true);
    if (settings.og_image) {
      updateMetaTag("twitter:image", settings.og_image, true);
    }
  }, [settings]);
};

