/**
 * Catálogo unificado de metadata de tablas/entidades SAP B1 usadas por el ecosistema superAI.
 *
 * Fuente única de verdad — reconcilia dos catálogos que existían duplicados y desincronizados:
 * - `sap-b1-backend/lib/sap/metadata.ts` (`METADATOS_TABLAS`, consumido por el endpoint
 *   `GET /schema` / `descubrir_esquema`).
 * - `sap-b1-chat/lib/chat/system-prompt.ts` (sección "SCHEMA DE TABLAS CORE", inyectada
 *   en el prompt del tool `consultar_sql`).
 *
 * Estas columnas describen las tablas físicas de HANA tal como se acceden vía el
 * conector SQLQueries de Service Layer (`/query`, `sap_run_query`, `consultar_sql`) —
 * NO los nombres de propiedad de las entidades OData equivalentes, que pueden diferir
 * (ver nota en OITM.AvgPrice y en ORSC más abajo).
 */
export type SapTableVerification = "full" | "partial" | "blocked";
export interface SapTableColumn {
    campo: string;
    descripcion: string;
    tipo: string;
}
export interface SapTableSchema {
    tabla: string;
    descripcion: string;
    camposClave: string[];
    verificacion: SapTableVerification;
    camposComunes: SapTableColumn[];
    notas?: string[];
}
export declare const SAP_TABLE_SCHEMAS: Record<string, SapTableSchema>;
//# sourceMappingURL=sap-table-schemas.d.ts.map