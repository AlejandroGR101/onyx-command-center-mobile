import { describe, it, expect } from "vitest";
import {
  parseProfitAndLossReport,
  parseProfitAndLossLineItems,
  parseBalanceSheet,
  parseAgedReceivables,
  parseQbCustomers,
  extractCashPosition,
  extractApTotal,
  extractArTotal,
} from "../../server/quickbooks/parse";

// ─────────────────────────────────────────────────────────────
// parseProfitAndLossReport — extrae totales mensuales (revenue, COGS, opex, netIncome)
// ─────────────────────────────────────────────────────────────
describe("parseProfitAndLossReport", () => {
  const fixture = {
    Columns: {
      Column: [
        { ColTitle: "" },
        { ColTitle: "Jan 2026", MetaData: [{ Name: "StartDate", Value: "2026-01-01" }, { Name: "EndDate", Value: "2026-01-31" }] },
        { ColTitle: "Feb 2026", MetaData: [{ Name: "StartDate", Value: "2026-02-01" }, { Name: "EndDate", Value: "2026-02-28" }] },
        { ColTitle: "Total" },
      ],
    },
    Rows: {
      Row: [
        { group: "Income",    Summary: { ColData: [{ value: "" }, { value: "10000.00" }, { value: "8000.00" }, { value: "18000.00" }] } },
        { group: "COGS",      Summary: { ColData: [{ value: "" }, { value: "4000.00" },  { value: "3200.00" }, { value: "7200.00" } ] } },
        { group: "Expenses",  Summary: { ColData: [{ value: "" }, { value: "2500.00" },  { value: "2100.00" }, { value: "4600.00" } ] } },
        { group: "NetIncome", Summary: { ColData: [{ value: "" }, { value: "3500.00" },  { value: "2700.00" }, { value: "6200.00" } ] } },
      ],
    },
  };

  it("devuelve exactamente las columnas mensuales (skip label + Total)", () => {
    const result = parseProfitAndLossReport(fixture);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.period)).toEqual(["2026-01", "2026-02"]);
  });

  it("extrae revenue/cogs/opex/netIncome correctamente para 2026-01", () => {
    const result = parseProfitAndLossReport(fixture);
    expect(result[0]).toEqual({
      period: "2026-01",
      revenue: 10000,
      cogs: 4000,
      operatingExpenses: 2500,
      netIncome: 3500,
    });
  });

  it("extrae 2026-02 correctamente", () => {
    const result = parseProfitAndLossReport(fixture);
    expect(result[1]).toEqual({
      period: "2026-02",
      revenue: 8000,
      cogs: 3200,
      operatingExpenses: 2100,
      netIncome: 2700,
    });
  });

  it("devuelve array vacío cuando no hay columnas mensuales", () => {
    const empty = { Columns: { Column: [{ ColTitle: "" }] }, Rows: { Row: [] } };
    expect(parseProfitAndLossReport(empty)).toEqual([]);
  });

  it("trata strings con comas como números", () => {
    const withCommas = {
      ...fixture,
      Rows: {
        Row: [
          { group: "Income", Summary: { ColData: [{ value: "" }, { value: "1,234,567.89" }, { value: "" }, { value: "" }] } },
        ],
      },
    };
    const result = parseProfitAndLossReport(withCommas);
    expect(result[0].revenue).toBeCloseTo(1234567.89);
  });
});

