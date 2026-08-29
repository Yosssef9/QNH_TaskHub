import { Loader2, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import { useCreateSubtask, useUpdateSubtask } from '../hooks/use-tasks'
import type { Subtask } from '../types/task.types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: number
  subtask: Subtask | null
  dueDateRequired?: boolean
}

export function SubtaskEditorDialog({
  open,
  onOpenChange,
  taskId,
  subtask,
  dueDateRequired = false,
}: Props) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(subtask?.title ?? '')
  const [dueDate, setDueDate] = useState<string | null>(subtask?.dueDate ?? null)
  const [dueDateError, setDueDateError] = useState('')
  const createMutation = useCreateSubtask()
  const updateMutation = useUpdateSubtask()
  const pending = createMutation.isPending || updateMutation.isPending

  function save() {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    if (dueDateRequired && !dueDate) {
      setDueDateError(t('tasks.details.errors.subtaskDueDateRequired'))
      return
    }
    const options = {
      onSuccess: () => {
        toast.success(t(subtask ? 'tasks.details.subtaskUpdated' : 'tasks.details.subtaskCreated'))
        onOpenChange(false)
      },
      onError: () => toast.error(t('tasks.details.errors.subtask')),
    }
    if (subtask) {
      updateMutation.mutate({ subtaskId: subtask.id, title: cleanTitle, dueDate }, options)
    } else {
      createMutation.mutate({ taskId, title: cleanTitle, dueDate }, options)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
            {subtask ? <Save className="size-5" /> : <Plus className="size-5" />}
          </div>
          <div>
            <DialogTitle>
              {t(subtask ? 'tasks.details.editSubtaskTitle' : 'tasks.details.createSubtaskTitle')}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {t(
                dueDateRequired
                  ? 'tasks.details.subtaskDueDateRequiredDescription'
                  : 'tasks.details.subtaskFormDescription',
              )}
            </DialogDescription>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="subtask-title" className="text-sm font-medium">
              {t('tasks.details.subtaskTitle')}
            </label>
            <Input
              id="subtask-title"
              autoFocus
              maxLength={250}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && save()}
            />
          </div>
          <DatePicker
            required={dueDateRequired}
            label={t('tasks.dueDate')}
            value={dueDate}
            error={dueDateError || undefined}
            onChange={(value) => {
              setDueDate(value || null)
              setDueDateError('')
            }}
          />
        </div>
        <div className="mt-7 flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!title.trim() || pending} onClick={save}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

