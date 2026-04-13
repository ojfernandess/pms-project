import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Inlined: Supabase deploy bundle só inclui este ficheiro (importações relativas falham). ---

/**
 * Handlebars-like e-mail templates: `{{var}}`, `{{#if}}`, `{{#each}}`, `{{{raw}}}`.
 * Inlined in this file because some Supabase deploy paths only upload `index.ts`. Aligned with `src/lib/emailTemplateEngine.ts`.
 */

interface TemplateVariables {
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
function processTemplate(template: string, variables: TemplateVariables): string {
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

function detectBaseUrl(req: Request | null = null, supabaseUrl: string | null = null): string {
  // 1. Tentar variÃƒÆ’Ã‚Â¡vel de ambiente SITE_URL (prioridade mÃƒÆ’Ã‚Â¡xima)
  const siteUrl = Deno.env.get("SITE_URL");
  if (siteUrl) {
    console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Usando SITE_URL: ${siteUrl}`);
    return siteUrl;
  }

  // 2. Verificar variÃƒÆ’Ã‚Â¡veis de ambiente de plataformas de produÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
  // Vercel
  const vercelUrl = Deno.env.get("VERCEL_URL");
  if (vercelUrl) {
    const url = `https://${vercelUrl}`;
    console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Usando VERCEL_URL: ${url}`);
    return url;
  }

  // Render
  const renderUrl = Deno.env.get("RENDER_EXTERNAL_URL");
  if (renderUrl) {
    console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Usando RENDER_EXTERNAL_URL: ${renderUrl}`);
    return renderUrl;
  }

  // Netlify
  const netlifyUrl = Deno.env.get("URL");
  if (netlifyUrl) {
    console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Usando Netlify URL: ${netlifyUrl}`);
    return netlifyUrl;
  }

  // Railway
  const railwayUrl = Deno.env.get("RAILWAY_PUBLIC_DOMAIN");
  if (railwayUrl) {
    const url = `https://${railwayUrl}`;
    console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Usando RAILWAY_PUBLIC_DOMAIN: ${url}`);
    return url;
  }

  // 3. Tentar extrair do header Referer ou Origin se disponÃƒÆ’Ã‚Â­vel (ÃƒÆ’Ã‚Âºtil para webhooks)
  if (req) {
    const referer = req.headers.get("referer");
    const origin = req.headers.get("origin");
    
    if (origin) {
      try {
        const url = new URL(origin);
        // Verificar se nÃƒÆ’Ã‚Â£o ÃƒÆ’Ã‚Â© localhost
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Usando Origin header: ${url.origin}`);
        return url.origin;
        }
      } catch {
        // Ignorar erro
      }
    }
    
    if (referer) {
      try {
        const url = new URL(referer);
        // Verificar se nÃƒÆ’Ã‚Â£o ÃƒÆ’Ã‚Â© localhost
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Usando Referer header: ${url.origin}`);
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
        console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Detectado localhost via SUPABASE_URL: http://localhost:8080`);
        return "http://localhost:8080";
      }
      
      // Se for um projeto Supabase (.supabase.co), tentar inferir domÃƒÆ’Ã‚Â­nio de produÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
      if (hostname.includes('.supabase.co')) {
        // Extrair o ID do projeto do hostname
        // Exemplo: xxxxxx.supabase.co -> pode inferir domÃƒÆ’Ã‚Â­nio customizado se configurado
        // Por enquanto, vamos tentar usar variÃƒÆ’Ã‚Â¡veis de ambiente ou inferir
        console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Detectado Supabase Cloud, tentando inferir domÃƒÆ’Ã‚Â­nio de produÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o...`);
      }
      
      // Se nÃƒÆ’Ã‚Â£o for um domÃƒÆ’Ã‚Â­nio .supabase.co, pode ser um domÃƒÆ’Ã‚Â­nio customizado
      if (!hostname.includes('.supabase.co')) {
        // Tentar inferir removendo subdomÃƒÆ’Ã‚Â­nios como 'api', 'app', etc.
        const parts = hostname.split('.');
        if (parts.length > 2) {
          // Remover subdomÃƒÆ’Ã‚Â­nios como 'api', 'app', etc.
          const domain = parts.slice(-2).join('.');
          const inferredUrl = `${url.protocol}//${domain}`;
          console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] DomÃƒÆ’Ã‚Â­nio customizado inferido: ${inferredUrl}`);
          return inferredUrl;
        } else {
          // Se for um domÃƒÆ’Ã‚Â­nio direto, usar como estÃƒÆ’Ã‚Â¡
          const directUrl = `${url.protocol}//${hostname}`;
          console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Usando domÃƒÆ’Ã‚Â­nio direto do SUPABASE_URL: ${directUrl}`);
          return directUrl;
        }
      }
    } catch {
      // Ignorar erro
    }
  }

  // 5. Verificar variÃƒÆ’Ã‚Â¡vel de ambiente de ambiente (NODE_ENV, DENO_ENV, etc.)
  const env = Deno.env.get("ENVIRONMENT") || Deno.env.get("NODE_ENV") || Deno.env.get("DENO_ENV");
  if (env === "production" || env === "prod") {
    // Em produÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o, tentar usar o SUPABASE_URL como base
    if (supabaseUrlEnv) {
      try {
        const url = new URL(supabaseUrlEnv);
        // Se nÃƒÆ’Ã‚Â£o for localhost, tentar inferir
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Ambiente de produÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o detectado, usando SUPABASE_URL como base`);
          // Retornar apenas o protocolo e hostname (sem path)
          return `${url.protocol}//${url.hostname}`;
        }
      } catch {
        // Ignorar erro
      }
    }
  }

  // 6. ÃƒÆ’Ã…Â¡ltimo fallback: detectar baseado no SUPABASE_URL
  // Se SUPABASE_URL contÃƒÆ’Ã‚Â©m localhost, usar localhost
  if (supabaseUrlEnv && (supabaseUrlEnv.includes('localhost') || supabaseUrlEnv.includes('127.0.0.1'))) {
    console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Fallback: Detectado localhost, usando http://localhost:8080`);
    return "http://localhost:8080";
  }

  // 7. Se chegou aqui e nÃƒÆ’Ã‚Â£o ÃƒÆ’Ã‚Â© localhost, tentar inferir domÃƒÆ’Ã‚Â­nio de produÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
  // Por padrÃƒÆ’Ã‚Â£o, se nÃƒÆ’Ã‚Â£o conseguir detectar, usar localhost (mais seguro para desenvolvimento)
  console.log(`ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â [detectBaseUrl] Fallback final: Usando localhost (desenvolvimento)`);
  return "http://localhost:8080";
}

function otaGuestNameFromReservation(reservation: Record<string, unknown>): string | null {
  const ota = reservation?.ota_reservations;
  const row = Array.isArray(ota) ? ota[0] : ota;
  const n = (row as Record<string, unknown> | undefined)?.ota_guest_name;
  if (n != null && String(n).trim() !== "") return String(n).trim();
  const gn = reservation?.guest_name;
  return gn != null && String(gn).trim() !== "" ? String(gn).trim() : null;
}
function formatDatePt(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
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
    "HÃƒÂ³spede";

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

async function buildOtaGuestEmailVariables(
  supabase: SupabaseClient,
  args: {
    reservationId: string;
    establishmentId: string;
    eventType: "reservation.created" | "payment.confirmed";
    req?: Request | null;
  },
): Promise<TemplateVariables | null> {
  const reservation = await fetchReservationFull(supabase, args.reservationId);
  if (!reservation) return null;

  const { data: hotelSettings } = await supabase
    .from("hotel_settings")
    .select("*")
    .eq("establishment_id", args.establishmentId)
    .maybeSingle();

  const { data: siteSettings } = await supabase
    .from("site_settings")
    .select("logo_url, pms_base_url")
    .maybeSingle();

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  let baseUrl = detectBaseUrl(args.req ?? null, supabaseUrl);
  const pmsRaw = (siteSettings as { pms_base_url?: string } | null)?.pms_base_url?.trim();
  if (pmsRaw) {
    try {
      baseUrl = new URL(
        pmsRaw.startsWith("http://") || pmsRaw.startsWith("https://") ? pmsRaw : `https://${pmsRaw}`,
      ).origin;
    } catch {
      baseUrl = pmsRaw;
    }
  }

  return await buildVariables(
    supabase,
    reservation,
    hotelSettings,
    siteSettings,
    baseUrl,
    args.eventType,
  );
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_SETTINGS_FEATURE_ROW = "00000000-0000-0000-0000-000000000001";

type AnyObj = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ensureString(v: unknown) {
  return String(v ?? "").trim();
}

function nestedValue(obj: AnyObj | null | undefined, path: string): unknown {
  if (!obj) return undefined;
  const parts = path.split(".");
  let cursor: unknown = obj;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as AnyObj)[part];
  }
  return cursor;
}

function parseIsoMs(value: unknown): number | null {
  const raw = ensureString(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function parseDateOnly(value: unknown): Date | null {
  const raw = ensureString(value).slice(0, 10);
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetweenUtc(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay);
}

function parseDaysFromText(raw: unknown): number | null {
  const text = ensureString(raw).toLowerCase();
  if (!text) return null;
  const match = text.match(/(\d+)\s*dias?/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

async function applyChannelCancellationWithPolicy(
  supabase: ReturnType<typeof createClient>,
  args: {
    reservationId: string;
    reason: string;
  },
): Promise<{ penalty: number; policyId: string | null; details: AnyObj | null }> {
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, checkin_date, checkout_date, total_amount, pricing_plan_id, cancellation_policy_id")
    .eq("id", args.reservationId)
    .maybeSingle();

  if (!reservation?.id) {
    return { penalty: 0, policyId: null, details: null };
  }

  let policyId = ensureString((reservation as AnyObj).cancellation_policy_id) || null;
  if (!policyId) {
    const pricingPlanId = ensureString((reservation as AnyObj).pricing_plan_id);
    if (pricingPlanId) {
      const { data: pricingPlan } = await supabase
        .from("pricing_plans")
        .select("cancellation_policy_id")
        .eq("id", pricingPlanId)
        .maybeSingle();
      policyId = ensureString((pricingPlan as AnyObj | null)?.cancellation_policy_id) || null;
    }
  }

  let penalty = 0;
  let details: AnyObj | null = null;
  if (policyId) {
    const { data: policy } = await supabase
      .from("cancellation_policies")
      .select("*")
      .eq("id", policyId)
      .eq("is_active", true)
      .maybeSingle();
    if (policy) {
      const totalAmount = Math.max(0, Number((reservation as AnyObj).total_amount ?? 0));
      const checkin = parseDateOnly((reservation as AnyObj).checkin_date);
      const checkout = parseDateOnly((reservation as AnyObj).checkout_date);
      const today = parseDateOnly(new Date().toISOString()) ?? new Date();
      const nights =
        checkin && checkout ? Math.max(1, daysBetweenUtc(checkin, checkout)) : 1;
      const firstNight = totalAmount > 0 ? totalAmount / nights : 0;
      const daysBeforeCheckin = checkin ? daysBetweenUtc(today, checkin) : 0;

      const hasFree = Boolean((policy as AnyObj).has_free_cancellation);
      const freeDeadlineDays = parseDaysFromText((policy as AnyObj).free_cancellation_deadline);
      const insideFreeWindow =
        hasFree && freeDeadlineDays != null ? daysBeforeCheckin >= freeDeadlineDays : false;

      let feeType = ensureString((policy as AnyObj).cancellation_fee_type).toLowerCase();
      let feePct = Number((policy as AnyObj).cancellation_fee_percentage ?? 0);
      if (hasFree && !insideFreeWindow) {
        const afterType = ensureString((policy as AnyObj).cancellation_fee_after_deadline_type).toLowerCase();
        const afterPct = Number((policy as AnyObj).cancellation_fee_after_deadline_percentage ?? 0);
        if (afterType) feeType = afterType;
        if (afterPct > 0) feePct = afterPct;
      }

      if (insideFreeWindow) {
        penalty = 0;
      } else if (feeType === "percentage" && feePct > 0) {
        penalty = (totalAmount * feePct) / 100;
      } else if (feeType === "first_night") {
        penalty = firstNight;
      } else {
        penalty = 0;
      }

      penalty = Math.max(0, Math.min(totalAmount, Number(penalty.toFixed(2))));
      details = {
        source: "channex_channel",
        computed_at: new Date().toISOString(),
        has_free_cancellation: hasFree,
        free_deadline_days: freeDeadlineDays,
        days_before_checkin: daysBeforeCheckin,
        inside_free_window: insideFreeWindow,
        fee_type: feeType || null,
        fee_percentage: feeType === "percentage" ? feePct : null,
        first_night_amount: firstNight,
        total_amount: totalAmount,
        penalty,
      };
    }
  }

  const { data: updatedRows, error: updateErr } = await supabase
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: args.reason,
      cancellation_penalty: penalty,
      cancellation_policy_applied: policyId,
      cancellation_calculation_details: details,
      notes: args.reason,
    })
    .eq("id", args.reservationId)
    .select("id");

  if (updateErr) {
    throw new Error(`Falha ao cancelar reserva no PMS: ${updateErr.message}`);
  }
  if (!updatedRows?.length) {
    throw new Error(
      "Nenhuma reserva foi atualizada (id inválido ou linha inexistente). Verifique o vínculo ota_reservations / revisão Channex.",
    );
  }

  return { penalty, policyId, details };
}

function normalizeRevisionStatus(raw: unknown): "new" | "modified" | "cancelled" | "" {
  const s = ensureString(raw).toLowerCase();
  if (!s) return "";
  if (s === "new" || s === "booked" || s === "created") return "new";
  if (s === "modified" || s === "modify" || s === "updated" || s === "update") return "modified";
  if (s === "cancelled" || s === "canceled" || s === "cancel") return "cancelled";
  return "";
}

function isRoomCancelled(room: AnyObj): boolean {
  const v = room.is_cancelled;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "1", "yes"].includes(v.toLowerCase());
  if (typeof v === "number") return v === 1;
  return false;
}

function deriveRevisionStatus(attrs: AnyObj, hasExistingReservation: boolean): "new" | "modified" | "cancelled" {
  const direct = normalizeRevisionStatus(attrs.status);
  if (direct) return direct;

  const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
  if (rooms.length > 0 && rooms.every((r) => isRoomCancelled(r))) return "cancelled";

  return hasExistingReservation ? "modified" : "new";
}

function pickEmailTemplateForEstablishment(
  allTemplates: AnyObj[] | null,
  establishmentId: string,
): AnyObj | null {
  if (!allTemplates?.length) return null;
  const matchesEstablishment = (raw: unknown): boolean => {
    if (raw === null || raw === undefined) return false;
    if (Array.isArray(raw)) return raw.map(String).includes(establishmentId);
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.map(String).includes(establishmentId);
      } catch {
        return false;
      }
    }
    return false;
  };
  for (const template of allTemplates) {
    if (matchesEstablishment(template.establishment_ids)) return template;
  }
  for (const template of allTemplates) {
    const establishmentIds = template.establishment_ids;
    if (establishmentIds === null || establishmentIds === undefined) return template;
    if (Array.isArray(establishmentIds) && establishmentIds.length === 0) return template;
  }
  return null;
}

