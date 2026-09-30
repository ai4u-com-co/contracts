# Changelog — @ai4u/contracts

## 0.6.0 — 2026-09-29

### Agregado
- `BackendClient` manda `x-consumer` también **sin** pasar la opción: si no se pasa
  `consumer`, lo toma de la env `SERVICE_ID` (nombre canónico del contrato de
  `@ai4u/config`) o de su alias `PLATFORM_SERVICE`. Orden: opción > `SERVICE_ID` >
  `PLATFORM_SERVICE`. Se resuelve en cada request (respeta `setServiceName()` de
  `@ai4u/platform` llamado después de construir el cliente). Valores vacíos o solo
  espacios se ignoran.
- Getter `client.consumer` y función exportada `resolveConsumer(explicit?)`.
- Comentario `TODO(fase3)` en `headers()` que marca la auth S2S heredada
  (`x-mc-secret` + placeholder `"S2S_AUTH"` como X-API-Key) a retirar en la Fase 3.

### Sin cambios
- Sin opción ni env, el header `x-consumer` no se manda (igual que 0.5.0).
- `X-API-Key`, `x-mc-secret` (`BACKEND_SERVICE_SECRET ?? MISSION_CONTROL_SECRET`),
  `x-request-id`, URL base (`BACKEND_URL ?? NEXT_PUBLIC_BACKEND_URL`) y `BackendError`.

## 0.5.0
- `BackendError` tipado (envelope del backend) y opciones `requestId` / `consumer`
  (`x-request-id` / `x-consumer`).

## 0.4.0
- `SAP_TABLE_SCHEMAS`.

## 0.3.0
- Contrato `IAgentAdapter`.

## 0.2.0
- `BackendClient` unificado (mission-control + sap-b1-chat).
