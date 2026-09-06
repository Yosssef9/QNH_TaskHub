# QNH TaskHub — Procurement Module Source of Truth

> **Status:** Approved implementation baseline  
> **Last aligned:** 2026-09-05  
> **Revision note:** Production source tables/procedures are finalized; added `SOURCE_ROWID` deterministic ordering, production deployment validation, and the approved Items Performance V2 fast-data foundation while preserving Saved Views, Quote time-series, and Procurement UI rules.  
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
- How have my private Quotes for the same Item/Supplier changed over time?
- Can I save a recurring subset of specific Items and Suppliers and reopen it later with current recalculated statistics?

The module is a **price-intelligence and comparison experience**, not merely a CRUD interface over database tables.

---

# 3. Core scope

The Procurement area contains exactly these primary navigation destinations:

```text
Procurement
├── Contracts
├── Items
├── Suppliers
└── Price Quotes
```

There is **no separate Transactions sidebar page required in Phase 1**. Actual purchase transactions are reached through Item/Supplier details and drill-downs.

There is **no separate Procurement Dashboard sidebar destination required in Phase 1**. Overall statistics may be presented naturally on the Items/Procurement landing experience without adding navigation clutter.

---

# 4. Procurement permission model

## 4.1 One module permission

The old Contracts-only module permission is replaced/generalized by one Procurement permission:

```text
procurement_enabled
```

The existing concept:

```text
contracts_enabled
```

must no longer represent the final module boundary.

A user with:

```text
procurement_enabled = 1
```

has access to the full Procurement area:

- Contracts
- Items
- Suppliers
- Price Quotes
- read-only actual purchase transaction history
- Procurement statistics and price analysis

Do **not** introduce separate Phase-1 permissions such as:

```text
contracts_enabled
items_enabled
suppliers_enabled
quotes_enabled
```

Do **not** create a new application role such as `PROCUREMENT_USER`.

TaskHub application roles remain the existing:

```text
USER
ADMIN
```

Procurement is a separate module-access flag.

## 4.2 ADMIN does not imply Procurement access

TaskHub `ADMIN` remains an administrative role.

`ADMIN` may manage user access/permissions, but it does **not** automatically mean the administrator should receive Procurement business access unless the user's Procurement module permission is enabled.

Authorization must be enforced on the backend, not only by hiding navigation.

---

# 5. Shared vs private data — hard invariant

This is one of the most important rules in the module.

| Procurement domain | Visibility / ownership |
|---|---|
| **Contracts** | **PRIVATE per user** |
| **Price Quotes** | **PRIVATE per user** |
| **Items** | **SHARED globally among Procurement users** |
| **Suppliers** | **SHARED globally among Procurement users** |
| **Imported purchase transactions** | **SHARED / read-only among Procurement users** |

In compact form:

```text
Procurement
├── Contracts        → PRIVATE
├── Items            → SHARED
├── Suppliers        → SHARED
└── Price Quotes     → PRIVATE

Actual Transactions  → SHARED + READ ONLY
Saved Views          → PRIVATE per user configuration
```

## 5.1 Contracts remain private

Moving Suppliers into a shared master must **not weaken Contract privacy**.

Example:

```text
Shared Supplier #20
       │
       ├── User A Contract #1   → visible only to User A
       └── User B Contract #8   → visible only to User B
```

A user may see the shared Supplier, but may only see Contracts that belong to that authenticated user.

All Contract APIs must continue to enforce owner-scoped authorization server-side.

## 5.2 Price Quotes are private

Price Quotes are personal Procurement work.

Example:

```text
Shared Supplier #20
Shared Item #500

User A Quote = 95 SAR
User B Quote = 102 SAR
```

User A must not receive User B's quote through:

- list APIs
- item analytics
- supplier analytics
- search
- counts
- detail endpoints
- history
- exports added later

Price Quote queries must enforce:

```text
owner_user_id = authenticated Portal USER_ID
```

on the backend.

## 5.3 Items and Suppliers are intentionally shared

All Procurement-enabled users work with the same Item and Supplier master records.

When one authorized Procurement user edits a Supplier or Item, other Procurement users see that updated shared record.

`created_by_user_id` / `updated_by_user_id` are accountability fields, **not ownership controls**.

---

# 6. Existing TaskHub architecture must be preserved

Procurement must follow the existing TaskHub modular-monolith architecture.

Current preferred backend flow:

```text
route
→ authentication
→ access
→ validation
→ controller
→ service
→ policy/authorization where applicable
→ repository
```

Rules:

- No SQL in React/frontend code.
- No SQL in controllers.
- Repository owns SQL Server queries.
- Service owns use-case orchestration and analytics composition.
- Backend owns authorization and business rules.
- Schemas validate request/query input.
- Mappers may normalize database records into stable API contracts.
- Use parameterized SQL for values.
- Physical database-object names must never come from client input.
- Use TanStack Query for server state.
- Use React state for local UI state.
- Do not add Redux/Zustand unless a real requirement appears.
- Do not introduce microservices, Redis, queues, WebSockets, CQRS, GraphQL, event sourcing, or similar infrastructure for this module.

Procurement is part of the existing modular monolith.

---

# 7. Existing project patterns/components must be reused

Before creating any new abstraction, inspect the current implementation and reuse existing TaskHub building blocks.

Important existing shared components/patterns include, among others:

```text
client/src/components/shared/
├── ConfirmModal.tsx
├── EmptyState.tsx
├── ErrorState.tsx
├── LoadingState.tsx
├── PageHeader.tsx
├── SearchInput.tsx
├── SearchableMultiSelect.tsx
├── SortableHeader.tsx
├── TablePagination.tsx
├── TaskHubMotion.tsx
└── ...
```

The Procurement module must reuse the existing:

- `SortableHeader`
- `TablePagination`
- pagination hooks/state conventions
- `SearchInput`
- existing searchable select/multi-select patterns
- loading states
- empty states
- error states
- dialogs
- confirm dialogs
- buttons
- inputs
- tooltips
- semantic table styling
- page headers
- toast/error feedback conventions
- direction-aware behavior
- Motion conventions
- query/API patterns

Do **not** create:

```text
ProcurementSortableHeader
ProcurementPagination
ProcurementSearchInput
```

when the existing shared implementation is suitable.

---

# 8. Localization and visual consistency

Procurement must behave like the rest of TaskHub.

Required:

- Arabic-first localization.
- English localization.
- Full RTL in Arabic.
- LTR in English.
- Light theme.
- Dark theme.
- Existing semantic color tokens.
- Existing spacing/typography patterns.
- Existing icons/Lucide conventions.
- Existing responsive behavior.
- Existing accessible keyboard/focus behavior.
- Direction-aware icons and layout.
- Subtle Motion/reduced-motion behavior consistent with TaskHub.

New user-facing strings must be added to both Arabic and English translation resources.

Do not create hardcoded English-only UI.

---

# 9. Navigation design — approved

The existing Contracts navigation becomes part of the Procurement group.

Approved structure:

```text
Procurement / المشتريات
├── Contracts
├── Items
├── Suppliers
└── Price Quotes
```

Suppliers appear **once**.

Do not duplicate Suppliers under:

```text
Contracts → Suppliers
Items → Suppliers
```

The Supplier domain now has one shared home.

The Procurement group is shown only when the authenticated user has Procurement access.

---

# 10. Supplier architecture

## 10.1 Suppliers become a shared first-class domain

The existing Contract-only private Supplier concept is obsolete for the final Procurement architecture.

Current code that conceptually treats Suppliers as:

```text
contract-owned
owner_user_id-scoped
```

must be refactored so Contracts reference the shared Supplier master.

Supplier feature code should no longer conceptually live only under:

```text
features/contracts/
```

Recommended frontend organization:

```text
client/src/features/suppliers/
├── api/
├── components/
├── hooks/
└── types/
```

Recommended backend organization:

```text
server/src/modules/suppliers/
├── suppliers.controller.ts
├── suppliers.mapper.ts
├── suppliers.repository.ts
├── suppliers.routes.ts
├── suppliers.schemas.ts
├── suppliers.service.ts
└── suppliers.types.ts
```

Existing reusable Supplier editor/picker behavior should be moved/refactored rather than duplicated.

## 10.2 Supplier table physical name — production mapping

Production SQL Server table name:

```text
QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT
```

This is the approved production Supplier source table. The physical object name remains centralized in backend configuration so infrastructure changes stay isolated from UI/business logic.

## 10.3 Supplier source columns — actual known columns

The production Supplier source is `QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT`. Confirmed source columns:

```text
SUPPLIER_ID
SUPPLIER_CODE
MANUAL_FILE_NO
SUPPLIER_NAME
SUPPLIER_NAME_S
TAX_REGISTRATION_NO
COUNTRY_NAME
CITY_NAME
CURRENCY
CONTACT_JOB_TEL
EXTENSION_NO
MOBILE_NO
HOME_PHONE
EMAIL
```

These are not guessed column names.

## 10.4 Supplier identity fields

The important source identity fields are:

```text
SUPPLIER_ID
SUPPLIER_CODE
```

`SUPPLIER_ID` is the source relationship key used by imported purchase transactions.

`SUPPLIER_CODE` is the visible Supplier code.

Normal users must not be allowed to edit:

```text
SUPPLIER_ID
SUPPLIER_CODE
```

The UI may show Supplier Code as read-only.

The backend must also reject attempts to alter Supplier Code/identity; frontend read-only behavior alone is insufficient.

## 10.5 Supplier editing

Any user with Procurement access may edit the shared Supplier's normal business fields, except immutable identity/code fields.

Editable fields include source fields such as:

