# Annual Purchase Price Comparison — Methods & Audit Breakdown

This change affects **Procurement → Items → 3-Year Price Comparison** only. It does not change item/supplier-detail history, quotation analytics, or master data.

## User controls

- `Price calculation method` is a custom, localized popover with six choices, each explained in everyday language with a sample calculation. Its default is `lowest` for backward compatibility.
- Changing the method refetches the three-year table and financial totals and resets page 1. The choice is session-local; no database migration or stored preference is required.
- Hover a yearly unit price to see the corresponding formula and source aggregates. Clicking or keyboard activating the price opens the same breakdown in a popover, including a link to transaction history.
- Each annual price cell is calculated on the server. The displayed price and breakdown map from the **same SQL result row**.

## Shared eligibility and comparability

- Use only positive `UNIT_COST` from the eligible actual purchase transactions; do not substitute `UNIT_PRICE`, quote values, or invoice totals.
- Exclude known cancelled/void/reversed source rows, and apply the existing Supplier filters, currency, and UOM scope.
- The latest eligible transaction fixes the default currency/UOM comparison scope for an item if the user did not specify one. The same scope applies to every year and method.
- A year with no eligible transactions is N/A (not zero).
- Full SQL precision is used for selection/aggregation, with six decimal places returned for annual unit price. Frontend formats annual unit prices up to six decimals so small positive prices are not rendered as zero.
- **Lowest:** minimum eligible unit price, tied by most recent transaction/document fields.
- **Latest:** most recent transaction/document row by the existing deterministic ordering.
- **Average:** arithmetic mean of the eligible unit prices across individual transaction records, regardless of purchased quantity.
- **Median:** middle sorted record price; for even count, the average of the two middle prices.
- **Most repeated:** modal exact `DECIMAL(19,6)` unit price by *number of transactions*, not quantity. Ties: most recent purchase date, then lower price.
- **Weighted:** sum of eligible `quantity × unit price` divided by total quantity; any missing/nonpositive quantity in that year makes the weighted result unavailable, rather than silently excluding rows.
- Average/median/mode/weighted prices are aggregates, so they are not assigned to a specific supplier even when the component purchases have suppliers. Lowest/latest retain the exact chosen transaction's supplier/date/invoice.

## Financial comparison semantics

- The previous **year's selected-method unit price** is the benchmark for the current year's actual purchased quantity/spending. `estimated savings = previous-year method price × current-year quantity − current-year actual spending`.
- This is an *estimate*, not audited savings or true supplier-attributed savings.
- Only eligible SAR/UOM-matched transactions with fully valid quantities contribute to savings. At least two valid purchase years must be present within the three-year window to include an item's financial total; comparisons outside the window can serve only as the first year's benchmark.
- The selected savings-year controls, pagination, sort, filters, and YTD boundary keep their existing behavior.

## Deployment and tests

No SQL migration is needed; the feature uses read-only calculations on existing transaction source columns.

Run `pnpm build` and `pnpm test -- annual-price-methods.test.ts annual-price-years.test.ts annual-price-savings.test.ts` in server, then `pnpm build` and `pnpm test -- AnnualPriceSparkline.test.tsx` in client.

**Required live checks:** test an item with 5 known prices including ties, with two middle values, with unequal quantities, invalid quantities, multiple suppliers, and low precision prices. Confirm each price's tooltip exactly matches the backend's source aggregates and that the per-item and global savings totals adjust with the selected method. Test supplier/currency/UOM filters and an empty year. Run an `EXPLAIN`/actual query-plan review for large datasets because the additional ranking and median/window calculations can affect query performance.
