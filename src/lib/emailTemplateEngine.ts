/**
 * Template Engine para processar templates de e-mail com variáveis dinâmicas
 */

export interface TemplateVariables {
  [key: string]: string | number | null | undefined | any; // Permite objetos e arrays
}

/**
 * Detecta a URL base do site automaticamente
 * Prioriza: window.location.origin > variáveis de ambiente > inferência do Supabase > localhost
 */
function detectBaseUrl(): string {
  // No cliente (browser)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // No servidor (Node.js/Edge Function)
  if (typeof process !== 'undefined' && process.env) {
    // Priorizar variáveis de ambiente explícitas
    const envUrl = process.env.VITE_APP_URL || 
                   process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.SITE_URL ||
                   process.env.APP_URL;
    
    if (envUrl) {
      return envUrl;
    }
    
    // Tentar inferir do Supabase URL (não ideal, mas melhor que nada)
    const supabaseUrl = process.env.SUPABASE_URL || '';
    if (supabaseUrl) {
      // Tentar extrair domínio do Supabase (ex: spxxx.supabase.co -> app.seudominio.com)
      // Isso é uma heurística e pode não funcionar sempre
      try {
        const url = new URL(supabaseUrl);
        // Se o Supabase URL contém um domínio customizado, tentar inferir
        // Caso contrário, usar localhost como fallback
      } catch {
        // URL inválida, continuar
      }
    }
  }
  
  // Último recurso: localhost (apenas para desenvolvimento)
  return 'http://localhost:8080';
}

/**
 * Obtém valor de uma variável aninhada (ex: "main_guest.name" ou "documents.0.guest_name")
 */
function getNestedValue(variables: TemplateVariables, path: string): any {
  const parts = path.split('.');
  let value: any = variables;
  
  for (const part of parts) {
    if (value === null || value === undefined) return null;
    
    // Se for um número, tratar como índice de array
    const numPart = parseInt(part, 10);
    if (!isNaN(numPart) && Array.isArray(value)) {
      value = value[numPart];
    } else if (typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return null;
    }
  }
  
  return value;
}

/**
 * Processa loops {{#each array}}...{{/each}}
 */
