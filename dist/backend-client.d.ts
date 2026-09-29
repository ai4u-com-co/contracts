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
     * Se envía como `x-request-id`. El middleware del backend lo reusa como su
     * requestId, así que el log del consumidor y el del backend quedan unidos.
     */
    requestId?: string;
    /** Se envía como `x-consumer` (p. ej. "sap-b1-chat") para atribuir el tráfico en los logs del backend. */
    consumer?: string;
}
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
    private base;
    readonly tenant: string;
    private apiKey;
    private opts;
    constructor(tenant: string, apiKey: string, opts?: BackendClientOptions);
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