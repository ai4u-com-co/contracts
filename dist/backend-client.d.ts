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
    constructor(tenant: string, apiKey: string);
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