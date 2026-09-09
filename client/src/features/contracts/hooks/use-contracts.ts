import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  archiveContract,
  createContract,
  downloadContractAttachment,
  getContract,
  getContractAccessScopes,
  getContractActivity,
  getContractAttachments,
  getContracts,
  getContractSettings,
  restoreContract,
  removeContractAttachment,
  updateContract,
  updateContractSettings,
  uploadContractAttachment,
} from '../api/contracts.api'
import type {
  Contract,
  ContractInput,
  ContractListQuery,
  ContractUserSettings,
} from '../types/contracts.types'

export const contractsQueryKey = ['contracts'] as const
export const contractSettingsQueryKey = ['contract-settings'] as const
export const contractAttachmentsQueryKey = ['contract-attachments'] as const
export const contractAccessScopesQueryKey = ['contract-access-scopes'] as const

const contractListsQueryKey = [...contractsQueryKey, 'list'] as const

export function useContracts(query: ContractListQuery, enabled = true) {
  return useQuery({
    queryKey: [...contractsQueryKey, 'list', query],
    queryFn: () => getContracts(query),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useContractAccessScopes(enabled = true) {
  return useQuery({
    queryKey: contractAccessScopesQueryKey,
    queryFn: getContractAccessScopes,
    enabled,
  })
}

export function useContract(contractId: number | null) {
  return useQuery({
    queryKey: [...contractsQueryKey, 'detail', contractId],
    queryFn: () => getContract(contractId as number),
    enabled: contractId !== null,
  })
}

export function useContractActivity(contractId: number | null) {
  return useQuery({
    queryKey: [...contractsQueryKey, 'activity', contractId],
    queryFn: () => getContractActivity(contractId as number),
    enabled: contractId !== null,
  })
}

export function useContractAttachments(contractId: number | null) {
  return useQuery({
    queryKey: [...contractAttachmentsQueryKey, contractId],
    queryFn: () => getContractAttachments(contractId as number),
    enabled: contractId !== null,
  })
}

export function useUploadContractAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      contractId,
      file,
      onProgress,
    }: {
      contractId: number
      file: File
      onProgress?: (percentage: number) => void
    }) => uploadContractAttachment(contractId, file, onProgress),
    onSuccess: (_attachment, input) => {
      void queryClient.invalidateQueries({ queryKey: [...contractAttachmentsQueryKey, input.contractId] })
      void queryClient.invalidateQueries({ queryKey: contractListsQueryKey })
      void queryClient.invalidateQueries({ queryKey: [...contractsQueryKey, 'activity', input.contractId] })
    },
  })
}

export function useRemoveContractAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ attachmentId }: { contractId: number; attachmentId: string }) =>
      removeContractAttachment(attachmentId),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: [...contractAttachmentsQueryKey, input.contractId] })
      void queryClient.invalidateQueries({ queryKey: contractListsQueryKey })
      void queryClient.invalidateQueries({ queryKey: [...contractsQueryKey, 'activity', input.contractId] })
    },
  })
}

export { downloadContractAttachment }

export function useCreateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createContract,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contractListsQueryKey }),
  })
}

export function useUpdateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ contractId, input }: { contractId: number; input: ContractInput & { rowVersion: string } }) =>
      updateContract(contractId, input),
    onSuccess: (contract) => {
      queryClient.setQueryData([...contractsQueryKey, 'detail', contract.id], contract)
      void queryClient.invalidateQueries({ queryKey: contractListsQueryKey })
    },
  })
}

export function useArchiveContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: archiveContract,
    onSuccess: (contract) => {
      queryClient.setQueryData([...contractsQueryKey, 'detail', contract.id], contract)
      void queryClient.invalidateQueries({ queryKey: contractListsQueryKey })
    },
  })
}

export function useRestoreContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: restoreContract,
    onSuccess: (contract) => {
      queryClient.setQueryData([...contractsQueryKey, 'detail', contract.id], contract)
      void queryClient.invalidateQueries({ queryKey: contractListsQueryKey })
    },
  })
}

export function useContractSettings() {
  return useQuery({ queryKey: contractSettingsQueryKey, queryFn: getContractSettings })
}

export function useUpdateContractSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ContractUserSettings) => updateContractSettings(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(contractSettingsQueryKey, settings)
      void queryClient.invalidateQueries({ queryKey: contractListsQueryKey })
    },
  })
}

export function contractInputFromContract(contract: Contract): ContractInput {
  return {
    supplierId: contract.supplierId,
    contractNumber: contract.contractNumber,
    title: contract.title,
    startDate: contract.startDate,
    endDate: contract.endDate,
    isAutoRenewal: contract.isAutoRenewal,
    renewalTermMonths: contract.renewalTermMonths,
    noticePeriodDays: contract.noticePeriodDays,
    valueType: contract.valueType,
    contractValueSar: contract.contractValueSar,
    paymentFrequency: contract.paymentFrequency,
    paymentTiming: contract.paymentTiming,
    notes: contract.notes,
  }
}

export {
  useCreateSupplier,
  useSupplier,
  useSupplierActivity,
  useSuppliers,
  useUpdateSupplier,
} from '@/features/suppliers/hooks/use-suppliers'
