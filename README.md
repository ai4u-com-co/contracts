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
  que ya traen una key válida (el caso de `mission-control`, siempre). Cero cambio
  de comportamiento para ninguno de los dos, verificado con 6 tests que prueban
  exactamente esa precedencia (`tests/backend-client.test.ts`).
- **No**: la observabilidad (`bootstrapObservability`). Es lógica de arranque
  (kernel), no vocabulario — pertenece a `@ai4u/platform`, no acá.

## Instalación

```bash
npm install github:ai4u-com-co/contracts#v0.2.0
```

## Uso

```ts
import { ENTITY_MAP, type EntityConfig, BackendClient } from "@ai4u/contracts"

const cfg = ENTITY_MAP["ventas/pedidos"]
const client = new BackendClient(tenantId, apiKey)
```
