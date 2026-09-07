# QNH TaskHub — Procurement Module Source of Truth

> **Status:** Approved implementation baseline  
> **Last aligned:** 2026-09-07  
> **Revision note:** Excel Quote Import Supplier headers now resolve by exact Supplier Code first with exact English/Arabic Supplier Name fallback and ambiguity protection; the Items Supplier KPI is explicitly purchase-history scoped; Excel Quote Import Phase 2 completes the Items-page upload/review/destination workflow with server-authoritative revalidation, transactional Saved View merge/create, private SAR Quote creation, same-day duplicate skipping, and import-batch audit linkage; Production source tables/procedures are finalized; preserves `SOURCE_ROWID` deterministic ordering, production deployment validation, and Items Performance V2; Price Quote entry enforces SAR and controlled UOMs; Saved View Supplier Comparison supports persisted Actual Purchases / My Quotes / Compare price-source modes with Latest / Previous / Lowest / Highest / Average metrics while preserving Actual-vs-Quote separation; Price History uses one shared accessible interactive SVG design across Item Details and Item+Supplier drill-downs; private Quote history tables use grouped Quote-information / Price-comparison headers, predictable column geometry, explicit separators, stacked price/UOM values, and explanatory comparison empty states; Item Details Supplier filters keep selected Suppliers pinned and synchronize ordinary URL scope with repeated `supplier=` parameters and true default Reset behavior.  
> **Purpose:** Persistent, portable source of truth for all future Procurement-module design, implementation, review, and ZIP-patch requests.  
> **Project:** QNH TaskHub  
> **Primary audience:** ChatGPT/Codex/engineers implementing or reviewing Procurement work.

---

## 1. How to use this document

This file is the approved Procurement-module context. Read it before changing Procurement, Contracts/Suppliers integration, Items, Price Quotes, Procurement permissions, or Procurement analytics.

For Procurement work:

1. The user's **explicit current request** has highest priority.
2. The **actual current repository and actual SQL Server schema** determine physical names, existing implementation state, and migration reality.
3. This document defines the approved **Procurement business behavior, boundaries, UX, ownership model, integration rules, and implementation direction**.
4. Existing TaskHub `AGENTS.md`, `docs/product-requirements.md`, and established project patterns remain applicable.
5. General framework conventions come after project-specific rules.

If the repository or physical database conflicts with this approved Procurement behavior, **identify the mismatch instead of silently restoring old behavior**. Preserve operational data and update code/documentation coherently.

This document should be supplied with future Procurement requests so the implementation does not have to reconstruct the design from previous conversations.

---

# 2. Product goal

The Procurement module exists primarily to give authorized users a clear, fast, user-friendly way to understand **historical item purchase prices by supplier**, compare suppliers, inspect price trends, and maintain their own private supplier price quotes.

The primary questions the module should answer are:

- What is the latest actual purchase price of this item?
- Which supplier supplied it at that price?
- What was the previous price?
- Did the price increase or decrease?
- What is the lowest historical price?
- What is the highest historical price?
- What is the average recorded unit cost?
- Which supplier is currently cheapest for this item?
- Which supplier is currently highest?
- How does each supplier's price history compare?
- What items does a supplier provide?
- For which items is a supplier currently the cheapest?
- For which items is a supplier currently expensive?
- What is the supplier's latest price for each item?
- What are the user's current private Price Quotes?
- Is one of the user's quotes cheaper than the latest actual purchase price?
- Which items recently increased or decreased most?
- Which items have the largest price spread between suppliers?
- What exact transactions produced the displayed statistics?
- How has one Supplier's price for one Item changed across repeated Transactions over time?
- Can the user distinguish Suppliers immediately in the price-history chart through color + marker + line style, focus one Supplier, read useful time/price axes, and inspect exact purchase points by pointer or keyboard?
- How have my private Quotes for the same Item/Supplier changed over time?
- Can I save a recurring subset of specific Items and Suppliers and reopen it later with current recalculated statistics?
- On ordinary Item Details, can I clearly see and change the current Supplier/period scope, select multiple Suppliers without losing already-selected Suppliers to option pagination, and use Reset to return to All Suppliers + 1Y? Saved View Item Details deliberately resets to the Saved View's configured Supplier/period baseline instead.
- Can Item master information be scanned quickly through consistent information tiles, with long fields given adequate room and LTR numeric/code values aligned correctly inside both Arabic and English layouts?
- Can users recognize and open Supplier, Item, and Contract identities directly from Procurement tables through the same soft-blue rounded entity-link treatment, without underlines or row-wide navigation?
- Can the Items landing table be scanned quickly with a sticky compact Item identity, grouped Price Intelligence / Purchase Activity headers, aligned numeric values, semantic change/supplier indicators, and an explicit no-purchase-history state?

