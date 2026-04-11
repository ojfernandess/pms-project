import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Inlined for Supabase remote bundle (only index.ts is uploaded) ---
/** Fragmento alinhado a `src/lib/emailTemplateEngine.ts` (processTemplate + condicionais + each). */

export interface TemplateVariables {
  [key: string]: string | number | null | undefined | any; // Permite objetos e arrays
}

/**
 * ObtÃƒÂ©m valor de uma variÃƒÂ¡vel aninhada (ex: "main_guest.name" ou "documents.0.guest_name")
 */
function getNestedValue(variables: TemplateVariables, path: string): any {
  const parts = path.split('.');
  let value: any = variables;
  
  for (const part of parts) {
    if (value === null || value === undefined) return null;
    
    // Se for um nÃƒÂºmero, tratar como ÃƒÂ­ndice de array
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

      // Obter o array da variÃƒÂ¡vel
      const arrayValue = getNestedValue(variables, variablePath);
      
      if (Array.isArray(arrayValue) && arrayValue.length > 0) {
        // Processar cada item do array
        const items = arrayValue.map((item: any, index: number) => {
          // Criar contexto com "this" e ÃƒÂ­ndice
          const itemContext: TemplateVariables = {
            ...variables,
            this: item,
            '@index': index,
            '@first': index === 0,
            '@last': index === arrayValue.length - 1,
          };

          // Adicionar propriedades do item ao contexto como variÃƒÂ¡veis achatadas
          // Ex: this.guest_name -> guest_name, this.document_type -> document_type
          if (typeof item === 'object' && item !== null) {
            Object.keys(item).forEach(key => {
              // Adicionar como this.key para acesso direto
              itemContext[`this.${key}`] = item[key];
              // TambÃƒÂ©m adicionar como key para acesso sem this (mais simples)
              itemContext[key] = item[key];
            });
          }

          // Processar o conteÃƒÂºdo do loop com o contexto do item
          // Usar uma versÃƒÂ£o recursiva que processa apenas o conteÃƒÂºdo do loop
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
          
          // Processar condicionais e outras variÃƒÂ¡veis no contexto do item
          return processTemplate(itemContent, itemContext);
        });

        processed = processed.replace(fullMatch, items.join(''));
      } else {
        // Array vazio ou nÃƒÂ£o ÃƒÂ© array: remover o bloco
        processed = processed.replace(fullMatch, '');
      }

      changed = true;
      break;
    }
  }

  return processed;
}

/**
 * Processa um template HTML substituindo variÃƒÂ¡veis no formato {{variable_name}}
 * e processando condicionais no formato {{#if variable_name}}...{{/if}}
 * e loops no formato {{#each array}}...{{/each}}
 */
