import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type {
  ProcurementImportApplyInput,
  ProcurementImportApplyResult,
  ProcurementImportPreview,
} from '../types/procurement-import.types'

export async function previewProcurementImport(file: File, sheetName?: string): Promise<ProcurementImportPreview> {
  const form = new FormData()
  form.append('file', file)

  const response = await apiClient.post<ApiSuccessResponse<ProcurementImportPreview>>(
    '/procurement/imports/preview',
    form,
    {
      ...(sheetName ? { params: { sheetName } } : {}),
      timeout: 60_000,
    },
  )
  return response.data.data
}

export async function applyProcurementImport(input: ProcurementImportApplyInput): Promise<ProcurementImportApplyResult> {
  const form = new FormData()
  form.append('file', input.file)
  form.append('sheetName', input.sheetName)
  form.append('targetMode', input.targetMode)
  if (input.targetSavedViewId !== undefined) form.append('targetSavedViewId', String(input.targetSavedViewId))
  if (input.newViewName) form.append('newViewName', input.newViewName)

  const response = await apiClient.post<ApiSuccessResponse<ProcurementImportApplyResult>>(
    '/procurement/imports/apply',
    form,
    { timeout: 120_000 },
  )
  return response.data.data
}
