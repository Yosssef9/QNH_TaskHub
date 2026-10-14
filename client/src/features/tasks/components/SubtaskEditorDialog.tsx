import { Loader2, Plus, Save, UsersRound } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { TaskAssigneeMultiPicker } from '../assignment/TaskAssigneeMultiPicker'
import { TaskAssigneePicker } from '../assignment/TaskAssigneePicker'
import { useCreateSubtask, useUpdateSubtask } from '../hooks/use-tasks'
import { TASK_PRIORITIES } from '../types/task.types'
import type { Subtask, TaskPriority } from '../types/task.types'
import { TaskPriorityIndicator } from './TaskSelectIndicators'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: number
  subtask: Subtask | null
  parentPriority: TaskPriority
  dueDateRequired?: boolean
  generalAssignmentEnabled?: boolean
  collaborationActive?: boolean
  meetingId?: number | null
}

export function SubtaskEditorDialog({
  open,
  onOpenChange,
  taskId,
  subtask,
  parentPriority,
  dueDateRequired = false,
  generalAssignmentEnabled = false,
  collaborationActive = false,
  meetingId = null,
}: Props) {
  const { t } = useTranslation()
  // The parent mounts this dialog with a fresh key for every create/edit session.
  const [title, setTitle] = useState(subtask?.title ?? '')
  const [description, setDescription] = useState(subtask?.description ?? '')
  const [priority, setPriority] = useState<TaskPriority>(subtask?.priority ?? parentPriority)
  const [dueDate, setDueDate] = useState<string | null>(subtask?.dueDate ?? null)
  const [assigneeUserId, setAssigneeUserId] = useState<number | null>(null)
  const [assignmentMode, setAssignmentMode] = useState<'INHERIT' | 'CUSTOM'>('INHERIT')
  const [assigneeUserIds, setAssigneeUserIds] = useState<number[]>([])
  const [dueDateError, setDueDateError] = useState('')
  const createMutation = useCreateSubtask()
  const updateMutation = useUpdateSubtask()
  const pending = createMutation.isPending || updateMutation.isPending
  const customTeamIsEmpty = !subtask && collaborationActive && assignmentMode === 'CUSTOM' && !assigneeUserIds.length

  function save() {
    const cleanTitle = title.trim()
    if (!cleanTitle || pending || customTeamIsEmpty) return
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
    const fields = { title: cleanTitle, description: description.trim() || null, priority, dueDate }
    if (subtask) {
      updateMutation.mutate({ subtaskId: subtask.id, ...fields }, options)
      return
    }
    createMutation.mutate({
      taskId,
      ...fields,
      ...(collaborationActive ? {
        assignmentMode,
        ...(assignmentMode === 'CUSTOM' ? { assigneeUserIds } : {}),
      } : generalAssignmentEnabled && assigneeUserId !== null ? { assigneeUserId } : {}),
    }, options)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent variant="modal" closeLabel={t('common.close')} className="max-h-[min(90vh,850px)] overflow-y-auto sm:max-w-[600px]">
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
            {subtask ? <Save className="size-5" /> : <Plus className="size-5" />}
          </div>
          <div>
            <DialogTitle>{t(subtask ? 'tasks.details.editSubtaskTitle' : 'tasks.details.createSubtaskTitle')}</DialogTitle>
            <DialogDescription className="mt-1">
              {t(dueDateRequired ? 'tasks.details.subtaskDueDateRequiredDescription' : 'tasks.details.subtaskFormDescription')}
            </DialogDescription>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="subtask-title" className="text-sm font-medium">{t('tasks.details.subtaskTitle')} *</label>
            <Input id="subtask-title" autoFocus maxLength={1000} value={title}
              onChange={(event) => setTitle(event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="subtask-description" className="text-sm font-medium">{t('tasks.workspace.description')}</label>
            <Textarea id="subtask-description" rows={3} maxLength={4000} value={description}
              placeholder={t('tasks.details.subtaskDescriptionPlaceholder')}
              onChange={(event) => setDescription(event.target.value)} />
            <p className="text-muted-foreground text-xs">{t('tasks.details.subtaskDescriptionOptional')}</p>
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="subtask-priority" className="block text-sm font-medium">{t('tasks.priority')}</label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                <SelectTrigger id="subtask-priority" className="h-12"><SelectValue><TaskPriorityIndicator priority={priority} /></SelectValue></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((value) => <SelectItem key={value} value={value}>
                    <TaskPriorityIndicator priority={value} />
                  </SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DatePicker required={dueDateRequired} label={t('tasks.dueDate')} labelPlacement="above" value={dueDate}
              error={dueDateError || undefined}
              onChange={(value) => { setDueDate(value || null); setDueDateError('') }} />
          </div>

          {!subtask && collaborationActive ? (
            <fieldset className="space-y-3 rounded-xl border p-4">
              <legend className="px-2 text-sm font-semibold"><UsersRound className="me-2 inline size-4" />{t('tasks.workspace.assignmentMethod')}</legend>
              <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${assignmentMode === 'INHERIT' ? 'border-primary bg-primary/5' : ''}`}>
                <input type="radio" name="new-subtask-team-mode" checked={assignmentMode === 'INHERIT'}
                  onChange={() => setAssignmentMode('INHERIT')} />
                <span><span className="block text-sm font-semibold">{t('tasks.workspace.inheritTeam')}</span>
                  <span className="text-muted-foreground text-xs">{t('tasks.workspace.inheritHelp')}</span></span>
              </label>
              <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${assignmentMode === 'CUSTOM' ? 'border-primary bg-primary/5' : ''}`}>
                <input type="radio" name="new-subtask-team-mode" checked={assignmentMode === 'CUSTOM'}
                  onChange={() => setAssignmentMode('CUSTOM')} />
                <span><span className="block text-sm font-semibold">{t('tasks.workspace.customTeam')}</span>
                  <span className="text-muted-foreground text-xs">{t('tasks.workspace.customHelp')}</span></span>
              </label>
              {assignmentMode === 'CUSTOM' && <div className="space-y-2">
                <TaskAssigneeMultiPicker value={assigneeUserIds} onChange={setAssigneeUserIds} meetingId={meetingId} disabled={pending} />
                <p className={customTeamIsEmpty ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
                  {customTeamIsEmpty ? t('tasks.details.subtaskTeamRequired') : t('tasks.workspace.selectedCount', { count: assigneeUserIds.length })}
                </p>
              </div>}
            </fieldset>
          ) : null}

          {!subtask && !collaborationActive && generalAssignmentEnabled ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('tasks.assignment.assignSubtask')}</label>
              <TaskAssigneePicker value={assigneeUserId} onChange={setAssigneeUserId} inherit meetingId={meetingId} />
            </div>
          ) : null}
        </div>

        <div className="mt-7 flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={!title.trim() || pending || customTeamIsEmpty} onClick={save}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
