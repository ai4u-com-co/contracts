# CLAUDE.md — @ai4u/contracts

Vocabulario compartido del ecosistema superAI: tipos y mapas que dos o más repos deben ver
idénticos. Sin dependencias de runtime. Lo consumen apps y agentes (hoy el consumidor real de
`BackendClient` documentado en el README es `sap-b1-chat`). No es una app: se **publica como tag**.

## Dónde vive el código (importante)
- La fuente de verdad es el monorepo `ai4u-com-co/kernel` (`packages/contracts`). Este repo
  (`ai4u-com-co/contracts`) es un **espejo** que `kernel/.github/workflows/mirror.yml` sobrescribe
  (`rsync --delete`) al publicar un tag `contracts-vX.Y.Z`. Un cambio hecho solo aquí se pierde.
- Rama default de este repo: `main`.

## Stack
- TypeScript (`tsc`), tests con `vitest`. CI usa Node 22. Versión actual en `package.json`: 0.7.0.

## Comandos (de `package.json`)
- `npm ci` — instalar
- `npm run type-check` — `tsc --noEmit`
- `npm test` — `vitest run`
- `npm run build` — `tsc` → `dist/`

## Estructura (`src/`, exportado todo desde `src/index.ts`)
- `entity-map.ts` — `ENTITY_MAP`: clave de negocio (`ventas/pedidos`) → entidad del Service Layer,
  `keyType`, acciones permitidas y `select` por defecto.
- `backend-client.ts` — `BackendClient` / `BackendError`: cliente HTTP hacia `sap-b1-backend`.
- `agent-adapter.ts` — `IAgentAdapter`: contrato mínimo de los agentes de automatización.
- `sap-table-schemas.ts` — `SAP_TABLE_SCHEMAS`: metadata de tablas físicas HANA (vía SQLQueries).
- `tests/` — un archivo por módulo.

## Convenciones y trampas
- **`dist/` se commitea** y los consumidores leen `dist/`. El CI falla si no coincide con un build
  fresco: corre `npm run build` y commitea el resultado.
- Mantener el paquete **sin dependencias**: `extraHeaders` existe justamente para que el caller
  inyecte la identidad OIDC sin que este paquete importe `@vercel/oidc` ni `@ai4u/platform`.
- `BackendClient`: resuelve la URL en cada request (`baseUrl` > `SAP_BACKEND_URL` > `BACKEND_URL` >
  `NEXT_PUBLIC_BACKEND_URL`); en producción sin URL lanza en vez de llamar a localhost. Los headers
  `X-API-Key`, `x-mc-secret`, `x-consumer` y `x-request-id` no los puede pisar `extraHeaders`.
- `sap-table-schemas.ts` describe tablas HANA (SQLQueries), no las propiedades OData: pueden diferir.
- Contrastar `ENTITY_MAP` y los esquemas con `sap-b1-backend` / `GET /$metadata` antes de cambiarlos;
  no inventar entidades ni campos de SAP.
- Multitenant: `BackendClient` recibe `tenantId` y `IAgentAdapter` admite `onlyTenant`. No hardcodear
  tenants; queries y permisos con scope por tenant.
- Solo se habla con SAP vía `sap-b1-backend` (:4100), nunca directo al Service Layer.
- Cambios: test en `tests/` + entrada en `CHANGELOG.md` + subir `version`.

## Variables de entorno (solo nombres; las lee el código)
`SAP_BACKEND_URL` (alias `BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL`), `MISSION_CONTROL_SECRET` y `BACKEND_SERVICE_SECRET` (auth servicio a servicio, `x-mc-secret`; uso exacto por confirmar),
`SERVICE_ID` / `PLATFORM_SERVICE` (atribución `x-consumer`), `NODE_ENV`, `VERCEL_ENV`. Definidas por cada app consumidora.

## Publicar una versión
1. Subir `version`, `npm run build`, actualizar `CHANGELOG.md`.
2. PR a `main` de `kernel` (CI: type-check, test, build, `dist/` al día).
3. Tag `contracts-vX.Y.Z` en `kernel`: el workflow publica el contenido y el tag `vX.Y.Z` en el espejo.
4. Los consumidores pinean `github:ai4u-com-co/contracts#vX.Y.Z`.

## Por confirmar
- Lista actual de consumidores (el README solo nombra a `sap-b1-chat`).
- Identidad exacta del flujo de publicación: se dedujo de `kernel/.github/workflows/mirror.yml`.
