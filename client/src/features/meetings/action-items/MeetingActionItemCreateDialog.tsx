import { Plus, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TaskPriorityIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import type { MeetingAgendaItem } from '@/features/meetings/types/meeting.types'

import type { MeetingActionItemAssigneeOption } from './meeting-action-items.types'
import { useCreateMeetingActionItem } from './use-meeting-action-items'

interface Props {
  meetingId: number
  agendaItems: readonly MeetingAgendaItem[]
  assignees: readonly MeetingActionItemAssigneeOption[]
  assigneesLoading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  initialAssigneeUserId?: number | null
  initialAgendaItemId?: number | null
}

export function MeetingActionItemCreateDialog({
  meetingId,
  agendaItems,
  assignees,
  assigneesLoading,
  open,
  onOpenChange,
  initialAssigneeUserId = null,
  initialAgendaItemId = null,
}: Props) {
  const { t } = useTranslation()
  const createMutation = useCreateMeetingActionItem(meetingId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [agenda, setAgenda] = useState('NONE')

  const eligibleAssignees = useMemo(
    () => assignees.filter((item) => item.eligible),
    [assignees],
  )
  const selectedAssignee = useMemo(
    () => assignees.find((item) => String(item.userId) === assignee) ?? null,
    [assignee, assignees],
  )
  const hasNoEligibleAssignees = !assigneesLoading && eligibleAssignees.length === 0

  function resetForm() {
    setTitle('')
    setDescription('')
    setAssignee('')
    setPriority('MEDIUM')
    setDueDate('')
    setAgenda('NONE')
  }

  useEffect(() => {
    if (!open) return
    const initialAssignee = initialAssigneeUserId === null
      ? null
      : assignees.find((item) => item.userId === initialAssigneeUserId && item.eligible) ?? null
    setAssignee(initialAssignee ? String(initialAssignee.userId) : '')
    setAgenda(initialAgendaItemId === null ? 'NONE' : String(initialAgendaItemId))
  }, [assignees, initialAgendaItemId, initialAssigneeUserId, open])

  function changeOpen(nextOpen: boolean) {
    if (createMutation.isPending) return
    onOpenChange(nextOpen)
    if (!nextOpen) resetForm()
  }

  function submitCreate() {
    if (!title.trim() || !assignee) return
    createMutation.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate || null,
        assigneeUserId: Number(assignee),
        agendaItemId: agenda === 'NONE' ? null : Number(agenda),
      },
      {
        onSuccess: () => {
          toast.success(t('meetings.followUp.actionCreated'))
          onOpenChange(false)
          resetForm()
        },
        onError: () => toast.error(t('meetings.followUp.actionCreateError')),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="w-[min(38rem,calc(100vw-2rem))] max-w-none"
      >
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
            <Plus aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle>{t('meetings.followUp.newAction')}</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 max-w-lg text-sm leading-6">
              {t('meetings.followUp.newActionDescription')}
            </DialogDescription>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="meeting-action-title" className="text-sm font-medium">
              {t('meetings.followUp.taskTitle')}
              <span className="text-destructive ms-1" aria-hidden="true">*</span>
            </label>
            <Input
              id="meeting-action-title"
              autoFocus
              maxLength={1000}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('meetings.followUp.assignTo')}
              <span className="text-destructive ms-1" aria-hidden="true">*</span>
            </label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder={t('meetings.followUp.assignTo')}>
                  {selectedAssignee ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-full">
                        <UserRound aria-hidden="true" className="size-3.5" />
                      </span>
                      <span className="truncate">{selectedAssignee.userName}</span>
                    </span>
                  ) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {assigneesLoading ? (
                  <SelectItem value="__LOADING__" disabled>{t('common.loading')}</SelectItem>
                ) : assignees.length ? (
                  assignees.map((option) => (
                    <SelectItem
                      key={option.userId}
                      value={String(option.userId)}
                      textValue={option.userName}
                      disabled={!option.eligible}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-full">
                          <UserRound aria-hidden="true" className="size-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate">{option.userName}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {option.userCode}
                            {!option.eligible ? ` · ${t('meetings.followUp.noTaskHubAccess')}` : ''}
                          </span>
                        </span>
                      </span>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__EMPTY__" disabled>
                    {t('meetings.followUp.noEligibleAssignees')}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {hasNoEligibleAssignees ? (
              <p className="border-warning/25 bg-warning/10 text-warning-foreground rounded-lg border px-3 py-2 text-xs leading-5">
                {t('meetings.followUp.noEligibleAssigneesDescription')}
              </p>
            ) : null}
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('tasks.priority')}</label>
              <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
                <SelectTrigger className="h-12">
                  <SelectValue><TaskPriorityIndicator priority={priority} pill /></SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW" textValue={t('tasks.priorities.LOW')}>
                    <TaskPriorityIndicator priority="LOW" />
                  </SelectItem>
                  <SelectItem value="MEDIUM" textValue={t('tasks.priorities.MEDIUM')}>
                    <TaskPriorityIndicator priority="MEDIUM" />
                  </SelectItem>
                  <SelectItem value="HIGH" textValue={t('tasks.priorities.HIGH')}>
                    <TaskPriorityIndicator priority="HIGH" />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t('tasks.dueDate')}
                <span className="text-muted-foreground ms-1 text-xs font-normal">
                  · {t('meetings.followUp.optional')}
                </span>
              </label>
              <DatePicker value={dueDate} onChange={setDueDate} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('meetings.followUp.relatedAgenda')}
              <span className="text-muted-foreground ms-1 text-xs font-normal">
                · {t('meetings.followUp.optional')}
              </span>
            </label>
            <Select value={agenda} onValueChange={setAgenda}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder={t('meetings.followUp.relatedAgenda')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">{t('common.none')}</SelectItem>
                {agendaItems.length === 0 ? (
                  <SelectItem value="__NO_AGENDA__" disabled>
                    {t('meetings.followUp.noAgendaTopics')}
                  </SelectItem>
                ) : (
                  agendaItems.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>{item.topic}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="meeting-action-description" className="text-sm font-medium">
              {t('meetings.followUp.description')}
              <span className="text-muted-foreground ms-1 text-xs font-normal">
                · {t('meetings.followUp.optional')}
              </span>
            </label>
            <Textarea
              id="meeting-action-description"
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="outline" disabled={createMutation.isPending} onClick={() => changeOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={createMutation.isPending || !title.trim() || !assignee || eligibleAssignees.length === 0}
              onClick={submitCreate}
            >
              {t('meetings.followUp.createAction')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
