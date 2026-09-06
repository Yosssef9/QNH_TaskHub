import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type {
  PriceQuote,
  PriceQuoteActivity,
  PriceQuoteAnalytics,
  PriceQuoteAnalyticsQuery,
  PriceQuoteInput,
  PriceQuoteList,
  PriceQuoteListQuery,
  PriceQuoteSummary,
  PriceQuoteSummaryInput,
} from '../types/price-quote.types'

function analyticsParams(query: PriceQuoteAnalyticsQuery) {
  const { supplierIds, ...rest } = query
  return { ...rest, ...(supplierIds?.length ? { supplierIds: supplierIds.join(',') } : {}) }
}

export async function getPriceQuotes(query: PriceQuoteListQuery): Promise<PriceQuoteList> {
  const { supplierIds, ...rest } = query
  const response = await apiClient.get<ApiSuccessResponse<PriceQuoteList>>('/price-quotes', { params: { ...rest, ...(supplierIds?.length ? { supplierIds: supplierIds.join(',') } : {}) } })
  return response.data.data
}
export async function getPriceQuote(id: number): Promise<PriceQuote> {
  const response = await apiClient.get<ApiSuccessResponse<PriceQuote>>(`/price-quotes/${id}`)
  return response.data.data
}
export async function createPriceQuote(input: PriceQuoteInput): Promise<PriceQuote> {
  const response = await apiClient.post<ApiSuccessResponse<PriceQuote>>('/price-quotes', input)
  return response.data.data
}
export async function updatePriceQuote(id: number, input: PriceQuoteInput & { rowVersion: string }): Promise<PriceQuote> {
  const response = await apiClient.patch<ApiSuccessResponse<PriceQuote>>(`/price-quotes/${id}`, input)
  return response.data.data
}
export async function setPriceQuoteActive(id: number, active: boolean, rowVersion: string): Promise<PriceQuote> {
  const response = await apiClient.post<ApiSuccessResponse<PriceQuote>>(`/price-quotes/${id}/${active ? 'reactivate' : 'deactivate'}`, { rowVersion })
  return response.data.data
}
export async function getPriceQuoteActivity(id: number): Promise<PriceQuoteActivity[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: PriceQuoteActivity[] }>>(`/price-quotes/${id}/activity`)
  return response.data.data.items
}
export async function getPriceQuoteAnalytics(query: PriceQuoteAnalyticsQuery): Promise<PriceQuoteAnalytics> {
  const response = await apiClient.get<ApiSuccessResponse<PriceQuoteAnalytics>>('/price-quotes/analytics', { params: analyticsParams(query) })
  return response.data.data
}
export async function getPriceQuoteSummary(input: PriceQuoteSummaryInput): Promise<PriceQuoteSummary> {
  const response = await apiClient.post<ApiSuccessResponse<PriceQuoteSummary>>('/price-quotes/summary', input)
  return response.data.data
}
