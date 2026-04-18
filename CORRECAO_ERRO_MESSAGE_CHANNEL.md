# Correção do Erro: "message channel closed"

## Problema
```
Uncaught (in promise) Error: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received
```

## Causa
Este erro **não é causado pela aplicação**, mas sim por **extensões do navegador** que tentam interceptar mensagens entre scripts. É um problema comum e não afeta a funcionalidade da aplicação.

### Extensões que podem causar este erro:
- Extensões de tradução (Google Translate, etc.)
- Extensões de bloqueio de anúncios
- Extensões de segurança/privacy
- Extensões de desenvolvedor
- Extensões de automação

## Solução Implementada

Foi adicionado tratamento de erro global em `src/main.tsx` para suprimir esses erros específicos de extensões do navegador, evitando que apareçam no console e confundam o desenvolvedor.

### O que foi feito:
1. Adicionado listener para erros não capturados
2. Adicionado listener para rejeições de Promise não tratadas
3. Filtro para identificar e suprimir erros relacionados a "message channel closed"

## Como Verificar

1. Recarregue a aplicação
2. O erro não deve mais aparecer no console
3. A funcionalidade da aplicação permanece intacta

## Se o Erro Persistir

Se o erro continuar aparecendo, pode ser causado por uma extensão específica:

1. **Teste em modo anônimo** (sem extensões):
   - Abra uma janela anônima/privada
   - Acesse a aplicação
   - Se o erro desaparecer, é uma extensão

2. **Desabilite extensões uma por uma** para identificar qual está causando o problema

3. **Extensões comuns que causam este erro**:
   - LastPass
   - Grammarly
   - AdBlock Plus
   - uBlock Origin
   - Extensões de tradução

## Nota Técnica

Este erro ocorre quando:
- Uma extensão registra um listener de mensagem que retorna `true` (indicando resposta assíncrona)
- O canal de mensagem é fechado antes da resposta ser enviada
- Isso é um problema da extensão, não da aplicação

A solução implementada suprime apenas esses erros específicos, mantendo outros erros legítimos visíveis para debug.

