/**
 * Sistema de Logging Configurável
 * 
 * Permite ativar/desativar logs do console através do Super Admin
 */

import { supabase } from "@/integrations/supabase/client";

let consoleLogsEnabled: boolean | null = null;
let isLoadingConfig = false;
let configPromise: Promise<boolean> | null = null;

// Armazenar referências originais do console
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  error: console.error.bind(console),
};

/**
 * Verifica se os logs do console estão habilitados
 */
async function checkConsoleLogsEnabled(): Promise<boolean> {
  // Se já temos o valor em cache, retornar
  if (consoleLogsEnabled !== null) {
    return consoleLogsEnabled;
  }

  // Se já está carregando, aguardar a promise existente
  if (configPromise) {
    return configPromise;
  }

  // Criar nova promise para carregar a configuração
  configPromise = (async () => {
    try {
      isLoadingConfig = true;
      const { data, error } = await supabase
        .from("site_settings")
        .select("console_logs_enabled")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();

      if (error) {
        originalConsole.warn("⚠️ Erro ao verificar configuração de logs:", error);
        // Em caso de erro, habilitar logs por padrão (modo seguro)
        consoleLogsEnabled = true;
        return true;
      }

      // Se não encontrar configuração, habilitar por padrão
      const enabled = data?.console_logs_enabled ?? true;
      consoleLogsEnabled = enabled;
      return enabled;
    } catch (error) {
      originalConsole.warn("⚠️ Erro ao verificar configuração de logs:", error);
      consoleLogsEnabled = true; // Modo seguro: habilitar por padrão
      return true;
    } finally {
      isLoadingConfig = false;
      configPromise = null;
    }
  })();

  return configPromise;
}

/**
 * Invalida o cache da configuração (útil após atualização)
 */
export async function invalidateLogConfigCache(): Promise<void> {
  consoleLogsEnabled = null;
  configPromise = null;
  // Recarregar configuração e atualizar overrides
  const enabled = await checkConsoleLogsEnabled();
  updateConsoleOverrides();
}

/**
 * Wrapper para console.log que verifica a configuração
 */
export async function log(...args: any[]): Promise<void> {
  const enabled = await checkConsoleLogsEnabled();
  if (enabled) {
    originalConsole.log(...args);
  }
}

/**
 * Wrapper para console.warn que verifica a configuração
 */
export async function warn(...args: any[]): Promise<void> {
  const enabled = await checkConsoleLogsEnabled();
  if (enabled) {
    originalConsole.warn(...args);
  }
}

/**
 * Wrapper para console.error que SEMPRE loga (erros são críticos)
 * Mas pode ser configurado para não logar se necessário
 */
export async function error(...args: any[]): Promise<void> {
  const enabled = await checkConsoleLogsEnabled();
  if (enabled) {
    originalConsole.error(...args);
  }
}

/**
 * Wrapper para console.info que verifica a configuração
 */
export async function info(...args: any[]): Promise<void> {
  const enabled = await checkConsoleLogsEnabled();
  if (enabled) {
    originalConsole.info(...args);
  }
}

/**
 * Wrapper para console.debug que verifica a configuração
 */
export async function debug(...args: any[]): Promise<void> {
  const enabled = await checkConsoleLogsEnabled();
  if (enabled) {
    originalConsole.debug(...args);
  }
}

/**
 * Versão síncrona (usa cache se disponível, senão assume habilitado)
 * Útil para casos onde não podemos aguardar a promise
 */
export function logSync(...args: any[]): void {
  if (consoleLogsEnabled === null) {
    // Se não temos cache, logar por padrão (modo seguro)
    originalConsole.log(...args);
    // Carregar configuração em background
    checkConsoleLogsEnabled();
  } else if (consoleLogsEnabled) {
    originalConsole.log(...args);
  }
}

export function warnSync(...args: any[]): void {
  if (consoleLogsEnabled === null) {
    originalConsole.warn(...args);
    checkConsoleLogsEnabled();
  } else if (consoleLogsEnabled) {
    originalConsole.warn(...args);
  }
}

export function errorSync(...args: any[]): void {
  if (consoleLogsEnabled === null) {
    originalConsole.error(...args);
    checkConsoleLogsEnabled();
  } else if (consoleLogsEnabled) {
    originalConsole.error(...args);
  }
}

/**
 * Inicializa o override global do console
 * Deve ser chamado no início da aplicação (main.tsx)
 */
export function initializeConsoleOverride(): void {
  // Inicialmente, habilitar logs por padrão (modo seguro)
  // A configuração será carregada em background e os overrides atualizados
  
  // Sobrescrever console.log
  console.log = (...args: any[]) => {
    if (consoleLogsEnabled === null) {
      // Se ainda não carregou a configuração, logar por padrão
      originalConsole.log(...args);
    } else if (consoleLogsEnabled) {
      originalConsole.log(...args);
    }
  };

  // Sobrescrever console.warn
  console.warn = (...args: any[]) => {
    if (consoleLogsEnabled === null) {
      originalConsole.warn(...args);
    } else if (consoleLogsEnabled) {
      originalConsole.warn(...args);
    }
  };

  // Sobrescrever console.info
  console.info = (...args: any[]) => {
    if (consoleLogsEnabled === null) {
      originalConsole.info(...args);
    } else if (consoleLogsEnabled) {
      originalConsole.info(...args);
    }
  };

  // Sobrescrever console.debug
  console.debug = (...args: any[]) => {
    if (consoleLogsEnabled === null) {
      originalConsole.debug(...args);
    } else if (consoleLogsEnabled) {
      originalConsole.debug(...args);
    }
  };

  // console.error sempre loga (mas pode ser controlado também)
  console.error = (...args: any[]) => {
    if (consoleLogsEnabled === null) {
      originalConsole.error(...args);
    } else if (consoleLogsEnabled) {
      originalConsole.error(...args);
    }
  };

  // Carregar configuração inicial em background e atualizar overrides
  checkConsoleLogsEnabled().then(() => {
    updateConsoleOverrides();
  });
}

/**
 * Atualiza os overrides do console após mudança de configuração
 */
export function updateConsoleOverrides(): void {
  const enabled = consoleLogsEnabled ?? true;
  
  console.log = (...args: any[]) => {
    if (enabled) {
      originalConsole.log(...args);
    }
  };
  
  console.warn = (...args: any[]) => {
    if (enabled) {
      originalConsole.warn(...args);
    }
  };
  
  console.info = (...args: any[]) => {
    if (enabled) {
      originalConsole.info(...args);
    }
  };
  
  console.debug = (...args: any[]) => {
    if (enabled) {
      originalConsole.debug(...args);
    }
  };
  
  console.error = (...args: any[]) => {
    if (enabled) {
      originalConsole.error(...args);
    }
  };
}

