const sourceDatabase = "[QNHDB]";

export const PROCUREMENT_DB_OBJECTS = {
  suppliersTable: `${sourceDatabase}.[dbo].[TM_APS_SUPPLIERS_IMPORT]`,
  itemsTable: `${sourceDatabase}.[dbo].[TM_INV_Items_Import]`,
  transactionsTable: `${sourceDatabase}.[dbo].[TM_Purchase_Invoice_Details_Import]`,
  supplierSyncProcedure: `${sourceDatabase}.[dbo].[SP_Import_APS_SUPPLIERS]`,
  itemSyncProcedure: `${sourceDatabase}.[dbo].[SP_Import_INV_Items_All]`,
  transactionSyncProcedure: `${sourceDatabase}.[dbo].[SP_Import_Purchase_Invoices_All]`,
} as const;