// ─────────────────────────────────────────────────────────────
// parseProfitAndLossLineItems — extrae detail rows bajo Income/COGS/Expenses
// ─────────────────────────────────────────────────────────────
describe("parseProfitAndLossLineItems", () => {
  const fixture = {
    Columns: {
      Column: [
        { ColTitle: "" },
        { ColTitle: "Jan 2026", MetaData: [{ Name: "StartDate", Value: "2026-01-01" }] },
        { ColTitle: "Feb 2026", MetaData: [{ Name: "StartDate", Value: "2026-02-01" }] },
        { ColTitle: "Total" },
      ],
    },
    Rows: {
      Row: [
        {
          Header: { ColData: [{ value: "Income" }, { value: "" }, { value: "" }, { value: "" }] },
          Rows: { Row: [
            { type: "Data", ColData: [{ value: "Pressing Revenue" }, { value: "32659.00" }, { value: "28400.00" }, { value: "61059.00" }] },
          ]},
          Summary: { ColData: [{ value: "Total Income" }, { value: "32659.00" }, { value: "28400.00" }, { value: "61059.00" }] },
          type: "Section", group: "Income",
        },
        {
          Header: { ColData: [{ value: "Cost of Goods Sold" }, { value: "" }, { value: "" }, { value: "" }] },
          Rows: { Row: [
            { type: "Data", ColData: [{ value: "Vinyl Pellets" }, { value: "4822.00" }, { value: "4200.00" }, { value: "9022.00" }] },
            { type: "Data", ColData: [{ value: "Labels" }, { value: "2393.00" }, { value: "2100.00" }, { value: "4493.00" }] },
          ]},
          Summary: { ColData: [{ value: "Total COGS" }, { value: "7215.00" }, { value: "6300.00" }, { value: "13515.00" }] },
          type: "Section", group: "COGS",
        },
        {
          Header: { ColData: [{ value: "Expenses" }, { value: "" }, { value: "" }, { value: "" }] },
          Rows: { Row: [
            { type: "Data", ColData: [{ value: "Rent" }, { value: "6150.00" }, { value: "6150.00" }, { value: "12300.00" }] },
          ]},
          Summary: { ColData: [{ value: "Total Expenses" }, { value: "6150.00" }, { value: "6150.00" }, { value: "12300.00" }] },
          type: "Section", group: "Expenses",
        },
      ],
    },
  };

  it("emite 8 line items (4 leaf labels × 2 meses)", () => {
    const result = parseProfitAndLossLineItems(fixture);
    expect(result).toHaveLength(8);
  });

  it("mapea grupos QB a categorías UI", () => {
    const result = parseProfitAndLossLineItems(fixture);
    const cats = new Set(result.map((r) => r.category));
    expect(cats).toEqual(new Set(["Revenue", "Cost of Goods Sold", "Operating Expenses"]));
  });

  it("preserva sortOrder según orden dentro del grupo (Vinyl Pellets=0, Labels=1)", () => {
    const result = parseProfitAndLossLineItems(fixture);
    const vinyl = result.find((r) => r.label === "Vinyl Pellets" && r.period === "2026-01");
    const labels = result.find((r) => r.label === "Labels" && r.period === "2026-01");
    expect(vinyl?.sortOrder).toBe(0);
    expect(labels?.sortOrder).toBe(1);
  });

  it("amounts son raw QB (positivos, sin flip)", () => {
    const result = parseProfitAndLossLineItems(fixture);
    const rent = result.find((r) => r.label === "Rent" && r.period === "2026-01");
    expect(rent?.amount).toBe(6150); // positivo aunque sea expense
  });

  it("salta amounts en 0 (no emite filas inútiles)", () => {
    const zeroFixture = {
      ...fixture,
      Rows: {
        Row: [{
          Header: { ColData: [{ value: "Income" }] },
          Rows: { Row: [{ type: "Data", ColData: [{ value: "Empty Line" }, { value: "0" }, { value: "0" }, { value: "0" }] }] },
          group: "Income",
        }],
      },
    };
    expect(parseProfitAndLossLineItems(zeroFixture)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// parseBalanceSheet + extractCashPosition + extractApTotal
// ─────────────────────────────────────────────────────────────
describe("parseBalanceSheet", () => {
  const fixture = {
    Columns: {
      Column: [
        { ColTitle: "" },
        { ColTitle: "Jan 2026", MetaData: [{ Name: "StartDate", Value: "2026-01-01" }] },
      ],
    },
    Rows: {
      Row: [
        {
          Header: { ColData: [{ value: "ASSETS" }, { value: "" }] },
          Rows: { Row: [
            { Header: { ColData: [{ value: "Bank Accounts" }, { value: "" }] },
              Rows: { Row: [
                { type: "Data", ColData: [{ value: "Wells Fargo Checking" }, { value: "2676.58" }] },
                { type: "Data", ColData: [{ value: "Wells Fargo Savings" }, { value: "2022.14" }] },
              ]},
              Summary: { ColData: [{ value: "Total Bank Accounts" }, { value: "4698.72" }] },
            },
          ]},
          Summary: { ColData: [{ value: "TOTAL ASSETS" }, { value: "627061.05" }] },
        },
        {
          Header: { ColData: [{ value: "LIABILITIES AND EQUITY" }, { value: "" }] },
          Rows: { Row: [
            { Header: { ColData: [{ value: "LIABILITIES" }, { value: "" }] },
              Rows: { Row: [
                { type: "Data", ColData: [{ value: "Accounts Payable" }, { value: "24813.94" }] },
              ]},
              Summary: { ColData: [{ value: "TOTAL LIABILITIES" }, { value: "35739.50" }] },
            },
            { Header: { ColData: [{ value: "EQUITY" }, { value: "" }] },
              Rows: { Row: [
                { type: "Data", ColData: [{ value: "Owner Equity" }, { value: "591321.55" }] },
              ]},
              Summary: { ColData: [{ value: "TOTAL EQUITY" }, { value: "591321.55" }] },
            },
          ]},
        },
      ],
    },
  };

  it("detecta las tres secciones Assets/Liabilities/Equity", () => {
    const parsed = parseBalanceSheet(fixture);
    const sections = new Set(parsed.map((p) => p.section));
    expect(sections).toEqual(new Set(["Assets", "Liabilities", "Equity"]));
  });

  it("desciende correctamente en el contenedor 'LIABILITIES AND EQUITY'", () => {
    const parsed = parseBalanceSheet(fixture);
    const liab = parsed.filter((p) => p.section === "Liabilities");
    const equity = parsed.filter((p) => p.section === "Equity");
    expect(liab.length).toBeGreaterThan(0);
    expect(equity.length).toBeGreaterThan(0);
  });

  it("marca isBold en Headers y Summary rows", () => {
    const parsed = parseBalanceSheet(fixture);
    const summary = parsed.find((p) => p.label === "TOTAL ASSETS");
    expect(summary?.isBold).toBe(true);
    const leaf = parsed.find((p) => p.label === "Wells Fargo Checking");
    expect(leaf?.isBold).toBe(false);
  });

  it("extractCashPosition encuentra Total Bank Accounts case-insensitive", () => {
    const parsed = parseBalanceSheet(fixture);
    expect(extractCashPosition(parsed, "2026-01")).toBe(4698.72);
  });

  it("extractCashPosition devuelve null si no hay match", () => {
    expect(extractCashPosition([], "2026-01")).toBeNull();
  });

  it("extractApTotal encuentra Accounts Payable", () => {
    const parsed = parseBalanceSheet(fixture);
    expect(extractApTotal(parsed, "2026-01")).toBe(24813.94);
  });

  it("extractApTotal devuelve null si no hay match", () => {
    expect(extractApTotal([], "2026-01")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// parseAgedReceivables + extractArTotal
// ─────────────────────────────────────────────────────────────
describe("parseAgedReceivables", () => {
  const fixture = {
    Columns: {
      Column: [
        { ColTitle: "Customer" },
        { ColTitle: "Invoice Date" },
        { ColTitle: "Num" },
        { ColTitle: "Current" },
        { ColTitle: "1 - 30" },
        { ColTitle: "31 - 60" },
        { ColTitle: "61 - 90" },
        { ColTitle: "91 and over" },
        { ColTitle: "Total" },
      ],
    },
    Rows: {
      Row: [
        { type: "Data", ColData: [
          { value: "Adam Bartlett" }, { value: "2026-02-20" }, { value: "INV-3801" },
          { value: "5284.14" }, { value: "0" }, { value: "0" }, { value: "0" }, { value: "0" }, { value: "5284.14" },
        ]},
        { type: "Data", ColData: [
          { value: "Ira Altwegg" }, { value: "2025-06-15" }, { value: "INV-3650" },
          { value: "0" }, { value: "0" }, { value: "0" }, { value: "0" }, { value: "2018.54" }, { value: "2018.54" },
        ]},
      ],
    },
  };

  it("mapea bucket 'Current' → 'current'", () => {
    const parsed = parseAgedReceivables(fixture);
    expect(parsed[0].agingBucket).toBe("current");
  });

  it("mapea bucket '91 and over' → '91+'", () => {
    const parsed = parseAgedReceivables(fixture);
    expect(parsed[1].agingBucket).toBe("91+");
  });

  it("extrae invoiceDate e invoiceNumber correctamente", () => {
    const parsed = parseAgedReceivables(fixture);
    expect(parsed[0].invoiceDate).toBe("2026-02-20");
    expect(parsed[0].invoiceNumber).toBe("INV-3801");
  });

  it("salta cells con amount 0 (no emite filas con 0)", () => {
    const parsed = parseAgedReceivables(fixture);
    expect(parsed).toHaveLength(2); // solo 2 filas con un amount > 0 cada una
  });

  it("extractArTotal suma todos los amounts", () => {
    const parsed = parseAgedReceivables(fixture);
    expect(extractArTotal(parsed)).toBeCloseTo(7302.68);
  });
});

// ─────────────────────────────────────────────────────────────
// parseQbCustomers — filtra inválidos
// ─────────────────────────────────────────────────────────────
describe("parseQbCustomers", () => {
  const fixture = {
    QueryResponse: {
      Customer: [
        { Id: "1", DisplayName: "Adam Bartlett", Active: true },
        { Id: "2", DisplayName: "Puscifer Entertainment", Active: true },
        { Id: "3", DisplayName: "Old Customer", Active: false },
        { Id: "4", DisplayName: "" }, // filtered (no name)
        { DisplayName: "No Id Customer" }, // filtered (no Id)
      ],
    },
  };

  it("filtra customers sin Id o sin DisplayName", () => {
    const parsed = parseQbCustomers(fixture);
    expect(parsed).toHaveLength(3);
  });

  it("preserva Id como string", () => {
    const parsed = parseQbCustomers(fixture);
    expect(parsed[0].id).toBe("1");
    expect(typeof parsed[0].id).toBe("string");
  });

  it("Active=false propaga correctamente", () => {
    const parsed = parseQbCustomers(fixture);
    const inactive = parsed.find((c) => c.displayName === "Old Customer");
    expect(inactive?.active).toBe(false);
  });

  it("Active ausente default true", () => {
    const minimal = { QueryResponse: { Customer: [{ Id: "5", DisplayName: "No Active Field" }] } };
    const parsed = parseQbCustomers(minimal);
    expect(parsed[0].active).toBe(true);
  });

  it("devuelve array vacío si no hay Customer", () => {
    expect(parseQbCustomers({})).toEqual([]);
    expect(parseQbCustomers({ QueryResponse: {} })).toEqual([]);
  });
});
