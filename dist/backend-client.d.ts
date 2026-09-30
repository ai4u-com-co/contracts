/**
 * Variables de entorno de donde sale la URL del gateway, en orden de prioridad.
 * `SAP_BACKEND_URL` es el nombre canónico del contrato de `@ai4u/config/env`
 * (`ENV_CONTRACT.SAP_BACKEND_URL`, Shared Env Var del team en Vercel); los otros dos
 * son sus alias legados, en el mismo orden que el contrato. Se replica acá en vez de
 * importar `readEnv` para no sumarle a este paquete (hoy sin dependencias) la de
 * `@ai4u/config`, que arrastra `@supabase/supabase-js`. Un test compara esta lista
 * con `ENV_CONTRACT` cuando corre dentro del monorepo kernel.
 *
 * Los alias `SAP_B1_BACKEND_URL` y `KPIS_APP_URL` del contrato NO se leen a propósito:
 * el cliente nunca los leyó y sumarlos podría redirigir el tráfico de un consumidor
 * que hoy los tiene seteados con otro sentido.
 */
export declare const BACKEND_URL_ENV_NAMES: readonly ["SAP_BACKEND_URL", "BACKEND_URL", "NEXT_PUBLIC_BACKEND_URL"];
/**
 * Error tipado de una llamada al backend. Conserva el formato de `message` de
 * siempre (`Backend {METHOD} {path} ({status}): {body}`) para no romper a quien
 * lo parsea como texto, y además expone los campos del envelope JSON del
 * backend para clasificar sin regex frágiles:
 *   { error, code, uncertain, sapCode?, sapMessage?, table?, column? }
 * (`sapCode`/`sapMessage`/`table`/`column` solo vienen en rechazos 4xx de SAP.)
 */
export declare class BackendError extends Error {
    readonly name = "BackendError";
    readonly method: string;
    readonly path: string;
    readonly status: number;
    readonly body: string;
    /** Código estable del backend: SAP_TIMEOUT, SAP_QUERY_ERROR, SAP_UNREACHABLE, ... */
    readonly code?: string;
    /** Mensaje seguro (en español) que el backend puso en `error`. */
    readonly backendMessage?: string;
    readonly uncertain?: boolean;
    readonly sapCode?: string;
    readonly sapMessage?: string;
    readonly table?: string;
    readonly column?: string;
    /** x-request-id enviado en la llamada (para cruzar con los logs del backend). */
    readonly requestId?: string;
    constructor(method: string, path: string, status: number, body: string, requestId?: string);
}
export interface BackendClientOptions {
    /**
     * URL base del gateway sap-b1-backend (sin `/api/v1/...`). Si no se pasa, se usa la
     * env `SAP_BACKEND_URL` o sus alias legados `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL`.
     * Ver `resolveBackendUrl()`.
     */
    baseUrl?: string;
    /**
     * Se envía como `x-request-id`. El middleware del backend lo reusa como su
     * requestId, así que el log del consumidor y el del backend quedan unidos.
     */
    requestId?: string;
    /**
     * Se envía como `x-consumer` (p. ej. "sap-b1-chat") para atribuir el tráfico en
     * los logs del backend. Es SOLO atribución: el backend nunca autoriza con él.
     *
     * Si no se pasa, se usa la env `SERVICE_ID` (nombre canónico del contrato de
     * `@ai4u/config`) o su alias `PLATFORM_SERVICE`. Si no hay ninguno, el header no
     * se manda (compatibilidad con los consumidores actuales).
     *
     * Convención del valor: nombre del proyecto en Vercel (`mission-control`,
     * `desarrollo-oc`...) o, en Docker, el nombre de servicio de logs
     * (`orderloader-tamaprint`).
     */
    consumer?: string;
}
/**
 * Resuelve el valor de `x-consumer`: opción explícita > env `SERVICE_ID` >
 * alias `PLATFORM_SERVICE` > undefined (no se manda el header).
 * Se resuelve en cada request (no al construir) porque `@ai4u/platform` puede
 * fijar `PLATFORM_SERVICE` en runtime vía `setServiceName()` después de que el
 * cliente ya exista.
 */
export declare function resolveConsumer(explicit?: string): string | undefined;
/**
 * Resuelve la URL base del gateway: opción explícita > `SAP_BACKEND_URL` >
 * `BACKEND_URL` > `NEXT_PUBLIC_BACKEND_URL`. Valores vacíos o solo espacios se
 * ignoran y se quitan las `/` finales.
 *
 * Sin ninguna: fuera de producción devuelve `http://localhost:4100`; en producción
 * (`NODE_ENV === "production"` o `VERCEL_ENV === "production"`) lanza un Error que
 * nombra `SAP_BACKEND_URL` en vez de mandar el tráfico a localhost.
 *
 * `BackendClient` la llama en cada request (no al cargar el módulo ni al construir),
 * así un cambio de env en runtime o un módulo evaluado antes de cargar la env se respetan.
 */
export declare function resolveBackendUrl(explicit?: string): string;
/**
 * Cliente único de sap-b1-backend, compartido entre mission-control y sap-b1-chat.
 * Vivía duplicado en ambos repos, byte a byte igual salvo por headers(): sap-b1-chat
 * agregaba un header opcional x-mc-secret (auth de servicio a servicio, kpis->backend)
 * que mission-control no tenía. No era una diferencia accidental — es un superset
 * aditivo seguro: sap-b1-backend/lib/auth.ts revisa X-API-Key primero y retorna de
 * inmediato si es válido, así que el fallback x-mc-secret nunca se alcanza para
 * requests que ya traen una key válida (el caso de mission-control, siempre).
 */
export declare class BackendClient {
    readonly tenant: string;
    private apiKey;
    private opts;
    constructor(tenant: string, apiKey: string, opts?: BackendClientOptions);
    /** URL de este tenant en el gateway, resuelta en cada request (ver `resolveBackendUrl`). */
    private get base();
    /** x-consumer que este cliente envía en este momento (opción > SERVICE_ID > PLATFORM_SERVICE), o undefined. */
    get consumer(): string | undefined;
    /** x-request-id que este cliente envía (si se configuró). */
    get requestId(): string | undefined;
    private headers;
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body: unknown): Promise<T>;
    patch(path: string, body: unknown): Promise<void>;
    schema(q: string): Promise<{
        resultados: unknown[];
        count: number;
    }>;
    odata<T>(odataPath: string): Promise<T>;
    sapQuery(sql: string, limit?: number): Promise<{
        rows: unknown[];
        count: number;
    }>;
    catalogList(): Promise<{
        queries: Array<{
            name: string;
            description: string;
            params: string[];
        }>;
    }>;
    catalogQuery(name: string, params?: unknown, limit?: number): Promise<{
        rows: unknown[];
        count: number;
        query: string;
    }>;
    sapWrite<T = unknown>(method: "POST" | "PATCH" | "ACTION", path: string, body?: unknown): Promise<{
        result?: T;
        ok?: boolean;
    }>;
}
//# sourceMappingURL=backend-client.d.ts.map