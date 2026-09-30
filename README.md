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
- **No**: la observabilidad (`bootstrapObservability`). Es lógica de arranque
  (kernel), no vocabulario — pertenece a `@ai4u/platform`, no acá.

## Instalación

```bash
npm install github:ai4u-com-co/contracts#v0.6.0
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
