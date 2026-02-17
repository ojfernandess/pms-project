import { useEffect, useRef } from "react";

const MARKER = "data-motor-advanced";

type CompanyAdvanced = {
  booking_engine_custom_scripts_head?: string | null;
  booking_engine_custom_scripts_body?: string | null;
  booking_engine_meta_pixel_id?: string | null;
  booking_engine_google_analytics_id?: string | null;
  booking_engine_custom_css?: string | null;
};

/**
 * Injeta no documento: scripts personalizados (head/body), Meta Pixel, Google Analytics (GA4) e CSS customizado
 * das configurações avançadas do motor de reservas. Remove tudo no cleanup.
 */
export function useMotorAdvanced(company: CompanyAdvanced | null | undefined) {
  const injectedRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    if (!company) return;

    const scriptsHead = (company.booking_engine_custom_scripts_head || "").trim();
    const scriptsBody = (company.booking_engine_custom_scripts_body || "").trim();
    const metaPixelId = (company.booking_engine_meta_pixel_id || "").trim();
    const gaId = (company.booking_engine_google_analytics_id || "").trim();
    const customCss = (company.booking_engine_custom_css || "").trim();

    const addToRef = (el: HTMLElement) => {
      el.setAttribute(MARKER, "1");
      injectedRef.current.push(el);
    };

    const injectHtmlAsScripts = (html: string, parent: HTMLElement) => {
      if (!html) return;
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      const scripts = wrap.querySelectorAll("script");
      scripts.forEach((oldScript) => {
        const script = document.createElement("script");
        if (oldScript.src) script.src = oldScript.src;
        else script.textContent = oldScript.textContent || "";
        if (oldScript.async) script.async = true;
        if (oldScript.defer) script.defer = true;
        parent.appendChild(script);
        addToRef(script);
      });
      const styles = wrap.querySelectorAll("style");
      styles.forEach((oldStyle) => {
        const style = document.createElement("style");
        style.textContent = oldStyle.textContent || "";
        parent.appendChild(style);
        addToRef(style);
      });
      const other = wrap.querySelectorAll(":scope > *:not(script):not(style)");
      other.forEach((node) => {
        const clone = node.cloneNode(true) as HTMLElement;
        parent.appendChild(clone);
        addToRef(clone);
      });
    };

    if (scriptsHead) injectHtmlAsScripts(scriptsHead, document.head);
    if (scriptsBody) injectHtmlAsScripts(scriptsBody, document.body);

    if (metaPixelId) {
      const script = document.createElement("script");
      script.innerHTML = `
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${metaPixelId.replace(/'/g, "\\'")}');
        fbq('track', 'PageView');
      `;
      document.head.appendChild(script);
      addToRef(script);
    }

    if (gaId) {
      const gid = gaId.replace(/[^a-zA-Z0-9-]/g, "");
      const script1 = document.createElement("script");
      script1.async = true;
      script1.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gid)}`;
      document.head.appendChild(script1);
      addToRef(script1);
      const script2 = document.createElement("script");
      script2.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${gid.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');
      `;
      document.head.appendChild(script2);
      addToRef(script2);
    }

    if (customCss) {
      const style = document.createElement("style");
      style.textContent = customCss;
      document.head.appendChild(style);
      addToRef(style);
    }

    return () => {
      injectedRef.current.forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      injectedRef.current = [];
    };
  }, [
    company?.booking_engine_custom_scripts_head,
    company?.booking_engine_custom_scripts_body,
    company?.booking_engine_meta_pixel_id,
    company?.booking_engine_google_analytics_id,
    company?.booking_engine_custom_css,
  ]);
}
