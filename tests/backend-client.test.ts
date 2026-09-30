import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { BackendClient, BackendError, resolveConsumer } from "../src/backend-client"

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