```text
MANUAL_FILE_NO
SUPPLIER_NAME
SUPPLIER_NAME_S
TAX_REGISTRATION_NO
COUNTRY_NAME
CITY_NAME
CURRENCY
CONTACT_JOB_TEL
EXTENSION_NO
MOBILE_NO
HOME_PHONE
EMAIL
```

where supported by the physical SQL schema.

All user changes must be audited.

## 10.6 Manually created Suppliers

Procurement users may create a Supplier directly in TaskHub.

A manually created Supplier:

- lives in the same shared Supplier master;
- is visible to all Procurement-enabled users;
- is editable under the same rules;
- must be clearly distinguishable from an imported CarWare/Oracle Supplier;
- receives a system-generated non-conflicting Supplier identity/code;
- has its creation logged with the authenticated user.

The manual Supplier code must use a **reserved manual namespace/range** so it cannot collide with normal imported Supplier codes.

Preferred human-readable form when the physical `SUPPLIER_CODE` SQL type supports text:

```text
USR-SUP-000001
USR-SUP-000002
...
```

If the final physical Supplier-code type is numeric, use a reserved non-source numeric range and display a clear **Manual / Created in TaskHub** badge. The manual-code generator must be centralized so this implementation detail can be changed without redesigning the module.

Do not let a user manually type the generated Supplier code.

---

# 11. Item architecture

## 11.1 Items are shared

Items are a shared global Procurement master.

All Procurement-enabled users see the same Items and may edit normal Item fields.

## 11.2 Item table physical name — production mapping

Production SQL Server table name:

```text
QNHDB.dbo.TM_INV_Items_Import
```

This is the approved production Item source table and remains centralized in backend configuration.

## 11.3 Item source columns — confirmed production columns

The production Item source is `QNHDB.dbo.TM_INV_Items_Import`. Its confirmed columns are:

```text
SOURCE_ROWID
ITEM_CODE
GEN
ITEM_CODE_2
CATEGORY_DESC
TYPE_DESC
SPECIFICATION_DESC
ITEM_NAME
ITEM_PARENT_NAME
CATEGORY_CODE
CATEGORY_NAME
ITEM_TYPE
SHORT_NAME
FOLLOWUP_TYPE
MODEL_NO
GTIN_NO
CATALOG_CODE
IS_NEED_EXAMINATION
MANUFACTURER_ID
MANUFACTURER_NAME
ACCESS_LEVEL_CODE
ACCESS_LEVEL_NAME
UNIT
ITEM_PIECE_UNIT
FACTOR
LOWEST_RECEIVING_PERIOD
LOWEST_RECEIVING_VALUE
BAR_CODE
MOH_DISCOUNT
STATUS
SUB_ITEM_TYPE
METHOD_CODE
METHOD_NAME
COSTING_METHOD
AVERAGE_COST
GENERAL_PRICE
IS_STOCK_ITEM
ITEM_STATUS
IS_CRITICAL
IS_EXPIRED
IS_ASSET
IS_HOME_MADE
IS_CHARGABLE
CURRENT_QTY
CURRENT_QTY_PKG
LAST_BATCH_NO
ITEM_NO
COMPANY_ID
CATEGORY_ID
ACCESS_LEVEL
UNIT_CODE
DOSE_UNIT
ITEM_PARENT_NO
BRNS_TYPE
```

TaskHub does not need to expose or use every physical source column. The approved shared Item CRUD/analytics fields remain the narrower set documented below. These names are confirmed, not guessed.

## 11.4 Item identity fields

Important identity fields:

```text
ITEM_NO
ITEM_CODE
```

`ITEM_NO` is the source relationship key used by actual purchase transactions.

`ITEM_CODE` is the visible Item code.

Normal users must not be able to edit:

```text
ITEM_NO
ITEM_CODE
```

The UI may display Item Code as read-only.

Backend validation must enforce this rule.

## 11.5 Item editing

Authorized Procurement users may edit normal shared Item fields:

```text
ITEM_NAME
ITEM_PARENT_NAME
CATEGORY_NAME
UNIT
ITEM_PIECE_UNIT
FACTOR
IS_STOCK_ITEM
ITEM_STATUS
IS_ASSET
```

All user changes must be audited.

## 11.6 Manually created Items

Procurement users may create new Items in TaskHub.

A manually created Item:

- lives in the shared Item master;
- is visible to all Procurement-enabled users;
- receives a generated non-conflicting Item identity/code;
- is clearly marked as **Manual / Created in TaskHub**;
- can be edited by Procurement users except its immutable generated Item Code/identity;
- has its creation logged.

Preferred visible manual code:

```text
USR-ITEM-000001
USR-ITEM-000002
...
```

The code generator must be centralized.

## 11.7 UOM conversion fields

The Item master includes:

```text
UNIT
ITEM_PIECE_UNIT
FACTOR
```

Example conceptual meaning:

```text
UNIT = Box
ITEM_PIECE_UNIT = PCS
FACTOR = 20
```

This may support future normalized unit comparisons.

**Phase 1 must not silently normalize prices between different UOMs unless an explicit, tested conversion rule is implemented.**

The presence of `FACTOR` does not automatically justify changing the raw actual-price statistic.

---

# 12. Imported purchase transactions

## 12.1 Transaction table physical name — production mapping

Production SQL Server table name:

```text
QNHDB.dbo.TM_Purchase_Invoice_Details_Import
```

This is the approved production Transaction source table. Its name remains centralized so infrastructure changes do not leak into analytics/UI code.

## 12.2 Transaction table is externally populated

TaskHub does **not** own creation/population of the three source tables:

```text
QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT
QNHDB.dbo.TM_INV_Items_Import
QNHDB.dbo.TM_Purchase_Invoice_Details_Import
```

The user will create/populate them directly in SQL Server using separate import stored procedures that obtain new data from CarWare/Oracle.

TaskHub must not generate migrations that create these three source tables unless the user later explicitly changes this decision.

## 12.3 Transactions are read-only in TaskHub

Actual purchase transactions are authoritative imported history.

Procurement users may:

```text
VIEW
SEARCH
FILTER
SORT
PAGE
ANALYZE
DRILL DOWN
```

They may **not**:

```text
CREATE actual transaction
EDIT actual transaction
DELETE actual transaction
CHANGE supplier
CHANGE item
CHANGE date
CHANGE price
```

There must be no normal TaskHub API endpoint that mutates imported transaction rows.

Manual prices belong in **Price Quotes**, not Transactions.

## 12.4 Actual transaction columns

The production transaction source is `QNHDB.dbo.TM_Purchase_Invoice_Details_Import`. Confirmed physical columns include:

```text
SOURCE_ROWID
INVOICE_NO
DELIVERY_NOTE_DATE
VENDOR_INVOICE_NO
VENDOR_INVOICE_DATE
SOURCE_NO
SOURCE_NAME_EN
SUPPLIER_CODE
SUPPLIER_NAME_EN
STATUS_CODE
STATUS_NAME_EN
INVOICE_STATUS
INVOICE_DUE_DATE
CURRENCY_CODE
INV_VOUCHER_NO
CONFIRM_DATE
ORDER_ID
BILL_NO
BILL_DATE
STORE_CODE
STORE_NAME_EN
RECEIVED_BY_NAME_EN
ITEM_NO
ITEM_CODE
ITEM_DESC
IS_LEAF
PARENT_ITEM_NO
PARENT_ITEM_CODE
PARENT_ITEM_NAME
ITEM_STATUS
UNIT_NAME_EN
QTY
BONUS_QTY
UNIT_PRICE
ITEM_DISCOUNT_PERCENT
DISCOUNT_PERCENT2
DISCOUNT_PERCENT3
UNIT_COST
LOT_NO
SELL_PRICE
EXPIRY_DATE
Net_Amount
SUPPLIER_ID
STATUS
INV_YEAR_CODE
INV_VOUCHER_CODE
CONFIRMED_BY
```

TaskHub does not need to expose or use every source field.

## 12.5 Primary fields TaskHub should use

### Identity / relationship

```text
SOURCE_ROWID

SUPPLIER_ID
SUPPLIER_CODE
SUPPLIER_NAME_EN

ITEM_NO
ITEM_CODE
ITEM_DESC
```

`SOURCE_ROWID` is the stable imported source-row identity used as the final deterministic ordering tie-break; it is not a price field and does not replace the business timeline date.

### Main analytics date

```text
DELIVERY_NOTE_DATE
```

### Price context

```text
UNIT_COST
CURRENCY_CODE
UNIT_NAME_EN
```

### Quantity/detail

```text
QTY
BONUS_QTY
```

### Document drill-down

```text
INVOICE_NO
VENDOR_INVOICE_NO
VENDOR_INVOICE_DATE
ORDER_ID
BILL_NO
BILL_DATE
```

### Optional transaction detail

```text
LOT_NO
EXPIRY_DATE
STATUS_CODE
STATUS_NAME_EN
INVOICE_STATUS
```

Other source columns may be ignored unless a later requirement needs them.

---

# 13. Hard pricing invariant — UNIT_COST only

This is a fixed Procurement business rule.

> **`UNIT_COST` is the one and only authoritative actual purchase price used by Procurement price analytics.**

All actual-purchase statistics use:

```text
UNIT_COST
```

This includes:

- latest actual price;
- previous actual price;
- lowest actual price;
- highest actual price;
- average actual price;
- supplier price comparison;
- price increase/decrease;
- item price history charts;
- supplier-item statistics;
- overall price-spread analytics.

Do **not** use these fields as the actual Procurement price:

```text
UNIT_PRICE
NET_AMOUNT
SELL_PRICE
ITEM_DISCOUNT_PERCENT
DISCOUNT_PERCENT2
DISCOUNT_PERCENT3
```

Do not recalculate effective price from `UNIT_PRICE` and discounts.

