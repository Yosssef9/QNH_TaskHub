# QNH TaskHub — Procurement Module Source of Truth

> **Status:** Approved implementation baseline  
> **Last aligned:** 2026-09-06  
> **Revision note:** Production source tables/procedures are finalized; preserves `SOURCE_ROWID` deterministic ordering, production deployment validation, and Items Performance V2; Price Quote entry enforces SAR and controlled UOMs; Saved View Supplier Comparison supports persisted Actual Purchases / My Quotes / Compare price-source modes with Latest / Previous / Lowest / Highest / Average metrics while preserving Actual-vs-Quote separation; Price History uses one shared accessible interactive SVG design across Item Details and Item+Supplier drill-downs; private Quote history tables use grouped Quote-information / Price-comparison headers, predictable column geometry, explicit separators, stacked price/UOM values, and explanatory comparison empty states; Item Details Supplier filters keep selected Suppliers pinned and synchronize ordinary URL scope with repeated `supplier=` parameters and true default Reset behavior.  
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

The module is a **price-intelligence and comparison experience**, not merely a CRUD interface over database tables.

---

# 3. Core scope

The Procurement area contains exactly these primary navigation destinations:
