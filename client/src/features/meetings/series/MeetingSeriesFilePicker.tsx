import { FileText, Paperclip, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  formatMeetingAttachmentBytes,
  MEETING_ATTACHMENT_EXTENSIONS,
  MEETING_ATTACHMENT_MAX_COUNT,
  validateMeetingAttachmentFile,
} from '@/features/meetings/meeting-attachment-policy'

export interface MeetingSeriesDraftFile {
  id: string
  file: File
}

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `00000000-0000-4000-8000-${Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
}

export function MeetingSeriesFilePicker({
  files,
  maxCount = MEETING_ATTACHMENT_MAX_COUNT,
  title,
  description,
  onChange,
}: {
  files: MeetingSeriesDraftFile[]
  maxCount?: number
  title: string
  description: string
  onChange: (files: MeetingSeriesDraftFile[]) => void
}) {
  const { t } = useTranslation()
  const disabled = maxCount <= files.length

  function addFiles(input: FileList | null) {
    if (!input?.length) return
    const next = [...files]
    for (const file of Array.from(input)) {
      const validation = validateMeetingAttachmentFile(file)
      if (validation) {
        toast.error(t(validation === 'SIZE' ? 'meetings.files.errors.size' : 'meetings.files.errors.type'))
        continue
      }
      if (next.length >= maxCount) {
        toast.error(t('meetings.series.attachments.limit', { count: maxCount }))
        break
      }
      next.push({ id: createUuid(), file })
    }
    onChange(next)
  }

  return (
    <div className="rounded-xl border bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip aria-hidden="true" className="size-4" />
            {title}
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-5">{description}</p>
        </div>
        <label
          aria-disabled={disabled}
          className={`inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-semibold ${
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-primary/40'
          }`}
        >
          <Paperclip aria-hidden="true" className="size-3.5" />
          {t('meetings.series.attachments.addFiles')}
          <input
            className="sr-only"
            type="file"
            multiple
            disabled={disabled}
            accept={MEETING_ATTACHMENT_EXTENSIONS.join(',')}
            onChange={(event) => {
              addFiles(event.target.files)
              event.currentTarget.value = ''
            }}
          />
        </label>
      </div>

      {files.length > 0 ? (
        <div className="mt-3 space-y-2">
          {files.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
              <FileText aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{item.file.name}</p>
                <p className="text-muted-foreground text-[11px]">{formatMeetingAttachmentBytes(item.file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('common.delete')}
                onClick={() => onChange(files.filter((file) => file.id !== item.id))}
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
