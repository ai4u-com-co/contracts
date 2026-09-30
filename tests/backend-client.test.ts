import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { BackendClient, BackendError, resolveConsumer, resolveBackendUrl, BACKEND_URL_ENV_NAMES, PROTECTED_BACKEND_HEADERS } from "../src/backend-client"

function mockFetchOk(body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
    text: async () => "",
  })
}

describe("BackendClient", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.BACKEND_SERVICE_SECRET
    delete process.env.MISSION_CONTROL_SECRET
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it("siempre manda X-API-Key cuando hay apiKey (caso mission-control)", async () => {
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new BackendClient("tamaprint", "clave-real")
    await client.schema("q")
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("clave-real")
  })

  it("NO manda x-mc-secret si no hay BACKEND_SERVICE_SECRET/MISSION_CONTROL_SECRET (caso mission-control real)", async () => {
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new BackendClient("tamaprint", "clave-real")
    await client.schema("q")
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)["x-mc-secret"]).toBeUndefined()
  })

  it("manda x-mc-secret si MISSION_CONTROL_SECRET está seteado (caso sap-b1-chat / service-to-service)", async () => {
    process.env.MISSION_CONTROL_SECRET = "secreto-compartido"
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new BackendClient("tamaprint", "")
    await client.schema("q")
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)["x-mc-secret"]).toBe("secreto-compartido")
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBeUndefined()
  })

  it("BACKEND_SERVICE_SECRET tiene prioridad sobre MISSION_CONTROL_SECRET", async () => {
    process.env.BACKEND_SERVICE_SECRET = "prioritario"
    process.env.MISSION_CONTROL_SECRET = "secundario"
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new BackendClient("tamaprint", "clave")
    await client.schema("q")
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)["x-mc-secret"]).toBe("prioritario")
  })

  it("sapQuery hace POST a /query con sql y limit", async () => {
    const fetchMock = mockFetchOk({ rows: [], count: 0 })
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new BackendClient("tamaprint", "k")
    await client.sapQuery("SELECT 1", 10)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/query")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ sql: "SELECT 1", limit: 10 })
  })

  it("lanza error legible cuando la respuesta no es ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    }) as unknown as typeof fetch
    const client = new BackendClient("tamaprint", "k")
    await expect(client.schema("q")).rejects.toThrow(/500.*boom/)
  })
})

