const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:4100"

/**
 * Error tipado de una llamada al backend. Conserva el formato de `message` de
 * siempre (`Backend {METHOD} {path} ({status}): {body}`) para no romper a quien
 * lo parsea como texto, y además expone los campos del envelope JSON del
 * backend para clasificar sin regex frágiles:
 *   { error, code, uncertain, sapCode?, sapMessage?, table?, column? }
 * (`sapCode`/`sapMessage`/`table`/`column` solo vienen en rechazos 4xx de SAP.)
 */
export class BackendError extends Error {
  readonly name = "BackendError"
  readonly method: string
  readonly path: string
  readonly status: number
  readonly body: string
  /** Código estable del backend: SAP_TIMEOUT, SAP_QUERY_ERROR, SAP_UNREACHABLE, ... */
  readonly code?: string
  /** Mensaje seguro (en español) que el backend puso en `error`. */
  readonly backendMessage?: string
  readonly uncertain?: boolean
  readonly sapCode?: string
  readonly sapMessage?: string
  readonly table?: string
  readonly column?: string
  /** x-request-id enviado en la llamada (para cruzar con los logs del backend). */
  readonly requestId?: string

  constructor(method: string, path: string, status: number, body: string, requestId?: string) {
    super(`Backend ${method} ${path} (${status}): ${body}`)
    this.method = method
    this.path = path
    this.status = status
    this.body = body
    this.requestId = requestId
    let parsed: Record<string, unknown> | null = null
    try {
      const j = JSON.parse(body)
      if (j && typeof j === "object" && !Array.isArray(j)) parsed = j as Record<string, unknown>
    } catch {
      /* cuerpo no-JSON (HTML de un 504 de Vercel, texto plano): solo status */
    }
    const str = (k: string) => (parsed && typeof parsed[k] === "string" ? (parsed[k] as string) : undefined)
    this.code = str("code")
    this.backendMessage = str("error")
    this.uncertain = parsed && typeof parsed.uncertain === "boolean" ? (parsed.uncertain as boolean) : undefined
    this.sapCode = parsed && (typeof parsed.sapCode === "string" || typeof parsed.sapCode === "number") ? String(parsed.sapCode) : undefined
    this.sapMessage = str("sapMessage")
    this.table = str("table")
    this.column = str("column")
  }
}

export interface BackendClientOptions {
  /**
   * Se envía como `x-request-id`. El middleware del backend lo reusa como su
   * requestId, así que el log del consumidor y el del backend quedan unidos.
   */
  requestId?: string
  /** Se envía como `x-consumer` (p. ej. "sap-b1-chat") para atribuir el tráfico en los logs del backend. */
  consumer?: string
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
export class BackendClient {
  private base: string
  readonly tenant: string
  private apiKey: string
  private opts: BackendClientOptions

  constructor(tenant: string, apiKey: string, opts: BackendClientOptions = {}) {
    this.tenant = tenant
    this.apiKey = apiKey
    this.opts = opts
    this.base = `${BACKEND_URL}/api/v1/${tenant}`
  }

  /** x-request-id que este cliente envía (si se configuró). */
  get requestId(): string | undefined {
    return this.opts.requestId
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey
    }
    const serviceSecret = process.env.BACKEND_SERVICE_SECRET ?? process.env.MISSION_CONTROL_SECRET
    if (serviceSecret) {
      headers["x-mc-secret"] = serviceSecret
    }
    if (this.opts.requestId) headers["x-request-id"] = this.opts.requestId
    if (this.opts.consumer) headers["x-consumer"] = this.opts.consumer
    return headers
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: this.headers(),
      cache: "no-store",
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new BackendError("GET", path, res.status, text, this.opts.requestId)
    }
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      cache: "no-store",
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new BackendError("POST", path, res.status, text, this.opts.requestId)
    }
    return res.json() as Promise<T>
  }

  async patch(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.base}${path}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
      cache: "no-store",
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new BackendError("PATCH", path, res.status, text, this.opts.requestId)
    }
  }

  schema(q: string) {
    return this.get<{ resultados: unknown[]; count: number }>(
      `/schema?q=${encodeURIComponent(q)}`
    )
  }

  odata<T>(odataPath: string) {
    return this.get<T>(`/odata?path=${encodeURIComponent(odataPath)}`)
  }

  sapQuery(sql: string, limit = 500) {
    return this.post<{ rows: unknown[]; count: number }>("/query", { sql, limit })
  }

  catalogList() {
    return this.get<{ queries: Array<{ name: string; description: string; params: string[] }> }>(
      "/query/catalog"
    )
  }

  catalogQuery(name: string, params?: unknown, limit?: number) {
    return this.post<{ rows: unknown[]; count: number; query: string }>("/query/catalog", {
      query: name,
      params,
      limit,
    })
  }

  sapWrite<T = unknown>(method: "POST" | "PATCH" | "ACTION", path: string, body?: unknown) {
    return this.post<{ result?: T; ok?: boolean }>("/sap-write", { method, path, body })
  }
}
