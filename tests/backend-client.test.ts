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

  describe("catalogList (cache 1h por tenant)", () => {
    it("la primera llamada pega al backend", async () => {
      const fetchMock = mockFetchOk({ queries: [{ name: "ventas_por_periodo", description: "d", params: [] }] })
      global.fetch = fetchMock as unknown as typeof fetch
      const client = new BackendClient("cache-test-1", "k")
      const result = await client.catalogList()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.queries[0].name).toBe("ventas_por_periodo")
    })

    it("la segunda llamada dentro del TTL NO vuelve a pegarle al backend (mismo tenant)", async () => {
      const fetchMock = mockFetchOk({ queries: [{ name: "ventas_por_periodo", description: "d", params: [] }] })
      global.fetch = fetchMock as unknown as typeof fetch
      const client = new BackendClient("cache-test-2", "k")
      await client.catalogList()
      await client.catalogList()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("una instancia nueva del mismo tenant reutiliza el cache (no es por-instancia, es por-tenant)", async () => {
      const fetchMock = mockFetchOk({ queries: [] })
      global.fetch = fetchMock as unknown as typeof fetch
      const clientA = new BackendClient("cache-test-3", "k")
      await clientA.catalogList()
      const clientB = new BackendClient("cache-test-3", "otra-key")
      await clientB.catalogList()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("un tenant distinto SIEMPRE dispara su propio fetch (cache no cruza tenants)", async () => {
      const fetchMock = mockFetchOk({ queries: [] })
      global.fetch = fetchMock as unknown as typeof fetch
      const clientTamaprint = new BackendClient("cache-test-4-tamaprint", "k")
      const clientFlexo = new BackendClient("cache-test-4-flexo", "k")
      await clientTamaprint.catalogList()
      await clientFlexo.catalogList()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("después de vencer el TTL, vuelve a pegarle al backend", async () => {
      vi.useFakeTimers()
      try {
        const fetchMock = mockFetchOk({ queries: [] })
        global.fetch = fetchMock as unknown as typeof fetch
        const client = new BackendClient("cache-test-5", "k")
        await client.catalogList()
        vi.advanceTimersByTime(60 * 60 * 1000 + 1)
        await client.catalogList()
        expect(fetchMock).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
