import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "@/lib/export/csv";

const CH = (code: number) => String.fromCharCode(code);
const TAB = CH(0x09);
const CR = CH(0x0d);
const LF = CH(0x0a);
const BOM = CH(0xfeff);
const NBSP = CH(0xa0);
const EM_SPACE = CH(0x2003);
const ZWSP = CH(0x200b);

describe("csvCell — spreadsheet formula-injection guard", () => {
  it("prefixes a leading formula marker", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
  });

  it("detects a marker after skippable leading whitespace/control/BOM/NBSP/unicode", () => {
    // Plain spaces / tab → prefixed, no RFC quoting needed for space/tab.
    expect(csvCell("   =1")).toBe("'   =1");
    expect(csvCell(TAB + "=1")).toBe("'" + TAB + "=1");
    expect(csvCell(BOM + "=1")).toBe("'" + BOM + "=1");
    expect(csvCell(NBSP + "=1")).toBe("'" + NBSP + "=1");
    expect(csvCell(EM_SPACE + "=1")).toBe("'" + EM_SPACE + "=1");
    expect(csvCell(ZWSP + "=1")).toBe("'" + ZWSP + "=1");
    // CR / LF are also RFC-4180 special → prefixed AND quoted.
    expect(csvCell(CR + "=1")).toBe("\"'" + CR + '=1"');
    expect(csvCell(LF + "=1")).toBe("\"'" + LF + '=1"');
  });

  it("applies the guard inside quoted (comma/quote/newline) values", () => {
    expect(csvCell("=1,2")).toBe('"\'=1,2"');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });

  it("does not double-prefix a value that already starts with an apostrophe", () => {
    expect(csvCell("'=1")).toBe("'=1");
  });

  it("leaves benign values and preserves commas/quotes/newlines", () => {
    expect(csvCell("Safe Title")).toBe("Safe Title");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a" + LF + "b")).toBe('"a' + LF + 'b"');
    expect(csvCell("Grace Hopper")).toBe("Grace Hopper");
    expect(csvCell(100)).toBe("100");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    // A minus sign mid-string is not a formula.
    expect(csvCell("2026-01-01")).toBe("2026-01-01");
  });

  it("csvRow joins sanitised cells with commas", () => {
    expect(csvRow(["=1", "ok", "a,b"])).toBe('\'=1,ok,"a,b"');
  });
});
