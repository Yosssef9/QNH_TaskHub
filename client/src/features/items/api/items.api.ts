import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type {
  Item,
  ItemActivity,
  ItemInput,
  ItemList,
  ItemListQuery,
  ItemOptionList,
  ItemOptionQuery,
  ItemOverviewQuery,
  ItemPriceSummaryBatch,
  ItemPriceSummaryQuery,
  ItemSupplierMatrixBatch,
  ItemSupplierMatrixQuery,
  ItemPriceAnalytics,
  ItemPriceHistory,
  ItemPriceHistoryQuery,
  ItemSupplierListQuery,
  ItemSupplierPriceList,
  ItemTransactionList,
  ItemTransactionListQuery,
  ProcurementPriceFilter,
  ItemsOverview,
} from '../types/item.types'

function itemListParams(query: ItemListQuery | ItemOverviewQuery) {
  const { itemIds, supplierIds, ...filters } = query
  return {
    ...filters,
    ...(itemIds?.length ? { itemIds: itemIds.join(',') } : {}),
    ...(supplierIds?.length ? { supplierIds: supplierIds.join(',') } : {}),
  }
}

export async function getItems(query: ItemListQuery): Promise<ItemList> {
  const response = await apiClient.get<ApiSuccessResponse<ItemList>>('/items', {
    params: itemListParams(query),
  })
  return response.data.data
}

export async function getItemOptions(query: ItemOptionQuery): Promise<ItemOptionList> {
  const response = await apiClient.get<ApiSuccessResponse<ItemOptionList>>('/items/options', { params: query })
  return response.data.data
}

export async function getItemPriceSummaries(query: ItemPriceSummaryQuery): Promise<ItemPriceSummaryBatch> {
  const { itemIds, supplierIds, ...filters } = query
  const response = await apiClient.get<ApiSuccessResponse<ItemPriceSummaryBatch>>('/items/price-summaries', {
    params: {
      ...filters,
      itemIds: itemIds.join(','),
      ...(supplierIds?.length ? { supplierIds: supplierIds.join(',') } : {}),
    },
  })
  return response.data.data
}

export async function getItemSupplierMatrix(query: ItemSupplierMatrixQuery): Promise<ItemSupplierMatrixBatch> {
  const response = await apiClient.get<ApiSuccessResponse<ItemSupplierMatrixBatch>>('/items/supplier-matrix', {
    params: {
      period: query.period,
      itemIds: query.itemIds.join(','),
      supplierIds: query.supplierIds.join(','),
    },
  })
  return response.data.data
}
export async function getItemsOverview(query: ItemOverviewQuery): Promise<ItemsOverview> {
  const response = await apiClient.get<ApiSuccessResponse<ItemsOverview>>('/items/overview', {
    params: itemListParams(query),
  })
  return response.data.data
}

export async function getItem(itemId: number): Promise<Item> {
  const response = await apiClient.get<ApiSuccessResponse<Item>>(`/items/${itemId}`)
  return response.data.data
}
export async function createItem(input: ItemInput): Promise<Item> {
  const response = await apiClient.post<ApiSuccessResponse<Item>>('/items', input)
  return response.data.data
}
export async function updateItem(itemId: number, input: ItemInput): Promise<Item> {
  const response = await apiClient.patch<ApiSuccessResponse<Item>>(`/items/${itemId}`, input)
  return response.data.data
}
export async function getItemActivity(itemId: number): Promise<ItemActivity[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: ItemActivity[] }>>(`/items/${itemId}/activity`)
  return response.data.data.items
}


function priceParams(query: ProcurementPriceFilter | ItemPriceHistoryQuery) {
  const { supplierIds, ...filters } = query
  return {
    ...filters,
    ...(supplierIds?.length ? { supplierIds: supplierIds.join(',') } : {}),
  }
}

export async function getItemTransactions(itemId: number, query: ItemTransactionListQuery): Promise<ItemTransactionList> {
  const response = await apiClient.get<ApiSuccessResponse<ItemTransactionList>>(`/items/${itemId}/transactions`, {
    params: priceParams(query),
  })
  return response.data.data
}

export async function getItemPriceHistory(itemId: number, query: ItemPriceHistoryQuery): Promise<ItemPriceHistory> {
  const response = await apiClient.get<ApiSuccessResponse<ItemPriceHistory>>(`/items/${itemId}/price-history`, {
    params: priceParams(query),
  })
  return response.data.data
}

export async function getItemAnalytics(itemId: number, query: ProcurementPriceFilter): Promise<ItemPriceAnalytics> {
  const response = await apiClient.get<ApiSuccessResponse<ItemPriceAnalytics>>(`/items/${itemId}/analytics`, {
    params: priceParams(query),
  })
  return response.data.data
}

export async function getItemSupplierComparison(itemId: number, query: ItemSupplierListQuery): Promise<ItemSupplierPriceList> {
  const response = await apiClient.get<ApiSuccessResponse<ItemSupplierPriceList>>(`/items/${itemId}/suppliers`, {
    params: priceParams(query),
  })
  return response.data.data
}


