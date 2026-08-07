/**
 * Contrato común para "agentes de automatización" del ecosistema superAI —
 * OrderLoader, Cobro de Cartera, Cotizador y similares comparten el mismo
 * patrón real ("documento/disparo entra, acción SAP sale") pero hoy viven
 * como código completamente separado, sin ninguna forma común. Este es el
 * primer paso concreto hacia un catálogo instalable (ver skill
 * ai4u-strategist, roadmap Q2): un agente que implementa IAgentAdapter puede,
 * en principio, correr, listarse y certificarse de la misma forma que
 * cualquier otro — sin que el catálogo tenga que conocer los detalles
 * internos de cada uno.
 *
 * Deliberadamente mínimo: no fuerza un modelo de datos de entrada único
 * (cada agente define su propio AgentRunOptions extendido), porque
 * OrderLoader recibe un adjunto y Cobro de Cartera no recibe nada — forzar
 * una forma común ahí sería inventar acoplamiento que no existe en la
 * realidad.
 */

export interface AgentRunOptions {
  /** Restringe la corrida a un tenant — mismo id que usa sap-b1-backend. Ausente = todos los tenants configurados. */
  onlyTenant?: string
}

export interface AgentRunResult {
  /** ISO 8601 — cuándo terminó de correr. */
  ranAt: string
  /** false si CUALQUIER parte de la corrida falló — el detalle real vive en `summary`. */
  ok: boolean
  /**
   * Resumen operativo de la corrida, con la forma que cada agente ya usaba
   * antes de implementar este contrato — a propósito no se normaliza a un
   * shape genérico. El catálogo lo trata como opaco; un humano revisándolo
   * sí necesita el detalle real de "qué pasó en Tamaprint vs. Flexoimpresos".
   */
  summary: Record<string, unknown>
}

export interface IAgentAdapter {
  /** Id estable del agente — mismo que usa el catálogo de Agentes (Mission Control / ai4u-website). */
  readonly id: string
  /** Versión del propio agente (no de este contrato). */
  readonly version: string
  run(opts?: AgentRunOptions): Promise<AgentRunResult>
}
