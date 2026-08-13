import { describe, it, expect } from "vitest"
import { SAP_TABLE_SCHEMAS } from "../src/sap-table-schemas"

describe("SAP_TABLE_SCHEMAS", () => {
  it("unifica las 19 tablas de las dos fuentes reconciliadas (sap-b1-backend + sap-b1-chat)", () => {
    expect(Object.keys(SAP_TABLE_SCHEMAS)).toHaveLength(19)
  })

  it("toda tabla 'full' tiene al menos un campo documentado", () => {
    for (const [tabla, schema] of Object.entries(SAP_TABLE_SCHEMAS)) {
      if (schema.verificacion === "full") {
        expect(schema.camposComunes.length, `${tabla} es 'full' pero no tiene camposComunes`).toBeGreaterThan(0)
      }
    }
  })

  it("toda tabla 'blocked' tiene camposComunes vacío y notas explicando la ruta alternativa", () => {
    for (const [tabla, schema] of Object.entries(SAP_TABLE_SCHEMAS)) {
      if (schema.verificacion === "blocked") {
        expect(schema.camposComunes, `${tabla} bloqueada pero trae camposComunes`).toHaveLength(0)
        expect(schema.notas?.length ?? 0, `${tabla} bloqueada sin notas`).toBeGreaterThan(0)
      }
    }
  })

  it("OITB y OSLP están marcadas como bloqueadas (NO ACCESIBLE VÍA SQL)", () => {
    expect(SAP_TABLE_SCHEMAS.OITB.verificacion).toBe("blocked")
    expect(SAP_TABLE_SCHEMAS.OSLP.verificacion).toBe("blocked")
  })

  it("OITM.camposComunes contiene AvgPrice (columna real vía SQLQueries) y no AvgStdPrice", () => {
    const campos = SAP_TABLE_SCHEMAS.OITM.camposComunes.map((c) => c.campo)
    expect(campos).toContain("AvgPrice")
    expect(campos).not.toContain("AvgStdPrice")
  })

  it("OITM documenta en notas la resolución AvgPrice vs AvgStdPrice y la distinción OData/SQL", () => {
    const notas = SAP_TABLE_SCHEMAS.OITM.notas ?? []
    expect(notas.some((n) => n.includes("AvgPrice") && n.includes("AvgStdPrice"))).toBe(true)
  })

  it("OWOR y WOR1 son 'partial' y conservan la advertencia anti-alucinación verbatim del prompt del chat", () => {
    expect(SAP_TABLE_SCHEMAS.OWOR.verificacion).toBe("partial")
    expect(SAP_TABLE_SCHEMAS.WOR1.verificacion).toBe("partial")
    expect(SAP_TABLE_SCHEMAS.OWOR.notas?.[0]).toContain("CmpltQty es la columna real de cantidad completada")
    expect(SAP_TABLE_SCHEMAS.WOR1.notas?.[0]).toContain("ItemName es la columna real de descripción")
  })

  it("las 12 tablas del gate de sap-b1-chat tienen la verificación correcta", () => {
    const full = ["OINV", "INV1", "ORDR", "RDR1", "OPOR", "POR1", "OCRD", "OITM", "ORCT", "ORSC"]
    const partial = ["OWOR", "WOR1"]

    for (const tabla of full) {
      expect(SAP_TABLE_SCHEMAS[tabla].verificacion, tabla).toBe("full")
    }
    for (const tabla of partial) {
      expect(SAP_TABLE_SCHEMAS[tabla].verificacion, tabla).toBe("partial")
    }
  })

  it("las 4 tablas exclusivas del backend (compras/contabilidad/almacenes) están completas", () => {
    for (const tabla of ["OPCH", "PCH1", "OWHS", "OJDT", "OACT"]) {
      expect(SAP_TABLE_SCHEMAS[tabla].verificacion, tabla).toBe("full")
      expect(SAP_TABLE_SCHEMAS[tabla].camposComunes.length, tabla).toBeGreaterThan(0)
    }
  })

  it("mantiene camposClave y descripcion no vacíos en todas las 19 tablas", () => {
    for (const [tabla, schema] of Object.entries(SAP_TABLE_SCHEMAS)) {
      expect(schema.tabla, tabla).toBe(tabla)
      expect(schema.descripcion.length, tabla).toBeGreaterThan(0)
      expect(schema.camposClave.length, tabla).toBeGreaterThan(0)
    }
  })
})
