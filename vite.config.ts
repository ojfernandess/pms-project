import { defineConfig } from "vitest/config";
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
      
      if (!supabaseUrl) {
        return html; // Se não houver URL, retornar HTML sem modificações
      }
      
      let modifiedHtml = html;
      
      // 1. Adicionar meta tag com a URL do Supabase (antes do fechamento do </head>)
      if (!html.includes('name="supabase-url"')) {
        modifiedHtml = modifiedHtml.replace(
          '</head>',
          `  <meta name="supabase-url" content="${supabaseUrl}" />\n</head>`
        );
      }
      
      // 2. Injetar como variável global JavaScript antes do script que a utiliza
      // Inserir logo após a tag <head> ou antes do primeiro <script>
      const scriptInit = `    <script>
      // Inicializar variável global com URL do Supabase (injetada pelo Vite durante o build)
      window.__SUPABASE_URL__ = "${supabaseUrl}";
      window.__ENV__ = window.__ENV__ || {};
      window.__ENV__.VITE_SUPABASE_URL = "${supabaseUrl}";
    </script>`;
      
      // Inserir antes do primeiro script tag que contém fetchSettings
      if (html.includes('fetchSettings') && !html.includes('window.__SUPABASE_URL__ =')) {
        // Procurar pelo primeiro script que contém "Script para buscar e injetar meta tags"
        const scriptPattern = /(<script>\s*\/\/ Script para buscar e injetar meta tags Open Graph)/i;
        if (scriptPattern.test(modifiedHtml)) {
          modifiedHtml = modifiedHtml.replace(
            scriptPattern,
            scriptInit + '\n    $1'
          );
        } else {
          // Se não encontrar o padrão exato, inserir antes do primeiro script
          modifiedHtml = modifiedHtml.replace(
            /(<script>)/,
            scriptInit + '\n    $1'
          );
        }
      }
      
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
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
}));
