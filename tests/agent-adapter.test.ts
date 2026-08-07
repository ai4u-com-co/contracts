import { describe, it, expect } from "vitest"
import type { IAgentAdapter } from "../src/agent-adapter"

describe("IAgentAdapter", () => {
  it("es implementable por un agente real con su propia forma de summary", async () => {
    // Reproduce la forma mínima real de cobro-cartera (ver JobResult en lib/job.ts):
    // un agente scheduled, sin input estructurado, que corre por tenant.
    const fakeAgent: IAgentAdapter = {
      id: "cobro-cartera",
      version: "1.0.0",
      async run(opts) {
        const tenants = opts?.onlyTenant ? [opts.onlyTenant] : ["tamaprint", "flexoimpresos"]
        return {
          ranAt: new Date(0).toISOString(),
          ok: true,
          summary: { tenants, sent: tenants.length },
        }
      },
    }

    const result = await fakeAgent.run({ onlyTenant: "flexoimpresos" })
    expect(result.ok).toBe(true)
    expect(result.summary).toEqual({ tenants: ["flexoimpresos"], sent: 1 })
  })

  it("corre sin opciones — el caso 'todos los tenants configurados'", async () => {
    const fakeAgent: IAgentAdapter = {
      id: "orderloader",
      version: "1.0.0",
      async run() {
        return { ranAt: new Date(0).toISOString(), ok: true, summary: {} }
      },
    }

    const result = await fakeAgent.run()
    expect(result.ok).toBe(true)
  })
})