/** E-mail em CC/BCC: colunas são TEXT; normaliza arrays JSON vindos do PostgREST. */
function ccBccToText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  if (Array.isArray(v)) {
    const t = v.map((x) => String(x).trim()).filter(Boolean).join(", ");
    return t || null;
  }
  const t = String(v).trim();
  return t || null;
}

/** Channex / OTAs variam os campos do hóspede; cobrir mail, guests e aninhamentos comuns. */
function channexGuestEmailFromPayload(customer: AnyObj, firstGuest: AnyObj | null, attrs: AnyObj): string | null {
  const candidates: unknown[] = [
    customer.mail,
    customer.email,
    customer.e_mail,
    (customer as AnyObj).E_mail,
    nestedValue(customer, "contact.mail"),
    nestedValue(customer, "contact.email"),
    firstGuest?.mail,
    firstGuest?.email,
    firstGuest ? nestedValue(firstGuest as AnyObj, "contact.email") : undefined,
    firstGuest ? nestedValue(firstGuest as AnyObj, "contact.mail") : undefined,
    attrs.customer_email,
    attrs.guest_email,
    nestedValue(attrs, "customer.mail"),
    nestedValue(attrs, "customer.email"),
  ];
  for (const c of candidates) {
    const s = ensureString(c);
    if (s.includes("@")) return s;
  }
  return null;
}

/** Igual ao fluxo Aiosell: respeita `features_enabled.email` por estabelecimento. */
function isFeatureEnabledForEstablishmentEmail(featureConfig: unknown, establishmentId: string): boolean {
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

/** Envia item da `email_queue` na hora (SMTP / Resend / Sendgrid), como `aiosell-reservations-sync`. */
async function dispatchChannexOtaQueuedEmail(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  emailSettings: AnyObj,
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
    console.warn(`${logPrefix}: fila email — item não encontrado`, queueId);
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
    const provider = String(emailSettings.provider ?? "").toLowerCase();
    if (provider === "smtp") {
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

    if (provider === "resend") {
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

    if (provider === "sendgrid") {
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

async function queueChannelReservationEmail(
  supabase: ReturnType<typeof createClient>,
  args: {
    reservationId: string;
    establishmentId: string;
    guestName: string;
    guestEmail: string | null;
    otaGuestEmail: string | null;
    totalAmount: number;
    paidAmount: number;
    checkinDate?: string | null;
    checkoutDate?: string | null;
    reservationCode?: string | null;
  },
): Promise<void> {
  let recipientEmail = ensureString(args.guestEmail) || ensureString(args.otaGuestEmail);
  if (!recipientEmail && args.reservationId) {
    const { data: resRow } = await supabase
      .from("reservations")
      .select("guest_id, client_id")
      .eq("id", args.reservationId)
      .maybeSingle();
    const cid = ensureString((resRow as AnyObj | null)?.guest_id) || ensureString((resRow as AnyObj | null)?.client_id);
    if (cid) {
      const { data: cl } = await supabase.from("clients").select("email").eq("id", cid).maybeSingle();
      recipientEmail = ensureString((cl as AnyObj | null)?.email);
    }
  }
  if (!recipientEmail) return;

  const { data: siteRow } = await supabase
    .from("site_settings")
    .select("features_enabled")
    .eq("id", SITE_SETTINGS_FEATURE_ROW)
    .maybeSingle();

  const emailFeature = (siteRow?.features_enabled as AnyObj | undefined)?.email;
  if (!isFeatureEnabledForEstablishmentEmail(emailFeature, args.establishmentId)) {
    console.warn(
      "channex-reservations-sync: e-mail OTA desativado para o estabelecimento (site_settings.features_enabled.email)",
    );
    return;
  }

  const { data: emailSettings } = await supabase.from("email_settings").select("*").eq("is_active", true).maybeSingle();
  if (!emailSettings) {
    console.warn("channex-reservations-sync: email_settings inativo ou ausente");
    return;
  }

  const eventType =
    args.paidAmount >= args.totalAmount && args.totalAmount > 0 ? "payment.confirmed" : "reservation.created";

  const { data: templates } = await supabase
    .from("email_templates")
    .select("*")
    .eq("event_type", eventType)
    .eq("is_active", true);

  const template = pickEmailTemplateForEstablishment((templates || []) as AnyObj[], args.establishmentId);
  if (!template) return;

  const variablesFromDb = await buildOtaGuestEmailVariables(supabase, {
    reservationId: args.reservationId,
    establishmentId: args.establishmentId,
    eventType: eventType as "reservation.created" | "payment.confirmed",
    req: null,
  });

  const vars: TemplateVariables = variablesFromDb ?? {
    guest_name: args.guestName || "Hóspede",
    reservation_code: String(args.reservationCode || ""),
    identification_number: String(args.reservationCode || ""),
    reservation_id: args.reservationId,
    checkin_date: String(args.checkinDate || ""),
    checkout_date: String(args.checkoutDate || ""),
    total_amount: String(args.totalAmount ?? 0),
    paid_amount: String(args.paidAmount ?? 0),
    hotel_address: "",
    hotel_phone: "",
    hotel_whatsapp: "",
    hotel_email: "",
    hotel_website: "",
  };

  const subject = processTemplate(String(template.subject || ""), vars);
  const bodyHtml = processTemplate(String(template.body_html || ""), vars);
  const ccText = ccBccToText(template.cc_emails);
  const bccText = ccBccToText(template.bcc_emails);

  const { data: queueId, error: queueError } = await supabase.rpc("insert_email_queue", {
    p_template_id: template.id,
    p_event_type: eventType,
    p_recipient_email: recipientEmail,
    p_recipient_name: args.guestName || "Hóspede",
    p_subject: subject,
    p_body_html: bodyHtml,
    p_reservation_id: args.reservationId,
    p_variables: vars,
    p_priority: 1,
    p_cc_emails: ccText,
    p_bcc_emails: bccText,
  });

  if (queueError || !queueId) {
    console.warn("channex-reservations-sync insert_email_queue", queueError);
    const { data: inserted, error: insErr } = await supabase
      .from("email_queue")
      .insert({
        template_id: template.id,
        event_type: eventType,
        recipient_email: recipientEmail,
        recipient_name: args.guestName || "Hóspede",
        subject,
        body_html: bodyHtml,
        reservation_id: args.reservationId,
        variables: vars,
        priority: 1,
        status: "pending",
        cc_emails: ccText,
        bcc_emails: bccText,
      })
      .select("id")
      .single();
    if (insErr || !inserted?.id) {
      console.warn("channex-reservations-sync email_queue direct insert", insErr);
      return;
    }
    await dispatchChannexOtaQueuedEmail(supabase, String(inserted.id), emailSettings as AnyObj, "channex-reservation-email");
    return;
  }

  await dispatchChannexOtaQueuedEmail(supabase, String(queueId), emailSettings as AnyObj, "channex-reservation-email");
}

function normalizePartnerKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isKnownOtaPartner(key: string): boolean {
  return [
    "booking",
    "bookingcom",
    "airbnb",
    "expedia",
    "decolar",
    "despegar",
    "hoteiscom",
    "hotelbeds",
    "tripcom",
    "agoda",
    "hostelworld",
  ].includes(key);
}

async function shouldApplyChannelAutoPayment(
  supabase: ReturnType<typeof createClient>,
  establishmentId: string,
  partnerChannelName?: string | null,
): Promise<boolean> {
  const { data: hotelSettings } = await supabase
    .from("hotel_settings")
    .select("auto_payment_ota, auto_payment_ota_channels")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  const autoEnabled = (hotelSettings as { auto_payment_ota?: boolean } | null)?.auto_payment_ota === true;
  if (!autoEnabled) return false;

  const allowedPartnersRaw = (hotelSettings as { auto_payment_ota_channels?: unknown } | null)?.auto_payment_ota_channels;
  const allowedPartners = Array.isArray(allowedPartnersRaw)
    ? allowedPartnersRaw.map((v) => normalizePartnerKey(String(v))).filter(Boolean)
    : [];
  const partnerKey = normalizePartnerKey(partnerChannelName ?? "");

  if (allowedPartners.length > 0) {
    const allowsOthers = allowedPartners.includes("outros") || allowedPartners.includes("others");
    const matchesKnown = !!partnerKey && allowedPartners.includes(partnerKey);
    const matchesOthers = allowsOthers && !!partnerKey && !isKnownOtaPartner(partnerKey);
    if (!(matchesKnown || matchesOthers)) return false;
  }

  return true;
}

async function insertChannelPrepaidPayment(
  supabase: ReturnType<typeof createClient>,
  args: {
    reservationId: string;
    establishmentId: string;
    amount: number;
    bookingId: string;
    managerName: string;
    partnerName?: string | null;
  },
): Promise<{ error: string | null }> {
  if (args.amount <= 0) return { error: null };

  const { data: hotelSettings } = await supabase
    .from("hotel_settings")
    .select("auto_payment_ota, auto_payment_carrier_id, auto_payment_channel_carrier_id, auto_payment_ota_channels")
    .eq("establishment_id", args.establishmentId)
    .maybeSingle();

  const autoEnabled = (hotelSettings as { auto_payment_ota?: boolean } | null)?.auto_payment_ota === true;
  if (!autoEnabled) return { error: null };

  const allowedPartnersRaw = (hotelSettings as { auto_payment_ota_channels?: unknown } | null)?.auto_payment_ota_channels;
  const allowedPartners = Array.isArray(allowedPartnersRaw)
    ? allowedPartnersRaw.map((v) => normalizePartnerKey(String(v))).filter(Boolean)
    : [];
  const partnerKey = normalizePartnerKey(args.partnerName);
  if (allowedPartners.length > 0) {
    const allowsOthers = allowedPartners.includes("outros") || allowedPartners.includes("others");
    const matchesKnown = !!partnerKey && allowedPartners.includes(partnerKey);
    const matchesOthers = allowsOthers && !!partnerKey && !isKnownOtaPartner(partnerKey);
    if (!(matchesKnown || matchesOthers)) return { error: null };
  }

  const configuredCarrierId =
    ((hotelSettings as { auto_payment_channel_carrier_id?: string | null } | null)?.auto_payment_channel_carrier_id) ||
    ((hotelSettings as { auto_payment_carrier_id?: string | null } | null)?.auto_payment_carrier_id) ||
    null;

  const marker = `Pré-pago via canal OTA (${args.managerName})`;
  const { data: existing } = await supabase
    .from("payments")
    .select("id, carrier_id")
    .eq("reservation_id", args.reservationId)
    .ilike("notes", `%${marker}%`)
    .maybeSingle();
  if (existing?.id) {
    const existingCarrier = String((existing as AnyObj).carrier_id ?? "").trim();
    if (!existingCarrier && configuredCarrierId) {
      const { error: patchErr } = await supabase
        .from("payments")
        .update({ carrier_id: configuredCarrierId })
        .eq("id", (existing as AnyObj).id);
      if (patchErr) return { error: patchErr.message };
    }
    return { error: null };
  }

  const notes = [
    marker,
    `bookingId: ${args.bookingId}`,
    args.partnerName ? `canal parceiro: ${args.partnerName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { error } = await supabase.from("payments").insert({
    reservation_id: args.reservationId,
    establishment_id: args.establishmentId,
    amount: args.amount,
    payment_method: "deposit",
    payment_date: new Date().toISOString(),
    carrier_id: configuredCarrierId,
    notes,
  });

  return { error: error?.message ?? null };
}

async function refundReservationPaymentsForModificationReprocess(
  supabase: ReturnType<typeof createClient>,
  reservationId: string,
): Promise<void> {
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id")
    .eq("reservation_id", reservationId);
  if (paymentsError) {
    throw new Error(`Falha ao buscar pagamentos para estorno: ${paymentsError.message}`);
  }
  if ((payments?.length ?? 0) === 0) return;

  const { error: deleteError } = await supabase
    .from("payments")
    .delete()
    .eq("reservation_id", reservationId);
  if (deleteError) {
    throw new Error(`Falha ao estornar pagamentos da reserva antiga: ${deleteError.message}`);
  }
}

async function createChannelReservationNotification(
  supabase: ReturnType<typeof createClient>,
  args: {
    establishmentId: string;
    reservationId: string;
    reservationCode: string | null;
    guestName: string | null;
    managerName?: string | null;
    partnerName?: string | null;
  },
): Promise<void> {
  const manager = String(args.managerName ?? "Channex").trim() || "Channex";
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
      source: "channex_channel",
    },
  });
}

async function createChannelReservationLifecycleNotification(
  supabase: ReturnType<typeof createClient>,
  args: {
    establishmentId: string;
    reservationId: string;
    reservationCode: string | null;
    guestName: string | null;
    managerName?: string | null;
    partnerName?: string | null;
    type: "reservation_modified" | "reservation_cancelled";
  },
): Promise<void> {
  const manager = String(args.managerName ?? "Channex").trim() || "Channex";
  const partner = String(args.partnerName ?? "não informado").trim() || "não informado";
  const guest = String(args.guestName ?? "Hóspede").trim() || "Hóspede";
  const code = String(args.reservationCode ?? "").trim();
  const prefix = code ? `Reserva ${code}` : "Reserva";
  const isCancelled = args.type === "reservation_cancelled";

  await supabase.rpc("create_notification_for_establishment", {
    p_establishment_id: args.establishmentId,
    p_type: args.type,
    p_title: isCancelled ? "Reserva de Canal Cancelada" : "Reserva de Canal Alterada",
    p_message: `${prefix} de ${guest} via ${manager} / ${partner} foi ${isCancelled ? "cancelada" : "alterada"}`,
    p_priority: "medium",
    p_metadata: {
      reservation_id: args.reservationId,
      reservation_code: code || null,
      channel_manager: manager,
      source_channel: partner,
      source: "channex_channel",
      action: isCancelled ? "cancelled" : "modified",
    },
  });
}

async function ensureWebCheckinRow(
  supabase: ReturnType<typeof createClient>,
  reservation: { id: string; reservation_code?: string | null; checkin_date?: string | null },
  establishmentId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("web_checkin")
    .select("id")
    .eq("reservation_id", reservation.id)
    .maybeSingle();
  if (existing?.id) return;

  const code = reservation.reservation_code;
  if (!code) return;

  const token = btoa(`${reservation.id}:${code}:${Date.now()}`).replace(/[^a-zA-Z0-9]/g, "").substring(0, 64);
  const checkinDateObj = reservation.checkin_date ? new Date(reservation.checkin_date) : new Date();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  if (checkinDateObj < expiresAt) expiresAt.setTime(checkinDateObj.getTime());

  await supabase.from("web_checkin").insert({
    reservation_id: reservation.id,
    establishment_id: establishmentId,
    token,
    locator: code,
    expires_at: expiresAt.toISOString(),
    status: "pending",
  });
}

async function maybeSendCheckinChargeAutomationsForChannelReservation(
  reservationId: string,
  establishmentId: string,
): Promise<void> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return;

  const postIntent = async (intent: "checkin_reminder" | "payment_pending") => {
    await fetch(`${supabaseUrl}/functions/v1/send-checkin-charge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, intent }),
    }).catch(() => undefined);
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
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
  const isOta = String(row.channel ?? "direct") !== "direct";
  const checkinEligibleStatus = status === "confirmed" || (isOta && (status === "pending" || status === "preregistration"));
  const total = Number(row.total_amount ?? 0);
  const paid = Number(row.paid_amount ?? 0);
  const hasPendingPayment = total > 0 && paid < total;

  if (hasPendingPayment) {
    await postIntent("payment_pending");
    return;
  }
  if (config.send_timing === "after_confirmation" && checkinEligibleStatus) await postIntent("checkin_reminder");
  if (config.send_timing === "after_ota" && isOta && checkinEligibleStatus) await postIntent("checkin_reminder");
}

async function maybeSendLifecycleTemplateForChannelReservation(
  reservationId: string,
  intent: "reservation_modified" | "reservation_cancelled" | "reservation_overbooking",
): Promise<void> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !reservationId) return;

  await fetch(`${supabaseUrl}/functions/v1/send-checkin-charge`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reservation_id: reservationId, intent }),
  }).catch((e) => {
    console.warn(`channex-reservations-sync lifecycle template warning (${intent})`, e);
  });
}