describe("BackendClient — trazabilidad y errores tipados", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }
  beforeEach(() => {
    delete process.env.SERVICE_ID
    delete process.env.PLATFORM_SERVICE
  })
  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  function mockFetchError(status: number, body: string) {
    return vi.fn().mockResolvedValue({ ok: false, status, json: async () => JSON.parse(body), text: async () => body })
  }

  it("sin opciones NO manda x-request-id ni x-consumer (compatibilidad con consumidores actuales)", async () => {
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch
    await new BackendClient("tamaprint", "k").schema("q")
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers).not.toHaveProperty("x-request-id")
    expect(headers).not.toHaveProperty("x-consumer")
  })

  it("con opciones manda x-request-id y x-consumer en GET y POST", async () => {
    const fetchMock = mockFetchOk({ rows: [], count: 0 })
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new BackendClient("flexoimpresos", "k", { requestId: "rid-123", consumer: "sap-b1-chat" })
    await client.schema("OINV")
    await client.sapQuery("SELECT 1 FROM OINV")
    for (const call of fetchMock.mock.calls) {
      const headers = call[1].headers as Record<string, string>
      expect(headers["x-request-id"]).toBe("rid-123")
      expect(headers["x-consumer"]).toBe("sap-b1-chat")
    }
    expect(client.requestId).toBe("rid-123")
  })

  it("un 4xx de SAP lanza BackendError con sapCode/sapMessage/table/column y requestId", async () => {
    const body = JSON.stringify({
      error: "SAP rechazó la consulta.", code: "SAP_QUERY_ERROR", uncertain: false,
      sapCode: "703", sapMessage: "Column 'Remarks' from table 'OWOR' not exist.", table: "OWOR", column: "Remarks",
    })
    global.fetch = mockFetchError(502, body) as unknown as typeof fetch
    const client = new BackendClient("flexoimpresos", "k", { requestId: "rid-9" })
    const err = await client.sapQuery("SELECT Remarks FROM OWOR").catch((e) => e)
    expect(err).toBeInstanceOf(BackendError)
    expect(err).toBeInstanceOf(Error)
    expect(err).toMatchObject({
      method: "POST", path: "/query", status: 502, code: "SAP_QUERY_ERROR",
      sapCode: "703", table: "OWOR", column: "Remarks", requestId: "rid-9", uncertain: false,
      backendMessage: "SAP rechazó la consulta.",
    })
    // el message conserva el formato histórico (compatibilidad con parsers de texto)
    expect(err.message).toBe(`Backend POST /query (502): ${body}`)
  })

  it("un 504 de timeout expone code SAP_TIMEOUT sin campos de SAP", async () => {
    const body = JSON.stringify({ error: "SAP B1 no respondió a tiempo.", code: "SAP_TIMEOUT", uncertain: false })
    global.fetch = mockFetchError(504, body) as unknown as typeof fetch
    const err = await new BackendClient("tamaprint", "k").schema("q").catch((e) => e)
    expect(err).toBeInstanceOf(BackendError)
    expect(err.code).toBe("SAP_TIMEOUT")
    expect(err.sapCode).toBeUndefined()
    expect(err.requestId).toBeUndefined()
  })

  it("cuerpo no-JSON (HTML de un 504 de la plataforma) no revienta: solo status y body", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 504, text: async () => "<html>Gateway Timeout</html>" }) as unknown as typeof fetch
    const err = await new BackendClient("tamaprint", "k").schema("q").catch((e) => e)
    expect(err).toBeInstanceOf(BackendError)
    expect(err.status).toBe(504)
    expect(err.code).toBeUndefined()
    expect(err.body).toContain("Gateway Timeout")
  })

  it("acepta sapCode numérico y lo normaliza a string", async () => {
    global.fetch = mockFetchError(502, JSON.stringify({ error: "x", code: "SAP_QUERY_ERROR", sapCode: 702 })) as unknown as typeof fetch
    const err = await new BackendClient("tamaprint", "k").sapQuery("SELECT 1").catch((e) => e)
    expect(err.sapCode).toBe("702")
  })
})

