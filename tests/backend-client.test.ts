import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { BackendClient, BackendError } from "../src/backend-client"

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
  afterEach(() => {
    global.fetch = originalFetch
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
