import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { BackendClient } from "../src/backend-client"

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