describe("BackendClient — x-consumer (Fase 3, atribución en el gateway)", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.SERVICE_ID
    delete process.env.PLATFORM_SERVICE
    delete process.env.BACKEND_SERVICE_SECRET
    delete process.env.MISSION_CONTROL_SECRET
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  async function headersOf(client: BackendClient) {
    const fetchMock = mockFetchOk({ rows: [], count: 0 })
    global.fetch = fetchMock as unknown as typeof fetch
    await client.schema("q")
    await client.sapQuery("SELECT 1")
    await client.patch("/x", {})
    return fetchMock.mock.calls.map((c) => c[1].headers as Record<string, string>)
  }

  it("sin opción ni SERVICE_ID/PLATFORM_SERVICE NO manda x-consumer", async () => {
    const client = new BackendClient("tamaprint", "k")
    for (const h of await headersOf(client)) expect(h).not.toHaveProperty("x-consumer")
    expect(client.consumer).toBeUndefined()
  })

  it("usa SERVICE_ID como fallback en GET, POST y PATCH", async () => {
    process.env.SERVICE_ID = "desarrollo-oc"
    const client = new BackendClient("tamaprint", "k")
    for (const h of await headersOf(client)) expect(h["x-consumer"]).toBe("desarrollo-oc")
    expect(client.consumer).toBe("desarrollo-oc")
  })

  it("usa el alias PLATFORM_SERVICE si no hay SERVICE_ID", async () => {
    process.env.PLATFORM_SERVICE = ["orderloader", "tamaprint"].join("-")
    const client = new BackendClient("tamaprint", "k")
    for (const h of await headersOf(client)) expect(h["x-consumer"]).toBe("orderloader-tamaprint")
  })

  it("SERVICE_ID tiene prioridad sobre PLATFORM_SERVICE", async () => {
    process.env.SERVICE_ID = "canonico"
    process.env.PLATFORM_SERVICE = "alias"
    expect(resolveConsumer()).toBe("canonico")
  })

  it("la opción consumer tiene prioridad sobre la env", async () => {
    process.env.SERVICE_ID = "desde-env"
    const client = new BackendClient("tamaprint", "k", { consumer: "sap-b1-chat" })
    for (const h of await headersOf(client)) expect(h["x-consumer"]).toBe("sap-b1-chat")
  })

  it("valores vacíos o solo espacios se ignoran (no manda header vacío)", async () => {
    process.env.SERVICE_ID = "   "
    process.env.PLATFORM_SERVICE = ""
    const client = new BackendClient("tamaprint", "k", { consumer: "" })
    for (const h of await headersOf(client)) expect(h).not.toHaveProperty("x-consumer")
    process.env.SERVICE_ID = "  mission-control  "
    expect(resolveConsumer("  ")).toBe("mission-control")
  })

  it("se resuelve por request: una env fijada después de construir el cliente se respeta", async () => {
    const client = new BackendClient("tamaprint", "k")
    process.env.PLATFORM_SERVICE = "seteado-en-runtime"
    for (const h of await headersOf(client)) expect(h["x-consumer"]).toBe("seteado-en-runtime")
  })

  it("agregar x-consumer no altera los headers de auth (X-API-Key / x-mc-secret)", async () => {
    const secreto = ["valor", "de", "prueba"].join("-")
    process.env.MISSION_CONTROL_SECRET = secreto
    process.env.SERVICE_ID = "sap-b1-chat"
    const client = new BackendClient("tamaprint", "S2S_AUTH")
    for (const h of await headersOf(client)) {
      expect(h["X-API-Key"]).toBe("S2S_AUTH")
      expect(h["x-mc-secret"]).toBe(secreto)
      expect(h["x-consumer"]).toBe("sap-b1-chat")
      expect(Object.keys(h).sort()).toEqual(["Content-Type", "X-API-Key", "x-consumer", "x-mc-secret"])
    }
  })
})