Do not derive actual price from `NET_AMOUNT / QTY`.

Do not use `SELL_PRICE`.

CarWare/Oracle already provides the effective actual purchase unit cost in:

```text
UNIT_COST
```

TaskHub trusts that value.

## 13.1 Numeric precision

Price and quote calculations must use exact decimal/numeric semantics.

Do not use approximate floating-point values for stored financial calculations.

---

# 14. Actual transaction date rule

The primary date used for price history/statistics is:

```text
DELIVERY_NOTE_DATE
```

Use it for:

- latest purchase;
- previous purchase;
- historical price order;
- 1M/3M/6M/1Y filters;
- last purchase date;
- price trend chronology.

Other dates such as:

```text
VENDOR_INVOICE_DATE
BILL_DATE
CONFIRM_DATE
```

may be displayed in transaction details but do not replace `DELIVERY_NOTE_DATE` as the default analytics timeline.

### 14.1 Production deterministic tie-break

The production Transaction table exposes `SOURCE_ROWID`. It is used as the final deterministic tie-break after the approved date/document ordering when multiple Item/Supplier Transactions otherwise tie. `SOURCE_ROWID` does not replace `DELIVERY_NOTE_DATE` as the business timeline date.

---

# 15. Transaction inclusion rule

The import stored procedure controls which source rows reach the SQL Server transaction table.

Phase-1 TaskHub analytics should therefore:

- use rows present in `QNHDB.dbo.TM_Purchase_Invoice_Details_Import`;
- require a usable `UNIT_COST`;
- require usable Item/Supplier relationships for grouped analytics;
- not invent additional undocumented Oracle status-code rules.

If future requirements define cancelled/invalid status exclusions, add them explicitly and test them.

Do not guess status mappings.

---

# 16. Startup synchronization

## 16.1 User requirement

Whenever a Procurement-enabled user opens/authenticates into TaskHub, TaskHub should request the three Procurement import stored procedures so the user gets the latest available Supplier, Item, and Transaction data.

Run them sequentially:

```text
1. Supplier import procedure
2. Item import procedure
3. Transaction import procedure
```

The order matters because transaction data references Items and Suppliers.

## 16.2 Stored procedure behavior is user-owned

The user will create the procedures.

The procedures are expected to be **insert-new-ID-only**:

```text
source ID does not exist in SQL Server
→ INSERT

source ID already exists
→ DO NOTHING
```

They must not overwrite existing Item/Supplier rows.

This behavior intentionally allows TaskHub users to edit imported shared Items/Suppliers without a future startup import silently overwriting those edits.

TaskHub does not implement Oracle synchronization logic.

## 16.3 Production startup stored procedures

Use these approved production procedures:

```text
QNHDB.dbo.SP_Import_APS_SUPPLIERS
QNHDB.dbo.SP_Import_INV_Items_All
QNHDB.dbo.SP_Import_Purchase_Invoices_All
```

These names are no longer placeholders. Keep them centralized in backend configuration so future infrastructure renames remain low-risk.

Never accept a stored-procedure name from frontend/client input.

## 16.4 Keep startup sync simple

Expected usage is only approximately 1–2 Procurement users.

Do **not** overengineer startup synchronization.

Do not add:

- SQL Agent as a TaskHub requirement;
- Redis;
- queue infrastructure;
- synchronization microservice;
- application-level distributed lock;
- `sp_getapplock` coordination;
- complex deduplication orchestration.

If two users happen to open TaskHub at almost the same time, both startup calls may execute the three procedures. The user's insert-new-only procedures/database constraints are responsible for data integrity.

## 16.5 Controlled startup-sync disable mode

TaskHub may explicitly disable startup synchronization through backend configuration while the import procedures are not deployed or while maintenance requires source sync to be paused.

When startup sync is disabled:

- `/api/procurement/sync` must return a successful `SKIPPED` result immediately instead of attempting missing procedures or returning `503`;
- the server must log that synchronization was skipped and why;
- the frontend must show one clear warning toast per application session;
- existing SQL Server Procurement data remains fully usable;
- skipped synchronization must **not** invalidate/refetch Items/Suppliers as though a real import completed.

The current backend switch is:

```text
PROCUREMENT_STARTUP_SYNC_ENABLED=false
```

Set it to `true` only after the three approved production import procedures are deployed and executable by the TaskHub SQL principal.

## 16.6 Startup failure behavior

Oracle/import failure must not make all of TaskHub unavailable.

If one startup Procurement sync fails:

- preserve existing SQL Server data;
- allow the application to continue;
- expose normal server logging/error feedback;
- show existing/latest available Procurement data;
- do not delete or reset existing data.

After a successful sync, invalidate/refetch affected Procurement queries.

---

# 17. Price Quotes

## 17.1 Purpose

Price Quotes are user-entered supplier/item prices used for comparison against actual historical purchase costs.

They are intentionally separate from imported purchase transactions.

A Quote is **not** an actual purchase.

## 17.2 Ownership

Price Quotes are **private per user**.

Every quote has:

```text
owner_user_id
```

and every backend query/mutation must scope it to the authenticated Portal `USER_ID`.

## 17.3 TaskHub-owned table

Recommended TaskHub-owned table:

```text
dbo.TM_price_quotes
```

This table may be created through a normal TaskHub migration.

Recommended logical fields:

```text
id
owner_user_id

supplier_id / supplier source relationship
item_id / item source relationship

quote_date
quoted_unit_cost
currency_code
unit_name

quote_number       nullable
notes              nullable

is_active

created_at_utc
created_by_user_id
updated_at_utc
updated_by_user_id

row_version
```

Use actual physical foreign-key/reference strategy that matches the final shared Supplier/Item schema.

## 17.4 Quote entry UX

User chooses:

```text
Supplier
Item
Quote Date
Quoted Price
Currency
UOM
```

Optional:

```text
Quote / Reference No.
Notes
```

Supplier and Item must use shared searchable pickers.

The user should not manually type Supplier/Item identity keys.

## 17.5 Quote lifecycle

The owner may:

```text
CREATE
VIEW
EDIT
DEACTIVATE
REACTIVATE if implemented consistently
```

Do not hard-delete quote history through ordinary UI.

Changes must be auditable.

## 17.6 Quotes and actual purchases must remain visually distinct

Do not merge Quote values into actual purchase statistics without labeling.

Examples:

Correct:

```text
Lowest Actual Purchase
100 SAR
Supplier A

Lowest My Quote
90 SAR
Supplier D
```

Incorrect:

```text
Cheapest Price = 90 SAR
```

when 90 SAR was only a quote.

Charts/tables must clearly distinguish:

```text
Actual Purchase
My Price Quote
```

---


## 17.7 Price Quotes are a historical time series — hard invariant

A Price Quote is **not** one permanent price for one Item + Supplier combination.

The same authenticated user may create any number of Quotes for the same Item and Supplier across time, including multiple Quotes on the same calendar date.

Conceptually:

```text
User A
  │
  └── Item 100 + Supplier 20
         ├── Quote #1 — 01-Jan-2026 — 18.00
         ├── Quote #2 — 10-Mar-2026 — 17.50
         ├── Quote #3 — 15-Jun-2026 — 19.00
         └── Quote #4 — 03-Sep-2026 — 16.80
```

Therefore:

- Do **not** add a uniqueness rule on `owner_user_id + item_id + supplier_id`.
- Do **not** overwrite an older Quote merely because a newer Quote exists for the same Item/Supplier.
- Each Quote row has its own persistent identity.
- Historical Quotes remain available for trend/history analysis.
- Deactivation is a lifecycle state, not a replacement for historical storage.
- The user may have multiple Quote rows with the same `quote_date`.
- `quote_date` alone is not a unique key and is not a sufficient deterministic tie-break.

### 17.7.1 Latest / previous Quote

For Quote analytics, partition conceptually by:

```text
owner_user_id
+
item_id
+
supplier_id
```

and order by:

```text
quote_date DESC
+
stable Quote identity/timestamp DESC
```

Conceptually:

```sql
ROW_NUMBER() OVER (
    PARTITION BY owner_user_id, item_id, supplier_id
    ORDER BY quote_date DESC, id DESC
)
```

Then:

```text
row 1 = latest Quote
row 2 = previous Quote
```

The exact SQL may follow repository conventions, but the behavior is fixed.

### 17.7.2 Quote statistics

For one authenticated user + one Item + one Supplier, the application may calculate:

```text
latest Quote
previous Quote
lowest Quote
highest Quote
average Quote
Quote count
latest Quote date
Quote price trend
```

These values are calculated from **that user's private Quote history only**.

Never include another user's Quote rows.

### 17.7.3 Quote and actual histories remain separate

For one Item + Supplier pair:

```text
                  ITEM + SUPPLIER
                        │
              ┌─────────┴─────────┐
              │                   │
        Actual Purchases       My Quotes
             SHARED             PRIVATE
              │                   │
        many dated rows       many dated rows
              │                   │
       latest / previous     latest / previous
       lowest / highest      lowest / highest
       average / trend       average / trend
              │                   │
              └─────────┬─────────┘
                        │
                  Comparison UI
```

Do not mix Quote rows into actual-purchase calculations.

Do not mix actual transaction rows into Quote-only statistics.

A combined chart is allowed only when the two series are visually and semantically distinguished:

```text
Actual Purchase
My Price Quote
```

---

# 18. Currency and UOM comparison rules

`UNIT_COST` is the only actual price numeric field.

However valid comparison also requires context:

```text
CURRENCY_CODE
UNIT_NAME_EN
```

Do not present two prices as directly comparable if they represent different currencies or incompatible UOMs unless an explicit conversion rule exists.

Example:

```text
50 SAR / BOX
8 SAR / EACH
```