export function processTemplate(template: string, variables: TemplateVariables): string {
  let processed = template;

  // Log inicial para debug
  if (template?.includes('{{review_link}}') || template?.includes('{{{review_link}}}')) {
    console.log('Ã°Å¸â€Â processTemplate: Template contÃƒÂ©m review_link placeholder', {
      hasReviewLinkVar: 'review_link' in variables,
      reviewLinkValue: variables.review_link,
      allKeys: Object.keys(variables),
    });
  }

  // Primeiro, processar loops {{#each array}}...{{/each}}
  processed = processEachLoops(processed, variables);

  // Depois, processar condicionais {{#if variable}}...{{/if}}
  // Fazer mÃƒÂºltiplas passadas atÃƒÂ© que nÃƒÂ£o haja mais mudanÃƒÂ§as
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
  // Contar quantos {{#if}} e {{/if}} existem para garantir que nÃƒÂ£o removemos demais
  const ifCount = (processed.match(/\{\{#if\s+\w+(?:\.\w+)*\}\}/g) || []).length;
  const endifCount = (processed.match(/\{\{\/if\}\}/g) || []).length;
  
  // Se hÃƒÂ¡ mais {{/if}} do que {{#if}}, remover os extras
  if (endifCount > ifCount) {
    // Remover apenas os {{/if}} extras (a diferenÃƒÂ§a)
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

  // Por ÃƒÂºltimo, substituir variÃƒÂ¡veis no formato {{variable_name}} ou {{variable.path}}
  // Processar variÃƒÂ¡veis aninhadas primeiro (ex: {{main_guest.name}})
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

  // Depois, substituir variÃƒÂ¡veis simples no formato {{variable_name}}
  // Fazer mÃƒÂºltiplas passadas para garantir que todas as variÃƒÂ¡veis sejam substituÃƒÂ­das
  let varChanged = true;
  let varIterations = 0;
  while (varChanged && varIterations < 20) {
    varIterations++;
    varChanged = false;
    
    // Substituir variÃƒÂ¡veis aninhadas primeiro (formato {{variable.path}})
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
    
    // Substituir variÃƒÂ¡veis com trÃƒÂªs chaves {{{variable}}} (HTML nÃƒÂ£o escapado)
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
    
    // Depois substituir variÃƒÂ¡veis simples primeiro (formato {{variable}})
    // Processar variÃƒÂ¡veis simples (strings, nÃƒÂºmeros, etc) antes de objetos
    Object.keys(variables).forEach((key) => {
      const value = variables[key];
      
      // Processar apenas valores simples (nÃƒÂ£o objetos ou arrays)
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
              console.log('Ã¢Å“â€¦ review_link substituÃƒÂ­do no loop simples:', {
                matches: matches.length,
                value: stringValue,
              });
            }
          }
        }
      }
    });
    
    // Depois processar objetos e arrays (variÃƒÂ¡veis aninhadas)
    Object.keys(variables).forEach((key) => {
      const value = variables[key];
    
      // Processar objetos e arrays (variÃƒÂ¡veis aninhadas)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Processar propriedades do objeto como variÃƒÂ¡veis aninhadas
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
      // Esta parte jÃƒÂ¡ foi processada acima, mas manter para compatibilidade
      // Converter para string, tratando null/undefined como string vazia
      const stringValue = value !== null && value !== undefined ? String(value) : '';
        // Usar replace global para substituir todas as ocorrÃƒÂªncias
      // Escapar caracteres especiais na chave (como underscore, que ÃƒÂ© vÃƒÂ¡lido em regex)
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
        const beforeReplace = processed;
      const matches = processed.match(regex);
      if (matches && matches.length > 0) {
        console.log(`Ã°Å¸â€Â Substituindo variÃƒÂ¡vel ${key}:`, {
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
            console.log('Ã¢Å“â€¦ review_link substituÃƒÂ­do:', {
              before: beforeReplace.includes('{{review_link}}'),
              after: processed.includes('{{review_link}}'),
              value: stringValue,
            });
          }
        } else if (key === 'review_link' && processed.includes('{{review_link}}')) {
          console.warn('Ã¢Å¡Â Ã¯Â¸Â review_link NÃƒÆ’O foi substituÃƒÂ­do:', {
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
  
  // Log de debug para variÃƒÂ¡veis nÃƒÂ£o substituÃƒÂ­das (apenas em desenvolvimento)
  // Deno Edge pode definir `window` sem `location` — usar optional chaining.
  if (typeof window !== "undefined" && window.location?.hostname === "localhost") {
    const remainingVars = processed.match(/\{\{[\w.]+(?:\.[\w.]+)*\}\}/g);
    if (remainingVars && remainingVars.length > 0) {
      console.log('Ã¢Å¡Â Ã¯Â¸Â VariÃƒÂ¡veis nÃƒÂ£o substituÃƒÂ­das no template:', remainingVars);
      console.log('Ã°Å¸â€œâ€¹ VariÃƒÂ¡veis disponÃƒÂ­veis:', Object.keys(variables));
      console.log('Ã°Å¸â€Â Verificando review_link:', {
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
 * Remove blocos onde a variÃƒÂ¡vel ÃƒÂ© falsy (null, undefined, '', 0, false)
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
    // Suporta variÃƒÂ¡veis aninhadas (ex: {{#if main_guest.name}})
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
          // NÃƒÂ£o encontrou fechamento, sair
          break;
        }
        
        // Verificar se hÃƒÂ¡ um {{else}} antes do prÃƒÂ³ximo {{#if}} ou {{/if}}
        // Se houver um {{else}} no mesmo nÃƒÂ­vel (depth === 1), ele pertence ao bloco atual
        // Se houver um {{#if}} antes do {{else}}, incrementar depth
        if (nextIf !== -1 && nextIf < nextEndIf && (nextElse === -1 || nextIf < nextElse)) {
          // Encontrou um {{#if}} antes do {{/if}}, incrementar profundidade
          depth++;
          searchIndex = nextIf + 5; // AvanÃƒÂ§ar apÃƒÂ³s {{#if
        } else {
          // Encontrou um {{/if}}
          depth--;
          if (depth === 0) {
            // Este ÃƒÂ© o {{/if}} correspondente
            const endIndex = nextEndIf + 7; // {{/if}} tem 7 caracteres
            const fullMatch = processed.substring(startIndex, endIndex);
            const content = processed.substring(startIndex + startTag.length, nextEndIf);
            
            // Verificar se hÃƒÂ¡ um {{else}} dentro do conteÃƒÂºdo
            // Precisamos encontrar o {{else}} que pertence a este bloco (nÃƒÂ£o aos aninhados)
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
                break; // NÃƒÂ£o hÃƒÂ¡ mais tags
              }
              
              // Ordenar por posiÃƒÂ§ÃƒÂ£o
              positions.sort((a, b) => a.pos - b.pos);
              const nextTag = positions[0];
              
              // Se encontramos um {{else}} no nÃƒÂ­vel 0 (sem blocos aninhados abertos), ele pertence ao bloco atual
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
              // Separar conteÃƒÂºdo do if e do else
              ifContent = content.substring(0, elseIndex);
              elseContent = content.substring(elseIndex + 8); // {{else}} tem 8 caracteres
              
              // Processar condicionais recursivamente no conteÃƒÂºdo do else
              // Fazer mÃƒÂºltiplas passadas para garantir que todas as condicionais sejam processadas
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
            
            // Verificar se a variÃƒÂ¡vel existe e ÃƒÂ© truthy
            // Suportar variÃƒÂ¡veis aninhadas (ex: main_guest.document_number)
            const value = variableName.includes('.') 
              ? getNestedValue(variables, variableName)
              : variables[variableName];
            
            // Debug: log para variÃƒÂ¡veis aninhadas problemÃƒÂ¡ticas
            if (variableName.includes('.') && (value === null || value === undefined)) {
              console.log(`Ã°Å¸â€Â [Template Debug] VariÃƒÂ¡vel aninhada nÃƒÂ£o encontrada: ${variableName}`, {
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
              // VariÃƒÂ¡vel ÃƒÂ© truthy: manter o conteÃƒÂºdo do if, remover apenas as tags
              // Processar condicionais recursivamente no conteÃƒÂºdo do if se necessÃƒÂ¡rio
              // Fazer mÃƒÂºltiplas passadas para garantir que todas as condicionais sejam processadas
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
              // (isso nÃƒÂ£o deveria acontecer, mas ÃƒÂ© uma seguranÃƒÂ§a)
              finalIfContent = finalIfContent.replace(/\{\{\/if\}\}/g, '');
              // Substituir o bloco completo (incluindo {{#if}} e {{/if}}) usando substring
              processed = processed.substring(0, startIndex) + finalIfContent + processed.substring(endIndex);
            } else {
              // VariÃƒÂ¡vel ÃƒÂ© falsy: manter o conteÃƒÂºdo do else (se existir), remover apenas as tags
              if (elseContent) {
                // O elseContent jÃƒÂ¡ foi processado recursivamente, entÃƒÂ£o nÃƒÂ£o deve ter {{/if}} soltos
                // Mas vamos garantir removendo apenas se houver (pode haver casos edge)
                // IMPORTANTE: NÃƒÂ£o remover {{/if}} que fazem parte de blocos aninhados jÃƒÂ¡ processados
                // O processamento recursivo jÃƒÂ¡ removeu as tags dos blocos aninhados
                // Apenas remover se realmente houver {{/if}} solto (nÃƒÂ£o deveria acontecer)
                let finalElseContent = elseContent;
                // Verificar se hÃƒÂ¡ {{/if}} que nÃƒÂ£o fazem parte de um bloco vÃƒÂ¡lido
                // Se o elseContent foi processado recursivamente, nÃƒÂ£o deveria ter {{/if}}
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
        break; // Reiniciar busca apÃƒÂ³s processar um bloco
      }
    }
  }
  
  return processed;
}


/** Copiado de stripe-webhook para reutilizaÃ§Ã£o nas Edge Functions. */

/**
 * Detecta o domÃ­nio base do sistema automaticamente
 * Detecta automaticamente se estÃ¡ em localhost (desenvolvimento) ou produÃ§Ã£o
 */
function detectBaseUrl(req: Request | null = null, supabaseUrl: string | null = null): string {
  // 1. Tentar variÃƒÂ¡vel de ambiente SITE_URL (prioridade mÃƒÂ¡xima)
  const siteUrl = Deno.env.get("SITE_URL");
  if (siteUrl) {
    console.log(`Ã°Å¸Å’Â [detectBaseUrl] Usando SITE_URL: ${siteUrl}`);
    return siteUrl;
  }

  // 2. Verificar variÃƒÂ¡veis de ambiente de plataformas de produÃƒÂ§ÃƒÂ£o
  // Vercel
  const vercelUrl = Deno.env.get("VERCEL_URL");
  if (vercelUrl) {
    const url = `https://${vercelUrl}`;
    console.log(`Ã°Å¸Å’Â [detectBaseUrl] Usando VERCEL_URL: ${url}`);
    return url;
  }

  // Render
  const renderUrl = Deno.env.get("RENDER_EXTERNAL_URL");
  if (renderUrl) {
    console.log(`Ã°Å¸Å’Â [detectBaseUrl] Usando RENDER_EXTERNAL_URL: ${renderUrl}`);
    return renderUrl;
  }

  // Netlify
  const netlifyUrl = Deno.env.get("URL");
  if (netlifyUrl) {
    console.log(`Ã°Å¸Å’Â [detectBaseUrl] Usando Netlify URL: ${netlifyUrl}`);
    return netlifyUrl;
  }

  // Railway
  const railwayUrl = Deno.env.get("RAILWAY_PUBLIC_DOMAIN");
  if (railwayUrl) {
    const url = `https://${railwayUrl}`;
    console.log(`Ã°Å¸Å’Â [detectBaseUrl] Usando RAILWAY_PUBLIC_DOMAIN: ${url}`);
    return url;
  }

  // 3. Tentar extrair do header Referer ou Origin se disponÃƒÂ­vel (ÃƒÂºtil para webhooks)
  if (req) {
    const referer = req.headers.get("referer");
    const origin = req.headers.get("origin");
    
    if (origin) {
      try {
        const url = new URL(origin);
        // Verificar se nÃƒÂ£o ÃƒÂ© localhost
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          console.log(`Ã°Å¸Å’Â [detectBaseUrl] Usando Origin header: ${url.origin}`);
        return url.origin;
        }
      } catch {
        // Ignorar erro
      }
    }
    
    if (referer) {
      try {
        const url = new URL(referer);
        // Verificar se nÃƒÂ£o ÃƒÂ© localhost
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          console.log(`Ã°Å¸Å’Â [detectBaseUrl] Usando Referer header: ${url.origin}`);
        return url.origin;
        }
      } catch {
        // Ignorar erro
      }
    }
  }

  // 4. Analisar SUPABASE_URL para detectar ambiente
  const supabaseUrlEnv = supabaseUrl || Deno.env.get("SUPABASE_URL");
  if (supabaseUrlEnv) {
    try {
      const url = new URL(supabaseUrlEnv);
      const hostname = url.hostname;
      
      // Se for localhost, retornar localhost
      if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
        console.log(`Ã°Å¸Å’Â [detectBaseUrl] Detectado localhost via SUPABASE_URL: http://localhost:8080`);
        return "http://localhost:8080";
      }
      
      // Se for um projeto Supabase (.supabase.co), tentar inferir domÃƒÂ­nio de produÃƒÂ§ÃƒÂ£o
      if (hostname.includes('.supabase.co')) {
        // Extrair o ID do projeto do hostname
        // Exemplo: xxxxxx.supabase.co -> pode inferir domÃƒÂ­nio customizado se configurado
        // Por enquanto, vamos tentar usar variÃƒÂ¡veis de ambiente ou inferir
        console.log(`Ã°Å¸Å’Â [detectBaseUrl] Detectado Supabase Cloud, tentando inferir domÃƒÂ­nio de produÃƒÂ§ÃƒÂ£o...`);
      }
      
      // Se nÃƒÂ£o for um domÃƒÂ­nio .supabase.co, pode ser um domÃƒÂ­nio customizado
      if (!hostname.includes('.supabase.co')) {
        // Tentar inferir removendo subdomÃƒÂ­nios como 'api', 'app', etc.
        const parts = hostname.split('.');
        if (parts.length > 2) {
          // Remover subdomÃƒÂ­nios como 'api', 'app', etc.
          const domain = parts.slice(-2).join('.');
          const inferredUrl = `${url.protocol}//${domain}`;
          console.log(`Ã°Å¸Å’Â [detectBaseUrl] DomÃƒÂ­nio customizado inferido: ${inferredUrl}`);
          return inferredUrl;
        } else {
          // Se for um domÃƒÂ­nio direto, usar como estÃƒÂ¡
          const directUrl = `${url.protocol}//${hostname}`;
          console.log(`Ã°Å¸Å’Â [detectBaseUrl] Usando domÃƒÂ­nio direto do SUPABASE_URL: ${directUrl}`);
          return directUrl;
        }
      }
    } catch {
      // Ignorar erro
    }
  }

  // 5. Verificar variÃƒÂ¡vel de ambiente de ambiente (NODE_ENV, DENO_ENV, etc.)
  const env = Deno.env.get("ENVIRONMENT") || Deno.env.get("NODE_ENV") || Deno.env.get("DENO_ENV");
  if (env === "production" || env === "prod") {
    // Em produÃƒÂ§ÃƒÂ£o, tentar usar o SUPABASE_URL como base
    if (supabaseUrlEnv) {
      try {
        const url = new URL(supabaseUrlEnv);
        // Se nÃƒÂ£o for localhost, tentar inferir
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          console.log(`Ã°Å¸Å’Â [detectBaseUrl] Ambiente de produÃƒÂ§ÃƒÂ£o detectado, usando SUPABASE_URL como base`);
          // Retornar apenas o protocolo e hostname (sem path)
          return `${url.protocol}//${url.hostname}`;
        }
      } catch {
        // Ignorar erro
      }
    }
  }

  // 6. ÃƒÅ¡ltimo fallback: detectar baseado no SUPABASE_URL
  // Se SUPABASE_URL contÃƒÂ©m localhost, usar localhost
  if (supabaseUrlEnv && (supabaseUrlEnv.includes('localhost') || supabaseUrlEnv.includes('127.0.0.1'))) {
    console.log(`Ã°Å¸Å’Â [detectBaseUrl] Fallback: Detectado localhost, usando http://localhost:8080`);
    return "http://localhost:8080";
  }

  // 7. Se chegou aqui e nÃƒÂ£o ÃƒÂ© localhost, tentar inferir domÃƒÂ­nio de produÃƒÂ§ÃƒÂ£o
  // Por padrÃƒÂ£o, se nÃƒÂ£o conseguir detectar, usar localhost (mais seguro para desenvolvimento)
  console.log(`Ã°Å¸Å’Â [detectBaseUrl] Fallback final: Usando localhost (desenvolvimento)`);
  return "http://localhost:8080";
}


const SITE_SETTINGS_FEATURE_ROW = "00000000-0000-0000-0000-000000000001";

function isFeatureEnabledForEstablishment(
  featureConfig: unknown,
  establishmentId: string,
): boolean {
  if (!establishmentId) return false;
  if (typeof featureConfig === "boolean") return featureConfig;
  if (typeof featureConfig === "object" && featureConfig !== null) {
    const o = featureConfig as Record<string, unknown>;
    if (o.enabled !== true) return false;
    if (!o.establishment_ids || !Array.isArray(o.establishment_ids)) return true;
    return (o.establishment_ids as string[]).includes(establishmentId);
  }
  return false;
}

function otaGuestEmailFromReservation(reservation: Record<string, unknown>): string | null {
  const ota = reservation?.ota_reservations;
  const row = Array.isArray(ota) ? ota[0] : ota;
  const e = (row as Record<string, unknown> | undefined)?.ota_guest_email;
  return e != null && String(e).trim() !== "" ? String(e).trim() : null;
}

function otaGuestNameFromReservation(reservation: Record<string, unknown>): string | null {
  const ota = reservation?.ota_reservations;
  const row = Array.isArray(ota) ? ota[0] : ota;
  const n = (row as Record<string, unknown> | undefined)?.ota_guest_name;
  if (n != null && String(n).trim() !== "") return String(n).trim();
  const gn = reservation?.guest_name;
  return gn != null && String(gn).trim() !== "" ? String(gn).trim() : null;
}

function pickEmailTemplateForEstablishment(
  allTemplates: any[] | null,
  establishmentId: string,
): any | null {
  if (!allTemplates?.length) return null;
  for (const template of allTemplates) {
    const establishmentIds = template.establishment_ids;
    if (establishmentIds === null || establishmentIds === undefined) return template;
    if (Array.isArray(establishmentIds) && establishmentIds.length === 0) continue;
    if (Array.isArray(establishmentIds) && establishmentIds.includes(establishmentId)) {
      return template;
    }
    try {
      const parsed = typeof establishmentIds === "string" ? JSON.parse(establishmentIds) : establishmentIds;
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) continue;
        if (parsed.includes(establishmentId)) return template;
      }
    } catch {
      return template;
    }
  }
  return null;
}

function formatDatePt(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}

async function ensureWebCheckinRow(
  supabase: SupabaseClient,
  reservation: Record<string, unknown>,
  establishmentId: string,
): Promise<void> {
  const rid = reservation.id as string;
  const { data: existing } = await supabase
    .from("web_checkin")
    .select("id")
    .eq("reservation_id", rid)
    .maybeSingle();
  if (existing?.id) return;

  const code = reservation.reservation_code as string | null | undefined;
  if (!code) return;

  const payload = `${rid}:${code}:${Date.now()}`;
  const token = btoa(payload).replace(/[^a-zA-Z0-9]/g, "").substring(0, 64);
  const checkinDateObj = reservation.checkin_date ? new Date(reservation.checkin_date as string) : new Date();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  if (checkinDateObj < expiresAt) expiresAt.setTime(checkinDateObj.getTime());

  await supabase.from("web_checkin").insert({
    reservation_id: rid,
    establishment_id: establishmentId,
    token,
    locator: code,
    expires_at: expiresAt.toISOString(),
    status: "pending",
  });
}

async function fetchReservationFull(
  supabase: SupabaseClient,
  reservationId: string,
): Promise<any | null> {
  const select = `
    *,
    financial_responsible:clients!client_id(*),
    guest:clients!guest_id(*),
    rooms (id, room_number, name, fixed_password),
    room_categories (id, name, description, building_id),
    reservation_service_fees (amount, quantity),
    ota_reservations(ota_guest_email, ota_guest_name)
  `;
  const first = await supabase.from("reservations").select(select).eq("id", reservationId).maybeSingle();
  let data = first.data;
  if (first.error || !data) return null;
  if (!data.reservation_code) {
    await new Promise((r) => setTimeout(r, 300));
    const second = await supabase.from("reservations").select(select).eq("id", reservationId).maybeSingle();
    if (second.data) data = second.data;
  }
  return data;
}

function resolvePoliciesLink(
  hotelSettings: any,
  siteSettings: any,
  reservation: any,
  baseUrl: string,
): string {
  const buildingId = reservation.room_categories?.building_id ?? null;
  const establishmentId = reservation.establishment_id ?? hotelSettings?.establishment_id;
  const id = buildingId ?? establishmentId;
  const type: "building" | "establishment" = buildingId ? "building" : "establishment";
  if (!id) return "";
  try {
    const token = btoa(`${type}:${id}`);
    const hotelName = hotelSettings?.name || "hotel";
    const slug = hotelName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${baseUrl}/policies/${slug}/${token}`;
  } catch {
    return "";
  }
}

function resolveLogoUrls(
  supabase: SupabaseClient,
  hotelSettings: any,
  siteSettings: any,
): { logoUrl: string; hotelLogo: string } {
  let logoUrl = siteSettings?.logo_url || hotelSettings?.logo_url || "";
  let hotelLogo = hotelSettings?.logo_url || "";

  const tryPublic = (raw: string): string => {
    if (!raw || raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const buckets = ["hotel-assets", "uploads", "hotel-logos"];
    for (const bucket of buckets) {
      try {
        let filePath = raw;
        if (bucket === "hotel-assets" && !filePath.startsWith("hotel/") && !filePath.includes("/")) {
          filePath = `hotel/${filePath}`;
        }
        if (filePath.includes("/storage/v1/object/public/")) {
          const m = filePath.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
          if (m?.[1]) filePath = m[1];
        }
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        if (data?.publicUrl?.startsWith("http")) return data.publicUrl;
      } catch {
        /* next bucket */
      }
    }
    return raw;
  };

  if (logoUrl) logoUrl = tryPublic(logoUrl);
  if (hotelLogo) hotelLogo = tryPublic(hotelLogo);
  return { logoUrl: logoUrl || "", hotelLogo: hotelLogo || "" };
}

async function buildVariables(
  supabase: SupabaseClient,
  reservation: any,
  hotelSettings: any,
  siteSettings: any,
  baseUrl: string,
  eventType: "reservation.created" | "payment.confirmed",
): Promise<TemplateVariables> {
  const checkinDate = formatDatePt(reservation.checkin_date);
  const checkoutDate = formatDatePt(reservation.checkout_date);
  const checkinTimeRaw =
    reservation.checkin_time || hotelSettings?.checkin_time || hotelSettings?.default_checkin_time || "14:00";
  const checkoutTimeRaw =
    reservation.checkout_time || hotelSettings?.checkout_time || hotelSettings?.default_checkout_time || "12:00";
  const checkinTime =
    typeof checkinTimeRaw === "string" && checkinTimeRaw.includes(":")
      ? checkinTimeRaw.substring(0, 5)
      : checkinTimeRaw;
  const checkoutTime =
    typeof checkoutTimeRaw === "string" && checkoutTimeRaw.includes(":")
      ? checkoutTimeRaw.substring(0, 5)
      : checkoutTimeRaw;

  const addressParts: string[] = [];
  if (hotelSettings?.street) {
    let streetLine = hotelSettings.street;
    if (hotelSettings.number) streetLine += `, ${hotelSettings.number}`;
    addressParts.push(streetLine);
  }
  if (hotelSettings?.neighborhood) addressParts.push(hotelSettings.neighborhood);
  if (hotelSettings?.city) {
    let cityLine = hotelSettings.city;
    if (hotelSettings.state) cityLine += ` - ${hotelSettings.state}`;
    if (hotelSettings.zip_code) cityLine += ` - CEP: ${hotelSettings.zip_code}`;
    addressParts.push(cityLine);
  }
  const hotelAddress =
    addressParts.length > 0
      ? addressParts.join(", ")
      : hotelSettings?.street
        ? `${hotelSettings.street}, ${hotelSettings.city || ""}`
        : "";

  const hotelPhone =
    hotelSettings?.phone_ddi && hotelSettings?.phone_number
      ? `${hotelSettings.phone_ddi} ${hotelSettings.phone_number}`
      : hotelSettings?.phone_number || hotelSettings?.phone || "";

  const hotelWhatsApp =
    hotelSettings?.whatsapp ||
    (hotelSettings?.whatsapp_ddi && hotelSettings?.whatsapp_number
      ? `${hotelSettings.whatsapp_ddi} ${hotelSettings.whatsapp_number}`
      : hotelSettings?.whatsapp_number || "");

  const policiesLink = resolvePoliciesLink(hotelSettings, siteSettings, reservation, baseUrl);

  let webCheckinLink = "";
  const { data: wc } = await supabase
    .from("web_checkin")
    .select("locator")
    .eq("reservation_id", reservation.id)
    .maybeSingle();
  if (wc?.locator) webCheckinLink = `${baseUrl}/web-checkin/${wc.locator}`;
  else if (reservation.reservation_code) {
    webCheckinLink = `${baseUrl}/web-checkin/${reservation.reservation_code}`;
  }

  const { logoUrl, hotelLogo } = resolveLogoUrls(supabase, hotelSettings, siteSettings);

  const guestName =
    reservation.guest?.full_name ||
    reservation.financial_responsible?.full_name ||
    otaGuestNameFromReservation(reservation) ||
    reservation.guest_name ||
    "HÃ³spede";

  const paymentLabel =
    eventType === "payment.confirmed" || reservation.payment_status === "paid" ? "Pago" : "Pendente";

  const baseTotalAmount = Number(reservation.total_amount || 0);
  const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce(
    (sum: number, fee: { amount?: unknown; quantity?: unknown }) =>
      sum + Number(fee.amount || 0) * Number(fee.quantity || 1),
    0,
  );
  const totalWithFees = baseTotalAmount + serviceFeesTotal;
  const paidNum = Number(reservation.paid_amount || 0);

  const idRaw = reservation.identification_number;
  const identification_number =
    idRaw != null && String(idRaw).trim() !== ""
      ? `#${String(idRaw).trim()}`
      : reservation.reservation_code || "";

  const vars: TemplateVariables = {
    guest_name: guestName,
    reservation_code: reservation.reservation_code || "",
    identification_number,
    checkin_date: checkinDate,
    checkout_date: checkoutDate,
    checkin_time: checkinTime,
    checkout_time: checkoutTime,
    total_amount: totalWithFees.toFixed(2).replace(".", ","),
    paid_amount: paidNum.toFixed(2).replace(".", ","),
    payment_status: paymentLabel,
    room_number: reservation.rooms?.room_number || "",
    room_name: reservation.rooms?.name || "",
    room_password: reservation.rooms?.fixed_password || "",
    room_category: reservation.room_categories?.name || "",
    category_name: reservation.room_categories?.name || "",
    adults: reservation.adults || 0,
    children: reservation.children || 0,
    hotel_name: hotelSettings?.name || "",
    hotel_address: hotelAddress,
    hotel_contact: hotelPhone,
    hotel_email: hotelSettings?.email || "",
    hotel_phone: hotelPhone,
    hotel_whatsapp: hotelWhatsApp,
    hotel_website: hotelSettings?.website || "",
    hotel_policies: hotelSettings?.policies || "",
    policies_link: policiesLink,
    web_checkin_link: webCheckinLink,
    logo_url: logoUrl,
    hotel_logo: hotelLogo,
    payment_link: "",
  };

  return vars;
}

async function dispatchQueuedEmail(
  supabase: SupabaseClient,
  queueId: string,
  emailSettings: any,
  logPrefix: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const { data: queueItem, error: fetchError } = await supabase
    .from("email_queue")
    .select("*")
    .eq("id", queueId)
    .maybeSingle();

  if (fetchError || !queueItem) {
    console.warn(`${logPrefix}: fila email â€” item não encontrado`, queueId);
    return;
  }

  await supabase.from("email_queue").update({ status: "sending" }).eq("id", queueId);

  const fail = async (msg: string) => {
    await supabase
      .from("email_queue")
      .update({ status: "pending", error_message: msg.substring(0, 500) })
      .eq("id", queueId);
  };

  try {
    if (emailSettings.provider === "smtp") {
      const smtpResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-smtp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          to: queueItem.recipient_email,
          to_name: queueItem.recipient_name,
          from: emailSettings.sender_email,
          from_name: emailSettings.sender_name,
          reply_to: emailSettings.reply_to_email || emailSettings.sender_email,
          subject: queueItem.subject,
          html: queueItem.body_html,
          text: queueItem.body_text || "",
          smtp_config: {
            host: emailSettings.smtp_host,
            port: emailSettings.smtp_port || 587,
            secure: emailSettings.smtp_secure || false,
            auth: { user: emailSettings.smtp_username, pass: emailSettings.smtp_password },
          },
        }),
      });
      if (smtpResponse.ok) {
        await supabase
          .from("email_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", queueId);
      } else {
        await fail(await smtpResponse.text());
      }
      return;
    }

    if (emailSettings.provider === "resend") {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email-resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          to: queueItem.recipient_email,
          to_name: queueItem.recipient_name,
          from: emailSettings.sender_email,
          from_name: emailSettings.sender_name,
          reply_to: emailSettings.reply_to_email || emailSettings.sender_email,
          subject: queueItem.subject,
          html: queueItem.body_html,
          text: queueItem.body_text || "",
          api_key: emailSettings.api_key || "",
        }),
      });
      if (res.ok) {
        await supabase
          .from("email_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", queueId);
      } else {
        await fail(await res.text());
      }
      return;
    }

    if (emailSettings.provider === "sendgrid") {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email-sendgrid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          to: queueItem.recipient_email,
          to_name: queueItem.recipient_name,
          from: emailSettings.sender_email,
          from_name: emailSettings.sender_name,
          reply_to: emailSettings.reply_to_email || emailSettings.sender_email,
          subject: queueItem.subject,
          html: queueItem.body_html,
          text: queueItem.body_text || "",
          api_key: emailSettings.api_key || "",
        }),
      });
      if (res.ok) {
        await supabase
          .from("email_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", queueId);
      } else {
        await fail(await res.text());
      }
    }
  } catch (e) {
    console.warn(`${logPrefix}: erro ao enviar fila`, e);
    await fail(e instanceof Error ? e.message : String(e));
  }
}