function isAvailabilityErrorMessage(raw: unknown): boolean {
  const msg = ensureString(raw).toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("nenhum quarto disponível") ||
    msg.includes("quarto não está disponível") ||
    msg.includes("nao está disponível") ||
    msg.includes("não está disponível") ||
    msg.includes("available_rooms")
  );
}

function isTruthyLike(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = ensureString(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

function hasNegativeModifierSignal(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasNegativeModifierSignal(item));
  const obj = value as Record<string, unknown>;
  const modifier = Number(obj.modifier);
  if (Number.isFinite(modifier) && modifier < 0) return true;
  for (const nested of Object.values(obj)) {
    if (hasNegativeModifierSignal(nested)) return true;
  }
  return false;
}

function detectChannexOverbooking(attrs: AnyObj, sourceEvent: string): boolean {
  if (sourceEvent === "booking_unmapped_room" || sourceEvent === "booking_unmapped_rate") return true;
  const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
  if (isTruthyLike(attrs.overbooking) || isTruthyLike(attrs.is_overbooking) || isTruthyLike(attrs.overbooked)) return true;
  if (isTruthyLike(attrs.overbook)) return true;
  if (rooms.some((r) => isTruthyLike(r.overbooking) || isTruthyLike(r.is_overbooking) || isTruthyLike(r.overbooked))) return true;
  const statusHint = ensureString(
    attrs.availability_status || attrs.booking_status || attrs.type || attrs.inventory_status || attrs.availability,
  ).toLowerCase();
  if (
    statusHint.includes("overbook") ||
    statusHint.includes("unavailable") ||
    statusHint.includes("no_availability") ||
    statusHint.includes("soldout") ||
    statusHint.includes("sold_out")
  ) {
    return true;
  }
  if (hasNegativeModifierSignal(attrs.values) || hasNegativeModifierSignal(attrs.availability_changes)) return true;
  return false;
}

function isPmsOverbookingRelocationRevision(attrs: AnyObj): boolean {
  const bookingMeta = ((attrs.meta as AnyObj | undefined) ?? {}) as AnyObj;
  if (bookingMeta.pms_overbooking_reallocation === true) return true;
  const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
  for (const room of rooms) {
    const roomMeta = (((room as AnyObj).meta as AnyObj | undefined) ?? {}) as AnyObj;
    if (roomMeta.pms_overbooking_reallocation === true) return true;
  }
  return false;
}

function extractOccupancyInfo(attrs: AnyObj, firstRoom: AnyObj): { adults: number; children: number; ages: number[] } {
  const occ = ((attrs.occupancy as AnyObj | undefined) ?? (firstRoom.occupancy as AnyObj | undefined) ?? {}) as AnyObj;
  const adultsRaw = Number(occ.adults ?? 2);
  const childrenRaw = Number(occ.children ?? 0);
  const adults = Number.isFinite(adultsRaw) && adultsRaw >= 0 ? Math.floor(adultsRaw) : 2;
  const children = Number.isFinite(childrenRaw) && childrenRaw >= 0 ? Math.floor(childrenRaw) : 0;
  const ages = Array.isArray(occ.ages)
    ? occ.ages
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 0)
        .map((n) => Math.floor(n))
    : [];
  return { adults, children, ages };
}

function extractChannexNotes(attrs: AnyObj, firstRoom: AnyObj): string[] {
  const notesCandidates = [
    attrs.notes,
    attrs.note,
    attrs.comments,
    attrs.comment,
    attrs.remarks,
    attrs.message,
    (firstRoom as AnyObj).notes,
    (firstRoom as AnyObj).comment,
    (firstRoom as AnyObj).remarks,
  ];
  return notesCandidates
    .map((v) => ensureString(v))
    .filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);
}

function mergeReservationNotes(existing: unknown, managedLines: string[]): string {
  const rawExisting = ensureString(existing);
  const startMarker = "[CHANNEX_SYNC]";
  const endMarker = "[/CHANNEX_SYNC]";
  const normalizedManagedLines = managedLines.filter(Boolean);
  const managedBlock = normalizedManagedLines.join("\n");
  if (!rawExisting) return managedBlock;

  const start = rawExisting.indexOf(startMarker);
  const end = rawExisting.indexOf(endMarker);
  if (start >= 0 && end > start) {
    const before = rawExisting.slice(0, start).trim();
    const after = rawExisting.slice(end + endMarker.length).trim();
    return [before, managedBlock, after].filter(Boolean).join("\n\n");
  }

  const existingLines = rawExisting
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !normalizedManagedLines.includes(l));
  return [...existingLines, ...normalizedManagedLines].filter(Boolean).join("\n");
}

async function createOverbookingReservationFallback(
  supabase: ReturnType<typeof createClient>,
  args: {
    establishmentId: string;
    categoryId: string;
    clientId: string;
    guestName: string;
    arrivalDate: string;
    departureDate: string;
    amount: number;
    adults: number;
    children: number;
    notesSuffix?: string | null;
    paidByOta: boolean;
    shouldApplyAutoPayment: boolean;
    mappedPricingPlanId?: string | null;
    otaName: string;
    bookingRef: string;
  },
): Promise<string> {
  const { data: created, error } = await supabase
    .from("reservations")
    .insert({
      establishment_id: args.establishmentId,
      category_id: args.categoryId,
      room_id: null,
      client_id: args.clientId,
      guest_name: args.guestName,
      checkin_date: args.arrivalDate,
      checkout_date: args.departureDate,
      adults: Math.max(0, Math.floor(Number(args.adults || 0))),
      children: Math.max(0, Math.floor(Number(args.children || 0))),
      total_amount: args.amount > 0 ? args.amount : 0,
      paid_amount: args.paidByOta && args.shouldApplyAutoPayment && args.amount > 0 ? args.amount : 0,
      payment_status: args.paidByOta && args.shouldApplyAutoPayment && args.amount > 0 ? "paid" : "pending",
      status: "pending",
      channel: "ota",
      notes:
        `Channex ${args.otaName} · booking ${args.bookingRef} · OVERBOOKING (sem disponibilidade no lock)` +
        ` · criado para tratativa manual no PMS` +
        (args.notesSuffix ? `\n${args.notesSuffix}` : ""),
      ...(args.mappedPricingPlanId ? { pricing_plan_id: args.mappedPricingPlanId } : {}),
    })
    .select("id")
    .single();
  if (error || !created?.id) {
    throw new Error(error?.message || "Falha ao criar fallback de overbooking no PMS");
  }
  return created.id as string;
}

async function fetchChannex(baseUrl: string, apiKey: string, path: string) {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    headers: { "Content-Type": "application/json", "user-api-key": apiKey },
  });
  const data = await resp.json().catch(() => ({}));
  return { resp, data };
}

function parseFeedList(feedData: unknown): AnyObj[] {
  const root = (feedData ?? {}) as AnyObj;
  if (Array.isArray(root.data)) return root.data as AnyObj[];
  if (root.data && typeof root.data === "object") return [root.data as AnyObj];
  return [];
}