must not automatically conclude that 8 is cheaper.

Similarly:

```text
100 USD
390 SAR
```

must not be treated as directly comparable unless currency conversion is deliberately implemented.

Phase 1 should prefer filtering/grouping by compatible UOM/currency rather than inventing conversion.

Item `FACTOR` may support a later UOM-normalization feature, but that is not automatically enabled.

---

# 19. Audit/activity logging

## 19.1 Required audited entities

At minimum, record user changes for:

```text
SUPPLIER
ITEM
PRICE_QUOTE
```

Supplier and Item change logs are mandatory.

Price Quote history is also required because Quotes may be edited/deactivated.

## 19.2 Recommended TaskHub-owned activity table

A centralized Procurement activity table is preferred:

```text
dbo.TM_procurement_activity
```

Conceptual fields:

```text
id
entity_type
entity_key
owner_user_id          nullable/shared-aware
action_type
actor_user_id
changed_at_utc
before_values
after_values
```

Example entity types:

```text
SUPPLIER
ITEM
PRICE_QUOTE
```

Example actions:

```text
CREATED
UPDATED
DEACTIVATED
REACTIVATED
```

Use immutable history rows.

For private Price Quote history, authorization must still enforce the Quote owner.

## 19.3 Audit presentation

A user-friendly Activity tab should show meaningful field changes, for example:

```text
Supplier Name
From: ABC Medical
To: ABC Medical Company

Email
From: —
To: sales@example.com
```

Do not expose raw storage paths, tokens, secrets, or unnecessary internal values.

---

# 20. Existing Contracts migration/refactor

This is a significant architecture transition.

Current TaskHub Contracts were designed around private `TM_contract_suppliers` records.

The final Procurement architecture instead requires one shared Supplier master.

Implementation must therefore:

1. Preserve existing Contract privacy.
2. Refactor Contracts to reference the shared Supplier record.
3. Remove owner-scoping from Supplier reads/writes.
4. Keep owner-scoping on Contracts.
5. Move reusable Supplier API/UI logic into the shared Supplier feature/domain.
6. Preserve existing operational Contract data during migration.
7. Do not silently drop legacy Supplier information that has no direct mapping to the new source structure.
8. Preserve existing access when replacing `contracts_enabled` with `procurement_enabled`.

If existing production data creates an ambiguous migration mapping, inspect the actual data before choosing a destructive transformation.

Do not silently delete legacy supplier information.

---

# 21. Procurement permission migration

The current repository contains `contracts_enabled`.

The Procurement implementation should migrate toward:

```text
procurement_enabled
```

Existing Contracts users should not suddenly lose access.

The migration must preserve existing access state, conceptually:

```text
procurement_enabled = previous contracts_enabled
```

then update backend/frontend access contracts and guards to the Procurement concept.

Use the next migration number available in the repository at implementation time.

The current supplied repository snapshot contains migrations through `026`, so `027` is expected if no newer migration has been added before implementation.

Do not execute the migration against the user's database unless the user separately and explicitly approves execution.

---

# 22. Frontend organization

Follow existing TaskHub feature organization.

Recommended direction:

```text
client/src/features/procurement/
    shared Procurement-level helpers only when genuinely cross-feature

client/src/features/items/
├── api/
├── components/
├── hooks/
└── types/

client/src/features/suppliers/
├── api/
├── components/
├── hooks/
└── types/

client/src/features/price-quotes/
├── api/
├── components/
├── hooks/
└── types/

client/src/features/procurement-saved-views/
├── api/
├── components/
├── hooks/
└── types/
```

Route-level pages:

```text
client/src/pages/items/
client/src/pages/suppliers/
client/src/pages/price-quotes/
```

Contracts remain in their existing Contracts feature/page organization but use shared Suppliers.

Do not create one giant page containing all:

- API calls;
- forms;
- charts;
- filters;
- tables;
- calculations;
- dialogs.

Keep pages as route-level composition and feature behavior inside feature components/hooks.

---

# 23. Backend organization

Recommended modules:

```text
server/src/modules/items/
server/src/modules/suppliers/
server/src/modules/price-quotes/
```

A small Procurement-level module may exist only for cross-domain behavior such as startup sync:

```text
server/src/modules/procurement/
```

Example:

```text
procurement-sync.service.ts
procurement.routes.ts
procurement.controller.ts
procurement.config.ts
```

Do not move unrelated Contracts logic unnecessarily.

---

# 24. Centralize physical SQL object names

The approved production source-object names are:

```text
QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT
QNHDB.dbo.TM_INV_Items_Import
QNHDB.dbo.TM_Purchase_Invoice_Details_Import

QNHDB.dbo.SP_Import_APS_SUPPLIERS
QNHDB.dbo.SP_Import_INV_Items_All
QNHDB.dbo.SP_Import_Purchase_Invoices_All
```

Keep them centralized in the backend, conceptually:

```text
PROCUREMENT_DB_OBJECTS
```

The exact mechanism can follow the repository's configuration style.

Changing one of these six physical names later must not require rewriting:

- React components;
- API response contracts;
- statistics logic;
- UI pages;
- charts;
- hooks.

Database-column mappings live in repositories/mappers.

---

# 25. Stable application/API field naming

Physical SQL column names may be mapped into stable TypeScript/API names.

Example:

```text
SUPPLIER_ID       → supplierId
SUPPLIER_CODE     → supplierCode
SUPPLIER_NAME     → supplierName

ITEM_NO           → itemId
ITEM_CODE         → itemCode
ITEM_NAME         → itemName

DELIVERY_NOTE_DATE → transactionDate
UNIT_COST          → unitCost
UNIT_NAME_EN       → unit
CURRENCY_CODE      → currencyCode
```

The frontend should consume stable domain contracts and should not know the physical table naming strategy.

---

# 26. Items landing/list UX

The Items experience is a primary Procurement entry point.

The top of the page should quickly summarize useful purchasing information without overwhelming the user.

Potential summary cards:

```text
Total Items
Purchased Items
Suppliers
My Active Price Quotes
```

Cards should be useful, clickable/drillable where appropriate, and visually consistent with TaskHub.

## 26.1 Item search/filtering

Primary visible controls:

```text
Search item code/name
Category
Supplier
Status
```

Additional filters may live under:

```text
More Filters
```

Possible advanced filters:

```text
Source / Manual vs imported
UOM
Currency
Purchase date range
```

Do not permanently expose a large wall of filters.

## 26.2 Items table

The table should prioritize purchasing decisions.

Example columns:

```text
Item Code
Item Name
Category
Latest Actual Unit Cost
Lowest Actual Unit Cost
Highest Actual Unit Cost
Suppliers
Last Purchase
```

Additional values can be shown when useful without making the table unreadable.

Use the existing shared:

```text
SortableHeader
TablePagination
```

Server-side pagination/sorting/search is preferred for large datasets.

Clicking the logical row should open Item Details where accessible.

---


## 26.3 Do not build one giant Item × Supplier matrix

The default Items experience must **not** attempt to show all Items, every Supplier, and every price statistic in one extremely wide table.

Avoid a default structure such as:

```text
Item
| Supplier A latest/low/high
| Supplier B latest/low/high
| Supplier C latest/low/high
| ...
```

This does not scale when there are many Items and Suppliers and becomes difficult to scan, sort, filter, and use on normal screens.

The approved information hierarchy is:

```text
Items list
   ↓
simple Item-level overview
   ↓
open Item
   ↓
Supplier Comparison
   ↓
Price History
   ↓
exact Transaction / Quote records
```

The main Items table should remain an **Item-level summary**, for example:

```text
Item Code
Item Name
Category
Latest Actual Price
Lowest Actual Price
Highest Actual Price
Latest Change
Supplier Count
Last Purchase
```

Supplier-level detail belongs inside Item Details or an explicitly focused comparison view.

## 26.4 Focused Supplier comparison matrix

A suppliers-as-columns comparison matrix is acceptable only as an **explicit focused comparison mode** where the user deliberately chooses a small number of Suppliers for one Item or a Saved View.

Recommended behavior:

```text
2–5 selected Suppliers
→ allow focused side-by-side matrix

more than 5 selected Suppliers
→ use vertical Item + Supplier summary rows instead
```

Example focused matrix:

| Metric | Supplier A | Supplier B | Supplier C |
|---|---:|---:|---:|
| Latest Actual | 17.80 | 18.60 | 17.20 |
| Previous Actual | 18.50 | 18.20 | 17.40 |
| Lowest Actual | 16.90 | 17.50 | 16.50 |
| Highest Actual | 20.10 | 21.00 | 19.20 |
| Average Actual | 18.34 | 19.05 | 17.63 |
| Transactions | 24 | 18 | 13 |
| Last Purchase | 03 Sep | 28 Aug | 22 Aug |

The matrix summarizes each Supplier's **full matching transaction history**. It does not imply one Item + Supplier has only one database row.

## 26.5 Saved Views — approved feature

Procurement must support **private user Saved Views** so a user can define a recurring working set of specific Items and specific Suppliers, save it, and reopen it at any time.

Saved Views are intended to solve the usability problem of very large Item/Supplier datasets without forcing the user to rebuild the same filters repeatedly.

Example:

```text
My Saved Views

• ICU Consumables — Main Suppliers
• Main Pharmacy Review
• Office Furniture
• Surgical Items — Selected Suppliers
• Monthly Price Check
```

Saved Views live inside the **Items** experience. Do **not** add another Procurement sidebar destination solely for Saved Views.

### 26.5.1 Saved Views are private

Saved Views are private per user:

```text
User A
├── ICU Consumables
├── Main Pharmacy
└── Monthly Price Review

User B
├── Office Supplies
└── Surgical Suppliers
```

A user must never receive another user's Saved View definition through list/search/detail APIs.

