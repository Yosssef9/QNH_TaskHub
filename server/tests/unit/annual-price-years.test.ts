import { describe, expect, it } from "vitest";
import { annualPriceQuerySchema } from "../../src/modules/items/items.schemas.js";

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

  it("accepts only 2026 and 2027, including 2027 before the calendar year begins", () => {
    expect(annualPriceQuerySchema.safeParse({ endingYear: "2026" }).success).toBe(true);
    expect(annualPriceQuerySchema.safeParse({ endingYear: "2027" }).success).toBe(true);
    expect(annualPriceQuerySchema.safeParse({ endingYear: "2025" }).success).toBe(false);
    expect(annualPriceQuerySchema.safeParse({ endingYear: "2028" }).success).toBe(false);
  });
});
