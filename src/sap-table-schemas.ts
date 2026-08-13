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

export type SapTableVerification = "full" | "partial" | "blocked"

export interface SapTableColumn {
  campo: string
  descripcion: string
  tipo: string
}

export interface SapTableSchema {
  tabla: string
  descripcion: string
  camposClave: string[]
  verificacion: SapTableVerification
  camposComunes: SapTableColumn[]
  notas?: string[]
}

export const SAP_TABLE_SCHEMAS: Record<string, SapTableSchema> = {
  OINV: {
    tabla: "OINV",
    descripcion: "Facturas de clientes (cabecera). Representa cuentas por cobrar generadas.",
    camposClave: ["DocEntry", "DocNum"],
    verificacion: "full",
    camposComunes: [
      { campo: "DocEntry", descripcion: "Clave primaria numérica interna", tipo: "Integer" },
      { campo: "DocNum", descripcion: "Número de factura visible en SAP", tipo: "Integer" },
      { campo: "CardCode", descripcion: "Código de cliente (ej: 'C00001')", tipo: "String" },
      { campo: "CardName", descripcion: "Nombre del cliente", tipo: "String" },
      { campo: "DocDate", descripcion: "Fecha de contabilización (formato 'YYYY-MM-DD')", tipo: "Date" },
      { campo: "DocDueDate", descripcion: "Fecha de vencimiento", tipo: "Date" },
      { campo: "DocTotal", descripcion: "Total neto + impuestos del documento", tipo: "Decimal" },
      { campo: "VatSum", descripcion: "Total impuestos (IVA) cobrados", tipo: "Decimal" },
      { campo: "DiscSum", descripcion: "Descuento total aplicado", tipo: "Decimal" },
      { campo: "PaidToDate", descripcion: "Monto ya cobrado de esta factura", tipo: "Decimal" },
      { campo: "DocStatus", descripcion: "Estado del documento: 'O' (Abierta/Open), 'C' (Cerrada/Closed/Cancelada)", tipo: "String" },
      { campo: "SlpCode", descripcion: "Código del vendedor asignado", tipo: "Integer" },
      { campo: "Project", descripcion: "Código del proyecto asociado", tipo: "String" },
      { campo: "Comments", descripcion: "Comentarios de la factura", tipo: "String" },
      { campo: "CANCELED", descripcion: "Factura cancelada: 'N' (no cancelada), 'Y' (cancelada). SIEMPRE filtra AND CANCELED = 'N'", tipo: "String" },
    ],
    notas: ["GrssProfit NO existe en OINV vía SQLQueries. Usa INV1.GrssProfit con JOIN."],
  },
  INV1: {
    tabla: "INV1",
    descripcion: "Detalle de líneas de facturas de clientes. Contiene los artículos y precios cobrados.",
    camposClave: ["DocEntry", "LineNum"],
    verificacion: "full",
    camposComunes: [
      { campo: "DocEntry", descripcion: "Enlace a la cabecera OINV (DocEntry)", tipo: "Integer" },
      { campo: "LineNum", descripcion: "Número de línea (0-indexed)", tipo: "Integer" },
      { campo: "ItemCode", descripcion: "Código del artículo/servicio", tipo: "String" },
      { campo: "Dscription", descripcion: "Descripción del artículo/servicio", tipo: "String" },
      { campo: "Quantity", descripcion: "Cantidad facturada", tipo: "Decimal" },
      { campo: "Price", descripcion: "Precio unitario antes de impuestos", tipo: "Decimal" },
      { campo: "LineTotal", descripcion: "Total de la línea antes de impuestos (Quantity * Price)", tipo: "Decimal" },
      { campo: "WhsCode", descripcion: "Código del almacén de donde salió el stock", tipo: "String" },
      { campo: "TaxCode", descripcion: "Código de indicador de impuesto aplicado", tipo: "String" },
      { campo: "GrssProfit", descripcion: "Ganancia bruta de la línea", tipo: "Decimal" },
      { campo: "ItmsGrpCod", descripcion: "Código de grupo de artículo de la línea", tipo: "Integer" },
    ],
  },
  ORDR: {
    tabla: "ORDR",
    descripcion: "Pedidos de venta (cabecera). Compromisos de venta formalizados con clientes.",
    camposClave: ["DocEntry", "DocNum"],
    verificacion: "full",
    camposComunes: [
      { campo: "DocEntry", descripcion: "Clave primaria numérica interna", tipo: "Integer" },
      { campo: "DocNum", descripcion: "Número de pedido visible en SAP", tipo: "Integer" },
      { campo: "CardCode", descripcion: "Código del cliente", tipo: "String" },
      { campo: "CardName", descripcion: "Nombre del cliente", tipo: "String" },
      { campo: "DocDate", descripcion: "Fecha del pedido ('YYYY-MM-DD')", tipo: "Date" },
      { campo: "DocDueDate", descripcion: "Fecha de entrega prometida", tipo: "Date" },
      { campo: "DocTotal", descripcion: "Total neto + impuestos del pedido", tipo: "Decimal" },
      { campo: "DocStatus", descripcion: "Estado del pedido: 'O' (Abierto), 'C' (Cerrado/Cancelado)", tipo: "String" },
      { campo: "Comments", descripcion: "Comentarios del pedido", tipo: "String" },
    ],
  },
  RDR1: {
    tabla: "RDR1",
    descripcion: "Detalle de líneas de pedidos de venta. Contiene artículos, cantidades y precios comprometidos.",
    camposClave: ["DocEntry", "LineNum"],
    verificacion: "full",
    camposComunes: [
      { campo: "DocEntry", descripcion: "Enlace a la cabecera ORDR", tipo: "Integer" },
      { campo: "LineNum", descripcion: "Número de línea (0-indexed)", tipo: "Integer" },
      { campo: "ItemCode", descripcion: "Código del artículo", tipo: "String" },
      { campo: "Dscription", descripcion: "Descripción del artículo", tipo: "String" },
      { campo: "Quantity", descripcion: "Cantidad solicitada", tipo: "Decimal" },
      { campo: "Price", descripcion: "Precio unitario antes de impuestos", tipo: "Decimal" },
      { campo: "LineTotal", descripcion: "Total de la línea antes de impuestos", tipo: "Decimal" },
      { campo: "WhsCode", descripcion: "Código del almacén de despacho", tipo: "String" },
    ],
  },
  OPOR: {
    tabla: "OPOR",
    descripcion: "Órdenes de compra (cabecera). Compromisos de compra formalizados con proveedores.",
    camposClave: ["DocEntry", "DocNum"],
    verificacion: "full",
    camposComunes: [
      { campo: "DocEntry", descripcion: "Clave primaria interna", tipo: "Integer" },
      { campo: "DocNum", descripcion: "Número de orden visible", tipo: "Integer" },
      { campo: "CardCode", descripcion: "Código del proveedor (comienza por V)", tipo: "String" },
      { campo: "CardName", descripcion: "Nombre del proveedor", tipo: "String" },
      { campo: "DocDate", descripcion: "Fecha de la orden ('YYYY-MM-DD')", tipo: "Date" },
      { campo: "DocDueDate", descripcion: "Fecha de entrega acordada", tipo: "Date" },
      { campo: "DocTotal", descripcion: "Total neto + impuestos de la orden", tipo: "Decimal" },
      { campo: "DocStatus", descripcion: "Estado de la orden: 'O' (Abierta), 'C' (Cerrada)", tipo: "String" },
      { campo: "Comments", descripcion: "Comentarios", tipo: "String" },
    ],
  },
  POR1: {
    tabla: "POR1",
    descripcion: "Detalle de líneas de órdenes de compra. Artículos y precios solicitados al proveedor.",
    camposClave: ["DocEntry", "LineNum"],
    verificacion: "full",
    camposComunes: [
      { campo: "DocEntry", descripcion: "Enlace a la cabecera OPOR", tipo: "Integer" },
      { campo: "LineNum", descripcion: "Número de línea (0-indexed)", tipo: "Integer" },
      { campo: "ItemCode", descripcion: "Código del artículo", tipo: "String" },
      { campo: "Dscription", descripcion: "Descripción", tipo: "String" },
      { campo: "Quantity", descripcion: "Cantidad pedida", tipo: "Decimal" },
      { campo: "Price", descripcion: "Precio unitario acordado", tipo: "Decimal" },
      { campo: "LineTotal", descripcion: "Total de línea", tipo: "Decimal" },
    ],
  },
  OPCH: {
    tabla: "OPCH",
    descripcion: "Facturas de proveedores (cabecera). Cuentas por pagar por compras realizadas.",
    camposClave: ["DocEntry", "DocNum"],
    verificacion: "full",
    camposComunes: [
      { campo: "DocEntry", descripcion: "Clave interna", tipo: "Integer" },
      { campo: "DocNum", descripcion: "Número de factura SAP", tipo: "Integer" },
      { campo: "CardCode", descripcion: "Código de proveedor", tipo: "String" },
      { campo: "CardName", descripcion: "Nombre de proveedor", tipo: "String" },
      { campo: "DocDate", descripcion: "Fecha de factura", tipo: "Date" },
      { campo: "DocTotal", descripcion: "Total con impuestos", tipo: "Decimal" },
      { campo: "DocStatus", descripcion: "Estado de factura", tipo: "String" },
    ],
  },
  PCH1: {
    tabla: "PCH1",
    descripcion: "Líneas de facturas de proveedores. Detalle de costos e insumos comprados.",
    camposClave: ["DocEntry", "LineNum"],
    verificacion: "full",
    camposComunes: [
      { campo: "DocEntry", descripcion: "Enlace a OPCH", tipo: "Integer" },
      { campo: "ItemCode", descripcion: "Código artículo", tipo: "String" },
      { campo: "Quantity", descripcion: "Cantidad", tipo: "Decimal" },
      { campo: "Price", descripcion: "Precio unitario", tipo: "Decimal" },
      { campo: "LineTotal", descripcion: "Total de línea", tipo: "Decimal" },
    ],
  },
  OCRD: {
    tabla: "OCRD",
    descripcion: "Socios de Negocio (clientes, proveedores y prospectos). Fichero maestro principal.",
    camposClave: ["CardCode"],
    verificacion: "full",
    camposComunes: [
      { campo: "CardCode", descripcion: "Código del socio de negocio (ej: 'C00001', 'V00002')", tipo: "String" },
      { campo: "CardName", descripcion: "Nombre o razón social", tipo: "String" },
      { campo: "CardType", descripcion: "Tipo de socio en SQL: 'C' (Cliente), 'S' (Proveedor), 'L' (Lead/Prospecto). ⚠️ En SQL usa CardType = 'C', NO 'cCustomer' (ese es el valor OData/API)", tipo: "String" },
      { campo: "GroupCode", descripcion: "Código numérico de grupo de socio", tipo: "Integer" },
      { campo: "SlpCode", descripcion: "Código del vendedor asignado", tipo: "Integer" },
      { campo: "Balance", descripcion: "Saldo de cuenta corriente actual (deuda)", tipo: "Decimal" },
      { campo: "Currency", descripcion: "Moneda de cuenta corriente", tipo: "String" },
      { campo: "Phone1", descripcion: "Teléfono principal", tipo: "String" },
      { campo: "EmailAddress", descripcion: "Correo electrónico de contacto", tipo: "String" },
    ],
  },
  OITM: {
    tabla: "OITM",
    descripcion: "Fichero Maestro de Artículos (ítems). Catálogo completo de productos e inventarios.",
    camposClave: ["ItemCode"],
    verificacion: "full",
    camposComunes: [
      { campo: "ItemCode", descripcion: "Código único de artículo (ej: 'ITEM0001')", tipo: "String" },
      { campo: "ItemName", descripcion: "Nombre o descripción del artículo", tipo: "String" },
      { campo: "ItmsGrpCod", descripcion: "Código numérico del grupo de artículos", tipo: "Integer" },
      { campo: "AvgPrice", descripcion: "Costo promedio ponderado del artículo (columna real de la tabla HANA OITM vía SQLQueries)", tipo: "Decimal" },
      { campo: "OnHand", descripcion: "Stock total disponible físicamente en almacenes", tipo: "Decimal" },
      { campo: "IsCommited", descripcion: "Stock comprometido para pedidos de clientes", tipo: "Decimal" },
      { campo: "OnOrder", descripcion: "Stock ordenado a proveedores (en camino)", tipo: "Decimal" },
      { campo: "InventoryItem", descripcion: "Articulo inventariable: 'Y' / 'N'", tipo: "String" },
      { campo: "SellItem", descripcion: "Artículo de venta: 'Y' / 'N'", tipo: "String" },
      { campo: "BuyItem", descripcion: "Artículo de compra: 'Y' / 'N'", tipo: "String" },
    ],
    notas: [
      "RESUELTO AvgPrice vs AvgStdPrice: para la tabla OITM vía SQLQueries (/query, sap_run_query, consultar_sql) la columna real es AvgPrice — AvgStdPrice NO existe en ese conector. Verificado por incidente real en producción: ~15 errores en platform_logs el 2026-08-12 al adivinar AvgStdPrice; fix mergeado en ai4u-com-co/sap-b1-chat#20 con diagnóstico confirmado en vivo contra SAP real (tamaprint) por sap-experto. Corroborado además por código de producción de sap-b1-backend (lib/capabilities/financial-ratios.ts, lib/capabilities/inventory-by-category.ts, lib/kpis/registry.ts) que consulta AvgPrice vía SQL crudo contra OITM en múltiples KPIs activos.",
      "AvgStdPrice SÍ es un nombre válido, pero para la entidad OData 'Items' del Service Layer (usado en $select de listar_registros / ENTITY_MAP), no para SQLQueries — mismo patrón de discrepancia OData-vs-SQL confirmado en ORSC/Resources. Ver lib/sap/entities.ts:179 de sap-b1-backend, que usa AvgStdPrice correctamente en el $select OData de 'inventario/items'.",
    ],
  },
  OITB: {
    tabla: "OITB",
    descripcion: "Grupos de artículos/líneas de negocio.",
    camposClave: ["ItmsGrpCod"],
    verificacion: "blocked",
    camposComunes: [],
    notas: [
      "NO ACCESIBLE VÍA SQL (error 702 'Table not accessible'). No intentes hacer JOIN a OITB. Solo tienes el código ItmsGrpCod desde OITM. Si necesitas los nombres de los grupos, informa que no están disponibles vía SQL.",
      "Para nombres de grupos, usa el contexto SAP (datos maestros al inicio del chat) o informa que solo tienes el código ItmsGrpCod desde OITM.",
    ],
  },
  OSLP: {
    tabla: "OSLP",
    descripcion: "Vendedores.",
    camposClave: ["SlpCode"],
    verificacion: "blocked",
    camposComunes: [],
    notas: [
      "NO ACCESIBLE VÍA SQL (error 702). Para obtener nombres de vendedores, usa la herramienta listar_registros con endpoint 'sistema/vendedores' — devuelve SalesEmployeeCode (= SlpCode en OINV) y SalesEmployeeName. En SQL agrupa por SlpCode y cruza con OData.",
      "Usa listar_registros(\"sistema/vendedores\") → devuelve SalesEmployeeCode (= SlpCode) y SalesEmployeeName. Cruza con SlpCode de OINV/ORDR.",
    ],
  },
  OWHS: {
    tabla: "OWHS",
    descripcion: "Almacenes/Bodegas físicas en la empresa.",
    camposClave: ["WhsCode"],
    verificacion: "full",
    camposComunes: [
      { campo: "WhsCode", descripcion: "Código del almacén (ej: '01')", tipo: "String" },
      { campo: "WhsName", descripcion: "Nombre del almacén (ej: 'Bodega Principal')", tipo: "String" },
    ],
  },
  ORCT: {
    tabla: "ORCT",
    descripcion: "Cobros recibidos (cabecera). Registra pagos hechos por clientes y entradas de caja.",
    camposClave: ["DocEntry", "DocNum"],
    verificacion: "full",
    camposComunes: [
      { campo: "DocEntry", descripcion: "Clave primaria numérica interna", tipo: "Integer" },
      { campo: "DocNum", descripcion: "Número de cobro visible", tipo: "Integer" },
      { campo: "CardCode", descripcion: "Código del cliente o proveedor", tipo: "String" },
      { campo: "CardName", descripcion: "Nombre del cliente o proveedor", tipo: "String" },
      { campo: "DocDate", descripcion: "Fecha de recepción del cobro", tipo: "Date" },
      { campo: "DocTotal", descripcion: "Total cobrado en el documento", tipo: "Decimal" },
      { campo: "Canceled", descripcion: "Cobro cancelado: 'N' (vigente), 'Y' (cancelado). Filtra AND Canceled = 'N'", tipo: "String" },
    ],
    notas: ["CashSum y TransferSum NO existen vía SQLQueries en este conector."],
  },
  OJDT: {
    tabla: "OJDT",
    descripcion: "Asientos contables (cabecera). Diario general de contabilidad.",
    camposClave: ["TransId"],
    verificacion: "full",
    camposComunes: [
      { campo: "TransId", descripcion: "Identificador numérico de la transacción contable", tipo: "Integer" },
      { campo: "RefDate", descripcion: "Fecha de contabilización del asiento", tipo: "Date" },
      { campo: "Memo", descripcion: "Glosa o descripción del asiento", tipo: "String" },
      { campo: "LocTotal", descripcion: "Total del asiento en moneda local", tipo: "Decimal" },
    ],
  },
  OACT: {
    tabla: "OACT",
    descripcion: "Plan de Cuentas (Cuentas contables de la empresa).",
    camposClave: ["AcctCode"],
    verificacion: "full",
    camposComunes: [
      { campo: "AcctCode", descripcion: "Código de cuenta contable (ej: '110505')", tipo: "String" },
      { campo: "AcctName", descripcion: "Nombre de la cuenta", tipo: "String" },
      { campo: "CurrTotal", descripcion: "Saldo de cuenta actual", tipo: "Decimal" },
      { campo: "Postable", descripcion: "Cuenta recibe asientos directos: 'Y' / 'N'", tipo: "String" },
    ],
  },
  OWOR: {
    tabla: "OWOR",
    descripcion: "Órdenes de producción (cabecera).",
    camposClave: ["DocEntry"],
    verificacion: "partial",
    camposComunes: [
      { campo: "CmpltQty", descripcion: "Cantidad completada de la orden", tipo: "Decimal" },
    ],
    notas: [
      "CmpltQty es la columna real de cantidad completada — NO \"CompletedQty\". Para el resto de columnas de OWOR no confirmadas en esta sección, usa descubrir_esquema antes de asumir.",
    ],
  },
  WOR1: {
    tabla: "WOR1",
    descripcion: "Líneas de órdenes de producción.",
    camposClave: ["DocEntry", "LineNum"],
    verificacion: "partial",
    camposComunes: [
      { campo: "ItemName", descripcion: "Nombre/descripción del artículo de la línea", tipo: "String" },
    ],
    notas: [
      "ItemName es la columna real de descripción/nombre de línea — NO \"Dscription\" (a diferencia de RDR1/INV1/POR1, que sí usan ese nombre histórico). Para el resto de columnas de WOR1 no confirmadas en esta sección, usa descubrir_esquema antes de asumir.",
    ],
  },
  ORSC: {
    tabla: "ORSC",
    descripcion: "Recursos de producción (máquinas/centros de trabajo).",
    camposClave: ["ResCode"],
    verificacion: "full",
    camposComunes: [
      { campo: "ResCode", descripcion: "Código del recurso (PK)", tipo: "String" },
      { campo: "ResName", descripcion: "Nombre del recurso", tipo: "String" },
      { campo: "ResType", descripcion: "Tipo de recurso — 'M' = Máquina (otros valores sin confirmar)", tipo: "String" },
      { campo: "ResGrpCod", descripcion: "Código de grupo del recurso", tipo: "Integer" },
    ],
    notas: [
      "No hay columnas de costo/moneda/UoM confirmadas para ORSC vía SQL (SAP bloquea la introspección de catálogo para SQLQueries en esta tabla) — NO inventes columnas de costo aquí. Para el costo real de una orden de producción, usa los movimientos de inventario posteados (InventoryGenEntries/InventoryGenExits, BaseType=202, BaseEntry=OWOR.DocEntry), NO intentes leer columnas de costo de ORSC.",
      "El entity OData \"Resources\" usa nombres de campo DISTINTOS (Code/Name/Group/UnitOfMeasure) — no son intercambiables con las columnas SQL de ORSC (prefijo Res*). Mismo patrón de discrepancia OData-vs-SQL que OITM.AvgPrice/AvgStdPrice.",
    ],
  },
}