async function queueAndMaybeSend(
  supabase: SupabaseClient,
  args: {
    template: any;
    eventType: string;
    recipientEmail: string;
    recipientName: string;
    subject: string;
    bodyHtml: string;
    variables: TemplateVariables;
    reservationId: string;
    emailSettings: any;
    logPrefix: string;
  },
): Promise<void> {
  const cc = args.template.cc_emails?.trim() || null;
  const bcc = args.template.bcc_emails?.trim() || null;

  const { data: queueId, error: queueError } = await supabase.rpc("insert_email_queue", {
    p_template_id: args.template.id,
    p_event_type: args.eventType,
    p_recipient_email: args.recipientEmail,
    p_recipient_name: args.recipientName || "",
    p_subject: args.subject,
    p_body_html: args.bodyHtml,
    p_reservation_id: args.reservationId,
    p_variables: args.variables,
    p_priority: 1,
    p_cc_emails: cc,
    p_bcc_emails: bcc,
  });

  if (queueError || !queueId) {
    console.warn(`${args.logPrefix}: insert_email_queue`, queueError);
    const { data: inserted, error: insErr } = await supabase
      .from("email_queue")
      .insert({
        template_id: args.template.id,
        event_type: args.eventType,
        recipient_email: args.recipientEmail,
        recipient_name: args.recipientName,
        subject: args.subject,
        body_html: args.bodyHtml,
        reservation_id: args.reservationId,
        variables: args.variables,
        priority: 1,
        status: "pending",
        cc_emails: cc,
        bcc_emails: bcc,
      })
      .select("id")
      .single();
    if (insErr || !inserted?.id) {
      console.warn(`${args.logPrefix}: insert direto email_queue`, insErr);
      return;
    }
    await dispatchQueuedEmail(supabase, inserted.id as string, args.emailSettings, args.logPrefix);
    return;
  }

  await dispatchQueuedEmail(supabase, queueId as string, args.emailSettings, args.logPrefix);
}

/**
 * Enfileira (e tenta enviar) e-mail de reserva criada ou pagamento confirmado para reservas OTA.
 */
