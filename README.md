# @ai4u/contracts

Vocabulario compartido del ecosistema **superAI**: tipos y mapas que dos o más repos
necesitan ver idénticos. Si un mismo concepto vive duplicado en más de un repo (y las
copias pueden divergir en silencio), este es el lugar — no una copia local más.

Distribución: igual que `@ai4u/platform`, `@ai4u/mc-sso`, `@ai4u/design-system` y
`@ai4u/config` — repo GitHub con `dist/` commiteado, consumido por tag:
`"@ai4u/contracts": "github:ai4u-com-co/contracts#vX.Y.Z"`.

## Qué resuelve (y qué NO)

- **Sí**: el vocabulario SAP (`ENTITY_MAP`) — un solo lugar para que "ventas/pedidos"
  siempre signifique lo mismo en todo el ecosistema.
- **Sí (desde v0.2.0)**: `BackendClient`, el cliente HTTP hacia `sap-b1-backend`.
  Vivía duplicado en `mission-control` y `sap-b1-chat`, con una diferencia real (no
  accidental): `sap-b1-chat` agrega un header opcional `x-mc-secret` para auth de
  servicio a servicio (`kpis → backend`). Se decidió unificar con la versión de
  `sap-b1-chat` (superset aditivo) tras verificar en el código real de
  `sap-b1-backend/lib/auth.ts` que `X-API-Key` se revisa primero y retorna de
  inmediato si es válido — el header `x-mc-secret` nunca se alcanza para requests
  que ya traen una key válida, verificado con 6 tests que prueban exactamente esa
  precedencia (`tests/backend-client.test.ts`).

  **Giro real al ejecutar la migración**: `mission-control` nunca terminó
  importando este paquete. Al ir a rewirear su `BackendClient` local se encontró
  que **nada lo instanciaba** (`grep "new BackendClient"` → 0 resultados) — el
  único consumidor era una cadena de código muerto (`lib/chat/sap-context.ts` →
  `lib/chat/system-prompt.ts`, éste último ya confirmado sin imports desde la
  auditoría de arquitectura). Se borraron los 3 archivos en vez de migrarlos
  (`mission-control#198`). Hoy el único consumidor real de `BackendClient` es
  `sap-b1-chat` (`sap-b1-chat#11`).
- **Sí (desde v0.3.0)**: `IAgentAdapter` — el contrato mínimo que un agente de
  automatización (OrderLoader, Cobro de Cartera, Cotizador...) implementa para
  correr, listarse y eventualmente certificarse de forma uniforme, sin que el
  catálogo tenga que conocer los detalles internos de cada uno. Primer paso
  concreto hacia un catálogo de agentes instalable (no forzado por diseño
  desde el principio — nació de mirar el shape real que ya tenía
  `runCollectionJob` en `cobro-cartera` y nombrarlo). A propósito NO define
  un `summary` normalizado: cada agente conserva su propia forma de reportar
  qué hizo, porque forzar un shape común ahí sería inventar acoplamiento que
  no existe en la realidad.