/** Códigos candidatos para bater com ota_reservations.ota_reservation_code (Channex pode enviar PREFIX-código; o PMS pode ter guardado só o sufixo ou outro formato). */
function otaReservationLookupCodes(uniqueId: string, bookingId: string): string[] {
  const u = ensureString(uniqueId);
  const b = ensureString(bookingId);
  const out: string[] = [];
  const push = (x: string) => {
    const t = x.trim();
    if (!t) return;
    out.push(t);
    const low = t.toLowerCase();
    if (low !== t) out.push(low);
  };
  push(u);
  push(b);
  const m = u.match(/^([A-Za-z]{2,10})-(.+)$/);
  if (m?.[2]) push(m[2].trim());
  const seen = new Set<string>();
  return out.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function findOtaReservationForChannel(
  supabase: ReturnType<typeof createClient>,
  channelId: string,
  uniqueId: string,
  bookingId: string,
): Promise<{ id: string; reservation_id: string | null } | null> {
  const codes = otaReservationLookupCodes(uniqueId, bookingId);
  if (codes.length === 0) return null;
  const { data, error } = await supabase
    .from("ota_reservations")
    .select("id, reservation_id")
    .eq("ota_channel_id", channelId)
    .in("ota_reservation_code", codes)
    .limit(1);
  if (error) {
    console.warn("findOtaReservationForChannel", error.message, codes);
    return null;
  }
  const row = (data?.[0] ?? null) as { id: string; reservation_id: string | null } | null;
  if (!row?.id) return null;
  return row;
}

function channexWebhookSummaryMatchesItem(
  ws: AnyObj,
  ctx: {
    revisionId: string;
    bookingId: string;
    uniqueId: string;
    revisionFilter: string;
    bookingIdFilter: string;
    bookingUniqueIdFilter: string;
  },
): boolean {
  const wsRev = ensureString(ws.booking_revision_id ?? ws.revision_id);
  const wsBook = ensureString(ws.booking_id);
  const wsUnique = ensureString(ws.booking_unique_id ?? ws.unique_id);
  if (ctx.revisionFilter && wsRev && wsRev === ctx.revisionFilter) return true;
  if (ctx.bookingIdFilter && wsBook && wsBook === ctx.bookingIdFilter) return true;
  if (ctx.bookingUniqueIdFilter && wsUnique && wsUnique === ctx.bookingUniqueIdFilter) return true;
  if (wsRev && wsRev === ctx.revisionId) return true;
  if (wsBook && wsBook === ctx.bookingId) return true;
  if (wsUnique && wsUnique === ctx.uniqueId) return true;
  return false;
}

/** Enriquece atributos da revisão com campos do webhook resumido (send_data=false), ex.: customer_name completo. */
function mergeChannexWebhookSummaryIntoAttrs(attrs: AnyObj, ws: AnyObj): AnyObj {
  const out = { ...attrs };
  const cn = ensureString(ws.customer_name);
  if (cn) out.customer_name = cn;
  const arr = ensureString(ws.arrival_date);
  if (arr) out.arrival_date = arr;
  const dep = ensureString(ws.departure_date);
  if (dep) out.departure_date = dep;
  if (ws.amount != null && String(ws.amount).trim() !== "") {
    const n = Number(ws.amount);
    if (!Number.isNaN(n)) out.amount = n;
  }
  const cur = ensureString(ws.currency);
  if (cur) out.currency = cur;
  return out;
}

async function updateOtaReservationsRow(
  supabase: ReturnType<typeof createClient>,
  params: {
    channelId: string;
    uniqueId: string;
    bookingId: string;
    existingOta: { id: string } | null;
    patch: Record<string, unknown>;
  },
): Promise<void> {
  const { channelId, uniqueId, bookingId, existingOta, patch } = params;
  const q = supabase.from("ota_reservations").update(patch).eq("ota_channel_id", channelId);
  if (existingOta?.id) {
    const { error } = await q.eq("id", existingOta.id);
    if (error) console.warn("updateOtaReservationsRow by id", error.message);
    return;
  }
  const codes = otaReservationLookupCodes(uniqueId, bookingId);
  if (codes.length === 0) {
    console.warn("updateOtaReservationsRow: sem códigos OTA", { uniqueId, bookingId });
    return;
  }
  const { error } =
    codes.length > 1
      ? await q.in("ota_reservation_code", codes)
      : await q.eq("ota_reservation_code", codes[0]!);
  if (error) console.warn("updateOtaReservationsRow", error.message, codes);
}

async function postChannex(baseUrl: string, apiKey: string, path: string) {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-api-key": apiKey },
  });
  const data = await resp.json().catch(() => ({}));
  return { resp, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const internalServiceAuth = serviceRoleKey.length > 0 && bearerToken === serviceRoleKey;

    let supabaseUser: ReturnType<typeof createClient>;
    let authUserId: string | null = null;

    if (internalServiceAuth) {
      supabaseUser = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } else {
      supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const {
        data: { user },
        error: userErr,
      } = await supabaseUser.auth.getUser();
      if (userErr || !user) {
        return json({ success: false, error: "Sessão inválida ou expirada" }, 401);
      }
      authUserId = user.id;
    }

    let body: {
      channel_id?: string;
      establishment_id?: string;
      revision_id?: string;
      booking_id?: string;
      booking_unique_id?: string;
      force_reprocess?: boolean;
      auto_apply_lifecycle?: boolean;
      recent_window_seconds?: number;
      source_event?: string;
      /** Campos do webhook resumido (ex. customer_name) para alinhar ao pull do feed. */
      webhook_summary?: AnyObj;
      /** Após cancelar no PMS pelo fluxo normal (UI): marca revisão/OTA/ACK sem reaplicar política no servidor. */
      finalize_channex_cancellation_revision?: boolean;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ success: false, error: "JSON inválido" }, 400);
    }

    const channelId = ensureString(body.channel_id);
    const establishmentId = ensureString(body.establishment_id);
    const revisionFilter = ensureString(body.revision_id);
    const bookingIdFilter = ensureString(body.booking_id);
    const bookingUniqueIdFilter = ensureString(body.booking_unique_id);
    const forceReprocess = body.force_reprocess === true;
    const autoApplyLifecycle = body.auto_apply_lifecycle === true;
    const sourceEvent = ensureString(body.source_event).toLowerCase();
    const recentWindowSeconds =
      typeof body.recent_window_seconds === "number" && Number.isFinite(body.recent_window_seconds)
        ? Math.max(0, Math.floor(body.recent_window_seconds))
        : 0;
    const webhookSummary =
      body.webhook_summary && typeof body.webhook_summary === "object" ? (body.webhook_summary as AnyObj) : null;
    if (!channelId || !establishmentId) {
      return json({ success: false, error: "channel_id e establishment_id são obrigatórios" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: channel } = await supabase.from("ota_channels").select("*").eq("id", channelId).maybeSingle();
    if (!channel) return json({ success: false, error: "Canal não encontrado" }, 404);

    if (String((channel as AnyObj).establishment_id ?? "").trim() !== establishmentId) {
      return json({ success: false, error: "Canal não pertence ao estabelecimento informado" }, 403);
    }

    if (!internalServiceAuth && authUserId) {
      const { data: canAccess, error: accessRpcError } = await supabaseUser.rpc("user_can_access_establishment", {
        p_user_id: authUserId,
        p_establishment_id: establishmentId,
      });
      if (accessRpcError) {
        return json(
          {
            success: false,
            error: `Não foi possível validar permissão: ${accessRpcError.message}`,
          },
          500,
        );
      }
      if (canAccess !== true) {
        return json({ success: false, error: "Sem permissão para este estabelecimento" }, 403);
      }
    }

    if (ensureString((channel as AnyObj).channel_manager_type) !== "channex") {
      return json({ success: false, error: "Canal informado não é do tipo Channex" }, 400);
    }

    if (body.finalize_channex_cancellation_revision === true) {
      const finalizeRevisionId = ensureString(body.revision_id);
      if (!finalizeRevisionId) {
        return json({ success: false, error: "revision_id é obrigatório para finalizar a revisão" }, 400);
      }

      const { data: revRow, error: revErr } = await supabase
        .from("channex_booking_revisions")
        .select("id, status, reservation_id, booking_id, unique_id, payload")
        .eq("ota_channel_id", channelId)
        .eq("revision_id", finalizeRevisionId)
        .maybeSingle();

      if (revErr) {
        return json({ success: false, error: `Erro ao ler revisão: ${revErr.message}` }, 500);
      }
      if (!revRow?.id) {
        return json({ success: false, error: "Revisão Channex não encontrada" }, 404);
      }

      const rev = revRow as AnyObj;
      if (normalizeRevisionStatus(rev.status) !== "cancelled") {
        return json({ success: false, error: "Esta pendência não é de cancelamento" }, 400);
      }

      const resId = ensureString(rev.reservation_id);
      if (!resId) {
        return json(
          {
            success: false,
            error: "Revisão sem reserva vinculada. Sincronize as reservas Channex antes de finalizar.",
          },
          409,
        );
      }

      const { data: resCheck } = await supabase.from("reservations").select("id, status").eq("id", resId).maybeSingle();
      const st = ensureString((resCheck as AnyObj | null)?.status).toLowerCase();
      if (st !== "cancelled") {
        return json(
          {
            success: false,
            error:
              "A reserva ainda não está cancelada no PMS. Use o cancelamento com política e estorno (como no mapa de reservas) antes de finalizar.",
            hint: "pending_reservation_not_cancelled",
          },
          409,
        );
      }

      const bookingIdF = ensureString(rev.booking_id);
      const uniqueIdF = ensureString(rev.unique_id);
      const existingOta = await findOtaReservationForChannel(supabase, channelId, uniqueIdF, bookingIdF);

      await updateOtaReservationsRow(supabase, {
        channelId,
        uniqueId: uniqueIdF,
        bookingId: bookingIdF,
        existingOta,
        patch: {
          sync_status: "cancelled",
          synced_at: new Date().toISOString(),
        },
      });

      await supabase
        .from("channex_booking_revisions")
        .update({
          process_status: "processed",
          processed_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rev.id as string);

      if (bookingIdF) {
        await supabase
          .from("channex_booking_revisions")
          .update({
            process_status: "processed",
            error_message: `Superseded by cancellation revision ${finalizeRevisionId}`,
            updated_at: new Date().toISOString(),
          })
          .eq("ota_channel_id", channelId)
          .eq("booking_id", bookingIdF)
          .eq("status", "modified")
          .in("process_status", ["pending", "failed"])
          .neq("revision_id", finalizeRevisionId);
      }
      if (uniqueIdF) {
        await supabase
          .from("channex_booking_revisions")
          .update({
            process_status: "processed",
            error_message: `Superseded by cancellation revision ${finalizeRevisionId}`,
            updated_at: new Date().toISOString(),
          })
          .eq("ota_channel_id", channelId)
          .eq("unique_id", uniqueIdF)
          .eq("status", "modified")
          .in("process_status", ["pending", "failed"])
          .neq("revision_id", finalizeRevisionId);
      }

      await supabase.from("channex_ack_queue").upsert(
        {
          ota_channel_id: channelId,
          establishment_id: establishmentId,
          revision_id: finalizeRevisionId,
          status: "pending",
          next_attempt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ota_channel_id,revision_id" },
      );

      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/channex-ack-worker`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ channel_id: channelId, establishment_id: establishmentId }),
        });
      } catch {
        // fila permanece pendente
      }

      await supabase.from("channex_sync_logs").insert({
        ota_channel_id: channelId,
        establishment_id: establishmentId,
        direction: "pull_booking",
        status: "success",
        endpoint: "finalize_channex_cancellation_revision",
        message: `Revisão ${finalizeRevisionId} finalizada após cancelamento no PMS`,
        request_payload: { revision_id: finalizeRevisionId },
      });

      return json({ success: true, finalized: true });
    }

    const apiKey = ensureString((channel as AnyObj).channex_api_key);
    const propertyId = ensureString((channel as AnyObj).channex_property_id);
    const baseUrl = ensureString((channel as AnyObj).channex_base_url || "https://staging.channex.io");
    if (!apiKey || !propertyId) {
      return json({ success: false, error: "Canal sem channex_api_key/channex_property_id configurados" }, 400);
    }

    const feedPath = revisionFilter
      ? `/api/v1/booking_revisions/${revisionFilter}`
      : `/api/v1/booking_revisions/feed?filter[property_id]=${encodeURIComponent(propertyId)}&order[inserted_at]=asc`;
    let feedResp: Response | null = null;
    let feedData: unknown = {};
    let list: AnyObj[] = [];

    const shouldRetryFeed =
      !revisionFilter && !bookingIdFilter && !bookingUniqueIdFilter && recentWindowSeconds > 0;
    const retryDelaysMs = shouldRetryFeed ? [0, 800, 1600, 3200] : [0];
    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const attempt = await fetchChannex(baseUrl, apiKey, feedPath);
      feedResp = attempt.resp;
      feedData = attempt.data;
      if (!attempt.resp.ok) break;
      list = parseFeedList(attempt.data);
      if (list.length > 0) break;
    }

    if (!feedResp || !feedResp.ok) {
      await supabase.from("channex_sync_logs").insert({
        ota_channel_id: channelId,
        establishment_id: establishmentId,
        direction: "pull_booking",
        status: "error",
        endpoint: feedPath,
        http_status: feedResp?.status ?? null,
        response_payload: feedData,
        message: "Erro ao buscar booking revisions",
      });
      return json({ success: false, error: "Falha ao buscar revisões no Channex", hint: String(feedResp?.status ?? 0) }, 502);
    }

    // Fallback: alguns ambientes retornam vazio em /feed logo após webhook resumido.
    // Tentamos endpoint alternativo de revisões não-acknowledged.
    if (
      list.length === 0 &&
      !revisionFilter &&
      !bookingIdFilter &&
      !bookingUniqueIdFilter &&
      recentWindowSeconds > 0
    ) {
      const altPath = `/api/v1/booking_revisions?filter[property_id]=${encodeURIComponent(propertyId)}&order[inserted_at]=desc`;
      const alt = await fetchChannex(baseUrl, apiKey, altPath);
      if (alt.resp.ok) {
        list = parseFeedList(alt.data);
      }
    }

    if (list.length === 0 && (revisionFilter || bookingIdFilter || bookingUniqueIdFilter)) {
      const fallbackPath = `/api/v1/booking_revisions/feed?filter[property_id]=${encodeURIComponent(propertyId)}&order[inserted_at]=desc`;
      const fallback = await fetchChannex(baseUrl, apiKey, fallbackPath);
      if (fallback.resp.ok) {
        const fallbackList: AnyObj[] = Array.isArray((fallback.data as AnyObj).data)
          ? ((fallback.data as AnyObj).data as AnyObj[])
          : [];
        list = fallbackList.filter((entry) => {
          const attrs = (entry.attributes ?? {}) as AnyObj;
          const rid = ensureString(attrs.id || entry.id);
          const bid = ensureString(attrs.booking_id);
          const uid = ensureString(attrs.unique_id || attrs.ota_reservation_code);
          if (revisionFilter && rid === revisionFilter) return true;
          if (bookingIdFilter && bid === bookingIdFilter) return true;
          if (bookingUniqueIdFilter && uid === bookingUniqueIdFilter) return true;
          return false;
        });
      }
    }

    // Fallback final: usa payload local já salvo para permitir "aceitar/reprocessar" via UI
    // mesmo quando a revisão não vem mais no feed remoto.
    if (list.length === 0 && revisionFilter) {
      const { data: localRevision } = await supabase
        .from("channex_booking_revisions")
        .select("revision_id, booking_id, unique_id, payload, status, reservation_id")
        .eq("ota_channel_id", channelId)
        .eq("revision_id", revisionFilter)
        .maybeSingle();
      if (localRevision?.revision_id) {
        const payload = (localRevision.payload ?? {}) as AnyObj;
        const rowStatus = ensureString((localRevision as AnyObj).status);
        const rowBid = ensureString((localRevision as AnyObj).booking_id);
        const rowUid = ensureString((localRevision as AnyObj).unique_id);
        const rowResId = ensureString((localRevision as AnyObj).reservation_id);
        list = [
          {
            id: localRevision.revision_id,
            _local_reservation_id: rowResId || undefined,
            attributes: {
              ...payload,
              id: localRevision.revision_id,
              booking_id: rowBid || ensureString(payload.booking_id),
              unique_id:
                rowUid ||
                ensureString(payload.unique_id) ||
                ensureString(payload.booking_unique_id) ||
                ensureString(payload.ota_reservation_code),
              status: ensureString(payload.status) || rowStatus || undefined,
            },
          },
        ];
      }
    }

    if (!revisionFilter && !bookingIdFilter && !bookingUniqueIdFilter && recentWindowSeconds > 0) {
      const minMs = Date.now() - recentWindowSeconds * 1000;
      list = list.filter((entry) => {
        const attrs = (entry.attributes ?? {}) as AnyObj;
        const insertedAtMs =
          parseIsoMs(attrs.inserted_at) ??
          parseIsoMs((entry as AnyObj).inserted_at) ??
          parseIsoMs(attrs.created_at) ??
          parseIsoMs((entry as AnyObj).created_at);
        // Para webhook resumido, só aceitar revisões com timestamp válido na janela.
        if (insertedAtMs == null) return false;
        return insertedAtMs >= minMs;
      });
    }

    let processed = 0;
    let created = 0;
    let modified = 0;
    let cancelled = 0;
    let failed = 0;
    let skippedMissingIds = 0;
    let skippedBySourceEvent = 0;

    // Limpeza defensiva: se a reserva local já está cancelada, não manter pendências antigas de modificação.
    const { data: staleModified } = await supabase
      .from("channex_booking_revisions")
      .select("id, reservation_id")
      .eq("ota_channel_id", channelId)
      .eq("status", "modified")
      .in("process_status", ["pending", "failed"])
      .not("reservation_id", "is", null)
      .limit(200);
    for (const row of staleModified ?? []) {
      const reservationId = ensureString((row as AnyObj).reservation_id);
      if (!reservationId) continue;
      const { data: reservation } = await supabase
        .from("reservations")
        .select("status")
        .eq("id", reservationId)
        .maybeSingle();
      const status = ensureString((reservation as AnyObj | null)?.status).toLowerCase();
      if (status === "cancelled") {
        await supabase
          .from("channex_booking_revisions")
          .update({
            process_status: "processed",
            error_message: "Superseded: local reservation already cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", (row as AnyObj).id);
      }
    }

    for (const item of list) {
      let attrs = (item.attributes ?? {}) as AnyObj;
      const processingMeta: AnyObj = {
        used_category_mapping_fallback: false,
        fallback_reservation_id: null,
        modification_details: [],
      };
      const itemObj = item as AnyObj;
      const localReservationHint = ensureString((itemObj as AnyObj)._local_reservation_id);
      const revisionId = ensureString(
        attrs.id ||
          attrs.revision_id ||
          itemObj.id ||
          itemObj.revision_id ||
          nestedValue(itemObj, "revision.id")
      );
      const bookingId = ensureString(
        attrs.booking_id ||
          attrs.bookingId ||
          itemObj.booking_id ||
          itemObj.bookingId ||
          nestedValue(itemObj, "relationships.booking.data.id") ||
          nestedValue(itemObj, "booking.id")
      );
      const uniqueId = ensureString(
        attrs.unique_id ||
          attrs.ota_reservation_code ||
          attrs.booking_unique_id ||
          itemObj.unique_id ||
          itemObj.booking_unique_id ||
          itemObj.bookingUniqueId
      );
      if (webhookSummary) {
        const summaryCustomer = ensureString(webhookSummary.customer_name);
        const matchIds = channexWebhookSummaryMatchesItem(webhookSummary, {
          revisionId,
          bookingId,
          uniqueId,
          revisionFilter,
          bookingIdFilter,
          bookingUniqueIdFilter,
        });
        // Webhook resumido: com uma única revisão na janela, enriquecer nome/datas do payload do CM.
        const singleRevisionInBatch = list.length === 1 && Boolean(summaryCustomer);
        if (matchIds || singleRevisionInBatch) {
          attrs = mergeChannexWebhookSummaryIntoAttrs(attrs, webhookSummary);
        }
      }
      const otaName = ensureString(attrs.ota_name) || "Channex";
      const existingOta = await findOtaReservationForChannel(supabase, channelId, uniqueId, bookingId);
      const reservationAlreadyExists = !!ensureString(existingOta?.reservation_id);
      const detectedOverbooking = detectChannexOverbooking(attrs, sourceEvent);
      const isSelfOverbookingRelocation = isPmsOverbookingRelocationRevision(attrs);

      if (!revisionId || (!bookingId && !uniqueId)) {
        skippedMissingIds += 1;
        continue;
      }

      const { data: exists } = await supabase
        .from("channex_booking_revisions")
        .select("id, process_status, reservation_id, status")
        .eq("ota_channel_id", channelId)
        .eq("revision_id", revisionId)
        .maybeSingle();

      let revisionStatus = deriveRevisionStatus(attrs, reservationAlreadyExists);
      const storedLifecycle = normalizeRevisionStatus((exists as AnyObj | null)?.status);
      if (storedLifecycle === "cancelled") {
        revisionStatus = "cancelled";
      }
      // Webhook/pull resumido: sem rooms/status no JSON o derive cai em "modified" mesmo sendo cancelamento.
      if (sourceEvent === "booking_cancellation") {
        revisionStatus = "cancelled";
      }

      if (sourceEvent === "booking_cancellation" && revisionStatus !== "cancelled") {
        skippedBySourceEvent += 1;
        continue;
      }
      if (sourceEvent === "booking_modification" && revisionStatus === "cancelled") {
        skippedBySourceEvent += 1;
        continue;
      }

      if (
        !forceReprocess &&
        exists?.id &&
        (exists.process_status === "acked" || exists.process_status === "processed")
      ) {
        continue;
      }

      processed += 1;

      try {
        const customer = (attrs.customer ?? {}) as AnyObj;
        const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
        const firstRoom = rooms[0] ?? {};
        const firstGuest = (Array.isArray((firstRoom as AnyObj).guests) ? ((firstRoom as AnyObj).guests as AnyObj[])[0] : null) as
          | AnyObj
          | null;
        const firstName = ensureString(customer.name || customer.first_name || firstGuest?.name);
        const lastName = ensureString(customer.surname || customer.last_name || firstGuest?.surname);
        const fromSummary = ensureString(attrs.customer_name);
        const guestName =
          fromSummary ||
          `${firstName} ${lastName}`.trim() ||
          "Hóspede Channex";
        const email = channexGuestEmailFromPayload(customer, firstGuest, attrs);
        const phone = ensureString(customer.phone || customer.mobile || customer.phone_number) || null;
        const roomTypeId = ensureString((firstRoom as AnyObj).room_type_id || (firstRoom as AnyObj).room_type_code || ((firstRoom as AnyObj).meta as AnyObj | undefined)?.room_type_code);
        const ratePlanId = ensureString((firstRoom as AnyObj).rate_plan_id || (firstRoom as AnyObj).rate_plan_code || ((firstRoom as AnyObj).meta as AnyObj | undefined)?.rate_plan_code);
        const arrivalDate = ensureString(attrs.arrival_date || (firstRoom as AnyObj).checkin_date);
        const departureDate = ensureString(attrs.departure_date || (firstRoom as AnyObj).checkout_date);
        const amount = Number(attrs.amount ?? (firstRoom as AnyObj).amount ?? 0);
        const paidByOta = ensureString(attrs.payment_collect).toLowerCase() === "ota";
        const occInfo = extractOccupancyInfo(attrs, firstRoom as AnyObj);
        const channexNotes = extractChannexNotes(attrs, firstRoom as AnyObj);
        const childAgeLine =
          occInfo.children > 0
            ? `Children: ${occInfo.children}` + (occInfo.ages.length > 0 ? ` | Child Age: ${occInfo.ages.join(", ")}` : "")
            : "";
        const notesSuffix = [childAgeLine, ...channexNotes.map((n) => `Notes (Channex): ${n}`)]
          .filter(Boolean)
          .join("\n");

        let clientId: string | null = null;
        // OTAs frequentemente repetem e-mail genérico/vazio: não reutilizar cliente só pelo e-mail (evita hóspede errado).
        if (email) {
          const { data: foundClient } = await supabase
            .from("clients")
            .select("id, full_name")
            .eq("email", email)
            .maybeSingle();
          if (foundClient?.id) {
            const existingNm = ensureString((foundClient as AnyObj).full_name).toLowerCase().replace(/\s+/g, " ");
            const wanted = guestName.toLowerCase().replace(/\s+/g, " ");
            if (existingNm && wanted && existingNm === wanted) {
              clientId = foundClient.id;
            }
          }
        }
        if (!clientId && phone) {
          const { data: foundByPhone } = await supabase
            .from("clients")
            .select("id, full_name")
            .eq("phone", phone)
            .maybeSingle();
          if (foundByPhone?.id) {
            const existingNm = ensureString((foundByPhone as AnyObj).full_name).toLowerCase().replace(/\s+/g, " ");
            const wanted = guestName.toLowerCase().replace(/\s+/g, " ");
            if (!wanted || !existingNm || existingNm === wanted) clientId = foundByPhone.id;
          }
        }
        if (!clientId) {
          const { data: clientRow, error: clientErr } = await supabase
            .from("clients")
            .insert({
              full_name: guestName,
              email,
              phone,
              city: ensureString(customer.city) || null,
              country: ensureString(customer.country) || null,
              address: ensureString(customer.address) || null,
            })
            .select("id")
            .single();
          if (clientErr) throw clientErr;
          clientId = clientRow.id;
        }

        const shouldApplyAutoPayment = paidByOta
          ? await shouldApplyChannelAutoPayment(supabase, establishmentId, otaName)
          : false;

        let reservationId = ensureString(existingOta?.reservation_id);
        if (!reservationId && localReservationHint) reservationId = localReservationHint;
        if (!reservationId) {
          const fromStoredRevision = ensureString((exists as AnyObj | null)?.reservation_id);
          if (fromStoredRevision) reservationId = fromStoredRevision;
        }
        let processStatusForRevision: "processed" | "pending" = "processed";

        const shouldQueueLifecyclePending =
          (revisionStatus === "modified" || revisionStatus === "cancelled") &&
          !forceReprocess &&
          !autoApplyLifecycle &&
          !isSelfOverbookingRelocation;

        if (shouldQueueLifecyclePending) {
          if (reservationId && (revisionStatus === "modified" || revisionStatus === "cancelled")) {
            const { data: currentReservation } = await supabase
              .from("reservations")
              .select("status")
              .eq("id", reservationId)
              .maybeSingle();
            const localStatus = ensureString((currentReservation as AnyObj | null)?.status).toLowerCase();
            // Se a reserva já está cancelada localmente, não abrir pendência de modificação antiga.
            if (localStatus === "cancelled") {
              processStatusForRevision = "processed";
            } else {
              processStatusForRevision = "pending";
            }
          } else {
          processStatusForRevision = "pending";
          }
          if (revisionStatus === "modified") modified += 1;
          if (revisionStatus === "cancelled") cancelled += 1;
        }

        let categoryId = "";
        let channexMappedPricingPlanId: string | null = null;
        const needsCategoryMapping =
          !shouldQueueLifecyclePending &&
          ((revisionStatus === "new" || revisionStatus === "modified") && !reservationId) ||
          (revisionStatus === "modified" && forceReprocess);

        // Reaproveitar último vínculo local por booking/unique quando ota_reservations ainda não estiver ligado.
        if (!reservationId && (revisionStatus === "modified" || revisionStatus === "cancelled")) {
          let latestReservationId = "";
          if (bookingId) {
            const { data: byBook } = await supabase
              .from("channex_booking_revisions")
              .select("reservation_id")
              .eq("ota_channel_id", channelId)
              .eq("booking_id", bookingId)
              .not("reservation_id", "is", null)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            latestReservationId = ensureString((byBook as AnyObj | null)?.reservation_id);
          }
          if (!latestReservationId && uniqueId) {
            const { data: byUnique } = await supabase
              .from("channex_booking_revisions")
              .select("reservation_id")
              .eq("ota_channel_id", channelId)
              .eq("unique_id", uniqueId)
              .not("reservation_id", "is", null)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            latestReservationId = ensureString((byUnique as AnyObj | null)?.reservation_id);
          }
          if (latestReservationId) {
            reservationId = latestReservationId;
            const { data: latestReservation } = await supabase
              .from("reservations")
              .select("status")
              .eq("id", latestReservationId)
              .maybeSingle();
            const latestStatus = ensureString((latestReservation as AnyObj | null)?.status).toLowerCase();
            if (latestStatus === "cancelled") {
              processStatusForRevision = "processed";
            }
          }
        }

        // Reprocessamento de modificação deve sempre partir de uma reserva já existente.
        // Se não houver vínculo em ota_reservations/revisões, tenta localizar por notas.
        if (!reservationId && revisionStatus === "modified" && forceReprocess) {
          const needles = [uniqueId, bookingId]
            .map((n) => ensureString(n).replace(/[^a-zA-Z0-9-]/g, "").trim())
            .filter((t) => t.length >= 8);
          for (const token of needles) {
            const { data: noteHits } = await supabase
              .from("reservations")
              .select("id")
              .eq("establishment_id", establishmentId)
              .ilike("notes", `%${token}%`)
              .in("status", ["pending", "confirmed", "checkedin", "preregistration"])
              .order("created_at", { ascending: false })
              .limit(2);
            if (noteHits?.length === 1) {
              reservationId = ensureString((noteHits[0] as AnyObj).id);
              break;
            }
          }
        }

        // Cancelamento: sem vínculo OTA, localizar reserva criada pelo PMS (notas "Channex … booking …").
        if (!reservationId && revisionStatus === "cancelled") {
          const needles = [uniqueId, bookingId].map((n) => ensureString(n).replace(/[^a-zA-Z0-9-]/g, "").trim()).filter(
            (t) => t.length >= 8,
          );
          for (const token of needles) {
            const { data: noteHits } = await supabase
              .from("reservations")
              .select("id")
              .eq("establishment_id", establishmentId)
              .ilike("notes", `%${token}%`)
              .in("status", ["pending", "confirmed", "checkedin", "preregistration"])
              .limit(2);
            if (noteHits?.length === 1) {
              reservationId = ensureString((noteHits[0] as AnyObj).id);
              break;
            }
          }
        }

        // Para pendência de modificação, registrar detalhes before/after para exibir no PMS.
        if (shouldQueueLifecyclePending && revisionStatus === "modified" && reservationId) {
          const { data: previousReservation } = await supabase
            .from("reservations")
            .select("guest_name, checkin_date, checkout_date, total_amount, category_id, room_id")
            .eq("id", reservationId)
            .maybeSingle();
          const prev = previousReservation as AnyObj | null;

          let incomingCategoryId: string | null = null;
          if (roomTypeId && ratePlanId) {
            const { data: detailMapping } = await supabase
              .from("channel_pricing")
              .select("category_id")
              .eq("ota_channel_id", channelId)
              .eq("channel_room_code", roomTypeId)
              .eq("channel_rate_plan_code", ratePlanId)
              .maybeSingle();
            incomingCategoryId = ensureString((detailMapping as AnyObj | null)?.category_id) || null;
          }
          // Fallback para quando o rate plan não vier no feed resumido
          // ou o mapeamento existir apenas por room code.
          if (!incomingCategoryId && roomTypeId) {
            const { data: roomOnlyMapping } = await supabase
              .from("channel_pricing")
              .select("category_id")
              .eq("ota_channel_id", channelId)
              .eq("channel_room_code", roomTypeId)
              .limit(1)
              .maybeSingle();
            incomingCategoryId = ensureString((roomOnlyMapping as AnyObj | null)?.category_id) || null;
          }

          const changes: AnyObj[] = [];
          const prevGuest = ensureString(prev?.guest_name);
          if (guestName && prevGuest !== guestName) {
            changes.push({ field: "guest_name", before: prevGuest || "-", after: guestName });
          }
          const prevCheckin = ensureString(prev?.checkin_date).slice(0, 10);
          const prevCheckout = ensureString(prev?.checkout_date).slice(0, 10);
          if (arrivalDate && prevCheckin !== arrivalDate) {
            changes.push({ field: "checkin_date", before: prevCheckin || "-", after: arrivalDate });
          }
          if (departureDate && prevCheckout !== departureDate) {
            changes.push({ field: "checkout_date", before: prevCheckout || "-", after: departureDate });
          }
          const prevAmount = Number(prev?.total_amount ?? 0);
          if (Number.isFinite(prevAmount) && Number.isFinite(amount) && Math.abs(prevAmount - amount) > 0.009) {
            changes.push({ field: "total_amount", before: prevAmount, after: amount });
          }
          const prevCategoryId = ensureString(prev?.category_id);
          if (incomingCategoryId && prevCategoryId !== incomingCategoryId) {
            const categoryIds = [prevCategoryId, incomingCategoryId].filter(Boolean);
            const { data: categories } = await supabase
              .from("room_categories")
              .select("id, name")
              .in("id", categoryIds);
            const categoryNameById = new Map<string, string>();
            for (const category of categories ?? []) {
              const cc = category as AnyObj;
              const cid = ensureString(cc.id);
              if (!cid) continue;
              categoryNameById.set(cid, ensureString(cc.name) || cid);
            }

            const prevCategoryName = prevCategoryId
              ? categoryNameById.get(prevCategoryId) ?? prevCategoryId
              : "-";
            const incomingCategoryName = categoryNameById.get(incomingCategoryId) ?? incomingCategoryId;

            changes.push({
              field: "category",
              before: prevCategoryName,
              after: incomingCategoryName,
              before_id: prevCategoryId,
              after_id: incomingCategoryId,
            });
          }

          processingMeta.modification_details = changes;
        }
        if (needsCategoryMapping) {
          const { data: mapping } = await supabase
            .from("channel_pricing")
            .select("category_id, pricing_plan_id")
            .eq("ota_channel_id", channelId)
            .eq("channel_room_code", roomTypeId)
            .eq("channel_rate_plan_code", ratePlanId)
            .maybeSingle();
          const mapRow = mapping as AnyObj | null;
          categoryId = ensureString(mapRow?.category_id);
          const mappedPlan = ensureString(mapRow?.pricing_plan_id);
          if (mappedPlan) channexMappedPricingPlanId = mappedPlan;
          if (!categoryId) {
            // Fallback: usar categoria da última reserva já vinculada ao mesmo booking/unique.
            // Isso evita falha de "modified" quando o mapeamento foi removido/alterado após a criação inicial.
            let fallbackReservationId = "";
            if (bookingId) {
              const { data: lastByBook } = await supabase
                .from("channex_booking_revisions")
                .select("reservation_id")
                .eq("ota_channel_id", channelId)
                .eq("booking_id", bookingId)
                .not("reservation_id", "is", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              fallbackReservationId = ensureString((lastByBook as AnyObj | null)?.reservation_id);
            }
            if (!fallbackReservationId && uniqueId) {
              const { data: lastByUnique } = await supabase
                .from("channex_booking_revisions")
                .select("reservation_id")
                .eq("ota_channel_id", channelId)
                .eq("unique_id", uniqueId)
                .not("reservation_id", "is", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              fallbackReservationId = ensureString((lastByUnique as AnyObj | null)?.reservation_id);
            }
            if (fallbackReservationId) {
              const { data: fallbackReservation } = await supabase
                .from("reservations")
                .select("category_id, pricing_plan_id")
                .eq("id", fallbackReservationId)
                .maybeSingle();
              const fb = fallbackReservation as AnyObj | null;
              categoryId = ensureString(fb?.category_id);
              const fbPlan = ensureString(fb?.pricing_plan_id);
              if (fbPlan) channexMappedPricingPlanId = fbPlan;
              if (categoryId) {
                processingMeta.used_category_mapping_fallback = true;
                processingMeta.fallback_reservation_id = fallbackReservationId;
              }
            }
          }
          if (!categoryId) {
            throw new Error(`Mapeamento não encontrado para room_type_id=${roomTypeId} rate_plan_id=${ratePlanId}`);
          }
        }

        // Proteção anti-duplicidade: no reprocessamento de "modified", sem reserva de origem não é seguro criar nova.
        if (revisionStatus === "modified" && forceReprocess && !reservationId) {
          throw new Error(
            `Não foi possível localizar a reserva original para reprocessar booking ${uniqueId || bookingId}. Operação bloqueada para evitar duplicidade.`,
          );
        }

        if (!shouldQueueLifecyclePending && (revisionStatus === "new" || revisionStatus === "modified") && !reservationId) {
          let reservationIsOverbooking = detectedOverbooking;
          if (detectedOverbooking && categoryId) {
            reservationId = await createOverbookingReservationFallback(supabase, {
              establishmentId,
              categoryId,
              clientId: clientId!,
              guestName,
              arrivalDate,
              departureDate,
              amount,
              adults: occInfo.adults,
              children: occInfo.children,
              notesSuffix,
              paidByOta,
              shouldApplyAutoPayment,
              mappedPricingPlanId: channexMappedPricingPlanId,
              otaName,
              bookingRef: uniqueId || bookingId,
            });
            await supabase.from("channex_sync_logs").insert({
              ota_channel_id: channelId,
              establishment_id: establishmentId,
              direction: "pull_booking",
              status: "warning",
              endpoint: "channex-reservations-sync (detected_overbooking_fallback)",
              message: `Reserva criada em modo overbooking por sinal do feed/webhook (${revisionId})`,
              request_payload: {
                booking_id: bookingId || null,
                unique_id: uniqueId || null,
                reservation_id: reservationId,
                category_id: categoryId,
              },
            });
          } else {
            const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_reservation_with_lock", {
              p_reservation_data: {
                guest_name: guestName,
                adults: occInfo.adults,
                children: occInfo.children,
                total_amount: amount > 0 ? amount : 0,
                paid_amount: paidByOta && shouldApplyAutoPayment && amount > 0 ? amount : 0,
                payment_status: paidByOta && shouldApplyAutoPayment && amount > 0 ? "paid" : "pending",
                status: "pending",
                channel: "ota",
                notes: mergeReservationNotes(null, [
                  `Channex ${otaName} · booking ${uniqueId || bookingId}`,
                  ...(detectedOverbooking ? ["OVERBOOKING (detectado no feed/webhook)"] : []),
                  ...(childAgeLine ? [childAgeLine] : []),
                  ...channexNotes.map((n) => `Notes (Channex): ${n}`),
                ]),
                client_id: clientId,
                ...(channexMappedPricingPlanId ? { pricing_plan_id: channexMappedPricingPlanId } : {}),
              },
              p_checkin_date: arrivalDate,
              p_checkout_date: departureDate,
              p_establishment_id: establishmentId,
              p_room_id: null,
              p_category_id: categoryId,
            });
            if (rpcErr) throw rpcErr;

            const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;
            if (!result?.success || !result?.reservation_id) {
              const rpcMessage = ensureString(result?.error);
              if (isAvailabilityErrorMessage(rpcMessage) && categoryId) {
                reservationIsOverbooking = true;
                reservationId = await createOverbookingReservationFallback(supabase, {
                  establishmentId,
                  categoryId,
                  clientId: clientId!,
                  guestName,
                  arrivalDate,
                  departureDate,
                  amount,
                  adults: occInfo.adults,
                  children: occInfo.children,
                  notesSuffix,
                  paidByOta,
                  shouldApplyAutoPayment,
                  mappedPricingPlanId: channexMappedPricingPlanId,
                  otaName,
                  bookingRef: uniqueId || bookingId,
                });
                await supabase.from("channex_sync_logs").insert({
                  ota_channel_id: channelId,
                  establishment_id: establishmentId,
                  direction: "pull_booking",
                  status: "warning",
                  endpoint: "channex-reservations-sync (overbooking_fallback)",
                  message: `Reserva criada sem quarto por indisponibilidade (${revisionId})`,
                  request_payload: {
                    booking_id: bookingId || null,
                    unique_id: uniqueId || null,
                    reservation_id: reservationId,
                    category_id: categoryId,
                    rpc_error: rpcMessage,
                  },
                });
              } else {
                throw new Error(result?.error || "Falha ao criar reserva");
              }
            } else {
              reservationId = String(result.reservation_id);
            }
          }

          await supabase.from("ota_reservations").insert({
            reservation_id: reservationId,
            ota_channel_id: channelId,
            ota_reservation_code: uniqueId || bookingId,
            ota_guest_name: guestName,
            ota_guest_email: email,
            ota_guest_phone: phone,
            ota_source_channel_name: otaName,
            sync_status: "synced",
            synced_at: new Date().toISOString(),
          });

          try {
            const { data: reservationRow } = await supabase
              .from("reservations")
              .select("reservation_code, checkin_date, checkout_date, total_amount, paid_amount, notes")
              .eq("id", reservationId)
              .maybeSingle();
            const rowNotes = ensureString((reservationRow as AnyObj | null)?.notes).toLowerCase();
            if (rowNotes.includes("overbooking")) reservationIsOverbooking = true;
            await createChannelReservationNotification(supabase, {
              establishmentId,
              reservationId,
              reservationCode: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
              guestName,
              managerName: "Channex",
              partnerName: otaName,
            });
            await ensureWebCheckinRow(
              supabase,
              {
                id: reservationId,
                reservation_code: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
                checkin_date: (reservationRow as { checkin_date?: string | null } | null)?.checkin_date ?? null,
              },
              establishmentId,
            );

            await queueChannelReservationEmail(supabase, {
              reservationId,
              establishmentId,
              guestName,
              guestEmail: email,
              otaGuestEmail: email,
              totalAmount: Number((reservationRow as AnyObj | null)?.total_amount ?? amount ?? 0),
              paidAmount: Number((reservationRow as AnyObj | null)?.paid_amount ?? 0),
              checkinDate: String((reservationRow as AnyObj | null)?.checkin_date ?? arrivalDate ?? ""),
              checkoutDate: String((reservationRow as AnyObj | null)?.checkout_date ?? departureDate ?? ""),
              reservationCode: String((reservationRow as AnyObj | null)?.reservation_code ?? ""),
            });
          } catch (e) {
            console.warn("channex-reservations-sync notification/web-checkin warning", e);
          }

          try {
            if (reservationIsOverbooking) {
              await maybeSendLifecycleTemplateForChannelReservation(reservationId, "reservation_overbooking");
            } else {
              await maybeSendCheckinChargeAutomationsForChannelReservation(reservationId, establishmentId);
            }
          } catch (e) {
            console.warn("channex-reservations-sync checkin-charge warning", e);
          }

          if (paidByOta && amount > 0) {
            const payErr = await insertChannelPrepaidPayment(supabase, {
              reservationId,
              establishmentId,
              amount,
              bookingId: uniqueId || bookingId,
              managerName: "Channex",
              partnerName: otaName,
            });
            if (payErr.error) {
              console.warn("channex-reservations-sync prepaid payment warning", payErr.error);
            }
          }
          created += 1;
        } else if (!shouldQueueLifecyclePending && revisionStatus === "modified" && reservationId) {
          if (isSelfOverbookingRelocation && !forceReprocess) {
            await updateOtaReservationsRow(supabase, {
              channelId,
              uniqueId,
              bookingId,
              existingOta,
              patch: {
                sync_status: "synced",
                synced_at: new Date().toISOString(),
              },
            });
            await supabase.from("channex_sync_logs").insert({
              ota_channel_id: channelId,
              establishment_id: establishmentId,
              direction: "pull_booking",
              status: "info",
              endpoint: "channex-reservations-sync (self_overbooking_relocation)",
              message: `Modificação técnica (realocação overbooking PMS) ignorada para pendência/reprocessamento (${revisionId})`,
              request_payload: {
                booking_id: bookingId || null,
                unique_id: uniqueId || null,
                reservation_id: reservationId,
              },
            });
            modified += 1;
          } else {
          const { data: previousReservation } = await supabase
            .from("reservations")
            .select("id, checkin_date, checkout_date, guest_name, total_amount, room_id, category_id, pricing_plan_id, notes")
            .eq("id", reservationId)
            .maybeSingle();

          if (forceReprocess && previousReservation?.id) {
            let reservationIsOverbooking = detectedOverbooking;
            const oldReservationId = reservationId;
            await refundReservationPaymentsForModificationReprocess(supabase, reservationId);

            await supabase
              .from("reservations")
              .update({
                status: "cancelled",
                cancelled_at: new Date().toISOString(),
                paid_amount: 0,
                payment_status: "pending",
                notes: `Reserva cancelada para reprocessamento de modificação do canal · booking ${uniqueId || bookingId}`,
              })
              .eq("id", reservationId);

            if (detectedOverbooking && categoryId) {
              reservationId = await createOverbookingReservationFallback(supabase, {
                establishmentId,
                categoryId,
                clientId: clientId!,
                guestName,
                arrivalDate,
                departureDate,
                amount,
                adults: occInfo.adults,
                children: occInfo.children,
                notesSuffix,
                paidByOta,
                shouldApplyAutoPayment,
                mappedPricingPlanId: channexMappedPricingPlanId,
                otaName,
                bookingRef: uniqueId || bookingId,
              });
              await supabase.from("channex_sync_logs").insert({
                ota_channel_id: channelId,
                establishment_id: establishmentId,
                direction: "pull_booking",
                status: "warning",
                endpoint: "channex-reservations-sync (modified_detected_overbooking_fallback)",
                message: `Reprocessamento criou reserva em modo overbooking por sinal do feed/webhook (${revisionId})`,
                request_payload: {
                  booking_id: bookingId || null,
                  unique_id: uniqueId || null,
                  reservation_id: reservationId,
                  category_id: categoryId,
                },
              });
            } else {
              const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_reservation_with_lock", {
                p_reservation_data: {
                  guest_name: guestName,
                  adults: occInfo.adults,
                  children: occInfo.children,
                  total_amount: amount > 0 ? amount : 0,
                  paid_amount: paidByOta && shouldApplyAutoPayment && amount > 0 ? amount : 0,
                  payment_status: paidByOta && shouldApplyAutoPayment && amount > 0 ? "paid" : "pending",
                  status: "pending",
                  channel: "ota",
                  notes: mergeReservationNotes(null, [
                    `Channex ${otaName} · booking ${uniqueId || bookingId} · modified (reprocess)`,
                    ...(detectedOverbooking ? ["OVERBOOKING (detectado no feed/webhook)"] : []),
                    ...(childAgeLine ? [childAgeLine] : []),
                    ...channexNotes.map((n) => `Notes (Channex): ${n}`),
                  ]),
                  client_id: clientId,
                  ...(channexMappedPricingPlanId ? { pricing_plan_id: channexMappedPricingPlanId } : {}),
                },
                p_checkin_date: arrivalDate,
                p_checkout_date: departureDate,
                p_establishment_id: establishmentId,
                p_room_id: null,
                p_category_id: categoryId,
              });
              if (rpcErr) throw rpcErr;
              const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;
              if (!result?.success || !result?.reservation_id) {
                const rpcMessage = ensureString(result?.error);
                if (isAvailabilityErrorMessage(rpcMessage) && categoryId) {
                  reservationIsOverbooking = true;
                  reservationId = await createOverbookingReservationFallback(supabase, {
                    establishmentId,
                    categoryId,
                    clientId: clientId!,
                    guestName,
                    arrivalDate,
                    departureDate,
                    amount,
                    adults: occInfo.adults,
                    children: occInfo.children,
                    notesSuffix,
                    paidByOta,
                    shouldApplyAutoPayment,
                    mappedPricingPlanId: channexMappedPricingPlanId,
                    otaName,
                    bookingRef: uniqueId || bookingId,
                  });
                  await supabase.from("channex_sync_logs").insert({
                    ota_channel_id: channelId,
                    establishment_id: establishmentId,
                    direction: "pull_booking",
                    status: "warning",
                    endpoint: "channex-reservations-sync (modified_overbooking_fallback)",
                    message: `Reprocessamento criou reserva sem quarto por indisponibilidade (${revisionId})`,
                    request_payload: {
                      booking_id: bookingId || null,
                      unique_id: uniqueId || null,
                      reservation_id: reservationId,
                      category_id: categoryId,
                      rpc_error: rpcMessage,
                    },
                  });
                } else {
                  throw new Error(result?.error || "Falha ao reprocessar modificação");
                }
              } else {
                reservationId = String(result.reservation_id);
              }
            }
            const { data: newReservationRow } = await supabase
              .from("reservations")
              .select("reservation_code, notes")
              .eq("id", reservationId)
              .maybeSingle();
            const newReservationCode = ensureString((newReservationRow as AnyObj | null)?.reservation_code);
            const newReservationNotes = ensureString((newReservationRow as AnyObj | null)?.notes).toLowerCase();
            if (newReservationNotes.includes("overbooking")) reservationIsOverbooking = true;

            await supabase
              .from("reservations")
              .update({
                cancellation_reason:
                  "Reserva cancelada para reprocessar a versão atual.\n" +
                  `Nova reserva: ${newReservationCode || reservationId}`,
                notes:
                  `Reserva cancelada para reprocessar a versão atual.\n` +
                  `Nova reserva: ${newReservationCode || reservationId}\n` +
                  `Cancelada em: ${new Date().toISOString()}`,
              })
              .eq("id", oldReservationId);

            await updateOtaReservationsRow(supabase, {
              channelId,
              uniqueId,
              bookingId,
              existingOta,
              patch: {
                reservation_id: reservationId,
                ota_guest_name: guestName,
                ota_guest_email: email,
                ota_guest_phone: phone,
                ota_source_channel_name: otaName,
                sync_status: "synced",
                synced_at: new Date().toISOString(),
              },
            });

            if (paidByOta && amount > 0) {
              const payErr = await insertChannelPrepaidPayment(supabase, {
                reservationId,
                establishmentId,
                amount,
                bookingId: uniqueId || bookingId,
                managerName: "Channex",
                partnerName: otaName,
              });
              if (payErr.error) {
                console.warn("channex-reservations-sync modified(reprocess) prepaid payment warning", payErr.error);
              }
            }

            try {
              await maybeSendLifecycleTemplateForChannelReservation(
                reservationId,
                reservationIsOverbooking ? "reservation_overbooking" : "reservation_modified",
              );
            } catch (e) {
              console.warn("channex-reservations-sync modified(reprocess) lifecycle template warning", e);
            }

            await supabase.from("channex_sync_logs").insert({
              ota_channel_id: channelId,
              establishment_id: establishmentId,
              direction: "pull_booking",
              status: "success",
              endpoint: "channex-reservations-sync (modified_reprocess)",
              message: `Modificação aceita e reprocessada (${revisionId})`,
              request_payload: {
                revision_id: revisionId,
                booking_id: bookingId || null,
                unique_id: uniqueId || null,
                old_reservation_id: oldReservationId,
                new_reservation_id: reservationId,
                new_reservation_code: newReservationCode || null,
              },
            });

            await supabase.rpc("create_notification_for_establishment", {
              p_establishment_id: establishmentId,
              p_type: "reservation_modified",
              p_title: "Reserva de Canal Reprocessada",
              p_message: `Reserva ${uniqueId || bookingId} reprocessada. Alterações: hóspede, período, valores e possível quarto/categoria.`,
              p_priority: "high",
              p_metadata: {
                source: "channex_channel",
                action: "modified_reprocess",
                previous_reservation: previousReservation,
                current: {
                  reservation_id: reservationId,
                  checkin_date: arrivalDate || null,
                  checkout_date: departureDate || null,
                  guest_name: guestName,
                  total_amount: amount > 0 ? amount : 0,
                },
              },
            });
          } else {
          let reservationIsOverbooking = detectedOverbooking;
          const shouldApplyAutoPayment = paidByOta
            ? await shouldApplyChannelAutoPayment(supabase, establishmentId, otaName)
            : false;
          let mappedCategoryId = "";
          let mappedPricingPlanId = "";
          if (roomTypeId && ratePlanId) {
            const { data: mapping } = await supabase
              .from("channel_pricing")
              .select("category_id, pricing_plan_id")
              .eq("ota_channel_id", channelId)
              .eq("channel_room_code", roomTypeId)
              .eq("channel_rate_plan_code", ratePlanId)
              .maybeSingle();
            mappedCategoryId = ensureString((mapping as AnyObj | null)?.category_id);
            mappedPricingPlanId = ensureString((mapping as AnyObj | null)?.pricing_plan_id);
          }
          const patch: AnyObj = {
            checkin_date: arrivalDate || null,
            checkout_date: departureDate || null,
            guest_name: guestName,
            adults: occInfo.adults,
            children: occInfo.children,
            total_amount: amount > 0 ? amount : 0,
            paid_amount: paidByOta && shouldApplyAutoPayment && amount > 0 ? amount : 0,
            payment_status: paidByOta && shouldApplyAutoPayment && amount > 0 ? "paid" : "pending",
            notes: mergeReservationNotes((previousReservation as AnyObj | null)?.notes, [
              detectedOverbooking
                ? `Channex ${otaName} · booking ${uniqueId || bookingId} · modify · OVERBOOKING (detectado no feed/webhook)`
                : `Channex ${otaName} · booking ${uniqueId || bookingId} · modify`,
              ...(childAgeLine ? [childAgeLine] : []),
              ...channexNotes.map((n) => `Notes (Channex): ${n}`),
            ]),
          };
          if (mappedCategoryId) {
            patch.category_id = mappedCategoryId;
            const prevCategory = ensureString((previousReservation as AnyObj | null)?.category_id);
            if (!prevCategory || prevCategory !== mappedCategoryId) {
              // Troca de categoria invalida o quarto anterior para evitar inconsistência de inventário.
              patch.room_id = null;
            }
          }
          if (mappedPricingPlanId) {
            patch.pricing_plan_id = mappedPricingPlanId;
          }
          await supabase.from("reservations").update(patch).eq("id", reservationId);

          await updateOtaReservationsRow(supabase, {
            channelId,
            uniqueId,
            bookingId,
            existingOta,
            patch: {
              ota_guest_name: guestName,
              ota_guest_email: email,
              ota_guest_phone: phone,
              ota_source_channel_name: otaName,
              sync_status: "synced",
              synced_at: new Date().toISOString(),
            },
          });

          try {
            const { data: reservationRow } = await supabase
              .from("reservations")
              .select("reservation_code, checkin_date, checkout_date, total_amount, paid_amount, notes")
              .eq("id", reservationId)
              .maybeSingle();
            const rowNotes = ensureString((reservationRow as AnyObj | null)?.notes).toLowerCase();
            if (rowNotes.includes("overbooking")) reservationIsOverbooking = true;
            await createChannelReservationLifecycleNotification(supabase, {
              establishmentId,
              reservationId,
              reservationCode: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
              guestName,
              managerName: "Channex",
              partnerName: otaName,
              type: "reservation_modified",
            });
            await ensureWebCheckinRow(
              supabase,
              {
                id: reservationId,
                reservation_code: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
                checkin_date: (reservationRow as { checkin_date?: string | null } | null)?.checkin_date ?? null,
              },
              establishmentId,
            );

            await queueChannelReservationEmail(supabase, {
              reservationId,
              establishmentId,
              guestName,
              guestEmail: email,
              otaGuestEmail: email,
              totalAmount: Number((reservationRow as AnyObj | null)?.total_amount ?? amount ?? 0),
              paidAmount: Number((reservationRow as AnyObj | null)?.paid_amount ?? 0),
              checkinDate: String((reservationRow as AnyObj | null)?.checkin_date ?? arrivalDate ?? ""),
              checkoutDate: String((reservationRow as AnyObj | null)?.checkout_date ?? departureDate ?? ""),
              reservationCode: String((reservationRow as AnyObj | null)?.reservation_code ?? ""),
            });
          } catch (e) {
            console.warn("channex-reservations-sync modified notification/web-checkin warning", e);
          }

          try {
            if (!reservationIsOverbooking) {
              await maybeSendCheckinChargeAutomationsForChannelReservation(reservationId, establishmentId);
            }
          } catch (e) {
            console.warn("channex-reservations-sync modified checkin-charge warning", e);
          }

          if (paidByOta && amount > 0) {
            const payErr = await insertChannelPrepaidPayment(supabase, {
              reservationId,
              establishmentId,
              amount,
              bookingId: uniqueId || bookingId,
              managerName: "Channex",
              partnerName: otaName,
            });
            if (payErr.error) {
              console.warn("channex-reservations-sync modified prepaid payment warning", payErr.error);
            }
          }
          try {
            await maybeSendLifecycleTemplateForChannelReservation(
              reservationId,
              reservationIsOverbooking ? "reservation_overbooking" : "reservation_modified",
            );
          } catch (e) {
            console.warn("channex-reservations-sync modified lifecycle template warning", e);
          }
          }
          modified += 1;
          }
        } else if (!shouldQueueLifecyclePending && revisionStatus === "cancelled" && reservationId) {
          await applyChannelCancellationWithPolicy(supabase, {
            reservationId,
            reason: `Cancelada via Channex · booking ${uniqueId || bookingId}`,
          });

          await updateOtaReservationsRow(supabase, {
            channelId,
            uniqueId,
            bookingId,
            existingOta,
            patch: {
              sync_status: "cancelled",
              synced_at: new Date().toISOString(),
            },
          });

          try {
            const { data: reservationRow } = await supabase
              .from("reservations")
              .select("reservation_code")
              .eq("id", reservationId)
              .maybeSingle();
            await createChannelReservationLifecycleNotification(supabase, {
              establishmentId,
              reservationId,
              reservationCode: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
              guestName,
              managerName: "Channex",
              partnerName: otaName,
              type: "reservation_cancelled",
            });
          } catch (e) {
            console.warn("channex-reservations-sync cancelled notification warning", e);
          }

          // Cancelamento mais recente invalida pendências anteriores de modificação do mesmo booking.
          if (bookingId) {
            await supabase
              .from("channex_booking_revisions")
              .update({
                process_status: "processed",
                error_message: `Superseded by cancellation revision ${revisionId}`,
                updated_at: new Date().toISOString(),
              })
              .eq("ota_channel_id", channelId)
              .eq("booking_id", bookingId)
              .eq("status", "modified")
              .in("process_status", ["pending", "failed"])
              .neq("revision_id", revisionId);
          }
          if (uniqueId) {
            await supabase
              .from("channex_booking_revisions")
              .update({
                process_status: "processed",
                error_message: `Superseded by cancellation revision ${revisionId}`,
                updated_at: new Date().toISOString(),
              })
              .eq("ota_channel_id", channelId)
              .eq("unique_id", uniqueId)
              .eq("status", "modified")
              .in("process_status", ["pending", "failed"])
              .neq("revision_id", revisionId);
          }
          try {
            await maybeSendLifecycleTemplateForChannelReservation(reservationId, "reservation_cancelled");
          } catch (e) {
            console.warn("channex-reservations-sync cancelled lifecycle template warning", e);
          }
          await supabase.from("channex_sync_logs").insert({
            ota_channel_id: channelId,
            establishment_id: establishmentId,
            direction: "pull_booking",
            status: "success",
            endpoint: "channex-reservations-sync (cancelled)",
            message: `Cancelamento processado (${revisionId})`,
            request_payload: {
              revision_id: revisionId,
              booking_id: bookingId || null,
              unique_id: uniqueId || null,
              reservation_id: reservationId,
            },
          });
          cancelled += 1;
        } else if (!shouldQueueLifecyclePending && revisionStatus === "cancelled" && !reservationId) {
          // Reserva cancelada sem vínculo local: mantemos revisão processada para permitir ACK e evitar loop no feed.

          if (bookingId) {
            await supabase
              .from("channex_booking_revisions")
              .update({
                process_status: "processed",
                error_message: `Superseded by cancellation revision ${revisionId}`,
                updated_at: new Date().toISOString(),
              })
              .eq("ota_channel_id", channelId)
              .eq("booking_id", bookingId)
              .eq("status", "modified")
              .in("process_status", ["pending", "failed"])
              .neq("revision_id", revisionId);
          }
          if (uniqueId) {
            await supabase
              .from("channex_booking_revisions")
              .update({
                process_status: "processed",
                error_message: `Superseded by cancellation revision ${revisionId}`,
                updated_at: new Date().toISOString(),
              })
              .eq("ota_channel_id", channelId)
              .eq("unique_id", uniqueId)
              .eq("status", "modified")
              .in("process_status", ["pending", "failed"])
              .neq("revision_id", revisionId);
          }
          cancelled += 1;
        }

        await supabase.from("channex_booking_revisions").upsert(
          {
            ota_channel_id: channelId,
            establishment_id: establishmentId,
            revision_id: revisionId,
            booking_id: bookingId,
            unique_id: uniqueId || null,
            system_id: ensureString(attrs.system_id) || null,
            status: revisionStatus || "new",
            payload: {
              ...attrs,
              _processing_meta: {
                ...processingMeta,
                detected_overbooking: detectedOverbooking,
              },
            },
            reservation_id: reservationId || null,
            process_status: processStatusForRevision,
            processed_at: new Date().toISOString(),
            error_message: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ota_channel_id,revision_id" }
        );

        // Sempre que uma revisão for registrada, limpar pendências/falhas anteriores do mesmo booking
        // para evitar reaparecimento de revisões antigas já ultrapassadas.
        if (bookingId) {
          await supabase
            .from("channex_booking_revisions")
            .update({
              process_status: "processed",
              error_message: `Superseded by newer revision ${revisionId}`,
              updated_at: new Date().toISOString(),
            })
            .eq("ota_channel_id", channelId)
            .eq("booking_id", bookingId)
            .in("process_status", ["pending", "failed"])
            .neq("revision_id", revisionId);
        }
        if (uniqueId) {
          await supabase
            .from("channex_booking_revisions")
            .update({
              process_status: "processed",
              error_message: `Superseded by newer revision ${revisionId}`,
              updated_at: new Date().toISOString(),
            })
            .eq("ota_channel_id", channelId)
            .eq("unique_id", uniqueId)
            .in("process_status", ["pending", "failed"])
            .neq("revision_id", revisionId);
        }

        if (processStatusForRevision === "processed") {
          await supabase.from("channex_ack_queue").upsert(
            {
              ota_channel_id: channelId,
              establishment_id: establishmentId,
              revision_id: revisionId,
              status: "pending",
              next_attempt_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "ota_channel_id,revision_id" }
          );
        }
      } catch (e) {
        failed += 1;
        await supabase.from("channex_booking_revisions").upsert(
          {
            ota_channel_id: channelId,
            establishment_id: establishmentId,
            revision_id: revisionId,
            booking_id: bookingId,
            unique_id: uniqueId || null,
            system_id: ensureString(attrs.system_id) || null,
            status: revisionStatus || "new",
            payload: {
              ...attrs,
              _processing_meta: {
                ...processingMeta,
                detected_overbooking: detectedOverbooking,
              },
            },
            process_status: "failed",
            processed_at: new Date().toISOString(),
            error_message: e instanceof Error ? e.message : "Falha no processamento",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ota_channel_id,revision_id" }
        );
      }
    }

    // Try immediate ack worker execution to reduce queue delay.
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/channex-ack-worker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ channel_id: channelId, establishment_id: establishmentId }),
      });
    } catch {
      // ignore; queue remains pending
    }

    await supabase.from("channex_sync_logs").insert({
      ota_channel_id: channelId,
      establishment_id: establishmentId,
      direction: "pull_booking",
      status: failed > 0 ? "warning" : "success",
      endpoint: feedPath,
      message: `Processadas ${processed} revisão(ões)`,
      request_payload: {
        revisionFilter: revisionFilter || null,
        bookingIdFilter: bookingIdFilter || null,
        bookingUniqueIdFilter: bookingUniqueIdFilter || null,
        recentWindowSeconds,
      },
      response_payload: {
        processed,
        created,
        modified,
        cancelled,
        failed,
        fetched_items: list.length,
        skipped_missing_ids: skippedMissingIds,
        skipped_by_source_event: skippedBySourceEvent,
      },
    });

    return json({
      success: true,
      processed,
      created,
      modified,
      cancelled,
      failed,
      skipped_missing_ids: skippedMissingIds,
      skipped_by_source_event: skippedBySourceEvent,
    });
  } catch (error) {
    console.error("channex-reservations-sync error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});