Every Saved View query/mutation must enforce:

```text
owner_user_id = authenticated Portal USER_ID
```

### 26.5.2 What a Saved View stores

A Saved View stores the **definition of the working view**, not calculated price results.

It may remember:

```text
View Name

Selected Items
Selected Suppliers

Optional:
Category
Status
Source / Manual vs imported
History period / date filter
Currency
UOM

Sort column
Sort direction

Visible columns / metrics
Preferred presentation mode where applicable
```

The Saved View must **not persist** values such as:

```text
latest price
previous price
lowest price
highest price
average price
current cheapest Supplier
```

Those values are always recalculated from current data when the view opens.

### 26.5.3 Saved View data flow

```text
Saved View definition
        │
        ├── selected Items
        ├── selected Suppliers
        ├── period / filters
        ├── sorting
        └── display preferences
                 │
                 ▼
Current shared actual Transactions
+
Current authenticated user's private Quotes
                 │
                 ▼
Recalculate statistics
                 │
                 ▼
Display current results
```

Therefore, if a new Oracle/CarWare transaction is imported tomorrow, the Saved View automatically reflects it the next time it is loaded/refetched.

### 26.5.4 TaskHub-owned Saved Views table

Recommended TaskHub-owned table:

```text
dbo.TM_procurement_saved_views
```

Recommended logical fields:

```text
id
owner_user_id
view_name
view_config_json
is_default
created_at_utc
updated_at_utc
row_version
```

`view_config_json` is appropriate because this is user-interface/filter configuration rather than core transactional purchasing data.

Conceptual example:

```json
{
  "itemIds": [101, 102, 103],
  "supplierIds": [20, 25, 31],
  "period": "12M",
  "sortBy": "latestActualPrice",
  "sortDirection": "asc",
  "columns": [
    "latestActualPrice",
    "previousActualPrice",
    "lowestActualPrice",
    "highestActualPrice",
    "latestQuote",
    "priceChangePercent"
  ]
}
```

Do not store calculated prices inside `view_config_json`.

### 26.5.5 Saved View lifecycle

The owner may:

```text
CREATE
VIEW
EDIT
RENAME
DUPLICATE
DELETE
SET AS DEFAULT
```

Deleting a Saved View deletes only the user's saved configuration.

It must never delete or alter:

```text
Items
Suppliers
Actual Transactions
Price Quotes
```

### 26.5.6 Default Saved View

A user may optionally set one Saved View as their default Items view.

When present:

```text
Open Items
→ load user's default Saved View
```

The user must always be able to return to:

```text
All Items
```

### 26.5.7 Saved View summary rows

When a Saved View contains multiple Items and Suppliers, a scalable comparison representation is one summarized row per:

```text
Item + Supplier
```

Example:

| Item | Supplier | Latest Actual | Latest My Quote | Quote vs Actual | Actual Txns | My Quotes |
|---|---|---:|---:|---:|---:|---:|
| Gloves | Supplier A | 17.80 | 16.80 | -5.6% | 24 | 4 |
| Gloves | Supplier B | 18.60 | 18.00 | -3.2% | 18 | 2 |
| Syringe | Supplier A | 0.48 | 0.45 | -6.3% | 35 | 5 |

Each row is an **analytics summary over all matching historical rows**.

It is **not** one physical Transaction and is **not** one Quote.

### 26.5.8 Saved View drill-down

Clicking an Item + Supplier summary must allow the user to inspect:

```text
Actual Purchase History
My Quote History
```

including repeated records over time.

A suitable detail view may show:

```text
Latest Actual
Previous Actual
Lowest Actual
Highest Actual
Average Actual
Actual Transaction Count

Latest My Quote
Previous My Quote
Lowest My Quote
Highest My Quote
Average My Quote
My Quote Count
```

followed by the two histories and/or a clearly differentiated combined timeline.

### 26.5.9 Saved View summary statistics

Cards/statistics on an active Saved View must recalculate using only the selected Items/Suppliers and active filters.

Useful examples:

```text
Items in View
Suppliers in View
Items With Price Increase
Items With Price Decrease
Items At New Historical High
My Quotes Below Latest Actual
```

Useful derived sections may include:

```text
Biggest increases in this View
Biggest decreases in this View
Largest current Supplier price spreads
Current cheapest Supplier distribution
```

These are dynamic results, never persisted into the Saved View definition.

---

# 27. Item Details UX

Item Details is one of the highest-value screens.

Suggested top identity block:

```text
Item Name
Item Code
Category
Unit
Piece Unit
Factor
Stock/Non-stock
Asset
Status
Manual/Imported source indicator
```

Suggested high-value cards:

```text
Latest Actual Price
Previous Actual Price
Change %
Lowest Historical Price
Highest Historical Price
Average Actual Price
Number of Suppliers
My Lowest Active Quote
```

Do not use unnecessary colors. Use semantic emphasis.

## 27.1 Recommended Item Details tabs/sections

```text
Overview
Supplier Comparison
Price History
My Price Quotes
Activity
```

Actual transactions can be included under Price History / Overview drill-down rather than adding excessive tabs if that is clearer.

---

# 28. Item statistics definitions

Unless the user explicitly changes the formula, use these clear definitions.

## 28.1 Latest actual price

Latest eligible transaction for the Item ordered by:

```text
DELIVERY_NOTE_DATE DESC
```

with a deterministic tie-break using stable transaction/document fields.

Displayed price:

```text
UNIT_COST
```

Also display the Supplier.

## 28.2 Previous actual price

Transaction immediately preceding the latest eligible Item transaction in the same chronological definition.

This is the basis for:

```text
price change amount
price change %
```

## 28.3 Price change amount

```text
latest UNIT_COST - previous UNIT_COST
```

## 28.4 Price change percentage

When previous price is non-zero:

```text
(latest - previous) / previous * 100
```

Handle zero/missing previous values safely.

## 28.5 Lowest historical actual price

```text
MIN(UNIT_COST)
```

for compatible currency/UOM scope.

Also show the Supplier/date that produced it.

## 28.6 Highest historical actual price

```text
MAX(UNIT_COST)
```

for compatible currency/UOM scope.

Also show Supplier/date.

## 28.7 Average actual price

Primary Phase-1 meaning:

```text
AVG(UNIT_COST)
```

over the filtered eligible transaction rows.

Do not silently present a quantity-weighted average under the label "Average Price".

A weighted average may be introduced later only with an explicit label and requirement.

## 28.8 Number of suppliers

Distinct suppliers with eligible transactions for the Item.

## 28.9 Last purchase date

Maximum:

```text
DELIVERY_NOTE_DATE
```

---

# 29. Item × Supplier statistics

For one Item and one Supplier, support:

```text
latest UNIT_COST
previous UNIT_COST
lowest UNIT_COST
highest UNIT_COST
average UNIT_COST
number of transactions
last purchase date
price trend
```

All price statistics use `UNIT_COST`.

---


## 29.1 Item + Supplier is a time series — hard invariant

The same Item + Supplier combination may occur in any number of actual purchase Transactions across different dates.

It may also occur multiple times on the **same calendar date**.

Example:

```text
Gloves + Supplier A

01-Jan-2026   UNIT_COST 18.20
15-Feb-2026   UNIT_COST 17.90
03-Mar-2026   UNIT_COST 19.10
22-May-2026   UNIT_COST 18.50
03-Sep-2026   UNIT_COST 17.80
03-Sep-2026   UNIT_COST 17.60
```

Therefore:

- Do not model actual history as one row per Item + Supplier.
- Do not overwrite an older Transaction when a newer Transaction exists.
- Do not group away repeated Transactions merely because Item, Supplier, or date matches.
- Every imported Transaction remains a distinct historical record.
- Summary rows are calculated projections over many Transactions, not physical source rows.

## 29.2 Latest / previous actual Transaction per Item + Supplier

For Item/Supplier-specific analytics, partition conceptually by:

```text
ITEM_NO
+
SUPPLIER_ID
```

ordered primarily by:

```text
DELIVERY_NOTE_DATE DESC
```

and then by a deterministic stable secondary ordering derived from available source document/transaction identifiers.

Conceptually:

```sql
ROW_NUMBER() OVER (
    PARTITION BY ITEM_NO, SUPPLIER_ID
    ORDER BY DELIVERY_NOTE_DATE DESC, <stable tie-break> DESC
)
```

Then:

```text
row 1 = latest actual Transaction
row 2 = previous actual Transaction
```

Because multiple Transactions may occur on the same date, **date alone must never be treated as a unique chronological identity**.

The repository must define a deterministic tie-break from reliable available source identifiers such as the appropriate invoice/order/document identity supported by the actual imported data.

Do not invent or persist a fake transaction sequence merely to hide ambiguous ordering.

## 29.3 Item overall vs Item + Supplier statistics

Keep these scopes distinct:

```text
Item overall statistics
→ all eligible Transactions for the Item across Suppliers

Item + Supplier statistics
→ only eligible Transactions for that Item and that Supplier
```

Example:

```text
Item Overall Latest
= latest eligible Transaction for Item 100 across every Supplier

Supplier A Latest for Item
= latest eligible Transaction where Item 100 + Supplier A
```

UI labels must make the scope clear.

## 29.4 Actual and Quote histories for one Item + Supplier

For an authenticated user, one Item + Supplier detail may combine two **separate** time series:

```text
Shared Actual Purchase History
+
My Private Quote History
```

A useful summary table may look like:

| Metric | Actual Purchases | My Quotes |
|---|---:|---:|
| Latest | 17.80 | 16.80 |
| Previous | 18.50 | 19.00 |
| Lowest | 16.90 | 16.80 |
| Highest | 20.10 | 19.00 |
| Average | 18.34 | 17.83 |
| Records | 24 Transactions | 4 Quotes |

