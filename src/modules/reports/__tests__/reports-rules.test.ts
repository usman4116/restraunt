import { describe, it, expect } from "vitest";
import {
  bucketKey,
  bucketRange,
  percentOf,
  foodCostPercent,
  marginPercent,
} from "../service/reports.service";
import { csvCell, toCsv, toExcelXml, toPdf, pdfString, slugify } from "../lib/export";
import type { ExportTable } from "../lib/export";
import { reportQuerySchema } from "../dto/reports.dto";

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("bucketKey", () => {
  it("keys days by the date itself", () => {
    expect(bucketKey(utc("2026-08-05"), "day")).toBe("2026-08-05");
  });

  it("collapses a week onto its Monday", () => {
    // 2026-08-05 is a Wednesday; its ISO week starts Monday 2026-08-03.
    expect(bucketKey(utc("2026-08-05"), "week")).toBe("2026-08-03");
  });

  it("keeps a Monday on itself", () => {
    expect(bucketKey(utc("2026-08-03"), "week")).toBe("2026-08-03");
  });

  it("folds a Sunday back to the preceding Monday, not forward", () => {
    expect(bucketKey(utc("2026-08-09"), "week")).toBe("2026-08-03");
  });

  it("keys months as YYYY-MM", () => {
    expect(bucketKey(utc("2026-08-05"), "month")).toBe("2026-08");
  });
});

describe("bucketRange", () => {
  it("emits every day in the window inclusive", () => {
    expect(bucketRange("2026-08-01", "2026-08-03", "day")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("does not duplicate a week when the range starts mid-week", () => {
    const keys = bucketRange("2026-08-05", "2026-08-12", "week");
    expect(keys).toEqual(["2026-08-03", "2026-08-10"]);
  });

  it("spans months across a year boundary", () => {
    expect(bucketRange("2026-11-15", "2027-01-10", "month")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });
});

describe("percent helpers", () => {
  it("computes a share to one decimal", () => {
    expect(percentOf(335, 1000)).toBe(33.5);
  });

  it("returns zero rather than dividing by an empty whole", () => {
    expect(percentOf(50, 0)).toBe(0);
  });

  it("expresses food cost against price", () => {
    expect(foodCostPercent(3.5, 10)).toBe(35);
  });

  it("margin and food cost are complements", () => {
    expect(marginPercent(3.5, 10)).toBe(65);
  });

  it("margin is zero for an unpriced item", () => {
    expect(marginPercent(2, 0)).toBe(0);
  });
});

describe("csv export", () => {
  it("quotes cells containing commas and doubles embedded quotes", () => {
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
  });

  it("leaves plain cells unquoted", () => {
    expect(csvCell("plain")).toBe("plain");
  });

  it("renders header plus one line per row with CRLF endings", () => {
    const csv = toCsv({
      title: "T",
      columns: [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
      ],
      rows: [
        { a: "x", b: 1 },
        { a: "y", b: 2 },
      ],
    });
    expect(csv).toBe("A,B\r\nx,1\r\ny,2");
  });
});

describe("excel export", () => {
  const table: ExportTable<Record<string, unknown>> = {
    title: "Sales <2026>",
    columns: [
      { key: "name", label: "Name" },
      { key: "total", label: "Total", numeric: true },
    ],
    rows: [{ name: "A&B café", total: 12.5 }],
  };

  it("escapes XML entities in strings", () => {
    const xml = toExcelXml(table);
    expect(xml).toContain("A&amp;B café");
    expect(xml).not.toContain("A&B");
  });

  it("emits numeric cells as typed numbers", () => {
    expect(toExcelXml(table)).toContain('<Data ss:Type="Number">12.5</Data>');
  });

  it("strips illegal sheet-name characters and caps at 31 chars", () => {
    const xml = toExcelXml({ ...table, title: "a/b\\c:d?e*f[g]h".repeat(4) });
    const name = /ss:Name="([^"]*)"/.exec(xml)![1];
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[:\\/?*[\]]/);
  });

  it("turns a non-numeric value in a numeric column into 0, not NaN", () => {
    const xml = toExcelXml({ ...table, rows: [{ name: "x", total: "n/a" }] });
    expect(xml).toContain('<Data ss:Type="Number">0</Data>');
    expect(xml).not.toContain("NaN");
  });
});

describe("pdf export", () => {
  const table: ExportTable<Record<string, unknown>> = {
    title: "Report (2026)",
    subtitle: "2026-08-01 to 2026-08-31",
    columns: [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ],
    rows: Array.from({ length: 40 }, (_, i) => ({ a: `row${i}`, b: i })),
  };

  it("escapes parentheses and backslashes in literal strings", () => {
    expect(pdfString("a(b)c\\d")).toBe("a\\(b\\)c\\\\d");
  });

  it("replaces non-ASCII rather than emitting bytes Helvetica cannot map", () => {
    expect(pdfString("café — 5€")).toBe("caf? ? 5?");
  });

  it("produces a structurally complete document", () => {
    const pdf = toPdf(table);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("trailer");
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("paginates once rows exceed a page", () => {
    const pdf = toPdf(table); // 40 rows, 32 per page
    expect(pdf).toContain("(Page 1 of 2)");
    expect(pdf).toContain("(Page 2 of 2)");
  });

  it("still renders a valid single page for an empty report", () => {
    const pdf = toPdf({ ...table, rows: [] });
    expect(pdf).toContain("(Page 1 of 1)");
  });
});

describe("slugify", () => {
  it("kebab-cases a title", () => {
    expect(slugify("Food cost (Q3) — final")).toBe("food-cost-q3-final");
  });

  it("never returns an empty filename", () => {
    expect(slugify("···")).toBe("report");
  });
});

describe("reportQuerySchema", () => {
  it("accepts a sane range and defaults granularity to day", () => {
    const parsed = reportQuerySchema.parse({ from: "2026-08-01", to: "2026-08-31" });
    expect(parsed.granularity).toBe("day");
    expect(parsed.limit).toBe(20);
  });

  it("rejects an inverted range", () => {
    const result = reportQuerySchema.safeParse({ from: "2026-08-31", to: "2026-08-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    const result = reportQuerySchema.safeParse({ from: "08/01/2026", to: "2026-08-31" });
    expect(result.success).toBe(false);
  });
});
