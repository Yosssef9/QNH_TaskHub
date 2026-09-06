import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createSupplier,
  getSupplier,
  getSupplierActivity,
  getSupplierItemPrices,
  getSupplierPriceAnalytics,
  getSuppliers,
  updateSupplier,
} from '../api/suppliers.api'
import type { ProcurementPricePeriod, Supplier, SupplierInput, SupplierItemPriceListQuery, SupplierListQuery } from '../types/supplier.types'

export const suppliersQueryKey = ['suppliers'] as const
const supplierListsQueryKey = [...suppliersQueryKey, 'list'] as const

export function useSuppliers(query: SupplierListQuery, enabled = true) {
  return useQuery({
    queryKey: [...supplierListsQueryKey, query],
    queryFn: () => getSuppliers(query),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useSupplier(supplierId: number | null) {
  return useQuery({
    queryKey: [...suppliersQueryKey, 'detail', supplierId],
    queryFn: () => getSupplier(supplierId as number),
    enabled: supplierId !== null,
  })
}

export function useSupplierActivity(supplierId: number | null) {
  return useQuery({
    queryKey: [...suppliersQueryKey, 'activity', supplierId],
    queryFn: () => getSupplierActivity(supplierId as number),
    enabled: supplierId !== null,
  })
}


export function useSupplierPriceAnalytics(
  supplierId: number | null,
  period: ProcurementPricePeriod,
) {
  return useQuery({
    queryKey: [...suppliersQueryKey, 'price-analytics', supplierId, period],
    queryFn: () => getSupplierPriceAnalytics(supplierId as number, period),
    enabled: supplierId !== null,
    retry: false,
  })
}

export function useSupplierItemPrices(
  supplierId: number | null,
  query: SupplierItemPriceListQuery,
) {
  return useQuery({
    queryKey: [...suppliersQueryKey, 'item-prices', supplierId, query],
    queryFn: () => getSupplierItemPrices(supplierId as number, query),
    enabled: supplierId !== null,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createSupplier,
    onSuccess: (supplier) => {
      queryClient.setQueryData([...suppliersQueryKey, 'detail', supplier.id], supplier)
      void queryClient.invalidateQueries({ queryKey: supplierListsQueryKey })
    },
  })
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ supplierId, input }: { supplierId: number; input: SupplierInput }) =>
      updateSupplier(supplierId, input),
    onSuccess: (supplier) => {
      queryClient.setQueryData([...suppliersQueryKey, 'detail', supplier.id], supplier)
      void queryClient.invalidateQueries({ queryKey: supplierListsQueryKey })
      void queryClient.invalidateQueries({ queryKey: [...suppliersQueryKey, 'activity', supplier.id] })
      void queryClient.invalidateQueries({ queryKey: ['contracts'] })
      void queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

export function supplierInputFromSupplier(supplier: Supplier): SupplierInput {
  return {
    manualFileNo: supplier.manualFileNo,
    name: supplier.name,
    nameSecondary: supplier.nameSecondary,
    taxRegistrationNo: supplier.taxRegistrationNo,
    countryName: supplier.countryName,
    cityName: supplier.cityName,
    currency: supplier.currency,
    contactJobTel: supplier.contactJobTel,
    extensionNo: supplier.extensionNo,
    mobileNo: supplier.mobileNo,
    homePhone: supplier.homePhone,
    email: supplier.email,
  }
}

