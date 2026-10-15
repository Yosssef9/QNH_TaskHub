import { describe, expect, it } from "vitest";
import { annualPriceOrder } from "../../src/modules/items/items.annual-prices.repository.js";

describe("annual procurement comparison ordering", () => {
  it("ranks comparable improvements ascending and puts missing comparisons last", () => {
    expect(annualPriceOrder({ sortBy: "performance", sortDirection: "asc" })).toContain(
      "CASE WHEN latestChangePercent IS NULL THEN 1 ELSE 0 END ASC, latestChangePercent ASC",
    );
  });

  it("allows reverse performance while still keeping uncomparable items at the end", () => {
    expect(annualPriceOrder({ sortBy: "performance", sortDirection: "desc" })).toContain(
      "CASE WHEN latestChangePercent IS NULL THEN 1 ELSE 0 END ASC, latestChangePercent DESC",
    );
  });

  it("sorts highest net savings first, including partial totals, with N/A at the end", () => {
    expect(annualPriceOrder({ sortBy: "totalSavings", sortDirection: "desc" })).toBe(
      "CASE WHEN totalSavings IS NULL THEN 1 ELSE 0 END ASC, totalSavings DESC, itemName ASC, itemId ASC",
    );
    expect(annualPriceOrder({ sortBy: "totalSavings", sortDirection: "asc" })).toContain(
      "CASE WHEN totalSavings IS NULL THEN 1 ELSE 0 END ASC, totalSavings ASC",
    );
  });

  it("sorts prices with missing values last and a deterministic item tie-breaker", () => {
    expect(annualPriceOrder({ sortBy: "currentPrice", sortDirection: "asc" })).toBe(
      "CASE WHEN year2Cost IS NULL THEN 1 ELSE 0 END ASC, year2Cost ASC, itemName ASC, itemId ASC",
    );
  });
});
