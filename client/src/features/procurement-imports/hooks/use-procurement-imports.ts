import { useMutation, useQueryClient } from '@tanstack/react-query'
import { applyProcurementImport, previewProcurementImport } from '../api/procurement-imports.api'
import type { ProcurementImportApplyInput } from '../types/procurement-import.types'

export function usePreviewProcurementImport() {
  return useMutation({
    mutationFn: ({ file, sheetName }: { file: File; sheetName?: string }) =>
      previewProcurementImport(file, sheetName),
  })
}

export function useApplyProcurementImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ProcurementImportApplyInput) => applyProcurementImport(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['procurement', 'saved-views'] })
      void queryClient.invalidateQueries({ queryKey: ['procurement', 'price-quotes'] })
      void queryClient.invalidateQueries({ queryKey: ['items'] })
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}
