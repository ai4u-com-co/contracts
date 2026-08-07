"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
