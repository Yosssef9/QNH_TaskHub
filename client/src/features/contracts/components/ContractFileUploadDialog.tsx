import { FileUp, Loader2, UploadCloud, X } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

import { useUploadContractAttachment } from '../hooks/use-contracts'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg']

function extension(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ContractFileUploadDialog({
  open,
  contractId,
  existingNames,
  onOpenChange,
}: {
  open: boolean
  contractId: number
  existingNames: string[]
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const mutation = useUploadContractAttachment()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)

  const duplicate =
    file !== null &&
    existingNames.some((name) => name.localeCompare(file.name, undefined, { sensitivity: 'accent' }) === 0)

  function reset() {
    setFile(null)
    setDragging(false)
    setProgress(0)
    setDuplicateConfirmed(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function validate(next: File): string | null {
    if (!allowedExtensions.includes(extension(next.name))) return t('contracts.files.errors.type')
    if (next.size <= 0) return t('contracts.files.errors.empty')
    if (next.size > MAX_FILE_BYTES) return t('contracts.files.errors.tooLarge')
    return null
  }

  function choose(next: File | null) {
    if (!next) return
    const error = validate(next)
    if (error) {
      toast.error(error)
      return
    }
    setFile(next)
    setProgress(0)
    setDuplicateConfirmed(false)
  }

  async function upload() {
    if (!file || (duplicate && !duplicateConfirmed)) return
    try {
      await mutation.mutateAsync({
        contractId,
        file,
        onProgress: setProgress,
      })
      toast.success(t('contracts.files.uploaded'))
      reset()
      onOpenChange(false)
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : ''
      const key =
        code === 'CONTRACT_ATTACHMENT_LIMIT_REACHED'
          ? 'contracts.files.errors.limit'
          : code === 'CONTRACT_ATTACHMENT_TOO_LARGE'
            ? 'contracts.files.errors.tooLarge'
            : code === 'CONTRACT_ATTACHMENT_TYPE_NOT_ALLOWED' ||
                code === 'CONTRACT_ATTACHMENT_CONTENT_INVALID'
              ? 'contracts.files.errors.type'
              : code === 'ARCHIVED_CONTRACT_READ_ONLY'
                ? 'contracts.files.errors.archived'
                : 'contracts.files.errors.upload'
      toast.error(t(key))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent variant="modal" className="w-[min(36rem,calc(100vw-2rem))]">
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
            <FileUp aria-hidden="true" className="size-5" />
          </div>
          <div>
            <DialogTitle>{t('contracts.files.addTitle')}</DialogTitle>
            <DialogDescription className="mt-1">{t('contracts.files.addDescription')}</DialogDescription>
          </div>
        </div>

        {!file ? (
          <button
            type="button"
            className={cn(
              'mt-5 grid min-h-56 w-full place-items-center rounded-2xl border-2 border-dashed p-6 text-center outline-none',
              'focus-visible:ring-ring focus-visible:ring-2',
              dragging
                ? 'border-primary bg-primary/8'
                : 'border-border hover:border-primary/40 hover:bg-primary/[0.035]',
            )}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              choose(event.dataTransfer.files.item(0))
            }}
          >
            <span>
              <UploadCloud className="text-primary mx-auto size-10" />
              <span className="mt-4 block font-semibold">
                {t(dragging ? 'contracts.files.dropNow' : 'contracts.files.dropHere')}
              </span>
              <span className="text-primary mt-1 block text-sm font-medium">
                {t('contracts.files.browse')}
              </span>
              <span className="text-muted-foreground mt-3 block text-xs">
                {t('contracts.files.rules')}
              </span>
            </span>
          </button>
        ) : (
          <div className="mt-5 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                <FileUp aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{file.name}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">{formatBytes(file.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={mutation.isPending}
                onClick={reset}
                aria-label={t('contracts.files.remove')}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            {duplicate && !duplicateConfirmed ? (
              <div className="bg-warning/10 mt-4 rounded-lg border border-warning/25 p-3 text-sm">
                <p className="font-medium">{t('contracts.files.duplicateTitle')}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('contracts.files.duplicateDescription', { name: file.name })}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setDuplicateConfirmed(true)}
                >
                  {t('contracts.files.uploadAnyway')}
                </Button>
              </div>
            ) : null}

            {mutation.isPending ? (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span>{t('contracts.files.uploading')}</span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
                <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(event) => choose(event.target.files?.item(0) ?? null)}
        />

        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!file || mutation.isPending || (duplicate && !duplicateConfirmed)}
            onClick={() => void upload()}
          >
            {mutation.isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {t('contracts.files.upload')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