The two histories may be shown together for comparison, but their calculations remain independent.

---

# 30. Current supplier comparison for an Item

A very important view is:

> For this Item, what is each Supplier's most recent actual cost?

For each Supplier:

1. find that Supplier's latest eligible transaction for the Item;
2. take its `UNIT_COST`;
3. compare Supplier latest prices only within compatible UOM/currency;
4. sort/highlight useful differences.

Example table:

| Supplier | Latest Actual | Lowest Historical | Highest Historical | Average | Purchases | My Latest Quote |
|---|---:|---:|---:|---:|---:|---:|

Useful labels:

```text
Lowest Current Supplier Price
Highest Current Supplier Price
```

Avoid vague wording such as:

```text
Best Supplier
Worst Supplier
```

Price alone does not measure quality, delivery, availability, or commercial terms.

---

# 31. Supplier list UX

Suppliers have one shared page.

Primary search/filter:

```text
Supplier Code / Name
Country
City
Currency
Manual vs imported
```

Example useful table columns:

```text
Supplier Code
Supplier Name
Country / City
Currency
Items Supplied
Last Purchase
Source
```

Use:

```text
SortableHeader
TablePagination
```

and existing TaskHub table patterns.

Procurement users may open Supplier Details and edit shared Supplier information.

---

# 32. Supplier Details UX

Supplier Details should answer:

> What do we buy from this Supplier, and how competitive are its prices?

Suggested sections/tabs:

```text
Overview
Items & Prices
My Contracts
Activity
```

`My Contracts` must remain owner-scoped.

Do not expose other users' Contracts.

Suggested summary information:

```text
Items Purchased
Transaction Count
Last Purchase
My Active Quotes
Items Where Currently Cheapest
Items Where Currently Highest
```

Only show statistics that can be calculated correctly under compatible UOM/currency rules.

---

# 33. Supplier × Item comparison

For each Item supplied by the current Supplier, useful columns include:

```text
Item
Supplier Latest Unit Cost
Supplier Lowest Unit Cost
Supplier Highest Unit Cost
Supplier Average Unit Cost
Overall Current Lowest Supplier Price
Difference vs Current Lowest
Last Purchase
```

This allows the user to see immediately where the Supplier is competitive.

---

# 34. Supplier competitiveness statistics

Useful statistics include:

```text
Items where this Supplier is currently cheapest
Items where this Supplier is currently highest
Items where this Supplier is within a small % of current cheapest
Average difference from current lowest supplier
```

"Currently cheapest" should mean:

- compare the latest actual `UNIT_COST` per Supplier for the Item;
- within compatible currency/UOM;
- current Supplier has the minimum among those latest Supplier values.

This is different from "historically supplied the absolute lowest transaction ever".

Use precise labels.

---

# 35. Price history UX

Price History should make trends understandable without forcing users to inspect raw transaction tables first.

Suggested time controls:

```text
1M
3M
6M
1Y
All
```

Supplier filtering should allow comparing one or multiple suppliers where the chart remains readable.

Actual transaction markers must use `UNIT_COST`.

If the user's private Price Quotes are plotted on the same chart, visually distinguish:

```text
Actual Purchase
My Price Quote
```

Do not imply a Quote is an actual purchase.

## 35.1 Chart implementation

Reuse an existing project chart component/library if one exists at implementation time.

Do not add a heavy new charting dependency automatically.

If no chart library exists, a focused lightweight SVG/chart implementation is acceptable when it stays maintainable and accessible.

---

# 36. Actual transaction drill-down

Under/alongside price history, provide a sortable/paginated transaction table.

Useful columns:

```text
Delivery Date
Supplier
UNIT_COST
Currency
UOM
QTY
Invoice No.
Vendor Invoice No.
Order ID
Lot No. / Expiry where relevant
```

The table is read-only.

Use existing `SortableHeader` and `TablePagination`.

---

# 37. Price Quotes list UX

The Price Quotes sidebar destination represents:

```text
My Price Quotes
```

because Quotes are private.

Suggested visible table columns:

```text
Quote Date
Item
Supplier
Quoted Unit Cost
Currency
UOM
Latest Actual Unit Cost
Difference Amount
Difference %
Status
```

Only compare Quote vs actual when currency/UOM are compatible.

Provide:

```text
New Price Quote
Edit
Deactivate
History
```

Do not hard-delete quote history.

Use existing shared sorting/pagination/search components.

The Price Quotes page lists individual Quote records, not one collapsed row per Item + Supplier.

Repeated Quotes for the same Item/Supplier remain separately visible and sortable by date/history.

Where a summarized Item + Supplier comparison is needed, calculate it as an analytics view and allow drill-down to the individual Quote records.

---

# 38. Quote vs actual comparison

When compatible:

```text
difference amount = quoted price - latest actual UNIT_COST
```

and:

```text
difference % = (quote - latest actual) / latest actual * 100
```

Display direction clearly:

```text
Quote is 12.5% below latest purchase
Quote is 7.2% above latest purchase
```

Do not call it "saving" unless the context makes clear it is a potential/quoted difference, not realized savings.

---

# 39. Overall Procurement analytics

The module should provide clear high-level analytics where useful, without adding a cluttered standalone dashboard unless later requested.

Useful views/cards/lists may include:

```text
Largest recent price increases
Largest recent price decreases
Items with largest current supplier price spread
Items with only one historical supplier
Items with multiple suppliers
Recently purchased items
Items with no recent purchase
My quotes below latest actual purchase price
Recent manual Items/Suppliers
```

These should drill into the underlying Item/Supplier/Transaction/Quote data.

---

# 40. Largest recent increase/decrease definition

For an Item:

```text
latest actual transaction UNIT_COST
vs
previous actual transaction UNIT_COST
```

ordered by `DELIVERY_NOTE_DATE`.

This is a purchase-to-purchase comparison and may reflect a supplier change.

Where the UI needs a within-supplier trend, calculate it separately for that Supplier and label it accordingly.

---

# 41. Supplier price spread

For an Item's current Supplier comparison:

```text
current lowest = MIN(latest UNIT_COST per supplier)
current highest = MAX(latest UNIT_COST per supplier)

spread amount = current highest - current lowest
```

When current lowest is non-zero:

```text
spread % = spread amount / current lowest * 100
```

Only compare compatible currency/UOM values.

---

# 42. Search, sorting, pagination, and filters

This is a hard consistency rule.

All large Procurement tables should follow existing TaskHub behavior.

Reuse:

```text
SortableHeader
TablePagination
SearchInput
SearchableMultiSelect where appropriate
existing pagination hooks
existing sort-state hooks/patterns
```

Sorting must be server-supported where the result set is server-paginated.

Do not fetch all large transaction history into the browser only to sort/paginate locally.

Common filter behavior should be consistent across pages.

Active filters should be obvious.

---

# 43. Drill-down behavior

Summary statistics should not be dead numbers.

Examples:

```text
Latest Price card
→ latest transaction detail

Lowest Price card
→ transaction that produced the minimum

Suppliers count
→ Supplier Comparison

Transactions count
→ filtered transaction history

Items Where Supplier Is Cheapest
→ filtered Supplier Items table
```

Prefer making the whole logical card/row interactive when accessibility/usability supports it rather than tiny click targets.

---

# 44. UI hierarchy principle

Procurement screens should generally follow this hierarchy:

```text
1. What is happening?
   → summary / key cards

2. Who is cheaper or more expensive?
   → comparison

3. How has the price changed?
   → trend

4. What exact records produced this?
   → transaction table
```

Do not force users to reverse-engineer business meaning from a giant raw transaction table.

---

# 45. UX language precision

Use precise terms:

Preferred:

```text
Latest Actual Purchase
Lowest Historical Purchase
Highest Historical Purchase
Lowest Current Supplier Price
Highest Current Supplier Price
My Lowest Quote
My Latest Quote
```

Avoid:

```text
Best Supplier
Worst Supplier
Market Price
Saving
```

unless the underlying data truly supports the term.

---

# 46. Empty and incomplete data behavior

Handle these cases gracefully:

- Item has no transactions.
- Item has one transaction only.
- Item has one supplier only.
- Supplier has no transactions.
- No previous price exists.
- Price is zero.
- Currency/UOM differs.
- Quote has no comparable actual purchase.
- User has no Price Quotes.
- Imported source row is missing optional display fields.

Use existing `EmptyState`/`ErrorState` patterns.

Do not display misleading `0%` when comparison is actually unavailable.

Use `—`, localized "Not available", or a clear empty state when appropriate.

---

# 47. Data integrity and security

## 47.1 Procurement access

Every Procurement route/API requires active TaskHub authentication and Procurement module access.

## 47.2 Shared masters

Items/Suppliers are shared only among authorized Procurement users.

Do not expose them to users without Procurement access through search or indirect endpoints.

## 47.3 Private resources

Contracts and Price Quotes enforce authenticated ownership server-side.

## 47.4 Transactions

Transactions are read-only and require Procurement access.

## 47.5 Input

Use validated request/query input and parameterized SQL values.

## 47.6 Secrets

Never log:

- Portal tokens;
- secrets;
- passwords;
- SMTP credentials;
- sensitive attachment contents.

---

# 48. Source-table modification policy

The user owns creation/import population of:

```text
QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT
QNHDB.dbo.TM_INV_Items_Import
QNHDB.dbo.TM_Purchase_Invoice_Details_Import
```

TaskHub may read Suppliers/Items and perform approved user edits/manual inserts on the shared master tables.

TaskHub must not alter imported Transactions through ordinary application operations.

Do not create unrelated source-table migration logic unless explicitly requested.

---

# 49. Concurrency and simplicity

