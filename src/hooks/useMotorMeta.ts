import { useEffect } from "react";
import { applyMotorBookingEngineFavicon } from "@/utils/bookingEngineFavicon";

type CompanyMotorMeta = {
  id?: string;
  booking_engine_title?: string | null;
  booking_engine_meta_description?: string | null;
  booking_engine_og_title?: string | null;
  booking_engine_og_description?: string | null;
  booking_engine_og_image?: string | null;
  booking_engine_favicon?: string | null;
  name?: string;
};

type SiteSettingsFallback = {
  site_title?: string | null;
  meta_description?: string | null;
  site_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
};

/**
 * Atualiza título, meta description e Open Graph da página do motor de reservas.
 * Usa os valores da empresa quando preenchidos; caso contrário usa site_settings como fallback.
 */
export function useMotorMeta(
  company: CompanyMotorMeta | null | undefined,
  siteSettings: SiteSettingsFallback | null | undefined
) {
  useEffect(() => {
    const metaDescription =
      (company?.booking_engine_meta_description?.trim() || "") ||
      (siteSettings?.meta_description?.trim() || "") ||
      (siteSettings?.site_description?.trim() || "") ||
      "";
    const ogTitle =
      company?.booking_engine_og_title?.trim() ||
      company?.booking_engine_title?.trim() ||
      company?.name ||
      siteSettings?.og_title ||
      siteSettings?.site_title ||
      "";
    const ogDescription =
      (company?.booking_engine_og_description?.trim() || "") ||
      (company?.booking_engine_meta_description?.trim() || "") ||
      (siteSettings?.og_description?.trim() || "") ||
      (siteSettings?.site_description?.trim() || "") ||
      metaDescription ||
      "";
    const ogImageRaw = company?.booking_engine_og_image?.trim() || siteSettings?.og_image?.trim() || null;

    const ensureAbsoluteUrl = (url: string | null): string | null => {
      if (!url) return null;
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
      if (url.startsWith("data:")) return null;
      if (url.startsWith("/")) return `${typeof window !== "undefined" ? window.location.origin : ""}${url}`;
      if (url.startsWith("//")) return `${typeof window !== "undefined" ? window.location.protocol : "https:"}${url}`;
      return `${typeof window !== "undefined" ? window.location.origin : ""}/${url}`;
    };
    const ogImage = ensureAbsoluteUrl(ogImageRaw);

    // Não alterar document.title aqui; a página do motor define título + subtítulo no próprio efeito

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", metaDescription);

    const setMeta = (property: string, content: string, isName = false) => {
      const selector = isName ? `meta[name="${property}"]` : `meta[property="${property}"]`;
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        if (isName) el.setAttribute("name", property);
        else el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content || "");
    };

    const siteUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";

    setMeta("og:title", ogTitle);
    setMeta("og:description", ogDescription);
    setMeta("og:type", "website");
    setMeta("og:url", siteUrl);

    if (ogImage) {
      setMeta("og:image", ogImage);
      setMeta("og:image:width", "1200");
      setMeta("og:image:height", "630");
      setMeta("og:image:type", "image/png");
    } else {
      document.querySelector('meta[property="og:image"]')?.remove();
      document.querySelector('meta[property="og:image:width"]')?.remove();
      document.querySelector('meta[property="og:image:height"]')?.remove();
      document.querySelector('meta[property="og:image:type"]')?.remove();
    }

    setMeta("twitter:card", "summary_large_image", true);
    setMeta("twitter:title", ogTitle, true);
    setMeta("twitter:description", ogDescription, true);
    if (ogImage) setMeta("twitter:image", ogImage, true);
    else document.querySelector('meta[name="twitter:image"]')?.remove();
  }, [company, siteSettings]);

  useEffect(() => {
    applyMotorBookingEngineFavicon(company);
  }, [company?.id, company?.booking_engine_favicon]);
}
