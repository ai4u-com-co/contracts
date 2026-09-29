"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendClient = exports.BackendError = void 0;
const BACKEND_URL = process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://localhost:4100";
/**
 * Error tipado de una llamada al backend. Conserva el formato de `message` de
 * siempre (`Backend {METHOD} {path} ({status}): {body}`) para no romper a quien
 * lo parsea como texto, y además expone los campos del envelope JSON del
 * backend para clasificar sin regex frágiles:
 *   { error, code, uncertain, sapCode?, sapMessage?, table?, column? }
 * (`sapCode`/`sapMessage`/`table`/`column` solo vienen en rechazos 4xx de SAP.)
 */
class BackendError extends Error {
    constructor(method, path, status, body, requestId) {
        super(`Backend ${method} ${path} (${status}): ${body}`);
        this.name = "BackendError";
        this.method = method;
        this.path = path;
        this.status = status;
        this.body = body;
        this.requestId = requestId;
        let parsed = null;
        try {
            const j = JSON.parse(body);
            if (j && typeof j === "object" && !Array.isArray(j))
                parsed = j;
        }
        catch {
            /* cuerpo no-JSON (HTML de un 504 de Vercel, texto plano): solo status */
        }
        const str = (k) => (parsed && typeof parsed[k] === "string" ? parsed[k] : undefined);
        this.code = str("code");
        this.backendMessage = str("error");
        this.uncertain = parsed && typeof parsed.uncertain === "boolean" ? parsed.uncertain : undefined;
        this.sapCode = parsed && (typeof parsed.sapCode === "string" || typeof parsed.sapCode === "number") ? String(parsed.sapCode) : undefined;
        this.sapMessage = str("sapMessage");
        this.table = str("table");
        this.column = str("column");
    }
}
exports.BackendError = BackendError;
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
    constructor(tenant, apiKey, opts = {}) {
        this.tenant = tenant;
        this.apiKey = apiKey;
        this.opts = opts;
        this.base = `${BACKEND_URL}/api/v1/${tenant}`;
    }
    /** x-request-id que este cliente envía (si se configuró). */
    get requestId() {
        return this.opts.requestId;
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
        if (this.opts.requestId)
            headers["x-request-id"] = this.opts.requestId;
        if (this.opts.consumer)
            headers["x-consumer"] = this.opts.consumer;
        return headers;
    }
    async get(path) {
        const res = await fetch(`${this.base}${path}`, {
            headers: this.headers(),
            cache: "no-store",
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new BackendError("GET", path, res.status, text, this.opts.requestId);
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
            throw new BackendError("POST", path, res.status, text, this.opts.requestId);
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
            throw new BackendError("PATCH", path, res.status, text, this.opts.requestId);
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