async function notifyGuestAfterOtaReservationBooked(
  supabase: SupabaseClient,
  reservationId: string,
  options?: { request?: Request | null; logPrefix?: string },
): Promise<void> {
  const logPrefix = options?.logPrefix ?? "ota-reservation-email";
  const req = options?.request ?? null;

  try {
    const reservation = await fetchReservationFull(supabase, reservationId);
    if (!reservation) {
      console.warn(`${logPrefix}: reserva não encontrada`, reservationId);
      return;
    }
    if (reservation.channel !== "ota") return;

    const establishmentId = reservation.establishment_id as string;
    if (!establishmentId) return;

    const { data: siteRow } = await supabase
      .from("site_settings")
      .select("features_enabled")
      .eq("id", SITE_SETTINGS_FEATURE_ROW)
      .maybeSingle();

    if (
      !isFeatureEnabledForEstablishment(siteRow?.features_enabled?.email, establishmentId)
    ) {
      console.warn(`${logPrefix}: e-mail desativado para o estabelecimento`);
      return;
    }

    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (!emailSettings) {
      console.warn(`${logPrefix}: email_settings inativo ou ausente`);
      return;
    }

    const paid =
      reservation.payment_status === "paid" ||
      (Number(reservation.paid_amount || 0) >= Number(reservation.total_amount || 0) &&
        Number(reservation.total_amount || 0) > 0);
    const eventType = paid ? "payment.confirmed" : "reservation.created";

    const { data: templates } = await supabase
      .from("email_templates")
      .select("*")
      .eq("event_type", eventType)
      .eq("is_active", true);

    const template = pickEmailTemplateForEstablishment(templates || [], establishmentId);
    if (!template) {
      console.warn(`${logPrefix}: sem template ativo para ${eventType}`);
      return;
    }

    const recipientEmail =
      reservation.guest?.email ||
      reservation.financial_responsible?.email ||
      otaGuestEmailFromReservation(reservation);
    const recipientName =
      reservation.guest?.full_name ||
      reservation.financial_responsible?.full_name ||
      otaGuestNameFromReservation(reservation) ||
      (reservation.guest_name as string) ||
      "HÃ³spede";

    if (!recipientEmail) {
      console.warn(`${logPrefix}: sem e-mail do hóspede (guest/financeiro/OTA)`);
      return;
    }

    const { data: hotelSettings } = await supabase
      .from("hotel_settings")
      .select("*")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    const { data: siteSettings } = await supabase
      .from("site_settings")
      .select("logo_url, pms_base_url")
      .maybeSingle();

    await ensureWebCheckinRow(supabase, reservation, establishmentId);

    const refreshed = await fetchReservationFull(supabase, reservationId);
    const res = refreshed || reservation;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    let baseUrl = detectBaseUrl(req, supabaseUrl);
    if (siteSettings?.pms_base_url?.trim()) {
      const pmsUrl = siteSettings.pms_base_url.trim();
      try {
        baseUrl = new URL(
          pmsUrl.startsWith("http://") || pmsUrl.startsWith("https://") ? pmsUrl : `https://${pmsUrl}`,
        ).origin;
      } catch {
        baseUrl = pmsUrl;
      }
    }

    const variables = await buildVariables(
      supabase,
      res,
      hotelSettings,
      siteSettings,
      baseUrl,
      eventType as "reservation.created" | "payment.confirmed",
    );

    const subject = processTemplate(template.subject || "", variables);
    const bodyHtml = processTemplate(template.body_html || "", variables);

    const supabaseFunctionsUrl = supabaseUrl.replace(/\/$/, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (emailSettings.provider === "resend" || emailSettings.provider === "sendgrid") {
      const fn = emailSettings.provider === "resend" ? "send-email-resend" : "send-email-sendgrid";
      try {
        const direct = await fetch(`${supabaseFunctionsUrl}/functions/v1/${fn}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            to: recipientEmail,
            to_name: recipientName,
            from: emailSettings.sender_email,
            from_name: emailSettings.sender_name,
            reply_to: emailSettings.reply_to_email || emailSettings.sender_email,
            subject,
            html: bodyHtml,
            text: "",
            api_key: emailSettings.api_key || "",
          }),
        });
        if (direct.ok) {
          console.log(`${logPrefix}: enviado diretamente (${fn}) para`, recipientEmail);
          return;
        }
        console.warn(`${logPrefix}: envio direto falhou, usando fila`, await direct.text());
      } catch (e) {
        console.warn(`${logPrefix}: envio direto erro, usando fila`, e);
      }
    }

    await queueAndMaybeSend(supabase, {
      template,
      eventType,
      recipientEmail,
      recipientName,
      subject,
      bodyHtml,
      variables,
      reservationId,
      emailSettings,
      logPrefix,
    });
  } catch (e) {
    console.warn(`${logPrefix}: falha geral`, e);
  }
}

async function triggerAiosellAvailabilitySync(args: {
  channelId: string;
  establishmentId: string;
  logPrefix?: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !key) {
    console.warn(
      `${args.logPrefix ?? "triggerAiosellAvailabilitySync"}: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente`
    );
    return { ok: false, error: "misconfigured" };
  }
  const invokeUrl = `${url}/functions/v1/aiosell-sync`;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120_000);
    const r = await fetch(invokeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        apikey: key,
      },
      body: JSON.stringify({
        channel_id: args.channelId,
        establishment_id: args.establishmentId,
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    const text = await r.text();
    if (!r.ok) {
      console.warn(
        `${args.logPrefix ?? "triggerAiosellAvailabilitySync"}: aiosell-sync HTTP ${r.status}`,
        text.slice(0, 500)
      );
      return { ok: false, status: r.status, error: text.slice(0, 240) };
    }
    try {
      const j = JSON.parse(text) as { success?: boolean; error?: string };
      if (j.success === false) {
        return { ok: false, error: j.error ?? "sync_failed" };
      }
    } catch {
      /* resposta nÃ£o JSON */
    }
    return { ok: true, status: r.status };
  } catch (e) {
    console.warn(`${args.logPrefix ?? "triggerAiosellAvailabilitySync"}`, e);
    return { ok: false, error: String(e) };
  }
}

function scheduleAiosellAvailabilitySync(args: {
  channelId: string;
  establishmentId: string;
  logPrefix?: string;
}): void {
  const p = triggerAiosellAvailabilitySync(args);
  const g = globalThis as { EdgeRuntime?: { waitUntil: (x: Promise<unknown>) => void } };
  if (g.EdgeRuntime?.waitUntil) {
    g.EdgeRuntime.waitUntil(p);
  } else {
    void p;
  }
}

function envFlagTrue(name: string): boolean {
  const v = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function splitAiosellRatePlanCodes(raw: unknown): string[] {
  const s = String(raw ?? "").replace(/\u00a0/g, " ");
  if (!s.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of s.split(/[,;\n\r]+/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function channelRateplanMatchesAiosell(stored: unknown, incoming: string | null | undefined): boolean {
  if (incoming == null || !String(incoming).trim()) return true;
  const s = String(stored ?? "").trim();
  if (!s) return true;
  const want = String(incoming).toUpperCase().trim();
  return splitAiosellRatePlanCodes(s).some((c) => c.toUpperCase() === want);
}

/**
 * Aiosell: `pah` true = pagamento no hotel; `pah` false = reserva prÃ©-paga (OTA).
 * Aceita tambÃ©m texto em paymentStatus/segment quando o canal envia "Prepaid".
 */
function boolFromUnknown(v: unknown): boolean | undefined {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return undefined;
}

function looksLikePrepaidString(v: unknown): boolean {
  if (v == null) return false;
  const t = String(v).toLowerCase().trim();
  return (
    t.includes("prepaid") ||
    t.includes("pre-paid") ||
    t.includes("pre pago") ||
    t.includes("prepago") ||
    t === "pp"
  );
}

function isAiosellPrepaidBooking(
  layers: Record<string, unknown>[],
  body: Record<string, unknown>
): boolean {
  const pahKeys = ["pah", "payAtHotel", "pay_at_hotel", "paymentAtHotel"];

  for (const layer of layers) {
    for (const k of pahKeys) {
      if (!(k in layer)) continue;
      const b = boolFromUnknown(layer[k]);
      if (b === true) return false;
      if (b === false) return true;
    }
  }
  for (const k of pahKeys) {
    if (!(k in body)) continue;
    const b = boolFromUnknown(body[k]);
    if (b === true) return false;
    if (b === false) return true;
  }

  const statusKeys = [
    "paymentStatus",
    "payment_status",
    "bookingPaymentStatus",
    "paymentType",
    "payment_type",
    "bookingPaymentType",
    "prepaidStatus",
  ];
  for (const layer of layers) {
    for (const k of statusKeys) {
      if (looksLikePrepaidString(layer[k])) return true;
    }
    if (looksLikePrepaidString(layer.segment) || looksLikePrepaidString(layer.bookingSegment)) {
      return true;
    }
  }
  for (const k of statusKeys) {
    if (looksLikePrepaidString(body[k])) return true;
  }
  if (looksLikePrepaidString(body.segment)) return true;

  return false;
}

async function insertAiosellChannelPrepaidPayment(
  supabase: SupabaseClient,
  args: {
    reservationId: string;
    establishmentId: string;
    amount: number;
    bookingId: string;
    partnerChannelName?: string | null;
    /**
     * OTA marcou pré-pago no payload. Grava `payments` mesmo com `auto_payment_ota` desligado.
     */
    otaPrepaid?: boolean;
  }
): Promise<{ error: string | null }> {
  if (args.amount <= 0) return { error: null };

  const { data: hotelSettings } = await supabase
    .from("hotel_settings")
    .select("auto_payment_ota, auto_payment_carrier_id, auto_payment_channel_carrier_id, auto_payment_ota_channels")
    .eq("establishment_id", args.establishmentId)
    .maybeSingle();

  const otaPrepaid = args.otaPrepaid === true;
  const autoEnabled = (hotelSettings as { auto_payment_ota?: boolean } | null)?.auto_payment_ota === true;
  if (!autoEnabled && !otaPrepaid) return { error: null };

  const allowedPartnersRaw = (hotelSettings as { auto_payment_ota_channels?: unknown } | null)?.auto_payment_ota_channels;
  const allowedPartners = Array.isArray(allowedPartnersRaw)
    ? allowedPartnersRaw.map((v) => normalizePartnerKey(String(v))).filter(Boolean)
    : [];
  const partnerKey = normalizePartnerKey(args.partnerChannelName);
  if (autoEnabled && !otaPrepaid && allowedPartners.length > 0) {
    const allowsOthers = allowedPartners.includes("outros") || allowedPartners.includes("others");
    const matchesKnown = !!partnerKey && allowedPartners.includes(partnerKey);
    const matchesOthers = allowsOthers && !!partnerKey && !isKnownOtaPartner(partnerKey);
    if (!(matchesKnown || matchesOthers)) return { error: null };
  }

  const marker = "Pré-pago via canal OTA (Aiosell)";
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("reservation_id", args.reservationId)
    .ilike("notes", `%${marker}%`)
    .maybeSingle();

  if (existing?.id) return { error: null };

  const notes = [
    marker,
    `bookingId: ${args.bookingId}`,
    args.partnerChannelName ? `canal parceiro: ${formatPartnerChannelName(args.partnerChannelName)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { error } = await supabase.from("payments").insert({
    reservation_id: args.reservationId,
    establishment_id: args.establishmentId,
    amount: args.amount,
    payment_method: "deposit",
    payment_date: new Date().toISOString(),
    carrier_id:
      ((hotelSettings as { auto_payment_channel_carrier_id?: string | null } | null)?.auto_payment_channel_carrier_id) ||
      ((hotelSettings as { auto_payment_carrier_id?: string | null } | null)?.auto_payment_carrier_id) ||
      null,
    notes,
  });

  return { error: error?.message ?? null };
}

/** Camadas do payload (raiz, data, reservation, booking, etc.) para aceitar webhooks aninhados. */
function collectLayers(body: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [body];
  const data = body.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    out.push(data as Record<string, unknown>);
  }
  const payload = body.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    out.push(payload as Record<string, unknown>);
  }
  const reservation = body.reservation;
  if (reservation && typeof reservation === "object" && !Array.isArray(reservation)) {
    out.push(reservation as Record<string, unknown>);
  }
  const booking = body.booking;
  if (booking && typeof booking === "object" && !Array.isArray(booking)) {
    out.push(booking as Record<string, unknown>);
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const dr = d.reservation;
    if (dr && typeof dr === "object" && !Array.isArray(dr)) {
      out.push(dr as Record<string, unknown>);
    }
    const db = d.booking;
    if (db && typeof db === "object" && !Array.isArray(db)) {
      out.push(db as Record<string, unknown>);
    }
  }
  return out;
}

function firstNonEmptyString(layers: Record<string, unknown>[], keys: string[]): string | undefined {
  for (const layer of layers) {
    for (const k of keys) {
      const v = layer[k];
      if (v == null || v === "") continue;
      if (typeof v === "number" && !Number.isNaN(v)) return String(v);
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return undefined;
}

function aiosellLayerString(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
  if (typeof v === "number" && !Number.isNaN(v)) return String(v);
  return null;
}

/** Doc. Aiosell CM: `action: "modify"`. Alguns envios usam sinónimos no mesmo campo. */
function normalizeAiosellPrimaryAction(t: string): string {
  if (
    t === "change" ||
    t === "changed" ||
    t === "amend" ||
    t === "amended" ||
    t === "alter" ||
    t === "altered" ||
    t === "edit" ||
    t === "edited" ||
    t === "adjust" ||
    t === "adjustment" ||
    t === "revision"
  ) {
    return "modify";
  }
  return t;
}

function normalizeActionFromLayers(layers: Record<string, unknown>[]): string {
  const primaryKeys = ["action", "bookingAction", "booking_action", "operationType", "operation_type"];
  for (const layer of layers) {
    for (const k of primaryKeys) {
      const t = aiosellLayerString(layer[k]);
      if (t) return normalizeAiosellPrimaryAction(t);
    }
  }
  const secondaryKeys = ["event", "bookingType", "operation"];
  for (const layer of layers) {
    for (const k of secondaryKeys) {
      const t = aiosellLayerString(layer[k]);
      if (!t) continue;
      if (t === "modification" || t === "modification_request" || t === "booking_modification") return "modify";
      if (t === "cancellation" || t === "cancel_request" || t === "booking_cancellation") return "cancel";
      return normalizeAiosellPrimaryAction(t);
    }
  }
  for (const layer of layers) {
    const t = aiosellLayerString(layer.type);
    if (!t) continue;
    if (t.includes("modif") || t.includes("change") || t.endsWith("_update") || t === "booking_updated") {
      return "modify";
    }
    if (t.includes("cancel")) return "cancel";
    if (t === "book" || t === "new" || t === "booking") return "book";
  }
  for (const layer of layers) {
    const s = layer.status;
    if (s == null || s === "") continue;
    const t = String(s).trim().toLowerCase();
    if (t === "cancelled" || t === "canceled") return "cancel";
    if (t === "modified" || t === "update") return "modify";
  }
  return "";
}

function pickBookingIdFromLayers(layers: Record<string, unknown>[]): string | undefined {
  const keys = [
    "bookingId",
    "cmBookingId",
    "otaBookingId",
    "reservation_id",
    "reservationId",
    "booking_id",
    "bookingReference",
    "confirmationNo",
    "confirmationNumber",
    "externalBookingId",
    "reference",
    "bookingCode",
    "ota_booking_id",
    "confirmation_code",
    "bookingNumber",
    "booking_id_ext",
    "id",
  ];
  return firstNonEmptyString(layers, keys);
}

function pickRoomsFromLayers(layers: Record<string, unknown>[]): Record<string, unknown>[] {
  for (const layer of layers) {
    for (const key of ["rooms", "roomList", "room_stays", "roomStays"]) {
      const rm = layer[key];
      if (Array.isArray(rm) && rm.length) return rm as Record<string, unknown>[];
    }
    const single = layer.room;
    if (single && typeof single === "object" && !Array.isArray(single)) {
      return [single as Record<string, unknown>];
    }
  }
  return [];
}

function pickGuestObject(layers: Record<string, unknown>[]): Record<string, unknown> {
  for (const layer of layers) {
    const g = layer.guest;
    if (g && typeof g === "object" && !Array.isArray(g)) {
      return g as Record<string, unknown>;
    }
  }
  return {};
}

function isBadGuestNameToken(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === "" || t === "null" || t === "undefined";
}

function pickGuestStringField(guest: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = guest[k];
    if (v == null || v === "") continue;
    const raw = String(v).trim();
    if (isBadGuestNameToken(raw)) continue;
    return raw;
  }
  return undefined;
}

function sanitizeGuestNameBuilt(s: string): string {
  let t = s.trim().replace(/\s+/g, " ");
  t = t.replace(/\s+(null|undefined)\s*$/gi, "").trim();
  t = t.replace(/^(null|undefined)\s+/gi, "").trim();
  if (isBadGuestNameToken(t)) return "";
  return t;
}

/** DocumentaÃ§Ã£o Aiosell: `guest.firstName`/`lastName`, `rooms[].guestName`. */
function buildAiosellGuestName(
  body: Record<string, unknown>,
  layers: Record<string, unknown>[],
  guest: Record<string, unknown>,
  room0: Record<string, unknown>
): string {
  const fromLayers = firstNonEmptyString(layers, ["guestName", "guest_name"]);
  if (fromLayers && !isBadGuestNameToken(fromLayers)) return sanitizeGuestNameBuilt(fromLayers);
  const bodyGn = body.guestName;
  if (typeof bodyGn === "string" && bodyGn.trim() && !isBadGuestNameToken(bodyGn.trim())) {
    return sanitizeGuestNameBuilt(bodyGn.trim());
  }
  const fromRoom = firstNonEmptyString([room0], ["guestName", "guest_name", "primaryGuestName"]);
  if (fromRoom && !isBadGuestNameToken(fromRoom)) return sanitizeGuestNameBuilt(fromRoom);
  const fn = pickGuestStringField(guest, ["firstName", "first_name", "givenName", "given_name"]);
  const ln = pickGuestStringField(guest, ["lastName", "last_name", "surname", "familyName"]);
  const combined = [fn, ln].filter((x): x is string => !!x && !isBadGuestNameToken(x)).join(" ").trim();
  if (combined) return sanitizeGuestNameBuilt(combined);
  const single = pickGuestStringField(guest, ["name", "fullName", "full_name"]);
  if (single) return sanitizeGuestNameBuilt(single);
  return "Hóspede OTA";
}

function formatPartnerChannelName(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower === "airbnb") return "Airbnb";
  if (lower === "booking" || lower === "booking.com") return "Booking.com";
  if (lower === "expedia") return "Expedia";
  if (lower === "direct") return "Direct";
  return value;
}

function normalizePartnerKey(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

function isKnownOtaPartner(partnerKey: string): boolean {
  return ["booking.com", "booking", "airbnb", "expedia", "direct"].includes(partnerKey);
}

function pickGuestPhone(guest: Record<string, unknown>): string | null {
  const keys = ["phone", "mobile", "phoneNumber", "mobilePhone", "telephone", "tel"];
  for (const k of keys) {
    const v = guest[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function pickAiosellBookingMeta(body: Record<string, unknown>, layers: Record<string, unknown>[]) {
  const sourceChannel =
    firstNonEmptyString(layers, ["channel", "channelName", "sourceChannel", "otaChannel", "partnerChannel"]) ||
    (typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : "") ||
    "";
  const segment =
    firstNonEmptyString(layers, ["segment", "bookingSegment"]) ||
    (typeof body.segment === "string" && body.segment.trim() ? body.segment.trim() : "") ||
    "";
  const cmBookingId =
    firstNonEmptyString(layers, ["cmBookingId", "cm_booking_id", "itineraryId", "itinerary_id"]) || "";
  const specialRequests =
    firstNonEmptyString(layers, ["specialRequests", "special_requests", "remarks"]) || "";
  const bookedOn =
    firstNonEmptyString(layers, ["bookedOn", "booked_on", "bookingDate", "booking_date"]) || "";
  return {
    sourceChannel: sourceChannel || null,
    segment: segment || null,
    cmBookingId: cmBookingId || null,
    specialRequests: specialRequests || null,
    bookedOn: bookedOn || null,
  };
}

function guestAddressJson(addr: unknown): Record<string, unknown> | null {
  if (!addr || typeof addr !== "object" || Array.isArray(addr)) return null;
  return addr as Record<string, unknown>;
}

function buildAiosellReservationNotes(
  bookingId: string,
  meta: ReturnType<typeof pickAiosellBookingMeta>
): string {
  const parts: string[] = [`Aiosell booking ${bookingId}`];
  if (meta.sourceChannel) parts.push(`Canal parceiro: ${formatPartnerChannelName(meta.sourceChannel)}`);
  if (meta.segment) parts.push(`Segmento: ${meta.segment}`);
  if (meta.cmBookingId) parts.push(`CM booking: ${meta.cmBookingId}`);
  if (meta.bookedOn) parts.push(`Reservado em: ${meta.bookedOn}`);
  if (meta.specialRequests) parts.push(`Pedidos: ${meta.specialRequests}`);
  return parts.join(" · ");
}

function pickCheckIn(room0: Record<string, unknown>, layers: Record<string, unknown>[]): string | undefined {
  const keys = [
    "checkin",
    "checkIn",
    "checkin_date",
    "checkinDate",
    "arrivalDate",
    "arrival",
    "fromDate",
    "startDate",
    "check_in",
    "dateFrom",
    "start_date",
    "stayFrom",
    "stay_from",
    "from",
  ];
  const fromRoom = firstNonEmptyString([room0], keys);
  if (fromRoom) return fromRoom;
  return firstNonEmptyString(layers, keys);
}

function pickCheckOut(room0: Record<string, unknown>, layers: Record<string, unknown>[]): string | undefined {
  const keys = [
    "checkout",
    "checkOut",
    "checkout_date",
    "checkoutDate",
    "departureDate",
    "departure",
    "toDate",
    "endDate",
    "check_out",
    "dateTo",
    "end_date",
    "stayTo",
    "stay_to",
    "to",
  ];
  const fromRoom = firstNonEmptyString([room0], keys);
  if (fromRoom) return fromRoom;
  return firstNonEmptyString(layers, keys);
}

function normalizeAiosellDateField(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const isoDay = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDay) return isoDay[1];
  return s;
}

function isValidPmsStayRange(checkin: string | undefined, checkout: string | undefined): boolean {
  const a = normalizeAiosellDateField(checkin) ?? String(checkin ?? "").trim();
  const b = normalizeAiosellDateField(checkout) ?? String(checkout ?? "").trim();
  if (!a || !b) return false;
  return a < b;
}

async function roomHasReservationOverlapForModify(
  supabase: SupabaseClient,
  args: {
    roomId: string;
    establishmentId: string;
    checkin: string;
    checkout: string;
    excludeReservationId: string;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("reservations")
    .select("id")
    .eq("room_id", args.roomId)
    .eq("establishment_id", args.establishmentId)
    .neq("id", args.excludeReservationId)
    .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
    .lt("checkin_date", args.checkout)
    .gt("checkout_date", args.checkin)
    .limit(1);
  if (error) {
    console.warn("aiosell room overlap check", error.message);
    return true;
  }
  return (data?.length ?? 0) > 0;
}

async function findAvailableRoomForAiosellCategoryChange(
  supabase: SupabaseClient,
  args: {
    establishmentId: string;
    categoryId: string;
    checkin: string;
    checkout: string;
    excludeReservationId: string;
    currentRoomId: string | null | undefined;
  },
): Promise<string | null> {
  const cur = args.currentRoomId?.trim();
  if (cur) {
    const { data: pref } = await supabase
      .from("rooms")
      .select("id, category_id, is_blocked, status")
      .eq("id", cur)
      .eq("establishment_id", args.establishmentId)
      .maybeSingle();
    const pr = pref as { category_id?: string; is_blocked?: boolean | null; status?: string } | null;
    if (
      pr &&
      String(pr.category_id) === args.categoryId &&
      pr.is_blocked !== true &&
      pr.status !== "maintenance" &&
      pr.status !== "blocked"
    ) {
      const ov = await roomHasReservationOverlapForModify(supabase, {
        roomId: cur,
        establishmentId: args.establishmentId,
        checkin: args.checkin,
        checkout: args.checkout,
        excludeReservationId: args.excludeReservationId,
      });
      if (!ov) return cur;
    }
  }

  const { data: cands, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("establishment_id", args.establishmentId)
    .eq("category_id", args.categoryId)
    .or("is_blocked.is.null,is_blocked.eq.false")
    .in("status", ["available", "occupied", "cleaning"])
    .order("room_number", { ascending: true });

  if (error || !cands?.length) {
    if (error) console.warn("aiosell list rooms for category change", error.message);
    return null;
  }

  for (const row of cands) {
    const rid = String((row as { id: string }).id);
    const ov = await roomHasReservationOverlapForModify(supabase, {
      roomId: rid,
      establishmentId: args.establishmentId,
      checkin: args.checkin,
      checkout: args.checkout,
      excludeReservationId: args.excludeReservationId,
    });
    if (!ov) return rid;
  }
  return null;
}

function pickRoomCode(room0: Record<string, unknown>, layers: Record<string, unknown>[]): string | undefined {
  const keys = [
    "roomCode",
    "room_code",
    "roomTypeCode",
    "room_type_code",
    "categoryCode",
    "roomType",
    "roomId",
  ];
  const fromRoom = firstNonEmptyString([room0], keys);
  if (fromRoom) return fromRoom;
  return firstNonEmptyString(layers, keys);
}

function pickRateplanCode(room0: Record<string, unknown>, layers: Record<string, unknown>[]): string | undefined {
  const keys = ["rateplanCode", "rate_plan_code", "ratePlanCode", "rateCode", "mealPlanCode", "rate_plan"];
  const fromRoom = firstNonEmptyString([room0], keys);
  if (fromRoom) return fromRoom;
  return firstNonEmptyString(layers, keys);
}

function extractNumberFromAmountLike(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    if (!Number.isNaN(n)) return n;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const k of ["amountAfterTax", "amountBeforeTax", "total", "amount", "grandTotal"]) {
      const n = extractNumberFromAmountLike(o[k]);
      if (n != null) return n;
    }
  }
  return undefined;
}

function pickTotalAmount(
  room0: Record<string, unknown>,
  body: Record<string, unknown>,
  layers: Record<string, unknown>[]
): number {
  const direct = extractNumberFromAmountLike(room0.amount) ?? extractNumberFromAmountLike(body.amount);
  if (direct != null) return direct;
  const keys = ["amount", "totalAmount", "total_amount", "totalPrice", "total_price", "grandTotal", "price"];
  for (const k of keys) {
    const v = room0[k];
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  for (const k of keys) {
    const v = body[k];
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  for (const layer of layers) {
    for (const k of keys) {
      const v = layer[k];
      if (v != null && v !== "") {
        const n = Number(v);
        if (!Number.isNaN(n)) return n;
      }
    }
  }
  return 0;
}

function pickTotalAmountFromRoomObjectOnly(room0: Record<string, unknown>): number | null {
  const direct =
    extractNumberFromAmountLike(room0.amount) ?? extractNumberFromAmountLike(room0.total);
  if (direct != null) return direct;
  const keys = ["totalAmount", "total_amount", "totalPrice", "total_price", "grandTotal", "price"];
  for (const k of keys) {
    const v = room0[k];
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function summarizeAiosellRoomLine(
  room: Record<string, unknown>,
  index: number
): Record<string, unknown> {
  const rc = pickRoomCode(room, []);
  const rpc = pickRateplanCode(room, []);
  const perRoom = pickTotalAmountFromRoomObjectOnly(room);
  const amountKeys = ["amount", "total", "totalAmount", "total_amount", "totalPrice", "grandTotal", "price"].filter(
    (k) => room[k] != null && room[k] !== ""
  );
  return {
    index,
    roomCode: rc ?? null,
    rateplanCode: rpc ?? null,
    amount_numeric_on_room: perRoom,
    amount_fields_present: amountKeys,
  };
}

function splitMoneyAcrossParts(total: number, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [Math.round(total * 100) / 100];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}

/**
 * Soma `rooms[].prices[].sellRate` (formato doc. Aiosell: tarifa diária por quarto).
 * Usado como peso proporcional para multi-quarto quando os quartos não têm um campo `amount` direto.
 * Retorna null se o quarto não tiver o array `prices` ou se nenhuma tarifa for válida.
 */
function sumRoomSellRates(room: Record<string, unknown>): number | null {
  const prices = room.prices;
  if (!Array.isArray(prices) || prices.length === 0) return null;
  let sum = 0;
  let hasAny = false;
  for (const p of prices as Record<string, unknown>[]) {
    const sr = p.sellRate ?? p.sell_rate ?? p.rate ?? p.price;
    if (sr != null) {
      const n = Number(sr);
      if (!Number.isNaN(n) && n > 0) {
        sum += n;
        hasAny = true;
      }
    }
  }
  return hasAny ? sum : null;
}

function computePerRoomAmounts(
  rooms: Record<string, unknown>[],
  room0: Record<string, unknown>,
  body: Record<string, unknown>,
  layers: Record<string, unknown>[]
): { amounts: number[]; strategy: "per_room_lines" | "split_booking_total" | "prices_proportional" } {
  if (rooms.length === 0) return { amounts: [], strategy: "split_booking_total" };

  // 1ª prioridade: campo de valor direto por quarto (e.g. room.amount, room.totalAmount)
  const per = rooms.map((r) => pickTotalAmountFromRoomObjectOnly(r));
  const allSet = per.length > 0 && per.every((a) => a != null && !Number.isNaN(a));
  if (allSet) {
    return { amounts: per.map((a) => a as number), strategy: "per_room_lines" };
  }

  const bookingTotal = pickTotalAmount(room0, body, layers);

  // 2ª prioridade: distribuição proporcional via rooms[].prices[].sellRate (doc. Aiosell)
  // Ex.: Room A com sellRate diário 500, Room B com 1000 → split 1/3 : 2/3 do total com impostos
  if (rooms.length > 1) {
    const pricesRates = rooms.map((r) => sumRoomSellRates(r));
    const allHavePrices = pricesRates.every((s) => s != null && (s as number) > 0);
    if (allHavePrices && bookingTotal > 0) {
      const totalRates = (pricesRates as number[]).reduce((a, b) => a + b, 0);
      const amounts = (pricesRates as number[]).map(
        (s) => Math.round((s / totalRates) * bookingTotal * 100) / 100
      );
      return { amounts, strategy: "prices_proportional" };
    }
  }

  // 3ª prioridade: divisão igualitária do total da reserva
  return { amounts: splitMoneyAcrossParts(bookingTotal, rooms.length), strategy: "split_booking_total" };
}

function otaReservationCodeForRoom(bookingId: string, roomIndex: number, multiRoom: boolean): string {
  return multiRoom ? `${bookingId}#${roomIndex}` : bookingId;
}

async function listOtaRowsForAiosellBooking(
  supabase: SupabaseClient,
  channelId: string,
  bookingId: string
): Promise<{ id: string; reservation_id: string; ota_reservation_code: string }[]> {
  const { data, error } = await supabase
    .from("ota_reservations")
    .select("id, reservation_id, ota_reservation_code")
    .eq("ota_channel_id", channelId)
    .like("ota_reservation_code", `${bookingId}%`);
  if (error || !data?.length) return [];
  return data.filter(
    (r) =>
      r.ota_reservation_code === bookingId || String(r.ota_reservation_code).startsWith(`${bookingId}#`)
  );
}

const OTA_BOOKING_ID_LOOKUP_KEYS = [
  "bookingId",
  "booking_id",
  "otaBookingId",
  "cmBookingId",
  "cm_booking_id",
  "confirmationNumber",
  "confirmationNo",
  "reference",
  "externalBookingId",
] as const;

async function listOtaRowsForAiosellPayloadLookup(
  supabase: SupabaseClient,
  channelId: string,
  layers: Record<string, unknown>[],
): Promise<{ id: string; reservation_id: string; ota_reservation_code: string }[]> {
  const tried = new Set<string>();
  for (const k of OTA_BOOKING_ID_LOOKUP_KEYS) {
    const v = firstNonEmptyString(layers, [k]);
    if (!v || tried.has(v)) continue;
    tried.add(v);
    const rows = await listOtaRowsForAiosellBooking(supabase, channelId, v);
    if (rows.length) return rows;
  }
  return [];
}

function findChannelPricingMapping(
  roomCode: string | undefined,
  rateplanCode: string | undefined,
  pricingRows: {
    channel_room_code?: unknown;
    channel_rate_plan_code?: unknown;
    category_id?: unknown;
    pricing_plan_id?: unknown;
  }[] | null
): { category_id: string; pricing_plan_id?: string | null } | null {
  if (!roomCode) return null;
  let mapping = (pricingRows || []).find(
    (p) =>
      p.channel_room_code &&
      String(p.channel_room_code).toUpperCase() === String(roomCode).toUpperCase() &&
      channelRateplanMatchesAiosell(p.channel_rate_plan_code, rateplanCode)
  );
  if (!mapping) {
    mapping = (pricingRows || []).find(
      (p) =>
        p.channel_room_code &&
        String(p.channel_room_code).toUpperCase() === String(roomCode).toUpperCase()
    );
  }
  if (!mapping?.category_id) return null;
  return { category_id: mapping.category_id as string, pricing_plan_id: (mapping.pricing_plan_id as string) ?? null };
}

/**
 * Mensagens & Cobranças: espelha `useReservations` ao criar reserva no PMS.
 * Reservas Aiosell chegam com `status: pending` e `channel: ota`; o cliente só disparava com `confirmed`.
 */
async function maybeSendCheckinChargeAutomationsForAiosellReservation(
  supabase: SupabaseClient,
  reservationId: string,
  establishmentId: string,
  logPrefix: string,
): Promise<void> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return;

  const postIntent = async (intent: "checkin_reminder" | "payment_pending") => {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-checkin-charge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, intent }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      results?: Array<{ success?: boolean; error?: string }>;
      error?: string;
    };
    const first = data.results?.[0];
    if (!res.ok || !first?.success) {
      console.warn(`${logPrefix}: send-checkin-charge ${intent}`, first?.error ?? data.error ?? res.statusText);
    }
  };

  const { data: config } = await supabase
    .from("checkin_charge_config")
    .select("send_timing")
    .eq("establishment_id", establishmentId)
    .eq("enabled", true)
    .maybeSingle();

  if (!config) return;

  const { data: row } = await supabase
    .from("reservations")
    .select("status, total_amount, paid_amount, channel")
    .eq("id", reservationId)
    .maybeSingle();

  if (!row) return;

  const status = String(row.status ?? "");
  const ch = String(row.channel ?? "direct");
  const isOta = ch !== "direct";

  const checkinEligibleStatus =
    status === "confirmed" || (isOta && (status === "pending" || status === "preregistration"));

  const total = Number(row.total_amount ?? 0);
  const paid = Number(row.paid_amount ?? 0);
  const hasPendingPayment = total > 0 && paid < total;

  // Evita 2 mensagens na mesma criação OTA:
  // se há pendência, prioriza "payment_pending" e não envia "checkin_reminder".
  if (hasPendingPayment) {
    await postIntent("payment_pending");
    return;
  }

  if (config.send_timing === "after_confirmation" && checkinEligibleStatus) {
    await postIntent("checkin_reminder");
  }

  if (
    config.send_timing === "after_ota" &&
    isOta &&
    checkinEligibleStatus
  ) {
    await postIntent("checkin_reminder");
  }
}

/**
 * Mensagens & Cobranças: dispara evento específico (modificação / cancelamento / overbooking)
 * para reservas que chegam do canal Aiosell.
 *
 * Diferente de `maybeSendCheckinChargeAutomationsForAiosellReservation` (que trata criação),
 * esta função envia notificações de ciclo de vida: reserva modificada, cancelada ou overbooking.
 * Fire-and-forget — erros são apenas logados para não interromper o fluxo principal.
 */
async function maybeSendCheckinChargeEventForAiosell(
  supabase: SupabaseClient,
  reservationIds: string[],
  establishmentId: string,
  logPrefix: string,
  intent: "reservation_cancelled" | "reservation_modified" | "reservation_overbooking"
): Promise<void> {
  if (reservationIds.length === 0) return;
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return;

  const { data: config } = await supabase
    .from("checkin_charge_config")
    .select("enabled")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (!config?.enabled) return;

  for (const reservationId of reservationIds) {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-checkin-charge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, intent }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      results?: Array<{ success?: boolean; error?: string }>;
      error?: string;
    };
    const first = data.results?.[0];
    if (!res.ok || !first?.success) {
      console.warn(
        `${logPrefix}: send-checkin-charge ${intent} ${reservationId}`,
        first?.error ?? data.error ?? res.statusText
      );
    }
  }
}

async function createChannelReservationNotification(
  supabase: SupabaseClient,
  args: {
    establishmentId: string;
    reservationId: string;
    reservationCode: string | null;
    guestName: string | null;
    managerName?: string | null;
    partnerName?: string | null;
  }
): Promise<void> {
  const manager = String(args.managerName ?? "Aiosell").trim() || "Aiosell";
  const partner = String(args.partnerName ?? "não informado").trim() || "não informado";
  const guest = String(args.guestName ?? "Hóspede").trim() || "Hóspede";
  const code = String(args.reservationCode ?? "").trim();
  const prefix = code ? `Nova reserva ${code}` : "Nova reserva";
  await supabase.rpc("create_notification_for_establishment", {
    p_establishment_id: args.establishmentId,
    p_type: "new_reservation",
    p_title: "Nova Reserva de Canal",
    p_message: `${prefix} de ${guest} via ${manager} / ${partner}`,
    p_priority: "medium",
    p_metadata: {
      reservation_id: args.reservationId,
      reservation_code: code || null,
      channel_manager: manager,
      source_channel: partner,
      source: "aiosell_channel",
    },
  });
}

async function notifyEstablishmentAiosellReservationModified(
  supabase: SupabaseClient,
  args: {
    establishmentId: string;
    reservationId: string;
    guestName: string;
    partnerName?: string | null;
    bookingRef: string;
    checkIn: string;
    checkOut: string;
  },
): Promise<void> {
  const partner = String(args.partnerName ?? "canal").trim() || "canal";
  const { data: row } = await supabase
    .from("reservations")
    .select("reservation_code")
    .eq("id", args.reservationId)
    .maybeSingle();
  const code = String((row as { reservation_code?: string | null } | null)?.reservation_code ?? "").trim();
  const head = code ? `Reserva ${code}` : "Reserva de canal";
  const { error } = await supabase.rpc("create_notification_for_establishment", {
    p_establishment_id: args.establishmentId,
    p_type: "reservation_modified",
    p_title: "Reserva alterada (Aiosell)",
    p_message: `${head} — ${args.guestName} (${args.checkIn} a ${args.checkOut}) atualizada via ${partner}. Ref. ${args.bookingRef}.`,
    p_priority: "medium",
    p_metadata: {
      reservation_id: args.reservationId,
      reservation_code: code || null,
      source: "aiosell_channel",
      lifecycle: "modify",
      booking_ref: args.bookingRef,
    },
  });
  if (error) {
    console.warn("notifyEstablishmentAiosellReservationModified: create_notification_for_establishment", error);
    throw new Error(error.message);
  }
}

/** Cancel e modify Aiosell → Tratativas; `AIOSELL_AUTO_APPLY_CANCEL_MODIFY=true` aplica na hora. */
function aiosellLifecycleQueueEnabled(): boolean {
  return !envFlagTrue("AIOSELL_AUTO_APPLY_CANCEL_MODIFY");
}

function fmtAiosellMoneyDisplay(n: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function buildAiosellModifyQueueProcessingMeta(
  supabase: SupabaseClient,
  args: {
    reservationId: string;
    otaChannelId: string;
    incomingGuestName: string;
    incomingCheckIn?: string;
    incomingCheckOut?: string;
    incomingRoomCode?: string;
    incomingRateplanCode?: string;
    incomingTotal: number;
    incomingPrepaid: boolean;
    partnerChannelName?: string | null;
    multiRoomCount: number;
  },
): Promise<Record<string, unknown>> {
  const details: { field: string; before: string; after: string }[] = [];

  const { data: cur } = await supabase
    .from("reservations")
    .select("checkin_date, checkout_date, guest_name, total_amount, paid_amount, payment_status, room_categories(name)")
    .eq("id", args.reservationId)
    .maybeSingle();

  const row = cur as {
    checkin_date?: string;
    checkout_date?: string;
    guest_name?: string | null;
    total_amount?: number | null;
    paid_amount?: number | null;
    payment_status?: string | null;
    room_categories?: { name?: string | null } | null;
  } | null;

  const prevGuest = String(row?.guest_name ?? "").trim() || "—";
  const prevIn = String(row?.checkin_date ?? "").trim() || "—";
  const prevOut = String(row?.checkout_date ?? "").trim() || "—";
  const prevTotal = Number(row?.total_amount ?? 0);
  const prevPaid = Number(row?.paid_amount ?? 0);
  const prevPayStatus = String(row?.payment_status ?? "").trim() || "—";
  const prevCat = String(row?.room_categories?.name ?? "").trim() || "—";

  const incGuest = String(args.incomingGuestName ?? "").trim() || "—";
  const pushIfDiff = (field: string, before: string, after: string) => {
    if (before !== after) details.push({ field, before, after });
  };

  pushIfDiff("Hóspede", prevGuest, incGuest);

  const incInRaw = String(args.incomingCheckIn ?? "").trim();
  const incOutRaw = String(args.incomingCheckOut ?? "").trim();
  if (incInRaw) pushIfDiff("Check-in", prevIn, incInRaw);
  if (incOutRaw) pushIfDiff("Check-out", prevOut, incOutRaw);

  pushIfDiff("Valor total (PMS → proposto pelo canal)", fmtAiosellMoneyDisplay(prevTotal), fmtAiosellMoneyDisplay(args.incomingTotal));

  const { data: pricingRows } = await supabase
    .from("channel_pricing")
    .select("category_id, channel_room_code, channel_rate_plan_code, pricing_plan_id")
    .eq("ota_channel_id", args.otaChannelId)
    .eq("is_active", true);

  const mapping = findChannelPricingMapping(args.incomingRoomCode, args.incomingRateplanCode, pricingRows || []);
  let newCatName = "";
  if (mapping?.category_id) {
    const { data: cat } = await supabase
      .from("room_categories")
      .select("name")
      .eq("id", mapping.category_id)
      .maybeSingle();
    newCatName = String(cat?.name ?? "").trim();
  }
  const codesLabel = `${args.incomingRoomCode || "—"} / ${args.incomingRateplanCode || "—"}`;
  const afterCat =
    newCatName ||
    (args.incomingRoomCode ? `Sem mapeamento em Tarifas por canal (${codesLabel})` : "—");
  pushIfDiff("Categoria no PMS (atual → após mapear códigos do canal)", prevCat, afterCat);

  details.push({
    field: "Códigos quarto / tarifa (canal)",
    before: "—",
    after: codesLabel,
  });

  const prepBefore = `${prevPayStatus || "—"} · já pago ${fmtAiosellMoneyDisplay(prevPaid)}`;
  const prepAfter = args.incomingPrepaid ? "Canal indica pré-pago" : "Canal não indica pré-pago";
  pushIfDiff("Pagamento (estado PMS vs canal)", prepBefore, prepAfter);

  if (args.partnerChannelName) {
    details.push({
      field: "Parceiro OTA",
      before: "—",
      after: formatPartnerChannelName(args.partnerChannelName),
    });
  }

  if (args.multiRoomCount > 1) {
    details.push({
      field: "Quartos no payload",
      before: "—",
      after: String(args.multiRoomCount),
    });
  }

  return { modification_details: details };
}

async function queueAiosellLifecycleRevision(
  supabase: SupabaseClient,
  args: {
    channel: Record<string, unknown>;
    establishmentId: string;
    bookingId: string;
    revisionStatus: "cancelled" | "modified";
    body: Record<string, unknown>;
    lifecycle: "cancel" | "modify";
    reservationId: string;
    processingMeta?: Record<string, unknown>;
  },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const revId = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    source: "aiosell_lifecycle",
    lifecycle: args.lifecycle,
    rawBody: args.body,
  };
  if (args.processingMeta && Object.keys(args.processingMeta).length > 0) {
    payload._processing_meta = args.processingMeta;
  }
  const { error: insErr } = await supabase.from("channex_booking_revisions").insert({
    ota_channel_id: args.channel.id,
    establishment_id: args.establishmentId,
    revision_id: revId,
    booking_id: null,
    unique_id: String(args.bookingId),
    system_id: "aiosell",
    status: args.revisionStatus,
    payload,
    reservation_id: args.reservationId,
    process_status: "pending",
  });
  if (insErr) {
    console.warn("aiosell-reservations-sync queue lifecycle revision", insErr);
    return { status: 500, json: { success: false, error: insErr.message } };
  }
  const msg =
    args.lifecycle === "cancel"
      ? "Cancelamento enfileirado — confirme em Tratativas."
      : "Alteração enfileirada — confirme em Tratativas.";
  return {
    status: 200,
    json: {
      success: true,
      queued: true,
      revision_id: revId,
      message: msg,
      action: args.lifecycle,
    },
  };
}

async function applyAiosellReservationPayload(
  supabase: SupabaseClient,
  channel: Record<string, unknown>,
  body: Record<string, unknown>,
  opts?: {
    logPrefix?: string;
    requestPathname?: string;
    incomingRequest?: Request | null;
    skipLifecycleQueue?: boolean;
  }
): Promise<{ status: number; json: Record<string, unknown> }> {
  const logPrefix = opts?.logPrefix ?? "aiosell-reservations-sync";

  const layers = collectLayers(body);
  let action = normalizeActionFromLayers(layers);
  const pathLower = (opts?.requestPathname ?? "").toLowerCase();
  if (!action) {
    if (pathLower.includes("reservation/cancel")) action = "cancel";
    else if (pathLower.includes("reservation/modify")) action = "modify";
  }
  const bookingId = pickBookingIdFromLayers(layers);

  const guest = pickGuestObject(layers);
  const rooms = pickRoomsFromLayers(layers);
  const room0 = rooms[0] || {};
  const roomGuest =
    room0.guest && typeof room0.guest === "object" && !Array.isArray(room0.guest)
      ? (room0.guest as Record<string, unknown>)
      : {};
  const guestMerged = { ...guest, ...roomGuest };
  const guestName = buildAiosellGuestName(body, layers, guestMerged, room0);
  const meta = pickAiosellBookingMeta(body, layers);
  const guestPhone = pickGuestPhone(guestMerged);
  const guestAddr = guestAddressJson(guestMerged.address);

  const checkInRaw = pickCheckIn(room0, layers);
  const checkOutRaw = pickCheckOut(room0, layers);
  const checkIn = normalizeAiosellDateField(checkInRaw) ?? checkInRaw;
  const checkOut = normalizeAiosellDateField(checkOutRaw) ?? checkOutRaw;

  const roomCode = pickRoomCode(room0, layers);
  const rateplanCode = pickRateplanCode(room0, layers);

  const totalOnRoom0Only = pickTotalAmountFromRoomObjectOnly(room0);
  const roomSummaryLines = rooms.map((r, i) => summarizeAiosellRoomLine(r, i));
  console.info(
    `${logPrefix} booking_payload_shape`,
    JSON.stringify({
      booking_id: bookingId ?? null,
      action: action || "(empty)",
      rooms_count: rooms.length,
      room_lines: roomSummaryLines,
      room0_only_amount: totalOnRoom0Only,
      mapped_room_code: roomCode ?? null,
      mapped_rateplan_code: rateplanCode ?? null,
    })
  );

  const establishmentId = channel.establishment_id as string;

  const { data: hotelSettings } = await supabase
    .from("hotel_settings")
    .select("checkin_time, checkout_time")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (action.includes("cancel")) {
    const otaRows = await listOtaRowsForAiosellPayloadLookup(supabase, channel.id as string, layers);
    if (otaRows.length === 0) {
      return {
        status: 404,
        json: { success: false, error: "Reserva OTA não encontrada (confirme bookingId / cmBookingId no payload)" },
      };
    }
    const bookingRef =
      (bookingId && String(bookingId).trim()) ||
      String(otaRows[0].ota_reservation_code).replace(/#.*$/, "") ||
      "";
    if (!opts?.skipLifecycleQueue && aiosellLifecycleQueueEnabled()) {
      return queueAiosellLifecycleRevision(supabase, {
        channel,
        establishmentId,
        bookingId: bookingRef,
        revisionStatus: "cancelled",
        body,
        lifecycle: "cancel",
        reservationId: otaRows[0].reservation_id,
      });
    }
    const ids = otaRows.map((r) => r.reservation_id);
    void maybeSendCheckinChargeEventForAiosell(
      supabase, ids, establishmentId, logPrefix, "reservation_cancelled"
    ).catch((e) => console.warn(`${logPrefix}: checkin-charge reservation_cancelled`, e));
    const { error: updErr } = await supabase.from("reservations").update({ status: "cancelled" }).in("id", ids);
    if (updErr) {
      return { status: 500, json: { success: false, error: updErr.message } };
    }
    return {
      status: 200,
      json: {
        success: true,
        message: "Reservation Cancelled Successfully",
        action: "cancel",
        reservation_id: ids[0],
        reservation_ids: ids,
        cancelled_count: ids.length,
      },
    };
  }

  if (action.includes("modify") || action.includes("update")) {
    const otaRows = await listOtaRowsForAiosellPayloadLookup(supabase, channel.id as string, layers);
    if (otaRows.length === 0) {
      return {
        status: 404,
        json: { success: false, error: "Reserva OTA não encontrada (confirme bookingId / cmBookingId no payload)" },
      };
    }
    const bookingRef =
      (bookingId && String(bookingId).trim()) ||
      String(otaRows[0].ota_reservation_code).replace(/#.*$/, "") ||
      "";
    if (!opts?.skipLifecycleQueue && aiosellLifecycleQueueEnabled()) {
      const incomingTotal = pickTotalAmount(room0, body, layers);
      const incomingPrepaid = isAiosellPrepaidBooking(layers, body);
      const processingMeta = await buildAiosellModifyQueueProcessingMeta(supabase, {
        reservationId: otaRows[0].reservation_id,
        otaChannelId: channel.id as string,
        incomingGuestName: guestName,
        incomingCheckIn: checkIn,
        incomingCheckOut: checkOut,
        incomingRoomCode: roomCode,
        incomingRateplanCode: rateplanCode,
        incomingTotal,
        incomingPrepaid,
        partnerChannelName: meta.sourceChannel,
        multiRoomCount: rooms.length,
      });
      return queueAiosellLifecycleRevision(supabase, {
        channel,
        establishmentId,
        bookingId: bookingRef,
        revisionStatus: "modified",
        body,
        lifecycle: "modify",
        reservationId: otaRows[0].reservation_id,
        processingMeta,
      });
    }
    let checkInM = checkIn;
    let checkOutM = checkOut;
    if (!checkInM || !checkOutM) {
      const { data: curRes } = await supabase
        .from("reservations")
        .select("checkin_date, checkout_date")
        .eq("id", otaRows[0].reservation_id)
        .maybeSingle();
      checkInM = checkInM || (curRes?.checkin_date as string | undefined) || undefined;
      checkOutM = checkOutM || (curRes?.checkout_date as string | undefined) || undefined;
    }
    if (!checkInM || !checkOutM) {
      return { status: 400, json: { success: false, error: "Datas obrigatÃ³rias para alteraÃ§Ã£o" } };
    }
    let checkInFinal = normalizeAiosellDateField(checkInM) ?? checkInM;
    let checkOutFinal = normalizeAiosellDateField(checkOutM) ?? checkOutM;
    if (!isValidPmsStayRange(checkInFinal, checkOutFinal)) {
      const { data: curDates } = await supabase
        .from("reservations")
        .select("checkin_date, checkout_date")
        .eq("id", otaRows[0].reservation_id)
        .maybeSingle();
      const fbCi =
        normalizeAiosellDateField(curDates?.checkin_date as string | undefined) ??
        String(curDates?.checkin_date ?? "").trim();
      const fbCo =
        normalizeAiosellDateField(curDates?.checkout_date as string | undefined) ??
        String(curDates?.checkout_date ?? "").trim();
      if (isValidPmsStayRange(fbCi, fbCo)) {
        checkInFinal = fbCi;
        checkOutFinal = fbCo;
      } else {
        return {
          status: 400,
          json: {
            success: false,
            error:
              "Período inválido: check-out deve ser posterior ao check-in. Corrija o envio do canal ou as datas na reserva.",
          },
        };
      }
    }
    const amt = room0.amount ?? room0.totalAmount ?? body.totalAmount ?? body.amount;
    const numAmt = extractNumberFromAmountLike(amt) ?? (amt != null && amt !== "" ? Number(amt) : NaN);
    const modifyPrepaid = isAiosellPrepaidBooking(layers, body);
    const n = otaRows.length;
    const amountParts =
      numAmt != null && !Number.isNaN(numAmt) && n > 1 ? splitMoneyAcrossParts(numAmt, n) : null;

    const { data: pricingRowsModify } = await supabase
      .from("channel_pricing")
      .select("category_id, pricing_plan_id, channel_room_code, channel_rate_plan_code")
      .eq("ota_channel_id", channel.id)
      .eq("is_active", true);

    for (let i = 0; i < otaRows.length; i++) {
      const roomLine = rooms[i] || room0;
      const rc = pickRoomCode(roomLine, layers);
      const rpc = pickRateplanCode(roomLine, layers);
      let mapping: { category_id: string; pricing_plan_id?: string | null } | null = null;
      if (rc) {
        const m = findChannelPricingMapping(rc, rpc, pricingRowsModify || []);
        if (!m?.category_id) {
          return {
            status: 400,
            json: {
              success: false,
              error: `Mapeamento não encontrado para alteração (${rc} / ${rpc ?? "—"}). Configure Tarifas por canal.`,
            },
          };
        }
        mapping = m;
      }

      const { data: curRow } = await supabase
        .from("reservations")
        .select("category_id, room_id, establishment_id")
        .eq("id", otaRows[i].reservation_id)
        .maybeSingle();

      const patch: Record<string, unknown> = {
        checkin_date: checkInFinal,
        checkout_date: checkOutFinal,
        guest_name: guestName,
      };
      if (numAmt != null && !Number.isNaN(numAmt)) {
        const part = amountParts ? amountParts[i] : numAmt;
        patch.total_amount = part;
        if (modifyPrepaid && part > 0) {
          patch.paid_amount = part;
          patch.payment_status = "paid";
        }
      }

      if (mapping) {
        const newCat = mapping.category_id;
        const oldCat = String(curRow?.category_id ?? "");
        patch.category_id = newCat;
        if (mapping.pricing_plan_id) {
          patch.pricing_plan_id = mapping.pricing_plan_id;
        }
        if (newCat !== oldCat) {
          const estId = String(curRow?.establishment_id ?? establishmentId);
          const newRoomId = await findAvailableRoomForAiosellCategoryChange(supabase, {
            establishmentId: estId,
            categoryId: newCat,
            checkin: checkInFinal,
            checkout: checkOutFinal,
            excludeReservationId: otaRows[i].reservation_id,
            currentRoomId: curRow?.room_id as string | null | undefined,
          });
          if (!newRoomId) {
            return {
              status: 400,
              json: {
                success: false,
                error:
                  "Sem quarto disponível na nova categoria neste período. Libere um quarto no mapa ou atribua manualmente antes de aplicar.",
              },
            };
          }
          patch.room_id = newRoomId;
        }
      }

      const { error: updErr } = await supabase
        .from("reservations")
        .update(patch)
        .eq("id", otaRows[i].reservation_id);
      if (updErr) {
        return { status: 500, json: { success: false, error: updErr.message } };
      }
    }

    await supabase
      .from("ota_reservations")
      .update({
        ota_guest_name: guestName,
        ota_guest_email: (guestMerged.email as string) || null,
        ota_guest_phone: guestPhone,
        ota_source_channel_name: meta.sourceChannel,
        ota_segment: meta.segment,
        ota_cm_booking_id: meta.cmBookingId,
        ota_special_requests: meta.specialRequests,
        ota_guest_address: guestAddr,
      })
      .eq("ota_channel_id", channel.id)
      .in("id", otaRows.map((r) => r.id));

    if (modifyPrepaid && numAmt != null && !Number.isNaN(numAmt) && numAmt > 0) {
      for (let i = 0; i < otaRows.length; i++) {
        const part = amountParts ? amountParts[i] : numAmt;
        if (part > 0) {
          const payErr = await insertAiosellChannelPrepaidPayment(supabase, {
            reservationId: otaRows[i].reservation_id,
            establishmentId,
            amount: part,
            bookingId: `${bookingRef}#${i}`,
            partnerChannelName: meta.sourceChannel,
            otaPrepaid: true,
          });
          if (payErr.error) {
            console.warn(`${logPrefix} prepaid payment (modify)`, payErr.error);
          }
        }
      }
    }
    try {
      await notifyEstablishmentAiosellReservationModified(supabase, {
        establishmentId,
        reservationId: otaRows[0].reservation_id,
        guestName,
        partnerName: meta.sourceChannel,
        bookingRef,
        checkIn: checkInFinal,
        checkOut: checkOutFinal,
      });
    } catch (e) {
      console.warn(`${logPrefix} notification reserva modificada`, e);
    }
    // Mensagens & Cobranças: avisa hóspede(s) que a reserva foi modificada pelo canal.
    void maybeSendCheckinChargeEventForAiosell(
      supabase,
      otaRows.map((r) => r.reservation_id),
      establishmentId,
      logPrefix,
      "reservation_modified"
    ).catch((e) => console.warn(`${logPrefix}: checkin-charge reservation_modified`, e));
    return {
      status: 200,
      json: {
        success: true,
        message: "Reservation Modified Successfully",
        action: "modify",
        reservation_id: otaRows[0].reservation_id,
        reservation_ids: otaRows.map((r) => r.reservation_id),
        updated_count: otaRows.length,
      },
    };
  }

  if (!bookingId) {
    console.warn(`${logPrefix} 400: bookingId ausente`, { rootKeys: Object.keys(body) });
    return { status: 400, json: { success: false, error: "bookingId obrigatÃ³rio" } };
  }
  if (!checkIn || !checkOut) {
    console.warn(`${logPrefix} 400: datas ausentes`, {
      hasCheckIn: !!checkIn,
      hasCheckOut: !!checkOut,
      rootKeys: Object.keys(body),
    });
    return { status: 400, json: { success: false, error: "checkIn/checkOut obrigatÃ³rios" } };
  }

  const prepaid = isAiosellPrepaidBooking(layers, body);
  const bookingTotal = pickTotalAmount(room0, body, layers);

  const { data: pricingRows } = await supabase
    .from("channel_pricing")
    .select("category_id, pricing_plan_id, channel_room_code, channel_rate_plan_code")
    .eq("ota_channel_id", channel.id)
    .eq("is_active", true);

  if (rooms.length > 1) {
    const { data: ex0 } = await supabase
      .from("ota_reservations")
      .select("reservation_id")
      .eq("ota_channel_id", channel.id)
      .eq("ota_reservation_code", `${String(bookingId)}#0`)
      .maybeSingle();
    if (ex0?.reservation_id) {
      return {
        status: 200,
        json: {
          success: true,
          action: "book",
          already_exists: true,
          multi_room: true,
          reservation_id: ex0.reservation_id,
        },
      };
    }

    for (let i = 0; i < rooms.length; i++) {
      const rc = pickRoomCode(rooms[i], layers);
      const rpc = pickRateplanCode(rooms[i], layers);
      const mapping = findChannelPricingMapping(rc, rpc, pricingRows || []);
      if (!rc || !mapping?.category_id) {
        return {
          status: 400,
          json: {
            success: false,
            error: !rc
              ? `roomCode obrigatÃ³rio (quarto ${i + 1})`
              : `Mapeamento nÃ£o encontrado para o quarto ${i + 1} (${rc} / ${rpc ?? "â€”"}).`,
          },
        };
      }
    }

    const { amounts, strategy } = computePerRoomAmounts(rooms, room0, body, layers);
    console.info(
      `${logPrefix} book_amount_resolution`,
      JSON.stringify({
        booking_id: bookingId,
        booking_total: bookingTotal,
        per_room_amounts: amounts,
        split_strategy: strategy,
        prepaid,
        rooms_count: rooms.length,
        multi_room: true,
      })
    );

    const baseNotes = buildAiosellReservationNotes(String(bookingId), meta);
    const createdIds: string[] = [];

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const rc = pickRoomCode(room, layers);
      const rpc = pickRateplanCode(room, layers);
      const mapping = findChannelPricingMapping(rc, rpc, pricingRows || [])!;
      const ciRaw = pickCheckIn(room, layers) || checkIn;
      const coRaw = pickCheckOut(room, layers) || checkOut;
      const ci = normalizeAiosellDateField(ciRaw) ?? ciRaw;
      const co = normalizeAiosellDateField(coRaw) ?? coRaw;

      const rg =
        room.guest && typeof room.guest === "object" && !Array.isArray(room.guest)
          ? (room.guest as Record<string, unknown>)
          : {};
      const guestMerged_i = { ...guest, ...rg };
      const guestName_i = buildAiosellGuestName(body, layers, guestMerged_i, room);
      const guestPhone_i = pickGuestPhone(guestMerged_i);
      const guestAddr_i = guestAddressJson(guestMerged_i.address);

      const occ =
        room.occupancy && typeof room.occupancy === "object" && !Array.isArray(room.occupancy)
          ? (room.occupancy as Record<string, unknown>)
          : {};
      const total_i = amounts[i] ?? 0;
      const roomLabel = ` Â· Quarto ${i + 1}/${rooms.length} (Aiosell)`;
      const reservationData: Record<string, unknown> = {
        guest_name: guestName_i,
        adults: Number(room.adults ?? occ.adults ?? body.adults ?? 2),
        children: Number(room.children ?? occ.children ?? body.children ?? 0),
        total_amount: total_i,
        paid_amount: prepaid && total_i > 0 ? total_i : 0,
        payment_status: prepaid && total_i > 0 ? "paid" : "pending",
        status: "pending",
        channel: "ota",
        notes: prepaid
          ? `${baseNotes}${roomLabel} · Pagamento: pré-pago (OTA)`
          : `${baseNotes}${roomLabel}`,
        checkin_time: hotelSettings?.checkin_time ?? null,
        checkout_time: hotelSettings?.checkout_time ?? null,
      };
      if (mapping.pricing_plan_id) {
        reservationData.pricing_plan_id = mapping.pricing_plan_id;
      }

      const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_reservation_with_lock", {
        p_reservation_data: reservationData,
        p_checkin_date: ci,
        p_checkout_date: co,
        p_establishment_id: establishmentId,
        p_room_id: null,
        p_category_id: mapping.category_id,
      });

      if (rpcErr) {
        return { status: 500, json: { success: false, error: rpcErr.message } };
      }

      let resRpc = rpcResult as { success?: boolean; error?: string; reservation_id?: string };
      if (typeof rpcResult === "string") {
        try {
          resRpc = JSON.parse(rpcResult) as typeof resRpc;
        } catch {
          return { status: 500, json: { success: false, error: "Resposta RPC invÃ¡lida" } };
        }
      }
      if (!resRpc?.success) {
        console.warn(`${logPrefix} 400: create_reservation_with_lock`, {
          rpcMessage: resRpc?.error ?? null,
          room_index: i,
        });
        return { status: 400, json: { success: false, error: resRpc?.error || "Falha ao criar reserva" } };
      }

      const rid = resRpc.reservation_id as string;
      createdIds.push(rid);

      const otaCode = otaReservationCodeForRoom(String(bookingId), i, true);
      const { error: otaInsErr } = await supabase.from("ota_reservations").insert({
        reservation_id: rid,
        ota_channel_id: channel.id,
        ota_reservation_code: otaCode,
        ota_guest_name: guestName_i,
        ota_guest_email: (guestMerged_i.email as string) || null,
        ota_guest_phone: guestPhone_i,
        ota_source_channel_name: meta.sourceChannel,
        ota_segment: meta.segment,
        ota_cm_booking_id: meta.cmBookingId,
        ota_special_requests: meta.specialRequests,
        ota_guest_address: guestAddr_i,
        sync_status: "synced",
        synced_at: new Date().toISOString(),
      });

      if (otaInsErr) {
        return {
          status: 500,
          json: { success: false, error: `Reserva criada mas vÃ­nculo OTA falhou: ${otaInsErr.message}` },
        };
      }

      try {
        const { data: reservationRow } = await supabase
          .from("reservations")
          .select("reservation_code")
          .eq("id", rid)
          .maybeSingle();
        await createChannelReservationNotification(supabase, {
          establishmentId,
          reservationId: rid,
          reservationCode: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
          guestName: guestName_i,
          managerName: "Aiosell",
          partnerName: meta.sourceChannel,
        });
      } catch (e) {
        console.warn(`${logPrefix} reservation notification`, e);
      }

      if (prepaid && total_i > 0) {
        const payErr = await insertAiosellChannelPrepaidPayment(supabase, {
          reservationId: rid,
          establishmentId,
          amount: total_i,
          bookingId: otaCode,
          partnerChannelName: meta.sourceChannel,
          otaPrepaid: true,
        });
        if (payErr.error) {
          console.warn(`${logPrefix} prepaid payment insert`, payErr.error);
        }
      }

      try {
        await notifyGuestAfterOtaReservationBooked(supabase, rid, {
          request: opts?.incomingRequest ?? null,
          logPrefix,
        });
      } catch (e) {
        console.warn(`${logPrefix} guest notification email`, e);
      }

      try {
        await maybeSendCheckinChargeAutomationsForAiosellReservation(supabase, rid, establishmentId, logPrefix);
      } catch (e) {
        console.warn(`${logPrefix} checkin-charge automations`, e);
      }
    }

    return {
      status: 200,
      json: {
        success: true,
        message: "Reservation Updated Successfully",
        action: "book",
        multi_room: true,
        reservation_ids: createdIds,
        reservation_id: createdIds[0],
        rooms_created: createdIds.length,
        prepaid_recorded: prepaid && amounts.some((a) => a > 0),
      },
    };
  }

  if (!roomCode) {
    console.warn(`${logPrefix} 400: roomCode ausente`, { rootKeys: Object.keys(body) });
    return { status: 400, json: { success: false, error: "roomCode obrigatÃ³rio" } };
  }

  const { data: existingOta } = await supabase
    .from("ota_reservations")
    .select("reservation_id")
    .eq("ota_channel_id", channel.id)
    .eq("ota_reservation_code", String(bookingId))
    .maybeSingle();

  if (existingOta?.reservation_id) {
    return {
      status: 200,
      json: {
        success: true,
        action: "book",
        already_exists: true,
        reservation_id: existingOta.reservation_id,
      },
    };
  }

  const mapping = findChannelPricingMapping(roomCode, rateplanCode, pricingRows || []);

  if (!mapping?.category_id) {
    console.warn(`${logPrefix} 400: mapeamento channel_pricing`, {
      roomCode,
      rateplanCode: rateplanCode ?? null,
    });
    return {
      status: 400,
      json: {
        success: false,
        error:
          "Mapeamento nÃ£o encontrado: configure Tarifa por Canal com Room Code / Rate Plan Code para este canal Aiosell",
      },
    };
  }

  const total = bookingTotal;
  console.info(
    `${logPrefix} book_amount_resolution`,
    JSON.stringify({
      booking_id: bookingId,
      total_amount_used_for_pms: total,
      total_on_room0_object_only: totalOnRoom0Only,
      prepaid,
      rooms_count: rooms.length,
    })
  );

  const occ = room0.occupancy && typeof room0.occupancy === "object" && !Array.isArray(room0.occupancy)
    ? (room0.occupancy as Record<string, unknown>)
    : {};
  const baseNotes = buildAiosellReservationNotes(String(bookingId), meta);
  const reservationData: Record<string, unknown> = {
    guest_name: guestName,
    adults: Number(room0.adults ?? occ.adults ?? body.adults ?? 2),
    children: Number(room0.children ?? occ.children ?? body.children ?? 0),
    total_amount: total,
    paid_amount: prepaid && total > 0 ? total : 0,
    payment_status: prepaid && total > 0 ? "paid" : "pending",
    status: "pending",
    channel: "ota",
    notes: prepaid ? `${baseNotes} · Pagamento: pré-pago (OTA)` : baseNotes,
    checkin_time: hotelSettings?.checkin_time ?? null,
    checkout_time: hotelSettings?.checkout_time ?? null,
  };

  if (mapping.pricing_plan_id) {
    reservationData.pricing_plan_id = mapping.pricing_plan_id;
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_reservation_with_lock", {
    p_reservation_data: reservationData,
    p_checkin_date: checkIn,
    p_checkout_date: checkOut,
    p_establishment_id: establishmentId,
    p_room_id: null,
    p_category_id: mapping.category_id,
  });

  if (rpcErr) {
    return { status: 500, json: { success: false, error: rpcErr.message } };
  }

  let res = rpcResult as { success?: boolean; error?: string; reservation_id?: string };
  if (typeof rpcResult === "string") {
    try {
      res = JSON.parse(rpcResult) as typeof res;
    } catch {
      return { status: 500, json: { success: false, error: "Resposta RPC invÃ¡lida" } };
    }
  }
  if (!res?.success) {
    console.warn(`${logPrefix} 400: create_reservation_with_lock`, {
      rpcMessage: res?.error ?? null,
    });
    return { status: 400, json: { success: false, error: res?.error || "Falha ao criar reserva" } };
  }

  const rid = res.reservation_id as string;

  const { error: otaInsErr } = await supabase.from("ota_reservations").insert({
    reservation_id: rid,
    ota_channel_id: channel.id,
    ota_reservation_code: String(bookingId),
    ota_guest_name: guestName,
    ota_guest_email: (guestMerged.email as string) || null,
    ota_guest_phone: guestPhone,
    ota_source_channel_name: meta.sourceChannel,
    ota_segment: meta.segment,
    ota_cm_booking_id: meta.cmBookingId,
    ota_special_requests: meta.specialRequests,
    ota_guest_address: guestAddr,
    sync_status: "synced",
    synced_at: new Date().toISOString(),
  });

  if (otaInsErr) {
    return {
      status: 500,
      json: { success: false, error: `Reserva criada mas vÃ­nculo OTA falhou: ${otaInsErr.message}` },
    };
  }

  try {
    const { data: reservationRow } = await supabase
      .from("reservations")
      .select("reservation_code")
      .eq("id", rid)
      .maybeSingle();
    await createChannelReservationNotification(supabase, {
      establishmentId,
      reservationId: rid,
      reservationCode: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
      guestName,
      managerName: "Aiosell",
      partnerName: meta.sourceChannel,
    });
  } catch (e) {
    console.warn(`${logPrefix} reservation notification`, e);
  }

  if (prepaid && total > 0) {
    const payErr = await insertAiosellChannelPrepaidPayment(supabase, {
      reservationId: rid,
      establishmentId,
      amount: total,
      bookingId: String(bookingId),
      partnerChannelName: meta.sourceChannel,
      otaPrepaid: true,
    });
    if (payErr.error) {
      console.warn(`${logPrefix} prepaid payment insert`, payErr.error);
    }
  }

  try {
    await notifyGuestAfterOtaReservationBooked(supabase, rid, {
      request: opts?.incomingRequest ?? null,
      logPrefix,
    });
  } catch (e) {
    console.warn(`${logPrefix} guest notification email`, e);
  }

  try {
    await maybeSendCheckinChargeAutomationsForAiosellReservation(supabase, rid, establishmentId, logPrefix);
  } catch (e) {
    console.warn(`${logPrefix} checkin-charge automations`, e);
  }

  return {
    status: 200,
    json: {
      success: true,
      message: "Reservation Updated Successfully",
      action: "book",
      reservation_id: rid,
      prepaid_recorded: prepaid && total > 0,
    },
  };
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function basicAuthHeader(username: string, password: string): string {
  const token = btoa(unescape(encodeURIComponent(`${username}:${password}`)));
  return `Basic ${token}`;
}

/**
 * Junta URL base do canal com o path do endpoint (mesma regra que aiosell-sync).
 */
function joinBaseUrlAndPath(base: string, path: string): string {
  const b = (base || "").trim().replace(/\/$/, "");
  let p = (path ?? "").trim();
  if (!p.startsWith("/")) p = `/${p}`;
  try {
    if (/^\/api\/v2\/cm\//i.test(p)) {
      return `${new URL(b).origin}${p}`;
    }
  } catch {
    /* base invÃ¡lida */
  }
  const baseEndsWithCm = /\/cm$/i.test(b);
  if (baseEndsWithCm && /^\/cm(\/|$)/i.test(p)) {
    p = p.replace(/^\/cm/i, "");
    if (!p.startsWith("/")) p = `/${p}`;
  }
  let out = `${b}${p}`;
  out = out.replace(/(\/cm)\/cm(\/)/gi, "$1$2");
  return out;
}

function normalizeChannelCodeInput(s: unknown): string {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function extractBookingsArray(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    for (const k of ["bookings", "reservations", "data", "items", "results", "records"]) {
      const v = o[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

function addDaysIso(d: Date, days: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x.toISOString().split("T")[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ success: false, error: "NÃ£o autorizado" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ success: false, error: "SessÃ£o invÃ¡lida ou expirada" }, 401);
  }

  const supabaseAdmin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
  const db = supabaseAdmin ?? supabaseUser;

  let body: {
    channel_id?: string;
    establishment_id?: string;
    bookings?: unknown[];
    pull?: boolean;
    days?: number;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "JSON invÃ¡lido" }, 400);
  }

  const channelId = body.channel_id;
  if (!channelId) {
    return jsonResponse({ success: false, error: "channel_id obrigatÃ³rio" }, 400);
  }

  const { data: channel, error: channelError } = await db.from("ota_channels").select("*").eq("id", channelId).single();

  if (channelError || !channel) {
    return jsonResponse({ success: false, error: "Canal nÃ£o encontrado" }, 404);
  }

  if (channel.channel_manager_type !== "aiosell") {
    return jsonResponse({ success: false, error: "Canal nÃ£o Ã© Aiosell" }, 400);
  }

  const fromChannel = channel.establishment_id as string | null;
  const fromBody = body.establishment_id ?? null;
  const establishmentId = (fromChannel || fromBody) as string | null;

  if (!establishmentId) {
    return jsonResponse(
      {
        success: false,
        error: "establishment_id em falta ou canal sem estabelecimento.",
      },
      400
    );
  }

  if (fromChannel && fromBody && fromChannel !== fromBody) {
    return jsonResponse({ success: false, error: "establishment_id nÃ£o coincide com o canal." }, 400);
  }

  const { data: canAccess, error: accessRpcError } = await supabaseUser.rpc("user_can_access_establishment", {
    p_user_id: user.id,
    p_establishment_id: establishmentId,
  });

  if (accessRpcError) {
    return jsonResponse(
      {
        success: false,
        error: `NÃ£o foi possÃ­vel validar permissÃ£o: ${accessRpcError.message}`,
      },
      500
    );
  }
  if (canAccess !== true) {
    return jsonResponse({ success: false, error: "Sem permissÃ£o para este estabelecimento" }, 403);
  }

  const days = Math.min(365, Math.max(0, Number(body.days ?? 0) || 0));
  const daysBack = days || 30;
  const daysAhead = days || 90;

  let bookings: Record<string, unknown>[] = [];

  if (Array.isArray(body.bookings) && body.bookings.length > 0) {
    bookings = body.bookings.filter((b) => b && typeof b === "object") as Record<string, unknown>[];
  } else if (body.pull === true) {
    const listPath = (channel as { aiosell_bookings_list_path?: string | null }).aiosell_bookings_list_path?.trim();
    if (!listPath) {
      return jsonResponse(
        {
          success: false,
          error:
            "Preencha `aiosell_bookings_list_path` no canal (endpoint GET fornecido pela Aiosell) ou envie `bookings: [...]` no corpo.",
          hint:
            "A documentaÃ§Ã£o pÃºblica Aiosell descreve apenas o webhook push; o endpoint de listagem depende do contrato com o suporte Aiosell.",
        },
        400
      );
    }

    const apiUser = channel.api_key as string | null;
    const apiPass = channel.api_secret as string | null;
    const hotelCodeRaw = (channel.aiosell_hotel_code as string | null)?.trim() || null;
    const hotelCode = hotelCodeRaw ? normalizeChannelCodeInput(hotelCodeRaw) : null;

    if (!apiUser || !apiPass || !hotelCode) {
      return jsonResponse(
        {
          success: false,
          error: "Configure api_key, api_secret e aiosell_hotel_code no canal para pull HTTP.",
        },
        400
      );
    }

    const baseUrl = (channel.aiosell_base_url as string) || "https://live.aiosell.com";
    const url = joinBaseUrlAndPath(baseUrl, listPath);
    const u = new URL(url);
    const fromDate = addDaysIso(new Date(), -daysBack);
    const toDate = addDaysIso(new Date(), daysAhead);
    if (!u.searchParams.has("hotelCode")) u.searchParams.set("hotelCode", hotelCode);
    if (!u.searchParams.has("fromDate")) u.searchParams.set("fromDate", fromDate);
    if (!u.searchParams.has("toDate")) u.searchParams.set("toDate", toDate);

    const res = await fetch(u.toString(), {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(apiUser, apiPass),
        Accept: "application/json",
      },
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Resposta do canal nÃ£o Ã© JSON",
          status: res.status,
          preview: text.slice(0, 400),
        },
        502
      );
    }

    if (!res.ok) {
      return jsonResponse(
        {
          success: false,
          error: `HTTP ${res.status} ao obter reservas`,
          body: parsed,
        },
        502
      );
    }

    bookings = extractBookingsArray(parsed);
  } else {
    return jsonResponse(
      {
        success: false,
        error: "Envie `bookings` (array de payloads) ou `pull: true` com `aiosell_bookings_list_path` configurado.",
      },
      400
    );
  }

  if (bookings.length === 0) {
    return jsonResponse({
      success: true,
      processed: 0,
      results: [],
      message: "Nenhuma reserva para processar.",
    });
  }

  const results: Record<string, unknown>[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let shouldPushAvailability = false;

  for (const item of bookings) {
    const r = await applyAiosellReservationPayload(db, channel as Record<string, unknown>, item, {
      logPrefix: "aiosell-reservations-sync",
      incomingRequest: req,
    });
    const j = r.json as Record<string, unknown>;
    const bid = String((item as { bookingId?: unknown }).bookingId ?? (item as { cmBookingId?: unknown }).cmBookingId ?? "");
    if (r.status >= 200 && r.status < 300 && j.success) {
      if (j.already_exists) skipped++;
      else if (j.action === "book") created++;
      const action = String(j.action ?? "");
      if (j.queued === true) {
        // Inventário só após aplicar na Tratativas (webhook apply_revision).
      } else if (action === "cancel" || action === "modify") {
        shouldPushAvailability = true;
      } else if (action === "book" && !j.already_exists) {
        shouldPushAvailability = true;
      }
      results.push({ bookingId: bid || null, booking_id: bid || null, status: "ok", ...j });
    } else {
      failed++;
      results.push({
        bookingId: bid || null,
        booking_id: bid || null,
        status: "error",
        httpStatus: r.status,
        error: j.error ?? j,
      });
    }
  }

  if (
    shouldPushAvailability &&
    !envFlagTrue("AIOSELL_SKIP_POST_INVENTORY_SYNC") &&
    (channel as { sync_enabled?: unknown }).sync_enabled !== false &&
    (channel as { is_active?: unknown }).is_active !== false
  ) {
    const est = (channel as { establishment_id?: unknown }).establishment_id as string | undefined;
    if (est) {
      scheduleAiosellAvailabilitySync({
        channelId: String((channel as { id: unknown }).id),
        establishmentId: est,
        logPrefix: "aiosell-reservations-sync",
      });
    }
  }

  return jsonResponse({
    success: true,
    processed: bookings.length,
    created,
    skipped,
    failed,
    results,
  });
});