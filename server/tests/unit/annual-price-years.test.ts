import { describe, expect, it } from "vitest";
import { annualPriceQuerySchema } from "../../src/modules/items/items.schemas.js";
import { resolveAnnualSavingsSelection } from "../../src/modules/items/items.annual-prices.repository.js";

describe("annual price comparison ending-year selection", () => {
  it("defaults to 2026 and the best-price-improvement sort", () => {
    const result = annualPriceQuerySchema.parse({});
    expect(result.endingYear).toBe(2026);
    expect(result.sortBy).toBe("performance");
    expect(result.sortDirection).toBe("asc");
  });

  it("accepts the two selectable column-header sorts", () => {
    const savings = annualPriceQuerySchema.parse({ sortBy: "totalSavings", sortDirection: "desc" });
    expect(savings.sortBy).toBe("totalSavings");
    expect(savings.sortDirection).toBe("desc");
    const price = annualPriceQuerySchema.parse({ sortBy: "currentPrice", sortDirection: "asc" });
    expect(price.sortBy).toBe("currentPrice");
    expect(price.sortDirection).toBe("asc");
  });

  it("defaults to all three savings comparisons", () => {
    const parsed = annualPriceQuerySchema.parse({});
    expect(parsed.savingsYears).toBeUndefined();
    expect(resolveAnnualSavingsSelection(parsed)).toEqual({
      selectedYears: [2024, 2025, 2026], year0: true, year1: true, year2: true,
    });
  });

  it("accepts one or more selected comparison years, including zero-savings comparisons", () => {
    const single = annualPriceQuerySchema.parse({ savingsYears: "2026" });
    expect(single.savingsYears).toEqual([2026]);
    expect(resolveAnnualSavingsSelection(single)).toEqual({
      selectedYears: [2026], year0: false, year1: false, year2: true,
    });
    const two = annualPriceQuerySchema.parse({ savingsYears: "2024,2026" });
    expect(resolveAnnualSavingsSelection(two)).toMatchObject({ year0: true, year1: false, year2: true });
  });

  it("shifts comparison options with 2027 and rejects invalid/empty selections", () => {
    const parsed = annualPriceQuerySchema.parse({ endingYear: 2027, savingsYears: "2025,2027" });
    expect(resolveAnnualSavingsSelection(parsed)).toEqual({
      selectedYears: [2025, 2027], year0: true, year1: false, year2: true,
    });
    expect(annualPriceQuerySchema.safeParse({ endingYear: 2027, savingsYears: "2024" }).success).toBe(false);
    expect(annualPriceQuerySchema.safeParse({ savingsYears: "2025,2025" }).success).toBe(false);
    expect(annualPriceQuerySchema.safeParse({ savingsYears: "" }).success).toBe(false);
    expect(annualPriceQuerySchema.safeParse({ savingsYears: "2024,2025,2026,2027" }).success).toBe(false);
  });

  it("accepts only 2026 and 2027, including 2027 before the calendar year begins", () => {
    expect(annualPriceQuerySchema.safeParse({ endingYear: "2026" }).success).toBe(true);
    expect(annualPriceQuerySchema.safeParse({ endingYear: "2027" }).success).toBe(true);
    expect(annualPriceQuerySchema.safeParse({ endingYear: "2025" }).success).toBe(false);
    expect(annualPriceQuerySchema.safeParse({ endingYear: "2028" }).success).toBe(false);
  });
});