This module is expected to be used by only approximately 1–2 users.

Do not overengineer shared Item/Supplier editing.

Phase 1 may use straightforward updates plus required audit logging.

If the physical Item/Supplier tables already contain a concurrency/version field, use it consistently.

Do not require adding a distributed locking system solely for this module.

TaskHub-owned Price Quotes should follow the project's existing optimistic-concurrency style where practical (for example `ROWVERSION`).

---

# 50. API direction

Exact routes should match existing TaskHub conventions, but conceptually the API must support:

## Items

```text
GET    /api/items
GET    /api/items/:id
POST   /api/items
PATCH  /api/items/:id
GET    /api/items/:id/transactions
GET    /api/items/:id/suppliers
GET    /api/items/:id/analytics
GET    /api/items/:id/activity
```

## Suppliers

```text
GET    /api/suppliers
GET    /api/suppliers/:id
POST   /api/suppliers
PATCH  /api/suppliers/:id
GET    /api/suppliers/:id/items
GET    /api/suppliers/:id/analytics
GET    /api/suppliers/:id/activity
```

## Price Quotes

```text
GET    /api/price-quotes
GET    /api/price-quotes/:id
POST   /api/price-quotes
PATCH  /api/price-quotes/:id
POST/PATCH appropriate deactivate action
GET    /api/price-quotes/:id/activity
```


## Saved Views

```text
GET    /api/procurement/saved-views
GET    /api/procurement/saved-views/:id
POST   /api/procurement/saved-views
PATCH  /api/procurement/saved-views/:id
DELETE /api/procurement/saved-views/:id
POST/PATCH appropriate duplicate action
POST/PATCH appropriate set-default action
```

All Saved View endpoints are owner-scoped to the authenticated Portal `USER_ID`.

The exact routes/actions may be adjusted to match current TaskHub conventions.

## Procurement startup sync

Conceptually:

```text
POST /api/procurement/sync
```

or the equivalent existing routing style.

Do not expose stored-procedure names to the client.

Route names may be adjusted to match current project conventions; business behavior is authoritative.

---

# 51. Query/performance direction

Use server-side:

- search;
- filtering;
- sorting;
- pagination;
- aggregation.

Avoid returning massive transaction datasets unnecessarily.

Saved Views should submit their selected Item/Supplier/filter definition to server-side analytics queries; do not load the entire global Transaction table into the browser and filter it locally.

Window/partition calculations for latest/previous records should remain server-side.

Repositories should select only needed transaction columns for each use case.

### 51.1 Items landing performance priority

The Items landing page must prioritize the paginated Items table over secondary intelligence.

For ordinary Item-master sorting (`name`, `code`, `category`, `unit`, `status`, `source`):

1. filter/sort the shared Item master;
2. select only the requested server page;
3. calculate purchase-price analytics only for those paged Item IDs.

Do not calculate the full Item analytics universe before pagination when the requested sort does not depend on analytics.

For analytics-dependent sorting (`latest`, `lowest`, `highest`, `change`, `suppliers`, `lastPurchase`), full matching-set analytics remain necessary before pagination so server-side ordering stays mathematically correct.

On initial page load:

- resolve the Saved View/default-view context before firing the first expensive Items request;
- load the Items table first;
- defer Overview/Needs Attention and private Quote summary until the Items request succeeds;
- do not fetch Supplier picker options until the user opens the Supplier filter;
- a failure of secondary analytics must not make the Items table unusable.

Recommended physical indexes may be added by the user to the externally managed source tables if real performance requires them, especially around:

```text
QNHDB.dbo.TM_INV_Items_Import:
ITEM_NO
ITEM_CODE
ITEM_NAME

QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT:
SUPPLIER_ID
SUPPLIER_CODE
SUPPLIER_NAME

QNHDB.dbo.TM_Purchase_Invoice_Details_Import:
ITEM_NO
SUPPLIER_ID
DELIVERY_NOTE_DATE
UNIT_COST
CURRENCY_CODE
UNIT_NAME_EN
```

Do not create speculative indexes before checking actual query plans/data size if performance is acceptable.

---

# 52. What is explicitly out of scope unless later requested

Do not automatically add:

- Oracle writes from TaskHub.
- Editing/deleting actual imported transactions.
- automatic purchase-order creation.
- stock management.
- inventory quantity management.
- supplier quality scoring.
- delivery-performance scoring.
- a "Best Supplier" algorithm.
- AI price prediction.
- AI supplier recommendation.
- purchasing forecasting.
- external currency FX service.
- automatic UOM normalization.
- quote approval workflow.
- multi-user quote sharing.
- quote collaboration/comments.
- recurring Tasks based on prices.
- push/SMS/WhatsApp/Teams alerts.
- separate Procurement microservice.
- Redis/queues.
- WebSocket real-time system.
- SQL Agent requirement.
- complex startup-sync locking.
- new chart dependency without demonstrated need.
- separate permission matrix inside Procurement Phase 1.

---

# 53. Documentation requirements

If Procurement implementation changes important architecture/domain behavior, update the relevant project documentation so future work does not restore obsolete behavior.

Likely files include:

```text
AGENTS.md
docs/product-requirements.md
```

This Procurement source-of-truth file should also be kept aligned if the user explicitly changes a rule.

---

# 54. Implementation review rules

Before modifying code:

1. Inspect relevant existing frontend/backend/database code.
2. Reuse existing patterns/components.
3. Confirm current migration number.
4. Inspect current Contracts supplier implementation.
5. Inspect access/permission models.
6. Inspect navigation and guards.
7. Inspect localization.
8. Inspect existing pagination/sorting patterns.
9. Preserve unrelated working behavior.

Do not automatically trust prior AI/Codex completion claims.

Inspect actual source.

---

# 55. Engineering decision rules

When reviewing a requested implementation:

1. Identify what is good.
2. Identify architecture/data/security/UX risks.
3. Consider alternatives.
4. Recommend the simplest sound approach.
5. Do not overengineer for hypothetical scale.
6. If the user explicitly chooses an approach after concerns are explained, proceed.

Keep the implementation tightly scoped.

---

# 56. ZIP patch delivery contract — mandatory

This section is part of the Procurement source of truth and applies whenever the user asks ChatGPT to implement Procurement changes.

## 56.1 Tiny edits

If the entire requested change is only approximately:

- 2–3 changed lines;
- affecting at most 2 files;

the exact code changes may be returned directly in chat.

## 56.2 Larger work must be delivered as a ZIP patch

For anything meaningfully larger:

> **Create a ZIP patch instead of returning many code fragments.**

Expected structure:

```text
PATCH.zip
├── README.md
├── client/.../ChangedFile.tsx
├── server/.../ChangedFile.ts
└── server/database/migrations/...sql
```

## 56.3 ZIP contents

The ZIP must contain **ONLY**:

- changed files;
- new files;
- `README.md`.

Do not include unchanged project files.

## 56.4 Complete files only

Every source file inside the ZIP must be the **complete final file**.

Do not ship:

- diffs;
- patches requiring manual reconstruction;
- partial snippets.

The user should be able to extract the ZIP over the existing project root.

## 56.5 Preserve exact project-relative paths

Examples:

```text
client/src/features/items/api/items.api.ts
client/src/pages/items/ItemsPage.tsx
server/src/modules/items/items.repository.ts
server/database/migrations/027_example.sql
```

Do not flatten files.

## 56.6 README requirements

Every patch ZIP README must state:

- what was changed;
- which files are new;
- important architecture/business-rule changes;
- database migrations/manual steps;
- stored procedure/table placeholders that still need final names;
- validation performed;
- validation not performed;
- known assumptions/remaining items.

---

# 57. Validation speed rule — finish the ZIP quickly

The main delivery goal is:

> **Finish the correct complete ZIP patch as quickly as practical.**

Do not spend large amounts of time on environment setup or validation unless the user explicitly requests it.

If the user says they will validate locally, trust that instruction.

Do **not** automatically spend time on:

- dependency installation;
- package-manager troubleshooting;
- environment configuration;
- long typechecks;
- long test suites;
- lint across the whole repository;
- full builds;
- E2E setup;
- unrelated environment errors.

Incomplete validation is **not a reason to withhold the ZIP**.

A short manual sanity check is acceptable, for example:

- no merge-conflict markers;
- no obviously truncated files;
- no clearly unfinished edits;
- no obviously broken imports visible from inspection.

Do not turn this into a long investigation phase.

If the user says:

> "Stop investigation/validation and package the current implementation"

stop further investigation and produce the ZIP.

---

# 58. Database execution rule

Migrations/scripts may be included in the implementation ZIP.

Do **not** execute database migrations against the user's SQL Server unless the user gives separate explicit approval for database execution.

The user will normally run database scripts locally.

If a migration later fails when the user runs it, diagnose the exact SQL Server error and provide the corrected **full** migration script.

---

# 59. External source tables vs TaskHub-owned migrations

Do not create migrations for these three externally managed source tables under the current approved plan:

```text
QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT
QNHDB.dbo.TM_INV_Items_Import
QNHDB.dbo.TM_Purchase_Invoice_Details_Import
```

TaskHub migrations may still be required for TaskHub-owned changes such as:

```text
procurement_enabled
TM_price_quotes
TM_procurement_activity
TM_procurement_saved_views
Contract → shared Supplier relationship changes
```

Do not execute them automatically.

## 59.1 Production source validation

Migration `030_validate_procurement_production_sources.sql` is the production preflight for the finalized Procurement source mapping. It validates:

- the `QNHDB` source database;
- the three confirmed source tables;
- the three confirmed startup import stored procedures;
- the physical columns used by Procurement;
- unique Supplier/Item source identities;
- unique non-null Transaction `SOURCE_ROWID` values for deterministic tie-breaking;
- whether the real Supplier/Item import tables can accept TaskHub manual-record inserts without an unhandled required/no-default column.

