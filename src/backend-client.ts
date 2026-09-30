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
export const BACKEND_URL_ENV_NAMES = ["SAP_BACKEND_URL", "BACKEND_URL", "NEXT_PUBLIC_BACKEND_URL"] as const

/** Default solo para desarrollo local (el gateway corre en :4100). Nunca se usa en producción. */
const DEV_BACKEND_URL = "http://localhost:4100"

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
   * URL base del gateway sap-b1-backend (sin `/api/v1/...`). Si no se pasa, se usa la
   * env `SAP_BACKEND_URL` o sus alias legados `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL`.
   * Ver `resolveBackendUrl()`.
   */
  baseUrl?: string
  /**
   * Se envía como `x-request-id`. El middleware del backend lo reusa como su
   * requestId, así que el log del consumidor y el del backend quedan unidos.
   */
  requestId?: string
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
  consumer?: string
}

/** Primer valor no vacío (tras trim) o undefined. */
function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    const t = v?.trim()
    if (t) return t
  }
  return undefined
}

/**
 * Resuelve el valor de `x-consumer`: opción explícita > env `SERVICE_ID` >
 * alias `PLATFORM_SERVICE` > undefined (no se manda el header).
 * Se resuelve en cada request (no al construir) porque `@ai4u/platform` puede
 * fijar `PLATFORM_SERVICE` en runtime vía `setServiceName()` después de que el
 * cliente ya exista.
 */
export function resolveConsumer(explicit?: string): string | undefined {
  return firstNonEmpty(explicit, process.env.SERVICE_ID, process.env.PLATFORM_SERVICE)
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production"
}

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
export function resolveBackendUrl(explicit?: string): string {
  const url = firstNonEmpty(explicit, ...BACKEND_URL_ENV_NAMES.map((name) => process.env[name]))
  if (url) return url.replace(/\/+$/, "")
  if (isProduction()) {
    throw new Error(
      "[@ai4u/contracts] Falta la URL del gateway sap-b1-backend: define SAP_BACKEND_URL " +
        "(o pasa la opción baseUrl a BackendClient). En producción no se usa localhost.",
    )
  }
  return DEV_BACKEND_URL
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
  readonly tenant: string
  private apiKey: string
  private opts: BackendClientOptions

  constructor(tenant: string, apiKey: string, opts: BackendClientOptions = {}) {
    this.tenant = tenant
    this.apiKey = apiKey
    this.opts = opts
  }

  /** URL de este tenant en el gateway, resuelta en cada request (ver `resolveBackendUrl`). */
  private get base(): string {
    return `${resolveBackendUrl(this.opts.baseUrl)}/api/v1/${this.tenant}`
  }

  /** x-consumer que este cliente envía en este momento (opción > SERVICE_ID > PLATFORM_SERVICE), o undefined. */
  get consumer(): string | undefined {
    return resolveConsumer(this.opts.consumer)
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
    // TODO(fase3): auth S2S heredada — NO cambiar sin el paso correspondiente de la Fase 3.
    //  1. X-API-Key (arriba): consumidores como sap-b1-chat (app/lib/session.ts,
    //     getApiKey) pasan como apiKey el placeholder "S2S_AUTH" cuando no hay
    //     `{TENANT}_SAP_API_KEY`; ese valor no es una key válida en el gateway.
    //  2. x-mc-secret (abajo): secreto compartido BACKEND_SERVICE_SECRET ??
    //     MISSION_CONTROL_SECRET, que el gateway (sap-b1-backend/lib/auth.ts)
    //     acepta como fallback cuando X-API-Key no valida — es lo que hace
    //     funcionar el caso "S2S_AUTH".
    // Se retira/reemplaza por identidad OIDC tras medir con x-consumer quién
    // depende de este camino.
    const serviceSecret = process.env.BACKEND_SERVICE_SECRET ?? process.env.MISSION_CONTROL_SECRET
    if (serviceSecret) {
      headers["x-mc-secret"] = serviceSecret
    }
    if (this.opts.requestId) headers["x-request-id"] = this.opts.requestId
    const consumer = resolveConsumer(this.opts.consumer)
    if (consumer) headers["x-consumer"] = consumer
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
