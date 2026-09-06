import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  Supplier,
  SupplierActivity,
  SupplierInput,
  ProcurementPricePeriod,
  SupplierItemPriceList,
  SupplierItemPriceListQuery,
  SupplierList,
  SupplierListQuery,
  SupplierOptionList,
  SupplierOptionQuery,
  SupplierPriceAnalytics,
} from '../types/supplier.types'

export async function getSuppliers(query: SupplierListQuery): Promise<SupplierList> {
  const response = await apiClient.get<ApiSuccessResponse<SupplierList>>('/suppliers', {
    params: query,
  })
  return response.data.data
}

export async function getSupplierOptions(query: SupplierOptionQuery): Promise<SupplierOptionList> {
  const response = await apiClient.get<ApiSuccessResponse<SupplierOptionList>>('/suppliers/options', {
    params: query,
  })
  return response.data.data
}

export async function getSupplier(supplierId: number): Promise<Supplier> {
  const response = await apiClient.get<ApiSuccessResponse<Supplier>>(`/suppliers/${supplierId}`)
  return response.data.data
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const response = await apiClient.post<ApiSuccessResponse<Supplier>>('/suppliers', input)
  return response.data.data
}

export async function updateSupplier(supplierId: number, input: SupplierInput): Promise<Supplier> {
  const response = await apiClient.patch<ApiSuccessResponse<Supplier>>(`/suppliers/${supplierId}`, input)
  return response.data.data
}

export async function getSupplierActivity(supplierId: number): Promise<SupplierActivity[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: SupplierActivity[] }>>(
    `/suppliers/${supplierId}/activity`,
  )
  return response.data.data.items
}


export async function getSupplierPriceAnalytics(
  supplierId: number,
  period: ProcurementPricePeriod,
): Promise<SupplierPriceAnalytics> {
  const response = await apiClient.get<ApiSuccessResponse<SupplierPriceAnalytics>>(
    `/suppliers/${supplierId}/analytics`,
    { params: { period } },
  )
  return response.data.data
}

export async function getSupplierItemPrices(
  supplierId: number,
  query: SupplierItemPriceListQuery,
): Promise<SupplierItemPriceList> {
  const response = await apiClient.get<ApiSuccessResponse<SupplierItemPriceList>>(
    `/suppliers/${supplierId}/items`,
    { params: query },
  )
  return response.data.data
}
