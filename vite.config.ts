import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Plugin para injetar variáveis de ambiente no HTML
const injectEnvPlugin = () => {
  return {
    name: "inject-env",
    transformIndexHtml(html: string, ctx) {
      // Obter URL do Supabase da variável de ambiente
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
      
      // Injetar como variável global e como meta tag
      let modifiedHtml = html;
      
      // Adicionar meta tag com a URL do Supabase (antes do fechamento do </head>)
      if (supabaseUrl && !html.includes('name="supabase-url"')) {
        modifiedHtml = modifiedHtml.replace(
          '</head>',
          `  <meta name="supabase-url" content="${supabaseUrl}" />\n</head>`
        );
      }
      
      // Injetar como variável global JavaScript
      modifiedHtml = modifiedHtml.replace(
        /window\.__SUPABASE_URL__\s*=\s*window\.__SUPABASE_URL__\s*\|\|\s*null;/g,
        `window.__SUPABASE_URL__ = window.__SUPABASE_URL__ || "${supabaseUrl}";`
      );
      
      return modifiedHtml;
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0", // Permite acesso de qualquer interface de rede
    port: 8080,
    strictPort: true, // Falha se a porta estiver em uso
    hmr: {
      clientPort: 8080, // Porta do cliente para HMR
    },
    watch: {
      usePolling: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), injectEnvPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
}));