function processEachLoops(template: string, variables: TemplateVariables): string {
  let processed = template;
  let changed = true;
  let iterations = 0;
  const maxIterations = 100;

  while (changed && iterations < maxIterations) {
    iterations++;
    changed = false;

    // Regex para encontrar {{#each variable}}
    const eachRegex = /\{\{#each\s+(\w+(?:\.\w+)*)\}\}/g;
    let match;

    while ((match = eachRegex.exec(processed)) !== null) {
      const startIndex = match.index;
      const variablePath = match[1];
      const startTag = match[0];

      // Encontrar o {{/each}} correspondente
      let depth = 1;
      let searchIndex = startIndex + startTag.length;
      let endIndex = -1;

      while (depth > 0 && searchIndex < processed.length) {
        const nextEach = processed.indexOf('{{#each', searchIndex);
        const nextEndEach = processed.indexOf('{{/each}}', searchIndex);

        if (nextEndEach === -1) break;

        if (nextEach !== -1 && nextEach < nextEndEach) {
          depth++;
          searchIndex = nextEach + 7;
        } else {
          depth--;
          if (depth === 0) {
            endIndex = nextEndEach + 10; // {{/each}} tem 10 caracteres
            break;
          } else {
            searchIndex = nextEndEach + 10;
          }
        }
      }

      if (endIndex === -1) break;

      const fullMatch = processed.substring(startIndex, endIndex);
      const content = processed.substring(startIndex + startTag.length, endIndex - 10);

      // Obter o array da variável
      const arrayValue = getNestedValue(variables, variablePath);
      
      if (Array.isArray(arrayValue) && arrayValue.length > 0) {
        // Processar cada item do array
        const items = arrayValue.map((item: any, index: number) => {
          // Criar contexto com "this" e índice
          const itemContext: TemplateVariables = {
            ...variables,
            this: item,
            '@index': index,
            '@first': index === 0,
            '@last': index === arrayValue.length - 1,
          };

          // Adicionar propriedades do item ao contexto como variáveis achatadas
          // Ex: this.guest_name -> guest_name, this.document_type -> document_type
          if (typeof item === 'object' && item !== null) {
            Object.keys(item).forEach(key => {
              // Adicionar como this.key para acesso direto
              itemContext[`this.${key}`] = item[key];
              // Também adicionar como key para acesso sem this (mais simples)
              itemContext[key] = item[key];
            });
          }

          // Processar o conteúdo do loop com o contexto do item
          // Usar uma versão recursiva que processa apenas o conteúdo do loop
          let itemContent = content;
          
          // Substituir {{this.property}} e {{property}} dentro do loop
          if (typeof item === 'object' && item !== null) {
            Object.keys(item).forEach(key => {
              const value = item[key];
              const stringValue = value !== null && value !== undefined ? String(value) : '';
              
              // Substituir {{this.key}}
              const thisRegex = new RegExp(`\\{\\{this\\.${key}\\}\\}`, 'g');
              itemContent = itemContent.replace(thisRegex, stringValue);
              
              // Substituir {{key}} (sem this)
              const keyRegex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
              itemContent = itemContent.replace(keyRegex, stringValue);
            });
          }
          
          // Processar condicionais e outras variáveis no contexto do item
          return processTemplate(itemContent, itemContext);
        });

        processed = processed.replace(fullMatch, items.join(''));
      } else {
        // Array vazio ou não é array: remover o bloco
        processed = processed.replace(fullMatch, '');
      }

      changed = true;
      break;
    }
  }

  return processed;
}

/**
 * Processa um template HTML substituindo variáveis no formato {{variable_name}}
 * e processando condicionais no formato {{#if variable_name}}...{{/if}}
 * e loops no formato {{#each array}}...{{/each}}
 */
export function processTemplate(template: string, variables: TemplateVariables): string {
  let processed = template;

  // Log inicial para debug
  if (template?.includes('{{review_link}}') || template?.includes('{{{review_link}}}')) {
    console.log('🔍 processTemplate: Template contém review_link placeholder', {
      hasReviewLinkVar: 'review_link' in variables,
      reviewLinkValue: variables.review_link,
      allKeys: Object.keys(variables),
    });
  }

  // Primeiro, processar loops {{#each array}}...{{/each}}
  processed = processEachLoops(processed, variables);

  // Depois, processar condicionais {{#if variable}}...{{/if}}
  // Fazer múltiplas passadas até que não haja mais mudanças
  let conditionalChanged = true;
  let conditionalIterations = 0;
  while (conditionalChanged && conditionalIterations < 50) {
    conditionalIterations++;
    const beforeConditionals = processed;
  processed = processConditionals(processed, variables);
    conditionalChanged = beforeConditionals !== processed;
  }
  
  // Limpeza final: remover qualquer {{/if}} solto que possa ter sobrado
  // Isso pode acontecer se houver um erro no processamento de condicionais aninhadas
  // Contar quantos {{#if}} e {{/if}} existem para garantir que não removemos demais
  const ifCount = (processed.match(/\{\{#if\s+\w+(?:\.\w+)*\}\}/g) || []).length;
  const endifCount = (processed.match(/\{\{\/if\}\}/g) || []).length;
  
  // Se há mais {{/if}} do que {{#if}}, remover os extras
  if (endifCount > ifCount) {
    // Remover apenas os {{/if}} extras (a diferença)
    let removed = 0;
    const toRemove = endifCount - ifCount;
    processed = processed.replace(/\{\{\/if\}\}/g, (match) => {
      if (removed < toRemove) {
        removed++;
        return '';
      }
      return match;
    });
  }

  // Por último, substituir variáveis no formato {{variable_name}} ou {{variable.path}}
  // Processar variáveis aninhadas primeiro (ex: {{main_guest.name}})
  const nestedVarRegex = /\{\{(\w+(?:\.\w+)+)\}\}/g;
  let nestedMatch;
  let nestedChanged = true;
  let nestedIterations = 0;
  while (nestedChanged && nestedIterations < 10) {
    nestedIterations++;
    nestedChanged = false;
    nestedVarRegex.lastIndex = 0; // Reset regex
  while ((nestedMatch = nestedVarRegex.exec(processed)) !== null) {
    const fullMatch = nestedMatch[0];
    const path = nestedMatch[1];
    const value = getNestedValue(variables, path);
    const stringValue = value !== null && value !== undefined ? String(value) : '';
      if (processed.includes(fullMatch)) {
    processed = processed.replace(fullMatch, stringValue);
        nestedChanged = true;
      }
    }
  }

  // Depois, substituir variáveis simples no formato {{variable_name}}
  // Fazer múltiplas passadas para garantir que todas as variáveis sejam substituídas
  let varChanged = true;
  let varIterations = 0;
  while (varChanged && varIterations < 20) {
    varIterations++;
    varChanged = false;
    
    // Substituir variáveis aninhadas primeiro (formato {{variable.path}})
    const nestedVarRegex = /\{\{(\w+(?:\.\w+)+)\}\}/g;
    let nestedMatch;
    nestedVarRegex.lastIndex = 0;
    while ((nestedMatch = nestedVarRegex.exec(processed)) !== null) {
      const fullMatch = nestedMatch[0];
      const path = nestedMatch[1];
      const value = getNestedValue(variables, path);
      const stringValue = value !== null && value !== undefined ? String(value) : '';
      processed = processed.replace(fullMatch, stringValue);
      varChanged = true;
    }
    
    // Substituir variáveis com três chaves {{{variable}}} (HTML não escapado)
  Object.keys(variables).forEach((key) => {
    const value = variables[key];
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        const stringValue = value !== null && value !== undefined ? String(value) : '';
        const tripleBraceRegex = new RegExp(`\\{\\{\\{${key}\\}\\}\\}`, 'g');
        const beforeReplace = processed;
        processed = processed.replace(tripleBraceRegex, stringValue);
        if (beforeReplace !== processed) {
          varChanged = true;
        }
      }
    });
    
    // Depois substituir variáveis simples primeiro (formato {{variable}})
    // Processar variáveis simples (strings, números, etc) antes de objetos
    Object.keys(variables).forEach((key) => {
      const value = variables[key];
      
      // Processar apenas valores simples (não objetos ou arrays)
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        const stringValue = value !== null && value !== undefined ? String(value) : '';
        // Escapar caracteres especiais na chave
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
        const beforeReplace = processed;
        const matches = processed.match(regex);
        if (matches && matches.length > 0) {
          processed = processed.replace(regex, stringValue);
          if (beforeReplace !== processed) {
            varChanged = true;
            if (key === 'review_link') {
              console.log('✅ review_link substituído no loop simples:', {
                matches: matches.length,
                value: stringValue,
              });
            }
          }
        }
      }
    });
    
    // Depois processar objetos e arrays (variáveis aninhadas)
    Object.keys(variables).forEach((key) => {
      const value = variables[key];
    
      // Processar objetos e arrays (variáveis aninhadas)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Processar propriedades do objeto como variáveis aninhadas
      Object.keys(value).forEach((prop) => {
        const nestedPath = `${key}.${prop}`;
        const nestedValue = value[prop];
        const stringValue = nestedValue !== null && nestedValue !== undefined ? String(nestedValue) : '';
        const regex = new RegExp(`\\{\\{${nestedPath.replace(/\./g, '\\.')}\\}\\}`, 'g');
          if (regex.test(processed)) {
        processed = processed.replace(regex, stringValue);
            varChanged = true;
          }
      });
    } else {
      // Esta parte já foi processada acima, mas manter para compatibilidade
      // Converter para string, tratando null/undefined como string vazia
      const stringValue = value !== null && value !== undefined ? String(value) : '';
        // Usar replace global para substituir todas as ocorrências
      // Escapar caracteres especiais na chave (como underscore, que é válido em regex)
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
        const beforeReplace = processed;
      const matches = processed.match(regex);
      if (matches && matches.length > 0) {
        console.log(`🔍 Substituindo variável ${key}:`, {
          matches: matches.length,
          value: stringValue,
          key,
          escapedKey,
        });
      }
      processed = processed.replace(regex, stringValue);
        if (beforeReplace !== processed) {
          varChanged = true;
          if (key === 'review_link') {
            console.log('✅ review_link substituído:', {
              before: beforeReplace.includes('{{review_link}}'),
              after: processed.includes('{{review_link}}'),
              value: stringValue,
            });
          }
        } else if (key === 'review_link' && processed.includes('{{review_link}}')) {
          console.warn('⚠️ review_link NÃO foi substituído:', {
            key,
            escapedKey,
            regex: regex.toString(),
            value: stringValue,
            templateHasPlaceholder: processed.includes('{{review_link}}'),
          });
        }
    }
  });
  }
  
  // Log de debug para variáveis não substituídas (apenas em desenvolvimento)
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    const remainingVars = processed.match(/\{\{[\w.]+(?:\.[\w.]+)*\}\}/g);
    if (remainingVars && remainingVars.length > 0) {
      console.log('⚠️ Variáveis não substituídas no template:', remainingVars);
      console.log('📋 Variáveis disponíveis:', Object.keys(variables));
      console.log('🔍 Verificando review_link:', {
        hasReviewLink: 'review_link' in variables,
        reviewLinkValue: variables.review_link,
        reviewLinkType: typeof variables.review_link,
      });
    }
  }

  return processed;
}

/**
 * Processa condicionais no formato {{#if variable}}...{{/if}}
 * Remove blocos onde a variável é falsy (null, undefined, '', 0, false)
 * Suporta condicionais aninhados
 */
function processConditionals(template: string, variables: TemplateVariables): string {
  let processed = template;
  
  // Encontrar todos os blocos condicionais, lidando com aninhamento
  // Usar uma abordagem iterativa que processa de dentro para fora
  let changed = true;
  let iterations = 0;
  const maxIterations = 100; // Prevenir loop infinito
  
  while (changed && iterations < maxIterations) {
    iterations++;
    changed = false;
    
    // Regex para encontrar blocos {{#if variable}}...{{/if}}
    // Suporta variáveis aninhadas (ex: {{#if main_guest.name}})
    const ifRegex = /\{\{#if\s+(\w+(?:\.\w+)*)\}\}/g;
    let match;
    let lastIndex = 0;
    
    while ((match = ifRegex.exec(processed)) !== null) {
      const startIndex = match.index;
      const variableName = match[1];
      const startTag = match[0];
      
      // Encontrar o {{/if}} correspondente, contando aninhamentos
      let depth = 1;
      let searchIndex = startIndex + startTag.length;
      
      while (depth > 0 && searchIndex < processed.length) {
        const nextIf = processed.indexOf('{{#if', searchIndex);
        const nextEndIf = processed.indexOf('{{/if}}', searchIndex);
        const nextElse = processed.indexOf('{{else}}', searchIndex);
        
        if (nextEndIf === -1) {
          // Não encontrou fechamento, sair
          break;
        }
        
        // Verificar se há um {{else}} antes do próximo {{#if}} ou {{/if}}
        // Se houver um {{else}} no mesmo nível (depth === 1), ele pertence ao bloco atual
        // Se houver um {{#if}} antes do {{else}}, incrementar depth
        if (nextIf !== -1 && nextIf < nextEndIf && (nextElse === -1 || nextIf < nextElse)) {
          // Encontrou um {{#if}} antes do {{/if}}, incrementar profundidade
          depth++;
          searchIndex = nextIf + 5; // Avançar após {{#if
        } else {
          // Encontrou um {{/if}}
          depth--;
          if (depth === 0) {
            // Este é o {{/if}} correspondente
            const endIndex = nextEndIf + 7; // {{/if}} tem 7 caracteres
            const fullMatch = processed.substring(startIndex, endIndex);
            const content = processed.substring(startIndex + startTag.length, nextEndIf);
            
            // Verificar se há um {{else}} dentro do conteúdo
            // Precisamos encontrar o {{else}} que pertence a este bloco (não aos aninhados)
            let elseIndex = -1;
            let elseDepth = 0;
            let searchElseIndex = 0;
            
            while (searchElseIndex < content.length) {
              const nextIfInContent = content.indexOf('{{#if', searchElseIndex);
              const nextElseInContent = content.indexOf('{{else}}', searchElseIndex);
              const nextEndIfInContent = content.indexOf('{{/if}}', searchElseIndex);
              
              // Encontrar qual tag vem primeiro
              const positions = [];
              if (nextIfInContent !== -1) positions.push({ type: 'if', pos: nextIfInContent });
              if (nextElseInContent !== -1) positions.push({ type: 'else', pos: nextElseInContent });
              if (nextEndIfInContent !== -1) positions.push({ type: 'endif', pos: nextEndIfInContent });
              
              if (positions.length === 0) {
                break; // Não há mais tags
              }
              
              // Ordenar por posição
              positions.sort((a, b) => a.pos - b.pos);
              const nextTag = positions[0];
              
              // Se encontramos um {{else}} no nível 0 (sem blocos aninhados abertos), ele pertence ao bloco atual
              if (nextTag.type === 'else' && elseDepth === 0) {
                elseIndex = nextTag.pos;
                break;
              }
              
              // Ajustar depth para rastrear blocos aninhados
              if (nextTag.type === 'if') {
                elseDepth++;
                searchElseIndex = nextTag.pos + 5;
              } else if (nextTag.type === 'endif') {
                elseDepth--;
                searchElseIndex = nextTag.pos + 7;
              } else if (nextTag.type === 'else') {
                // {{else}} dentro de um bloco aninhado, ignorar
                searchElseIndex = nextTag.pos + 8;
              } else {
                break;
              }
            }
            
            let ifContent = content;
            let elseContent = '';
            
            if (elseIndex !== -1) {
              // Separar conteúdo do if e do else
              ifContent = content.substring(0, elseIndex);
              elseContent = content.substring(elseIndex + 8); // {{else}} tem 8 caracteres
              
              // Processar condicionais recursivamente no conteúdo do else
              // Fazer múltiplas passadas para garantir que todas as condicionais sejam processadas
              let elseProcessed = elseContent;
              let elseChanged = true;
              let elseIterations = 0;
              while (elseChanged && elseIterations < 10) {
                elseIterations++;
                const beforeProcess = elseProcessed;
                elseProcessed = processConditionals(elseProcessed, variables);
                elseChanged = beforeProcess !== elseProcessed;
              }
              // Limpeza final: remover qualquer {{/if}} que possa ter sobrado
              // Isso pode acontecer se houver blocos aninhados mal formados
              elseProcessed = elseProcessed.replace(/\{\{\/if\}\}/g, '');
              elseContent = elseProcessed;
            }
            
            // Verificar se a variável existe e é truthy
            // Suportar variáveis aninhadas (ex: main_guest.document_number)
            const value = variableName.includes('.') 
              ? getNestedValue(variables, variableName)
              : variables[variableName];
            
            // Debug: log para variáveis aninhadas problemáticas
            if (variableName.includes('.') && (value === null || value === undefined)) {
              console.log(`🔍 [Template Debug] Variável aninhada não encontrada: ${variableName}`, {
                variableName,
                path: variableName.split('.'),
                variablesKeys: Object.keys(variables),
                mainGuest: variables['main_guest'],
              });
            }
            
            const isTruthy = value !== null && 
                             value !== undefined && 
                             value !== '' && 
                             value !== 0 && 
                             value !== false &&
                             (typeof value === 'string' ? value.trim() !== '' : true);
            
            if (isTruthy) {
              // Variável é truthy: manter o conteúdo do if, remover apenas as tags
              // Processar condicionais recursivamente no conteúdo do if se necessário
              // Fazer múltiplas passadas para garantir que todas as condicionais sejam processadas
              let finalIfContent = ifContent;
              let ifChanged = true;
              let ifIterations = 0;
              while (ifChanged && ifIterations < 10) {
                ifIterations++;
                const beforeProcess = finalIfContent;
                finalIfContent = processConditionals(finalIfContent, variables);
                ifChanged = beforeProcess !== finalIfContent;
              }
              // Limpar qualquer {{/if}} solto que possa ter sobrado do processamento recursivo
              // (isso não deveria acontecer, mas é uma segurança)
              finalIfContent = finalIfContent.replace(/\{\{\/if\}\}/g, '');
              // Substituir o bloco completo (incluindo {{#if}} e {{/if}}) usando substring
              processed = processed.substring(0, startIndex) + finalIfContent + processed.substring(endIndex);
            } else {
              // Variável é falsy: manter o conteúdo do else (se existir), remover apenas as tags
              if (elseContent) {
                // O elseContent já foi processado recursivamente, então não deve ter {{/if}} soltos
                // Mas vamos garantir removendo apenas se houver (pode haver casos edge)
                // IMPORTANTE: Não remover {{/if}} que fazem parte de blocos aninhados já processados
                // O processamento recursivo já removeu as tags dos blocos aninhados
                // Apenas remover se realmente houver {{/if}} solto (não deveria acontecer)
                let finalElseContent = elseContent;
                // Verificar se há {{/if}} que não fazem parte de um bloco válido
                // Se o elseContent foi processado recursivamente, não deveria ter {{/if}}
                // Mas vamos fazer uma limpeza final apenas para garantir
                finalElseContent = finalElseContent.replace(/\{\{\/if\}\}/g, '');
                // Substituir o bloco completo (incluindo {{#if}} e {{/if}}) usando substring
                processed = processed.substring(0, startIndex) + finalElseContent + processed.substring(endIndex);
              } else {
                // Sem else: remover todo o bloco (incluindo {{#if}} e {{/if}})
                processed = processed.substring(0, startIndex) + processed.substring(endIndex);
              }
            }
            
            changed = true;
            break; // Processar um bloco por vez
          } else {
            searchIndex = nextEndIf + 7;
          }
        }
      }
      
      if (changed) {
        break; // Reiniciar busca após processar um bloco
      }
    }
  }
  
  return processed;
}

/**
 * Extrai todas as variáveis de um template
 */
export function extractVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return variables;
}

/**
 * Valida se todas as variáveis necessárias estão presentes
 */
export function validateTemplate(template: string, variables: TemplateVariables): {
  valid: boolean;
  missing: string[];
} {
  const required = extractVariables(template);
  const provided = Object.keys(variables);
  const missing = required.filter((v) => !provided.includes(v));

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Gera variáveis padrão para uma reserva
 */
/**
 * Formata uma data no formato YYYY-MM-DD para DD/MM/YYYY
 * Evita problemas de timezone usando apenas manipulação de string
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  // Se já estiver no formato correto, retornar como está
  if (dateString.includes('/')) return dateString;
  
  // Formato esperado: YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss.sssZ
  const dateOnly = dateString.split('T')[0]; // Pegar apenas a parte da data
  const parts = dateOnly.split('-');
  
  if (parts.length === 3) {
    // Formato: YYYY-MM-DD -> DD/MM/YYYY
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  
  // Fallback: tentar usar Date se não conseguir parsear
  try {
    // Usar UTC para evitar problemas de timezone
    const date = new Date(dateString + 'T12:00:00Z'); // Meio-dia UTC para evitar problemas de timezone
    return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  } catch {
    return dateString;
  }
}

export async function generateReservationVariables(
  reservation: any,
  client?: any,
  guest?: any,
  hotelSettings?: any,
  siteSettings?: any
): Promise<TemplateVariables> {
  const checkinDate = formatDate(reservation.checkin_date);
  const checkoutDate = formatDate(reservation.checkout_date);
  // Para extensões, new_checkout_date será a nova data de check-out (que já está em checkout_date após a atualização)
  // Se a reserva tiver uma propriedade new_checkout_date ou checkout_date foi atualizado, usar isso
  const newCheckoutDate = formatDate(reservation.new_checkout_date || reservation.checkout_date);
  
  // Importar supabase para buscar web_checkin
  const { supabase } = await import('@/integrations/supabase/client');

  // Construir endereço completo do hotel a partir dos campos separados
  const addressParts: string[] = [];
  if (hotelSettings?.street) {
    let streetLine = hotelSettings.street;
    if (hotelSettings.number) {
      streetLine += `, ${hotelSettings.number}`;
    }
    addressParts.push(streetLine);
  }
  if (hotelSettings?.neighborhood) {
    addressParts.push(hotelSettings.neighborhood);
  }
  if (hotelSettings?.city) {
    let cityLine = hotelSettings.city;
    if (hotelSettings.state) {
      cityLine += ` - ${hotelSettings.state}`;
    }
    if (hotelSettings.zip_code) {
      cityLine += ` - CEP: ${hotelSettings.zip_code}`;
    }
    addressParts.push(cityLine);
  }
  if (hotelSettings?.country && hotelSettings.country !== 'Brasil') {
    addressParts.push(hotelSettings.country);
  }
  const hotelAddress = addressParts.length > 0 ? addressParts.join(', ') : '';

  // Construir telefone completo (priorizar campo único 'phone', senão montar dos campos antigos)
  const hotelPhone = hotelSettings?.phone 
    || (hotelSettings?.phone_ddi && hotelSettings?.phone_number
      ? `${hotelSettings.phone_ddi} ${hotelSettings.phone_number}`
      : hotelSettings?.phone_number || '');

  // Construir WhatsApp completo (priorizar campo único 'whatsapp', senão montar dos campos antigos)
  const hotelWhatsApp = hotelSettings?.whatsapp 
    || (hotelSettings?.whatsapp_ddi && hotelSettings?.whatsapp_number
      ? `${hotelSettings.whatsapp_ddi} ${hotelSettings.whatsapp_number}`
      : hotelSettings?.whatsapp_number || '');

  // Obter building_id através do room_categories se disponível
  // O building_id já vem no relacionamento room_categories quando buscado no emailService
  const buildingId = reservation.room_categories?.building_id || null;

  // Gerar link para políticas públicas (priorizar prédio, senão estabelecimento)
  const generatePoliciesLink = (type: 'establishment' | 'building', id: string | null | undefined): string => {
    if (!id) return '';
    try {
      // Codificar o tipo e ID em base64 para criar um token
      // Formato: "type:id" (ex: "building:uuid" ou "establishment:uuid")
      const tokenData = `${type}:${id}`;
      const token = btoa(tokenData);
      // Detectar URL base automaticamente
      const baseUrl = detectBaseUrl();
      // Criar URL amigável usando o nome do hotel como slug
      const hotelName = hotelSettings?.name || 'hotel';
      // Criar slug simples (remover acentos, espaços, caracteres especiais)
      const slug = hotelName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9]+/g, '-') // Substitui não-alfanuméricos por hífen
        .replace(/^-+|-+$/g, ''); // Remove hífens no início/fim
      // URL amigável: /politicas-do-hotel/{slug}/{token}
      // O token ainda é necessário para decodificar e buscar as políticas
      return `${baseUrl}/policies/${slug}/${token}`;
    } catch (error) {
      console.error('Erro ao gerar link de políticas:', error);
      return '';
    }
  };

  // Priorizar políticas do prédio, senão usar do estabelecimento
  const establishmentId = reservation.establishment_id || hotelSettings?.establishment_id;
  const policiesLink = buildingId 
    ? generatePoliciesLink('building', buildingId)
    : generatePoliciesLink('establishment', establishmentId);

  // Gerar link do web check-in
  const generateWebCheckinLink = async (): Promise<string> => {
    try {
      // Buscar web_checkin existente para a reserva
      let webCheckin = null;
      const { data: existingWebCheckin, error: webCheckinError } = await supabase
        .from('web_checkin')
        .select('locator')
        .eq('reservation_id', reservation.id)
        .maybeSingle();

      if (!webCheckinError && existingWebCheckin?.locator) {
        webCheckin = existingWebCheckin;
      } else {
        // Se não existe, tentar criar um novo web_checkin
        // Usar o reservation_code como locator se disponível
        const locator = reservation.reservation_code || '';
        
        if (locator) {
          const { locatorService } = await import('@/lib/locatorService');
          const token = locatorService.generateWebCheckinToken(reservation.id, locator);
          
          // Calcular data de expiração
          const checkinDateObj = reservation.checkin_date ? new Date(reservation.checkin_date) : new Date();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);
          if (checkinDateObj < expiresAt) {
            expiresAt.setTime(checkinDateObj.getTime());
          }

          // Tentar criar web_checkin
          const { data: newWebCheckin, error: createError } = await supabase
            .from('web_checkin')
            .insert({
              reservation_id: reservation.id,
              establishment_id: establishmentId,
              token,
              locator,
              expires_at: expiresAt.toISOString(),
              status: 'pending',
            })
            .select('locator')
            .single();

          if (!createError && newWebCheckin) {
            webCheckin = newWebCheckin;
          }
        }
      }

      // Se temos um locator, gerar o link
      if (webCheckin?.locator) {
        // Detectar URL base automaticamente
        const baseUrl = detectBaseUrl();
        return `${baseUrl}/web-checkin/${webCheckin.locator}`;
      }

      return '';
    } catch (error) {
      console.error('Erro ao gerar link do web check-in:', error);
      return '';
    }
  };

  const webCheckinLink = await generateWebCheckinLink();

  // Gerar link de pagamento se a reserva não estiver paga
  const generatePaymentLink = async (): Promise<string> => {
    try {
      // Verificar se establishmentId está disponível
      if (!establishmentId) {
        console.warn('[Stripe] Establishment ID não encontrado');
        return '';
      }
      
      // Verificar se há pagamento pendente
      const paymentStatus = reservation.payment_status || 'pending';
      const totalAmount = Number(reservation.total_amount) || 0;
      const paidAmount = Number(reservation.paid_amount) || 0;
      const pendingAmount = totalAmount - paidAmount;
      
      console.log('[Stripe] Verificando necessidade de pagamento:', {
        reservation_id: reservation.id,
        establishment_id: establishmentId,
        payment_status: paymentStatus,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        pending_amount: pendingAmount
      });
      
      // Verificar se precisa de pagamento
      // Se não tem total_amount ou já está pago, não precisa
      if (totalAmount <= 0) {
        console.log('[Stripe] Valor total é zero ou negativo');
        return '';
      }
      
      if (paidAmount >= totalAmount) {
        console.log('[Stripe] Reserva já está totalmente paga');
        return '';
      }
      
      // Se tem valor pendente, precisa de pagamento
      const needsPayment = pendingAmount > 0;

      if (!needsPayment) {
        console.log('[Stripe] Não precisa de pagamento');
        return '';
      }
      
      console.log('[Stripe] Pagamento necessário:', { pendingAmount });

      // Verificar se Stripe está habilitado globalmente
      console.log('[Stripe] Verificando configuração global...');
      const { data: globalConfig, error: globalError } = await supabase
        .from('stripe_global_config')
        .select('is_enabled')
        .maybeSingle();

      if (globalError) {
        console.error('[Stripe] ❌ Erro ao verificar config global:', globalError);
        console.error('[Stripe] Código do erro:', globalError.code, 'Mensagem:', globalError.message);
        return '';
      }

      console.log('[Stripe] Config global encontrada:', { is_enabled: globalConfig?.is_enabled });

      if (!globalConfig?.is_enabled) {
        console.warn('[Stripe] ⚠️ Stripe não está habilitado globalmente. Configure em Super Admin > Stripe');
        return '';
      }

      // Verificar se Stripe está habilitado para o estabelecimento
      console.log('[Stripe] Verificando configuração do estabelecimento...', { establishment_id: establishmentId });
      
      // Verificar autenticação primeiro
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[Stripe] Usuário autenticado:', { user_id: user?.id, email: user?.email });
      
      // Buscar TODAS as configurações para debug
      const { data: allConfigs, error: allConfigsError } = await supabase
        .from('stripe_establishment_config')
        .select('id, establishment_id, is_enabled')
        .limit(10);
      
      console.log('[Stripe] Todas as configurações encontradas no banco:', allConfigs);
      
      // Buscar configuração específica
      const { data: establishmentConfig, error: establishmentError } = await supabase
        .from('stripe_establishment_config')
        .select('id, establishment_id, is_enabled, test_publishable_key, live_publishable_key')
        .eq('establishment_id', establishmentId)
        .maybeSingle();

      if (establishmentError) {
        console.error('[Stripe] ❌ Erro ao verificar config do estabelecimento:', establishmentError);
        console.error('[Stripe] Código do erro:', establishmentError.code, 'Mensagem:', establishmentError.message);
        console.error('[Stripe] Detalhes completos:', JSON.stringify(establishmentError, null, 2));
        return '';
      }

      console.log('[Stripe] Config do estabelecimento encontrada:', { 
        id: establishmentConfig?.id,
        establishment_id: establishmentConfig?.establishment_id,
        is_enabled: establishmentConfig?.is_enabled,
        has_config: !!establishmentConfig,
        has_test_key: !!establishmentConfig?.test_publishable_key,
        has_live_key: !!establishmentConfig?.live_publishable_key
      });

      if (!establishmentConfig) {
        console.warn('[Stripe] ⚠️ Configuração do estabelecimento não encontrada.');
        console.warn('[Stripe] 📋 Para habilitar o pagamento por Stripe:');
        console.warn('[Stripe]    1. Vá em Configurações > Integrações > Stripe');
        console.warn('[Stripe]    2. Configure as chaves do Stripe (publishable key e secret key)');
        console.warn('[Stripe]    3. Ative "Stripe Habilitado"');
        console.warn('[Stripe]    4. Salve a configuração');
        return '';
      }

      if (!establishmentConfig?.is_enabled) {
        console.warn('[Stripe] ⚠️ Stripe não está habilitado para o estabelecimento:', establishmentId);
        console.warn('[Stripe] 📋 Para habilitar:');
        console.warn('[Stripe]    1. Vá em Configurações > Integrações > Stripe');
        console.warn('[Stripe]    2. Ative "Stripe Habilitado"');
        console.warn('[Stripe]    3. Salve a configuração');
        return '';
      }
      
      console.log('[Stripe] ✅ Stripe está habilitado globalmente e para o estabelecimento');

      // Obter guest_id (pode estar em reservation.guest_id, reservation.client_id, ou guest/client.id)
      const guestId = reservation.guest_id || reservation.client_id || guest?.id || client?.id;
      
      if (!guestId) {
        console.warn('[Stripe] Guest/Client ID não encontrado para a reserva:', {
          reservation_id: reservation.id,
          reservation_guest_id: reservation.guest_id,
          reservation_client_id: reservation.client_id,
          guest_id: guest?.id,
          client_id: client?.id
        });
        return '';
      }

      // Criar Payment Intent
      // Usar fetch direto para evitar problemas com autenticação automática do cliente Supabase
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[Stripe] ❌ Variáveis de ambiente do Supabase não encontradas');
        return '';
      }

      const requestBody = {
        establishment_id: establishmentId,
        amount: pendingAmount,
        currency: 'BRL',
        payment_type: 'reservation_payment',
        reservation_id: reservation.id,
        guest_id: guestId,
        description: `Pagamento da reserva #${reservation.reservation_code || reservation.id}`,
      };

      console.log('[Stripe] Chamando Edge Function stripe-payment com:', requestBody);
      
      // Fazer chamada direta via fetch sem headers de autorização
      const response = await fetch(`${supabaseUrl}/functions/v1/stripe-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Não incluir Authorization header - a função deve aceitar requisições anônimas
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        
        console.error('[Stripe] ❌ Erro ao criar Payment Intent:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        
        // Se for erro 401, fornecer instruções específicas
        if (response.status === 401) {
          console.error('[Stripe] ⚠️ ERRO 401: A função stripe-payment está exigindo autenticação.');
          console.error('[Stripe] 📋 SOLUÇÃO: Acesse o Supabase Dashboard > Edge Functions > stripe-payment > Settings');
          console.error('[Stripe] 📋 Desative "Require Authorization" ou "Verify JWT"');
          console.error('[Stripe] 📋 Ou execute: supabase functions deploy stripe-payment --no-verify-jwt');
        }
        
        return '';
      }

      const paymentData = await response.json();

      if (!paymentData?.payment_intent_id) {
        console.error('[Stripe] ❌ Payment Intent criado mas sem payment_intent_id:', paymentData);
        return '';
      }
      
      console.log('[Stripe] ✅ Payment Intent criado com sucesso:', paymentData.payment_intent_id);

      // Gerar URL do link de pagamento
      const baseUrl = detectBaseUrl();

      const paymentUrl = `${baseUrl}/payment/${paymentData.payment_intent_id}`;
      console.log('[Stripe] ✅ Link de pagamento gerado com sucesso:', paymentUrl);
      
      return paymentUrl;
    } catch (error) {
      console.error('[Stripe] ❌ Erro ao gerar link de pagamento:', error);
      return '';
    }
  };

  const paymentLink = await generatePaymentLink();
  
  if (!paymentLink) {
    console.warn('[Stripe] ⚠️ Payment Link não foi gerado. Verifique os logs acima para identificar o problema.');
  } else {
    console.log('[Stripe] ✅ Payment Link final gerado:', paymentLink);
  }

  // Converter logo_url para URL pública se necessário
  // Priorizar logo do hotel_settings, senão usar do site_settings
  let logoUrl = hotelSettings?.logo_url || siteSettings?.logo_url || '';
  
  console.log('🔍 Processando logo_url:', {
    hasHotelSettings: !!hotelSettings,
    hasSiteSettings: !!siteSettings,
    logoUrlFromHotel: hotelSettings?.logo_url || 'N/A',
    logoUrlFromSite: siteSettings?.logo_url || 'N/A',
    logoUrlFinal: logoUrl || 'vazio',
    logoUrlLength: logoUrl?.length || 0,
    logoUrlType: typeof logoUrl,
    hotelSettingsKeys: hotelSettings ? Object.keys(hotelSettings) : [],
    siteSettingsKeys: siteSettings ? Object.keys(siteSettings) : []
  });
  
  if (logoUrl) {
    try {
      // Se a logo_url já é uma URL completa (http/https), verificar se é válida
      if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
        // Verificar se a URL contém o domínio do Supabase (pode precisar de ajuste)
        // Se a URL contém "/storage/v1/object/public/", garantir que está correta
        if (logoUrl.includes('/storage/v1/object/public/')) {
          // URL do Supabase Storage - garantir que está completa e correta
          console.log('✅ Logo já é uma URL completa do Supabase Storage:', logoUrl.substring(0, 100) + '...');
        } else {
          // URL externa - usar como está
          console.log('✅ Logo já é uma URL completa (externa):', logoUrl.substring(0, 100) + '...');
        }
      } else if (logoUrl.startsWith('data:')) {
        // Se for data URL, usar como está (não funciona em emails, mas manter para não quebrar)
        console.log('⚠️ Logo é data URL (pode não funcionar em emails):', logoUrl.substring(0, 50) + '...');
      } else {
        // Se não começa com http/https, pode ser:
        // 1. Um caminho relativo do Supabase Storage (ex: "hotel/logo_123.png")
        // 2. Uma URL do Supabase Storage sem protocolo (ex: "//storage.supabase.co/...")
        // 3. Um caminho que precisa ser convertido para URL pública
        
        // Se começa com "//", adicionar "https:"
        if (logoUrl.startsWith('//')) {
          logoUrl = 'https:' + logoUrl;
          console.log('✅ Logo corrigida (adicionado https:):', logoUrl.substring(0, 100) + '...');
        } else if (logoUrl.includes('/storage/v1/object/public/')) {
          // Se já contém o caminho do Supabase Storage, adicionar protocolo se necessário
          if (!logoUrl.startsWith('http')) {
            logoUrl = 'https:' + (logoUrl.startsWith('/') ? '' : '//') + logoUrl;
            console.log('✅ Logo corrigida (adicionado https ao caminho Supabase):', logoUrl.substring(0, 100) + '...');
          }
        } else {
          // Tentar converter caminho relativo para URL pública
          // O sistema salva logos no bucket "hotel-assets" com caminho "hotel/nome_arquivo.ext"
          const { supabase: supabaseClient } = await import('@/integrations/supabase/client');
          
          // Tentar diferentes buckets comuns (incluindo hotel-assets que é usado pelo sistema)
          const possibleBuckets = ['hotel-assets', 'logos', 'public', 'images', 'uploads', 'hotel-logos'];
          let publicUrl = '';
          
          for (const bucket of possibleBuckets) {
            try {
              // Se o logoUrl já contém o caminho completo (ex: "hotel/logo_123.png"), usar direto
              // Se não, tentar adicionar "hotel/" como prefixo para hotel-assets
              let filePath = logoUrl;
              
              // Se for hotel-assets e o caminho não começar com "hotel/", adicionar
              if (bucket === 'hotel-assets' && !filePath.startsWith('hotel/') && !filePath.includes('/')) {
                filePath = `hotel/${filePath}`;
              }
              
              // Se o caminho contém "/storage/v1/object/public/", extrair apenas o caminho do arquivo
              if (filePath.includes('/storage/v1/object/public/')) {
                const match = filePath.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
                if (match && match[1]) {
                  filePath = match[1];
                }
              }
              
              const { data } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
              if (data?.publicUrl) {
                publicUrl = data.publicUrl;
                // Verificar se a URL é válida (começa com http)
                if (publicUrl.startsWith('http://') || publicUrl.startsWith('https://')) {
                  logoUrl = publicUrl;
                  console.log(`✅ Logo convertida para URL pública do bucket "${bucket}":`, logoUrl.substring(0, 100) + '...');
                  console.log(`📁 Caminho do arquivo usado:`, filePath);
                  break;
                }
              }
            } catch (error) {
              // Continuar tentando outros buckets
              console.warn(`⚠️ Erro ao tentar bucket "${bucket}":`, error);
              continue;
            }
          }
          
          // Se não encontrou em nenhum bucket, manter a URL original
          if (!publicUrl) {
            console.warn('⚠️ Não foi possível converter logo_url para URL pública. Mantendo original:', logoUrl);
            console.warn('⚠️ Logo URL original:', logoUrl);
          }
        }
      }
    } catch (error) {
      console.error('❌ Erro ao processar logo_url:', error);
      // Em caso de erro, manter a URL original
    }
  } else {
    console.log('ℹ️ Logo não configurada para este estabelecimento');
  }
  
  // Log final para debug
  console.log('📧 Logo URL final para email:', {
    hasLogo: !!logoUrl,
    logoUrl: logoUrl ? (logoUrl.substring(0, 150) + (logoUrl.length > 150 ? '...' : '')) : 'N/A',
    isCompleteUrl: logoUrl ? (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) : false
  });

  // Lidar com rooms que pode ser array ou objeto único
  const roomsData = Array.isArray(reservation.rooms) 
    ? reservation.rooms[0] 
    : reservation.rooms;
  
  // Lidar com room_categories que pode ser array ou objeto único
  const roomCategoriesData = Array.isArray(reservation.room_categories)
    ? reservation.room_categories[0]
    : reservation.room_categories;

  return {
    guest_name: guest?.full_name || client?.full_name || 'Hóspede',
    reservation_code: reservation.reservation_code || '',
    identification_number: reservation.identification_number ? `#${reservation.identification_number}` : '',
    checkin_date: checkinDate,
    checkout_date: checkoutDate,
    new_checkout_date: newCheckoutDate, // Nova data de check-out após extensão
    checkin_time: reservation.checkin_time || hotelSettings?.checkin_time?.substring(0, 5) || hotelSettings?.default_checkin_time || '14:00',
    checkout_time: reservation.checkout_time || hotelSettings?.checkout_time?.substring(0, 5) || hotelSettings?.default_checkout_time || '12:00',
    total_amount: reservation.total_amount?.toFixed(2).replace('.', ',') || '0,00',
    paid_amount: reservation.paid_amount?.toFixed(2).replace('.', ',') || '0,00',
    payment_status: getPaymentStatusLabel(reservation.payment_status),
    room_number: roomsData?.room_number || '',
    room_name: roomsData?.name || roomsData?.room_number || '',
    room_password: roomsData?.fixed_password || '',
    category_name: roomCategoriesData?.name || '',
    room_category: roomCategoriesData?.name || '', // Alias para category_name
    room_category_name: roomCategoriesData?.name || '', // Nome da categoria do quarto
    adults: reservation.adults?.toString() || '1',
    children: reservation.children?.toString() || '0',
    hotel_name: hotelSettings?.name || 'Hotel',
    hotel_address: hotelAddress,
    hotel_contact: hotelPhone || hotelWhatsApp || hotelSettings?.email || '',
    hotel_policies: hotelSettings?.policies || hotelSettings?.description || 'Consulte as políticas do hotel na recepção.',
    hotel_email: hotelSettings?.email || '',
    hotel_phone: hotelPhone,
    hotel_whatsapp: hotelWhatsApp,
    hotel_website: hotelSettings?.website || '',
    hotel_logo: logoUrl, // URL do logo do estabelecimento (convertida para pública se necessário)
    logo_url: logoUrl, // Alias para hotel_logo
    policies_link: policiesLink, // Link para página pública de políticas
    web_checkin_link: webCheckinLink, // Link para web check-in com localizador
    payment_link: paymentLink, // Link para pagamento da reserva (se necessário)
  };
}

function getPaymentStatusLabel(status: string): string {
  const labels: { [key: string]: string } = {
    pending: 'Pendente',
    partial: 'Parcial',
    paid: 'Pago',
    refunded: 'Reembolsado',
  };
  return labels[status] || status;
}

