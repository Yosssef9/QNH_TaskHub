import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createItem,
  getItem,
  getItemActivity,
  getItemAnalytics,
  getItemOptions,
  getItemPriceHistory,
  getItemPriceSummaries,
  getItemSupplierMatrix,
  getItemSupplierComparison,
  getItemTransactions,
  getItems,
  getItemsOverview,
  updateItem,
} from '../api/items.api'
import type {
  Item,
  ItemInput,
  ItemListQuery,
  ItemOptionQuery,
  ItemOverviewQuery,
  ItemPriceHistoryQuery,
  ItemPriceSummaryQuery,
  ItemSupplierMatrixQuery,
  ItemSupplierListQuery,
  ItemTransactionListQuery,
  ProcurementPriceFilter,
} from '../types/item.types'

export const itemsQueryKey = ['items'] as const
const itemListsQueryKey = [...itemsQueryKey, 'list'] as const
const itemOptionsQueryKey = [...itemsQueryKey, 'options'] as const

export function useItems(query: ItemListQuery, enabled = true) {
  return useQuery({
    queryKey: [...itemListsQueryKey, query],
    queryFn: () => getItems(query),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useItemOptions(query: ItemOptionQuery, enabled = true) {
  return useQuery({
    queryKey: [...itemOptionsQueryKey, query],
    queryFn: () => getItemOptions(query),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useInfiniteItemOptions(
  query: Omit<ItemOptionQuery, 'page'>,
  enabled = true,
) {
  const normalizedSearch = query.search?.trim() || undefined
  const baseQuery = {
    pageSize: query.pageSize,
    ...(query.source ? { source: query.source } : {}),
  }

  return useInfiniteQuery({
    queryKey: [
      ...itemOptionsQueryKey,
      'infinite',
      {
        search: normalizedSearch ?? '',
        source: query.source ?? 'ALL',
        pageSize: query.pageSize,
      },
    ],
    queryFn: ({ pageParam }) =>
      getItemOptions({
        ...baseQuery,
        ...(normalizedSearch ? { search: normalizedSearch } : {}),
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.pageSize < lastPage.total
        ? lastPage.page + 1
        : undefined,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useItemPriceSummaries(query: ItemPriceSummaryQuery, enabled = true) {
  return useQuery({
    queryKey: [...itemsQueryKey, 'price-summaries', query],
    queryFn: () => getItemPriceSummaries(query),
    enabled,
    retry: false,
  })
}

export function useItemSupplierMatrix(query: ItemSupplierMatrixQuery, enabled = true) {
  return useQuery({
    queryKey: [...itemsQueryKey, 'supplier-matrix', query],
    queryFn: () => getItemSupplierMatrix(query),
    enabled,
    retry: false,
  })
}

export function useItemsOverview(query: ItemOverviewQuery, enabled = true) {
  return useQuery({
    queryKey: [...itemsQueryKey, 'overview', query],
    queryFn: () => getItemsOverview(query),
    enabled,
    retry: false,
  })
}
export function useItem(itemId: number | null) {
  return useQuery({ queryKey: [...itemsQueryKey, 'detail', itemId], queryFn: () => getItem(itemId as number), enabled: itemId !== null })
}
export function useItemActivity(itemId: number | null) {
  return useQuery({ queryKey: [...itemsQueryKey, 'activity', itemId], queryFn: () => getItemActivity(itemId as number), enabled: itemId !== null })
}
export function useItemTransactions(itemId: number | null, query: ItemTransactionListQuery) {
  return useQuery({
    queryKey: [...itemsQueryKey, 'transactions', itemId, query],
    queryFn: () => getItemTransactions(itemId as number, query),
    enabled: itemId !== null,
    placeholderData: keepPreviousData,
    retry: false,
  })
}
export function useItemPriceHistory(itemId: number | null, query: ItemPriceHistoryQuery) {
  return useQuery({
    queryKey: [...itemsQueryKey, 'price-history', itemId, query],
    queryFn: () => getItemPriceHistory(itemId as number, query),
    enabled: itemId !== null,
    retry: false,
  })
}
export function useItemAnalytics(itemId: number | null, query: ProcurementPriceFilter) {
  return useQuery({
    queryKey: [...itemsQueryKey, 'analytics', itemId, query],
    queryFn: () => getItemAnalytics(itemId as number, query),
    enabled: itemId !== null,
    retry: false,
  })
}
export function useItemSupplierComparison(itemId: number | null, query: ItemSupplierListQuery) {
  return useQuery({
    queryKey: [...itemsQueryKey, 'supplier-comparison', itemId, query],
    queryFn: () => getItemSupplierComparison(itemId as number, query),
    enabled: itemId !== null,
    placeholderData: keepPreviousData,
    retry: false,
  })
}
export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createItem,
    onSuccess: (item) => {
      queryClient.setQueryData([...itemsQueryKey, 'detail', item.id], item)
      void queryClient.invalidateQueries({ queryKey: itemListsQueryKey })
      void queryClient.invalidateQueries({ queryKey: itemOptionsQueryKey })
      void queryClient.invalidateQueries({ queryKey: [...itemsQueryKey, 'overview'] })
    },
  })
}
export function useUpdateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: number; input: ItemInput }) => updateItem(itemId, input),
    onSuccess: (item) => {
      queryClient.setQueryData([...itemsQueryKey, 'detail', item.id], item)
      void queryClient.invalidateQueries({ queryKey: itemListsQueryKey })
      void queryClient.invalidateQueries({ queryKey: itemOptionsQueryKey })
      void queryClient.invalidateQueries({ queryKey: [...itemsQueryKey, 'overview'] })
      void queryClient.invalidateQueries({ queryKey: [...itemsQueryKey, 'activity', item.id] })
    },
  })
}
export function itemInputFromItem(item: Item): ItemInput {
  return {
    name: item.name,
    parentName: item.parentName,
    categoryName: item.categoryName,
    unit: item.unit,
    pieceUnit: item.pieceUnit,
    factor: item.factor,
    isStockItem: item.isStockItem,
    statusCode: item.statusCode,
    isAsset: item.isAsset,
  }
}

