import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  Contract,
  ContractActivity,
  ContractAttachment,
  ContractInput,
  ContractList,
  ContractListQuery,
  ContractUserSettings,
  Supplier,
  SupplierInput,
  SupplierList,
  SupplierListQuery,
} from '../types/contracts.types'

export async function getContracts(query: ContractListQuery): Promise<ContractList> {
  const response = await apiClient.get<ApiSuccessResponse<ContractList>>('/contracts', {
    params: query,
  })
  return response.data.data
}

export async function getContract(contractId: number): Promise<Contract> {
  const response = await apiClient.get<ApiSuccessResponse<Contract>>(`/contracts/${contractId}`)
  return response.data.data
}

export async function createContract(input: ContractInput): Promise<Contract> {
  const response = await apiClient.post<ApiSuccessResponse<Contract>>('/contracts', input)
  return response.data.data
}

export async function updateContract(
  contractId: number,
  input: ContractInput & { rowVersion: string },
): Promise<Contract> {
  const response = await apiClient.patch<ApiSuccessResponse<Contract>>(
    `/contracts/${contractId}`,
    input,
  )
  return response.data.data
}

export async function archiveContract(contract: Contract): Promise<Contract> {
  const response = await apiClient.post<ApiSuccessResponse<Contract>>(
    `/contracts/${contract.id}/archive`,
    { rowVersion: contract.rowVersion },
  )
  return response.data.data
}

export async function restoreContract(contract: Contract): Promise<Contract> {
  const response = await apiClient.post<ApiSuccessResponse<Contract>>(
    `/contracts/${contract.id}/restore`,
    { rowVersion: contract.rowVersion },
  )
  return response.data.data
}

export async function getContractActivity(contractId: number): Promise<ContractActivity[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: ContractActivity[] }>>(
    `/contracts/${contractId}/activity`,
  )
  return response.data.data.items
}

export async function getSuppliers(query: SupplierListQuery): Promise<SupplierList> {
  const response = await apiClient.get<ApiSuccessResponse<SupplierList>>('/contracts/suppliers', {
    params: query,
  })
  return response.data.data
}

export async function getSupplier(supplierId: number): Promise<Supplier> {
  const response = await apiClient.get<ApiSuccessResponse<Supplier>>(
    `/contracts/suppliers/${supplierId}`,
  )
  return response.data.data
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const response = await apiClient.post<ApiSuccessResponse<Supplier>>('/contracts/suppliers', input)
  return response.data.data
}

export async function updateSupplier(
  supplierId: number,
  input: SupplierInput & { rowVersion: string },
): Promise<Supplier> {
  const response = await apiClient.patch<ApiSuccessResponse<Supplier>>(
    `/contracts/suppliers/${supplierId}`,
    input,
  )
  return response.data.data
}

export async function archiveSupplier(supplier: Supplier): Promise<Supplier> {
  const response = await apiClient.post<ApiSuccessResponse<Supplier>>(
    `/contracts/suppliers/${supplier.id}/archive`,
    { rowVersion: supplier.rowVersion },
  )
  return response.data.data
}

export async function restoreSupplier(supplier: Supplier): Promise<Supplier> {
  const response = await apiClient.post<ApiSuccessResponse<Supplier>>(
    `/contracts/suppliers/${supplier.id}/restore`,
    { rowVersion: supplier.rowVersion },
  )
  return response.data.data
}

export async function getContractSettings(): Promise<ContractUserSettings> {
  const response = await apiClient.get<ApiSuccessResponse<ContractUserSettings>>('/contracts/settings')
  return response.data.data
}

export async function updateContractSettings(
  input: ContractUserSettings,
): Promise<ContractUserSettings> {
  const response = await apiClient.patch<ApiSuccessResponse<ContractUserSettings>>(
    '/contracts/settings',
    input,
  )
  return response.data.data
}

export async function getContractAttachments(contractId: number): Promise<ContractAttachment[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: ContractAttachment[] }>>(
    `/contracts/${contractId}/attachments`,
  )
  return response.data.data.items
}

export async function uploadContractAttachment(
  contractId: number,
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<ContractAttachment> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await apiClient.post<ApiSuccessResponse<{ attachment: ContractAttachment }>>(
    `/contracts/${contractId}/attachments`,
    formData,
    {
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      },
    },
  )
  return response.data.data.attachment
}

export async function getContractAttachmentPreview(
  attachmentId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await apiClient.get<Blob>(
    `/contracts/attachments/${attachmentId}/preview`,
    { responseType: 'blob', signal },
  )
  return response.data
}

export async function downloadContractAttachment(attachment: ContractAttachment): Promise<void> {
  const response = await apiClient.get<Blob>(
    `/contracts/attachments/${attachment.id}/download`,
    { responseType: 'blob' },
  )
  const url = URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = attachment.originalFileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function removeContractAttachment(attachmentId: string): Promise<void> {
  await apiClient.delete(`/contracts/attachments/${attachmentId}`)
}