- **Sí (desde v0.6.0)**: atribución por app en el gateway. `BackendClient` manda
  `x-consumer` con el nombre de la app — de la opción `consumer`, o si no, de la env
  `SERVICE_ID` (canónica en `@ai4u/config`) / su alias `PLATFORM_SERVICE`. Sin
  ninguno, no manda el header. Es solo atribución: el gateway lo registra en
  `platform_logs` y nunca autoriza con él. Ver [Atribución con `x-consumer`](#atribución-con-x-consumer).
- **Sí (desde v0.6.1)**: URL del gateway por el contrato de env. `BackendClient` lee
  `SAP_BACKEND_URL` (canónica en `@ai4u/config`, Shared Env Var del team en Vercel) con
  `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL` como alias legados, o la opción `baseUrl`.
  Ver [URL del gateway](#url-del-gateway).
- **Sí (desde v0.7.0)**: headers extra por request (`extraHeaders`), pensado para la
  identidad OIDC de la app hacia el gateway (Fase 3). Ver
  [Headers extra por request](#headers-extra-por-request-identidad-oidc).
- **No**: la observabilidad (`bootstrapObservability`). Es lógica de arranque
  (kernel), no vocabulario — pertenece a `@ai4u/platform`, no acá.

## Instalación

```bash
npm install github:ai4u-com-co/contracts#v0.7.0
```

## Uso

```ts
import { ENTITY_MAP, type EntityConfig, BackendClient, type IAgentAdapter } from "@ai4u/contracts"

const cfg = ENTITY_MAP["ventas/pedidos"]
const client = new BackendClient(tenantId, apiKey)

// Atribución en el gateway (opcional; si no, usa SERVICE_ID / PLATFORM_SERVICE):
const atribuido = new BackendClient(tenantId, apiKey, { consumer: "mission-control" })

const miAgente: IAgentAdapter = {
  id: "cobro-cartera",
  version: "1.0.0",
  async run(opts) {
    // opts?.onlyTenant restringe la corrida a un tenant — el resto de la
    // forma de "summary" queda 100% en manos del agente.
    return { ranAt: new Date().toISOString(), ok: true, summary: {} }
  },
}
```

## URL del gateway

Orden de resolución (en cada request, no al cargar el módulo): opción `baseUrl` >
env `SAP_BACKEND_URL` > `BACKEND_URL` > `NEXT_PUBLIC_BACKEND_URL`. Valores vacíos o
solo espacios cuentan como ausentes; se quitan las `/` finales.

Sin ninguna: fuera de producción usa `http://localhost:4100`; en producción
(`NODE_ENV=production` o `VERCEL_ENV=production`) la llamada falla con un Error que
nombra `SAP_BACKEND_URL` — nunca hace fetch a localhost. Ojo: `next build`/`next start`
corren con `NODE_ENV=production` (también en Preview de Vercel), así que ahí la variable
tiene que estar definida.

```ts
new BackendClient("tamaprint", apiKey)                                   // SAP_BACKEND_URL
new BackendClient("tamaprint", apiKey, { baseUrl: "http://gw.interno" }) // explícita
resolveBackendUrl() // la URL que se usaría ahora (o lanza en prod sin URL)
```

Los alias `SAP_B1_BACKEND_URL` y `KPIS_APP_URL` del contrato no se leen (el cliente
nunca los leyó). `BACKEND_URL_ENV_NAMES` exporta la lista; un test la contrasta con
`ENV_CONTRACT` dentro del monorepo kernel.

## Headers extra por request (identidad OIDC)

Opción `extraHeaders?: () => Promise<Record<string, string>> | Record<string, string>`.
Ejemplo real de `sap-b1-chat` (`app/api/chat/route.ts`), con el helper de
`@ai4u/platform/gateway-identity` (desde platform v0.6.0):

```ts
import { BackendClient } from "@ai4u/contracts"
import { getGatewayIdentityHeaders } from "@ai4u/platform/gateway-identity"

const client = new BackendClient(tenantId, apiKey, {
  baseUrl: backendUrl,
  requestId: apiCtx.requestId,
  consumer: "sap-b1-chat",
  // Se evalúa en CADA request: el token OIDC vence, nunca se cachea acá.
  extraHeaders: () => getGatewayIdentityHeaders(), // → { "x-ai4u-identity": "<jwt>" } o {}
})
```

Reglas:
- **Por request**: la función se llama antes de cada `get`/`post`/`patch`; el cliente
  no guarda el resultado (el caché del token, si lo hay, es del helper).
- **No pisa auth ni trazabilidad**: `X-API-Key`, `x-mc-secret`, `x-consumer` y
  `x-request-id` (sin distinguir mayúsculas, exportados como
  `PROTECTED_BACKEND_HEADERS`) siempre los pone el cliente; si `extraHeaders` los
  trae, se descartan — ni pisan un valor existente ni inyectan uno que el cliente no mandaba.
- **Fail-open**: si la función lanza, su promesa se rechaza o devuelve algo que no es
  objeto, la request sale igual sin los headers extra y el cliente no lanza. El
  timeout es de quien la pasa (`getGatewayIdentityHeaders` ya trae 1.5 s y devuelve `{}`).
- Entradas con nombre de header inválido o valor no-string / con CR-LF se descartan una
  por una (para que `fetch` no rechace la request entera).
- `@ai4u/contracts` sigue **sin dependencias**: no importa `@vercel/oidc` ni
  `@ai4u/platform`; el caller inyecta la función.

## Atribución con `x-consumer`

Orden de resolución (en cada request): opción `consumer` > env `SERVICE_ID` > env
`PLATFORM_SERVICE` > sin header. Valores vacíos o solo espacios cuentan como ausentes.

Convención del valor:
- Apps en Vercel: el **nombre del proyecto en Vercel** (`mission-control`,
  `desarrollo-oc`, `sap-b1-chat`...), no el del repo.
- Servicios en Docker (OrderLoader): el nombre de servicio de logs,
  `orderloader-${TENANT}` (`orderloader-tamaprint`, `orderloader-flexoimpresos`).

```ts
const client = new BackendClient("tamaprint", apiKey, { consumer: "sap-b1-chat" })
client.consumer // "sap-b1-chat"
```

> La auth S2S heredada (`x-mc-secret` + el placeholder `"S2S_AUTH"` como X-API-Key)
> sigue igual en 0.6.0; está marcada con `TODO(fase3)` en `src/backend-client.ts`.
