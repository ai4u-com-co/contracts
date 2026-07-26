"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendClient = void 0;
const BACKEND_URL = process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://localhost:4100";
/**
 * Cliente único de sap-b1-backend, compartido entre mission-control y sap-b1-chat.
 * Vivía duplicado en ambos repos, byte a byte igual salvo por headers(): sap-b1-chat
 * agregaba un header opcional x-mc-secret (auth de servicio a servicio, kpis->backend)
 * que mission-control no tenía. No era una diferencia accidental — es un superset
 * aditivo seguro: sap-b1-backend/lib/auth.ts revisa X-API-Key primero y retorna de
 * inmediato si es válido, así que el fallback x-mc-secret nunca se alcanza para
 * requests que ya traen una key válida (el caso de mission-control, siempre).
 */
class BackendClient {
    constructor(tenant, apiKey) {
        this.tenant = tenant;
        this.apiKey = apiKey;
        this.base = `${BACKEND_URL}/api/v1/${tenant}`;
    }
    headers() {
        const headers = { "Content-Type": "application/json" };
        if (this.apiKey) {
            headers["X-API-Key"] = this.apiKey;
        }
        const serviceSecret = process.env.BACKEND_SERVICE_SECRET ?? process.env.MISSION_CONTROL_SECRET;
        if (serviceSecret) {
            headers["x-mc-secret"] = serviceSecret;
        }
        return headers;
    }
    async get(path) {
        const res = await fetch(`${this.base}${path}`, {
            headers: this.headers(),
            cache: "no-store",
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Backend GET ${path} (${res.status}): ${text}`);
        }
        return res.json();
    }
    async post(path, body) {
        const res = await fetch(`${this.base}${path}`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(body),
            cache: "no-store",
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Backend POST ${path} (${res.status}): ${text}`);
        }
        return res.json();
    }
    async patch(path, body) {
        const res = await fetch(`${this.base}${path}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify(body),
            cache: "no-store",
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Backend PATCH ${path} (${res.status}): ${text}`);
        }
    }
    schema(q) {
        return this.get(`/schema?q=${encodeURIComponent(q)}`);
    }
    odata(odataPath) {
        return this.get(`/odata?path=${encodeURIComponent(odataPath)}`);
    }
    sapQuery(sql, limit = 500) {
        return this.post("/query", { sql, limit });
    }
    catalogList() {
        return this.get("/query/catalog");
    }
    catalogQuery(name, params, limit) {
        return this.post("/query/catalog", {
            query: name,
            params,
            limit,
        });
    }
    sapWrite(method, path, body) {
        return this.post("/sap-write", { method, path, body });
    }
}
exports.BackendClient = BackendClient;
