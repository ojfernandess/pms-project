# Favicon do motor de reservas (white-label)

## Objetivo

Carregar **apenas** o ícone configurado em `companies.booking_engine_favicon`, eliminando:

1. Favicon “genérico” do PMS (`site_settings.favicon_url`) nas rotas do motor  
2. Placeholder cinza em `data:`  
3. Múltiplas substituições em sequência que geravam **várias requisições** ao mesmo recurso

## Raiz `/` e domínio personalizado

No **domínio personalizado** do motor, a URL da home é `https://hotel.com/` (pathname `"/"`). Essa rota é tratada como motor em `isBookingEngineRoute` para que **`useSiteMeta` não injete o favicon do SuperAdmin** na raiz — antes isso gerava **dois** ícones (PMS + cliente) e mais requisições.

## Componentes

| Peça | Função |
|------|--------|
| `src/utils/bookingEngineRoutes.ts` | Prefixos do motor + **raiz `/`** como motor (white-label) |
| `src/utils/bootstrapMotorFavicon.ts` | `stripStaticFaviconLinksOnMotorBoot()` — remove links legados **antes** do React (chamado em `main.tsx`) |
| `src/utils/bookingEngineFavicon.ts` | `applyMotorBookingEngineFavicon(company)` — remove ícones existentes e insere **no máximo um** `<link rel="icon" data-motor-booking-favicon="1">` |
| `src/hooks/useMotorMeta.ts` | Aplica o favicon quando `company` carrega |
| `src/hooks/useSiteMeta.ts` | Nas rotas do motor **não** injeta favicon do SuperAdmin |

## Comportamento sem favicon do cliente

Se `booking_engine_favicon` estiver vazio ou a URL for inválida, **todos** os `link[rel=icon|shortcut icon|apple-touch-icon]` são removidos. **Não** há fallback para favicon do sistema nem placeholder cinza.

## Métricas de rede (antes × depois)

Cenário típico na **home do motor** com cliente configurado:

| Fase (antes) | Requisições de favicon |
|--------------|-------------------------|
| `<link>` no HTML (placeholder cinza) | 1× `data:` SVG |
| `useSiteMeta` (legado) | 1× substituição neutra |
| `applyBookingEngineFavicon` (legado) com cliente | 1× URL do cliente |

**Total aproximado:** até **3** cargas visíveis na aba / trocas de `href`.

| Fase (depois) | Requisições de favicon |
|---------------|-------------------------|
| `<head>` sem `<link rel="icon">` estático | 0 |
| `stripStaticFaviconLinksOnMotorBoot` | 0 (limpeza defensiva) |
| `applyMotorBookingEngineFavicon` | **1×** URL do cliente |

**Redução:** de até **3** para **1** requisição de recurso de ícone por página (motor com favicon configurado).

> **Nota:** alguns navegadores podem tentar `GET /favicon.ico` mesmo sem `<link>`; este projeto não inclui `public/favicon.ico`, minimizando esse ruído.

## Testes

```bash
npm run test
```

Arquivo: `src/utils/bookingEngineFavicon.test.ts` — valida contagem de links, noop idempotente, ausência de placeholder e URLs inválidas.