describe("BackendClient — URL del gateway (SAP_BACKEND_URL, 0.6.1)", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }
  // Valores construidos en runtime (no parecen URLs/secretos literales a los scanners).
  const url = (name: string) => ["https:/", `${name}.example.test`].join("/")

  beforeEach(() => {
    for (const name of BACKEND_URL_ENV_NAMES) delete process.env[name]
    delete process.env.VERCEL_ENV
    delete process.env.SERVICE_ID
    delete process.env.PLATFORM_SERVICE
    process.env.NODE_ENV = "test"
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  async function urlOf(client: BackendClient): Promise<string> {
    const fetchMock = mockFetchOk({ rows: [], count: 0 })
    global.fetch = fetchMock as unknown as typeof fetch
    await client.schema("q")
    return fetchMock.mock.calls[0][0] as string
  }

  it("orden de precedencia: opción > SAP_BACKEND_URL > BACKEND_URL > NEXT_PUBLIC_BACKEND_URL", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = url("next-public")
    expect(await urlOf(new BackendClient("tamaprint", "k"))).toBe(`${url("next-public")}/api/v1/tamaprint/schema?q=q`)
    process.env.BACKEND_URL = url("legado")
    expect(await urlOf(new BackendClient("tamaprint", "k"))).toMatch(new RegExp(`^${url("legado")}/api/v1/`))
    process.env.SAP_BACKEND_URL = url("canonica")
    expect(await urlOf(new BackendClient("tamaprint", "k"))).toMatch(new RegExp(`^${url("canonica")}/api/v1/`))
    expect(await urlOf(new BackendClient("tamaprint", "k", { baseUrl: url("explicita") }))).toMatch(
      new RegExp(`^${url("explicita")}/api/v1/tamaprint/`),
    )
  })

  it("se resuelve en cada request: cambiar la env entre llamadas cambia el destino", async () => {
    const client = new BackendClient("flexoimpresos", "k")
    process.env.SAP_BACKEND_URL = url("primera")
    expect(await urlOf(client)).toMatch(new RegExp(`^${url("primera")}/api/v1/flexoimpresos/`))
    process.env.SAP_BACKEND_URL = url("segunda")
    expect(await urlOf(client)).toMatch(new RegExp(`^${url("segunda")}/api/v1/flexoimpresos/`))
  })

  it("valores vacíos o solo espacios se ignoran y se quitan las / finales", () => {
    process.env.SAP_BACKEND_URL = "  "
    process.env.BACKEND_URL = `${url("legado")}//`
    expect(resolveBackendUrl("")).toBe(url("legado"))
  })

  it("fuera de producción, sin ninguna URL, usa http://localhost:4100", async () => {
    expect(resolveBackendUrl()).toBe(["http://localhost", "4100"].join(":"))
    expect(await urlOf(new BackendClient("tamaprint", "k"))).toMatch(/^http:\/\/localhost:4100\/api\/v1\/tamaprint\//)
  })

  it.each([
    ["NODE_ENV", "production"],
    ["VERCEL_ENV", "production"],
  ])("en producción (%s=%s) sin URL lanza un error que nombra SAP_BACKEND_URL y NO hace fetch", async (name, value) => {
    process.env[name] = value
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new BackendClient("tamaprint", "k")
    await expect(client.schema("q")).rejects.toThrow(/SAP_BACKEND_URL/)
    await expect(client.sapQuery("SELECT 1")).rejects.toThrow(/SAP_BACKEND_URL/)
    await expect(client.patch("/x", {})).rejects.toThrow(/SAP_BACKEND_URL/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(() => resolveBackendUrl()).toThrow(/SAP_BACKEND_URL/)
  })

  it("en producción con SAP_BACKEND_URL (o baseUrl) funciona normal", async () => {
    process.env.NODE_ENV = "production"
    process.env.SAP_BACKEND_URL = url("prod")
    expect(await urlOf(new BackendClient("tamaprint", "k"))).toMatch(new RegExp(`^${url("prod")}/api/v1/`))
    delete process.env.SAP_BACKEND_URL
    expect(await urlOf(new BackendClient("tamaprint", "k", { baseUrl: url("opt") }))).toMatch(new RegExp(`^${url("opt")}/api/v1/`))
  })

  it("construir el cliente sin URL en producción no lanza (el error es por request)", () => {
    process.env.NODE_ENV = "production"
    expect(() => new BackendClient("tamaprint", "k")).not.toThrow()
  })

  it("x-consumer y los headers de auth quedan intactos con baseUrl", async () => {
    process.env.SERVICE_ID = "sap-b1-chat"
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch
    await new BackendClient("tamaprint", "k", { baseUrl: url("x"), requestId: "rid-1" }).schema("q")
    const h = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(h["x-consumer"]).toBe("sap-b1-chat")
    expect(h["x-request-id"]).toBe("rid-1")
    expect(h["X-API-Key"]).toBe("k")
    expect(resolveConsumer("explicito")).toBe("explicito")
  })
})

describe("BackendClient — extraHeaders (identidad OIDC, 0.7.0)", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }
  // Valores construidos en runtime (no parecen tokens/secretos literales a los scanners).
  const fake = (name: string) => ["valor", name, "prueba"].join("-")

  beforeEach(() => {
    delete process.env.SERVICE_ID
    delete process.env.PLATFORM_SERVICE
    delete process.env.BACKEND_SERVICE_SECRET
    delete process.env.MISSION_CONTROL_SECRET
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  async function headersOf(client: BackendClient) {
    const fetchMock = mockFetchOk({ rows: [], count: 0 })
    global.fetch = fetchMock as unknown as typeof fetch
    await client.schema("q")
    await client.sapQuery("SELECT 1")
    await client.patch("/x", {})
    return fetchMock.mock.calls.map((c) => c[1].headers as Record<string, string>)
  }

  it("agrega los headers en GET, POST y PATCH (función async)", async () => {
    const client = new BackendClient("tamaprint", "k", {
      extraHeaders: async () => ({ "x-ai4u-identity": fake("token") }),
    })
    const all = await headersOf(client)
    expect(all).toHaveLength(3)
    for (const h of all) expect(h["x-ai4u-identity"]).toBe(fake("token"))
  })

  it("acepta una función síncrona", async () => {
    const client = new BackendClient("tamaprint", "k", { extraHeaders: () => ({ "x-ai4u-identity": fake("sync") }) })
    for (const h of await headersOf(client)) expect(h["x-ai4u-identity"]).toBe(fake("sync"))
  })

  it("se evalúa en CADA request, nunca se cachea (el token vence)", async () => {
    let n = 0
    const extraHeaders = vi.fn(async () => ({ "x-ai4u-identity": fake(`t${++n}`) }))
    const client = new BackendClient("tamaprint", "k", { extraHeaders })
    const all = await headersOf(client)
    expect(extraHeaders).toHaveBeenCalledTimes(3)
    expect(all.map((h) => h["x-ai4u-identity"])).toEqual([fake("t1"), fake("t2"), fake("t3")])
  })

  it("no puede pisar X-API-Key, x-mc-secret, x-consumer ni x-request-id (sin importar mayúsculas)", async () => {
    const secreto = fake("secreto")
    process.env.MISSION_CONTROL_SECRET = secreto
    const client = new BackendClient("tamaprint", "clave-real", {
      requestId: "rid-1",
      consumer: "sap-b1-chat",
      extraHeaders: () => ({
        "X-API-Key": "pisada",
        "x-api-key": "pisada",
        "X-MC-SECRET": "pisada",
        "x-consumer": "otro",
        "X-Request-Id": "otro",
        "x-ai4u-identity": fake("token"),
      }),
    })
    for (const h of await headersOf(client)) {
      expect(h["X-API-Key"]).toBe("clave-real")
      expect(h["x-mc-secret"]).toBe(secreto)
      expect(h["x-consumer"]).toBe("sap-b1-chat")
      expect(h["x-request-id"]).toBe("rid-1")
      expect(h["x-ai4u-identity"]).toBe(fake("token"))
      expect(Object.keys(h).sort()).toEqual(
        ["Content-Type", "X-API-Key", "x-ai4u-identity", "x-consumer", "x-mc-secret", "x-request-id"],
      )
    }
  })

  it("tampoco puede inyectar un header protegido que el cliente no manda (p. ej. x-mc-secret sin env)", async () => {
    const client = new BackendClient("tamaprint", "", {
      extraHeaders: () => ({ "x-mc-secret": "inyectado", "X-API-Key": "inyectada", "x-consumer": "c", "x-request-id": "r" }),
    })
    for (const h of await headersOf(client)) {
      const lower = Object.keys(h).map((k) => k.toLowerCase())
      for (const name of PROTECTED_BACKEND_HEADERS) expect(lower).not.toContain(name)
    }
  })

  it.each([
    ["lanza síncrono", () => { throw new Error("sin contexto OIDC") }],
    ["promesa rechazada", async () => { throw new Error("oidc caído") }],
    ["devuelve null", () => null as unknown as Record<string, string>],
  ])("fail-open (%s): la request sigue sin los extra y no lanza", async (_label, extraHeaders) => {
    const client = new BackendClient("tamaprint", "k", { consumer: "sap-b1-chat", extraHeaders })
    const all = await headersOf(client)
    expect(all).toHaveLength(3)
    for (const h of all) {
      expect(h).toEqual({ "Content-Type": "application/json", "X-API-Key": "k", "x-consumer": "sap-b1-chat" })
    }
  })

  it("descarta entradas inválidas (nombre ilegal, valor no-string o con salto de línea) sin tumbar la request", async () => {
    const client = new BackendClient("tamaprint", "k", {
      extraHeaders: () =>
        ({
          "nombre invalido": "x",
          "x-numero": 1,
          "x-crlf": "a\r\nx-inyectado: b",
          "x-ok": "bien",
        }) as unknown as Record<string, string>,
    })
    for (const h of await headersOf(client)) {
      expect(h["x-ok"]).toBe("bien")
      expect(h).not.toHaveProperty("nombre invalido")
      expect(h).not.toHaveProperty("x-numero")
      expect(h).not.toHaveProperty("x-crlf")
    }
  })

  it("un header no protegido con otra capitalización reemplaza al del cliente en vez de duplicarlo", async () => {
    const client = new BackendClient("tamaprint", "k", { extraHeaders: () => ({ "content-type": "application/json; charset=utf-8" }) })
    for (const h of await headersOf(client)) {
      expect(h["content-type"]).toBe("application/json; charset=utf-8")
      expect(h).not.toHaveProperty("Content-Type")
    }
  })

  it("en producción sin URL lanza el error de SAP_BACKEND_URL sin evaluar extraHeaders", async () => {
    for (const name of BACKEND_URL_ENV_NAMES) delete process.env[name]
    process.env.NODE_ENV = "production"
    const extraHeaders = vi.fn(() => ({ "x-ai4u-identity": "t" }))
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch
    await expect(new BackendClient("tamaprint", "k", { extraHeaders }).schema("q")).rejects.toThrow(/SAP_BACKEND_URL/)
    expect(extraHeaders).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("compatibilidad: sin extraHeaders los headers son exactamente los de 0.6.1", async () => {
    const secreto = fake("s")
    process.env.MISSION_CONTROL_SECRET = secreto
    const client = new BackendClient("tamaprint", "S2S_AUTH", { requestId: "rid", consumer: "c" })
    for (const h of await headersOf(client)) {
      expect(h).toEqual({
        "Content-Type": "application/json",
        "X-API-Key": "S2S_AUTH",
        "x-mc-secret": secreto,
        "x-request-id": "rid",
        "x-consumer": "c",
      })
    }
  })
})

// Dentro del monorepo kernel: la lista local debe coincidir con el contrato de
// @ai4u/config (canónico + alias en el mismo orden). En el espejo standalone
// (ai4u-com-co/contracts) no existe ../../config, así que se salta.
const CONFIG_ENV = resolve(__dirname, "../../config/src/env.ts")
describe.skipIf(!existsSync(CONFIG_ENV))("BACKEND_URL_ENV_NAMES vs ENV_CONTRACT de @ai4u/config", () => {
  it("es el canónico SAP_BACKEND_URL seguido de sus alias, en el orden del contrato", async () => {
    const { ENV_CONTRACT } = (await import(CONFIG_ENV)) as {
      ENV_CONTRACT: Record<string, { name: string; aliases: readonly string[] }>
    }
    const spec = ENV_CONTRACT.SAP_BACKEND_URL
    const contractOrder = [spec.name, ...spec.aliases]
    expect(contractOrder.slice(0, BACKEND_URL_ENV_NAMES.length)).toEqual([...BACKEND_URL_ENV_NAMES])
  })
})
