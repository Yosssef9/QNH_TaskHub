import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPriceQuote,
  getPriceQuote,
  getPriceQuoteActivity,
  getPriceQuoteContext,
  getPriceQuoteAnalytics,
  getPriceQuotes,
  getPriceQuoteSummary,
  setPriceQuoteActive,
  updatePriceQuote,
} from '../api/price-quotes.api'
import type {
  PriceQuoteAnalyticsQuery,
  PriceQuoteInput,
  PriceQuoteListQuery,
  PriceQuoteSummaryInput,
} from '../types/price-quote.types'

export const priceQuotesQueryKey = ['procurement', 'price-quotes'] as const
const quoteListsKey = [...priceQuotesQueryKey, 'list'] as const

export function usePriceQuotes(query: PriceQuoteListQuery) {
  return useQuery({ queryKey: [...quoteListsKey, query], queryFn: () => getPriceQuotes(query), placeholderData: keepPreviousData, retry: false })
}
export function usePriceQuote(id: number | null) {
  return useQuery({ queryKey: [...priceQuotesQueryKey, 'detail', id], queryFn: () => getPriceQuote(id as number), enabled: id !== null })
}
export function usePriceQuoteContext(itemId: number | null, supplierId: number | null) {
  return useQuery({
    queryKey: [...priceQuotesQueryKey, 'context', itemId, supplierId],
    queryFn: () => getPriceQuoteContext(itemId as number, supplierId ?? undefined),
    enabled: itemId !== null,
    retry: false,
  })
}
export function usePriceQuoteActivity(id: number | null) {
  return useQuery({ queryKey: [...priceQuotesQueryKey, 'activity', id], queryFn: () => getPriceQuoteActivity(id as number), enabled: id !== null })
}
export function usePriceQuoteAnalytics(query: PriceQuoteAnalyticsQuery | null) {
  return useQuery({ queryKey: [...priceQuotesQueryKey, 'analytics', query], queryFn: () => getPriceQuoteAnalytics(query as PriceQuoteAnalyticsQuery), enabled: query !== null, retry: false })
}
export function usePriceQuoteSummary(input: PriceQuoteSummaryInput, enabled = true) {
  return useQuery({
    queryKey: [...priceQuotesQueryKey, 'summary', input],
    queryFn: () => getPriceQuoteSummary(input),
    enabled,
    retry: false,
  })
}
function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, id?: number) {
  void queryClient.invalidateQueries({ queryKey: priceQuotesQueryKey })
  void queryClient.invalidateQueries({ queryKey: ['items'] })
  void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  if (id) void queryClient.invalidateQueries({ queryKey: [...priceQuotesQueryKey, 'activity', id] })
}
export function useCreatePriceQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createPriceQuote,
    onSuccess: (quote) => {
      queryClient.setQueryData([...priceQuotesQueryKey, 'detail', quote.id], quote)
      invalidateAll(queryClient, quote.id)
    },
  })
}
export function useUpdatePriceQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: PriceQuoteInput & { rowVersion: string } }) => updatePriceQuote(id, input),
    onSuccess: (quote) => {
      queryClient.setQueryData([...priceQuotesQueryKey, 'detail', quote.id], quote)
      invalidateAll(queryClient, quote.id)
    },
  })
}
export function useSetPriceQuoteActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active, rowVersion }: { id: number; active: boolean; rowVersion: string }) => setPriceQuoteActive(id, active, rowVersion),
    onSuccess: (quote) => {
      queryClient.setQueryData([...priceQuotesQueryKey, 'detail', quote.id], quote)
      invalidateAll(queryClient, quote.id)
    },
  })
}