The Items landing-page Supplier KPI is purchase-history scoped: it counts distinct Suppliers present in the current Actual-purchase analytics scope and must be labeled **Suppliers with Purchases / الموردون الذين لديهم مشتريات**. It is not the shared Supplier-master total shown on the Suppliers page.

The module is a **price-intelligence and comparison experience**, not merely a CRUD interface over database tables.

---

# 3. Core scope

The Procurement area contains exactly these primary navigation destinations:


- Contracts
- Items
- Suppliers
- Price Quotes

---

# 4. Excel Quote Import

Excel Quote Import is an Items-page workflow for turning a controlled `.xlsx` quotation matrix into private TaskHub Price Quote history and Saved View membership without touching Actual purchase transactions.

Approved rules:

- Match Item rows by exact normalized `ITEM_CODE` first. If and only if the exact Item lookup returns no match and the Excel Item Code is digits-only without a leading zero, retry exactly once with one leading `0` to recover a leading zero stripped by Excel. Do not keep adding zeros, use partial matching, or fall back to Item names.
- Treat each Supplier header as a Supplier reference. Resolve it by exact normalized `SUPPLIER_CODE` first. Only when no Supplier Code matches, retry the same header against exact normalized `SUPPLIER_NAME` and `SUPPLIER_NAME_S`. A unique exact name match is accepted; multiple exact name matches are `AMBIGUOUS`; no match is `NOT_FOUND`. Never use partial/contains matching, never apply the Item leading-zero fallback to Suppliers, and never create missing master Items/Suppliers from an import.
- Supplier headers define Saved View Supplier membership even when all cells under that Supplier are blank. Item rows define Saved View Item membership even when they contain no Quote prices.
- Every non-empty positive numeric Supplier-price cell is a private Quote candidate. Blank/dash cells create no Quote; zero, negative, non-numeric, or out-of-range values are invalid.
- Imported Quote Currency is always SAR. Quote Date defaults to the current application date in `APP_TIME_ZONE`. The Excel UOM must exactly match an Item-approved controlled Quote UOM after whitespace/case normalization; no automatic EA/PCS/EACH alias conversion is approved in Phase 1.
- Same owner + Item + Supplier + UOM + SAR price + same Quote date is an exact duplicate and is skipped. The same price on an older date is a valid new historical Quote candidate. A changed price is also a new historical Quote candidate; import never overwrites older Quote history.
- Duplicate Item rows or duplicate Supplier columns in the same workbook are validation findings rather than additional Quote candidates.
- The server is authoritative for parsing, code resolution, UOM/price validation, and duplicate/history classification. Browser-side data must never be trusted as the final import result.
- Preview remains read-only. Final Apply re-uploads and fully revalidates the workbook server-side, then performs Saved View + Quote changes in one SQL transaction; client preview data is never trusted as write input.
- Import audit foundation uses `dbo.TM_procurement_import_batches`. Imported Quotes link through nullable `TM_price_quotes.import_batch_id`; a null link continues to identify manual/non-imported Quote history.
- Final Apply merges matched Item/Supplier IDs into an existing private Saved View without changing its other configuration, or creates a new private Saved View with the approved 1Y / Actual / Latest defaults.