If temporary placeholder `dbo.TM_suppliers` / `dbo.TM_items` tables exist from an earlier Procurement phase deployment, migration `030` copies only missing identities into the production master tables and retains the legacy placeholder tables. It does not delete historical data.

---

# 60. Final production physical source object names

The Supplier/Item/Transaction columns and physical production source-object names are now confirmed:

```text
TABLES
QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT
QNHDB.dbo.TM_INV_Items_Import
QNHDB.dbo.TM_Purchase_Invoice_Details_Import

STARTUP STORED PROCEDURES
QNHDB.dbo.SP_Import_APS_SUPPLIERS
QNHDB.dbo.SP_Import_INV_Items_All
QNHDB.dbo.SP_Import_Purchase_Invoices_All
```

These six names are production mappings, not guesses. They remain centralized to keep future infrastructure changes easy.

Do not treat the source column names documented above as guesses.

---

# 61. Approved Procurement domain summary

```text
                            QNH TaskHub
                                │
                    procurement_enabled
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
     Contracts               Shared Data          Price Quotes
      PRIVATE              Items/Suppliers          PRIVATE
         │                      │                      │
         │                      │                      │
         └──────────────► Shared Suppliers ◄──────────┘
                                │
                                ▼
                    Imported Transactions
                         SHARED / READ ONLY
                                │
                                ▼
                         Price Analytics
```

---

# 62. Approved source-data flow

```text
CarWare / Oracle
      │
      ├── Supplier Import SP
      │        │
      │        ▼
      │   QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT
      │      shared/editable
      │
      ├── Item Import SP
      │        │
      │        ▼
      │    QNHDB.dbo.TM_INV_Items_Import
      │      shared/editable
      │
      └── Transaction Import SP
               │
               ▼
      QNHDB.dbo.TM_Purchase_Invoice_Details_Import
               │
               └── shared/read-only in TaskHub
```

Import procedures:

```text
INSERT new source IDs only
DO NOT overwrite existing source rows
```

Manual records:

```text
TaskHub user
  ├── Manual Supplier → shared Supplier master
  └── Manual Item     → shared Item master
```

Manual prices:

```text
TaskHub user
  └── Price Quote → PRIVATE to that user
```

---

# 63. Hard invariants checklist

Future Procurement work must preserve all of these unless the user explicitly changes them:

- [ ] Procurement sidebar group contains Contracts, Items, Suppliers, Price Quotes.
- [ ] `procurement_enabled` is the module-access concept.
- [ ] Contracts are private per user.
- [ ] Price Quotes are private per user.
- [ ] Items are shared.
- [ ] Suppliers are shared.
- [ ] Actual imported transactions are shared/read-only.
- [ ] Item + Supplier actual purchase history is a time series with many Transactions, not one row.
- [ ] Multiple actual Transactions may exist for the same Item + Supplier on the same date.
- [ ] Latest/previous Item + Supplier analytics use deterministic chronological ordering with a stable tie-break.
- [ ] Price Quotes are also a time series; the same user may create many Quotes for the same Item + Supplier.
- [ ] Multiple private Quotes may exist for the same user + Item + Supplier on the same date.
- [ ] Do not add a uniqueness rule that permits only one Quote per owner + Item + Supplier.
- [ ] Actual purchase statistics and private Quote statistics remain separate even when displayed together.
- [ ] The default Items page must not become one giant all-Items × all-Suppliers matrix.
- [ ] Focused suppliers-as-columns comparison is used only for a deliberately small selected Supplier set.
- [ ] Saved Views are private per user.
- [ ] Saved Views store filters/selections/display configuration, never calculated prices.
- [ ] Opening a Saved View recalculates results from current Transactions and the authenticated user's current private Quotes.
- [ ] Saved View Item + Supplier rows are summaries over all matching historical records, not physical Transaction/Quote rows.
- [ ] Users may create, edit, rename, duplicate, delete, and optionally set a default Saved View.
- [ ] Shared Supplier is used by both Contracts and Items/Pricing.
- [ ] Supplier Code is immutable.
- [ ] Item Code is immutable.
- [ ] Source relationship IDs are system identity, not user-editable business fields.
- [ ] Procurement users may create manual Suppliers.
- [ ] Procurement users may create manual Items.
- [ ] Manual records receive non-conflicting generated identities/codes and clear Manual labeling.
- [ ] Supplier changes are audited.
- [ ] Item changes are audited.
- [ ] Quote changes are audited.
- [ ] Actual transactions cannot be edited from TaskHub.
- [ ] `UNIT_COST` is the only actual price used in analytics.
- [ ] `DELIVERY_NOTE_DATE` is the primary actual-price timeline date.
- [ ] Do not use `UNIT_PRICE`, `NET_AMOUNT`, or `SELL_PRICE` as actual Procurement price.
- [ ] Quotes remain distinct from actual purchases.
- [ ] Currency/UOM compatibility is respected.
- [ ] Existing `SortableHeader` is reused.
- [ ] Existing `TablePagination` is reused.
- [ ] Existing search/loading/error/empty patterns are reused.
- [ ] Arabic/English and RTL/LTR are complete.
- [ ] Light/dark themes are preserved.
- [ ] Existing Contracts privacy is not weakened.
- [ ] Startup sync runs the three procedures sequentially for Procurement users.
- [ ] Startup sync remains simple; no unnecessary lock/queue infrastructure.
- [ ] The three source tables are externally created/populated.
- [ ] Physical table/SP names are centralized for easy later replacement.
- [ ] Larger implementations are delivered as changed/new-files-only ZIP patches.
- [ ] ZIP contains complete replacement files at original project-relative paths.
- [ ] Do not withhold ZIP because full validation was not run.
- [ ] Do not execute database migrations without explicit separate approval.

---

# 64. Final implementation principle

Optimize Procurement work for:

1. Correct price interpretation (`UNIT_COST` only).
2. Correct private/shared boundaries.
3. Clear supplier/item comparisons.
4. Simple, understandable UI/UX.
5. Reuse of existing TaskHub architecture/components.
6. Maintainable repository/API boundaries.
7. Fast, complete ZIP-patch delivery.
8. Minimal unnecessary complexity.

When in doubt, choose the simplest implementation that preserves these invariants and fits the existing TaskHub project.

---

# 65. Source materials used to establish this specification

The approved rules in this document were derived from the user-approved Procurement design discussion plus the supplied project/source materials:

```text
Pasted text(20260903-092231).txt
CHATGPT_CODING_ZIP_RULES.md
APS_SUPPLIERS_IMPORT.xlsx
Items.xlsx
SP_Get_Purchase_Invoices_By_DeliveryDate.xlsx
```

The supplied TaskHub repository context is the baseline for architecture/component conventions.

The Supplier, Item, and Transaction column names documented above come from the supplied spreadsheets.

This document supersedes earlier brainstorming where it conflicts with the final approved rules written here.

---

**END OF PROCUREMENT MODULE SOURCE OF TRUTH**

---

# 61. Items Performance V2 — approved fast-data foundation (2026-09-05)

The Items experience must prioritize fast access to shared Item master data and must not make the entire page wait for purchase-history analytics.

## 61.1 Normal Item sorts use the master-data fast path

For `name`, `code`, `category`, `unit`, `status`, and `source` sorts, `GET /api/items` reads/paginates the Item master only and does **not** scan the purchase-transaction source for price statistics. The visible page is usable first.

## 61.2 Visible-row price summaries are a second batch

After the visible Item IDs are known, the client requests one batch of price summaries for those visible Items only. This batch recalculates the approved actual `UNIT_COST` statistics using the current period/Supplier scope and does not persist calculated prices.

The batch provides Latest, Previous, Lowest, Highest, Average, Change, Supplier Count, Transaction Count, Last Purchase, and Latest Supplier context. A failure of this secondary batch must not hide or fail the Item master list.

## 61.3 Analytical sorts remain server-side and complete

For `latest`, `lowest`, `highest`, `change`, `suppliers`, and `lastPurchase`, the backend must calculate the full matching analytical universe before pagination so sorting remains mathematically correct. Do not paginate Item master rows first for these analytical sorts.

## 61.4 Lightweight picker endpoints and lazy dialogs

Item selectors use the dedicated lightweight Item-options endpoint and must not execute purchase-price analytics. Closed Item/Supplier pickers and closed Saved View/Price Quote dialogs must not issue lookup requests. Queries are enabled only when the corresponding picker/dialog is actually needed.

## 61.5 Retry and failure isolation

Expensive Procurement analytical reads use no automatic immediate retry. Users may explicitly retry failed secondary analytics. Overview, Quote intelligence, Supplier picker, or visible-row price-summary failure must not make the main Items page unusable.

## 61.6 Load order

Approved load priority:

```text
Saved View context
    ↓
lightweight Item master page
    ↓
ITEM TABLE USABLE
    ↓
visible-Item price-summary batch
    ↓
Overview / Needs Attention + private Quote summary
```

## 61.7 Source index support

The operational setup script `server/database/setup/optimize_procurement_source_indexes.sql` maintains the TaskHub Item-price index with the Item-first key order:

```text
ITEM_NO
DELIVERY_NOTE_DATE DESC
SUPPLIER_ID
```

with core price-context fields as included columns. It remains an operations/setup script rather than a TaskHub schema migration because the import table is externally managed. Review existing indexes and execute it in an appropriate maintenance window.

## 61.8 No summary/cache tables yet

Do not introduce precomputed Item/Supplier price-summary tables unless measured performance remains inadequate after the fast master path, visible-row batching, lazy queries, no-retry behavior, and targeted source index are deployed and measured.

