import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/** Author-only controls. Server independently validates authorship and assignment access. */
export function WorkNoteEntryActions({ content, editVersion, disabled, onEdit, onDelete,
  labelsPrefix='tasks.workNoteActions', maxLength=4000 }: {
  content: string
  editVersion: number
  disabled: boolean
  labelsPrefix?: 'tasks.workNoteActions' | 'tasks.summaryActions'
  maxLength?: number
  onEdit: (text: string, version: number, done: () => void) => void
  onDelete: (version: number, done: () => void) => void
}) {
  const { t } = useTranslation()
  const [action, setAction] = useState<'EDIT' | 'DELETE' | null>(null)
  const [draft, setDraft] = useState(content)
  const edited = draft.trim()
  return <>
    <div className="flex shrink-0 items-center gap-1">
      <Button type="button" variant="ghost" size="icon" className="size-8"
        disabled={disabled} aria-label={t(`${labelsPrefix}.edit`)}
        onClick={() => { setDraft(content); setAction('EDIT') }}>
        <Pencil className="size-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="text-destructive size-8"
        disabled={disabled} aria-label={t(`${labelsPrefix}.delete`)}
        onClick={() => setAction('DELETE')}>
        <Trash2 className="size-4" />
      </Button>
    </div>
    <ConfirmModal open={action !== null} danger={action === 'DELETE'}
      title={t(action === 'EDIT' ? `${labelsPrefix}.editTitle` : `${labelsPrefix}.deleteTitle`)}
      message={t(action === 'EDIT' ? `${labelsPrefix}.editConfirm` : `${labelsPrefix}.deleteConfirm`)}
      confirmText={t(action === 'EDIT' ? `${labelsPrefix}.saveEdit` : `${labelsPrefix}.delete`)}
      cancelText={t('common.cancel')} loading={disabled}
      confirmDisabled={action === 'EDIT' && (!edited || edited === content)}
      onCancel={() => setAction(null)}
      onConfirm={() => {
        const done = () => { setAction(null); toast.success(t(action === 'DELETE' ? `${labelsPrefix}.deleted` : `${labelsPrefix}.saved`)) }
        if (action === 'EDIT') onEdit(edited, editVersion, done)
        else if (action === 'DELETE') onDelete(editVersion, done)
      }}>
      {action === 'EDIT' ? <Textarea rows={4} value={draft} maxLength={maxLength}
        aria-label={t(`${labelsPrefix}.edit`)}
        disabled={disabled} onChange={event => setDraft(event.target.value)} /> : null}
    </ConfirmModal>
  </>
}
