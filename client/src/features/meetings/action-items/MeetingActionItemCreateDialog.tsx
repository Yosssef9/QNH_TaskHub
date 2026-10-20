import { LoaderCircle, Pencil, Plus } from 'lucide-react'
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
import { TagPicker } from '@/features/tasks/tags/TagPicker'
import { TaskAssigneeMultiPicker } from '@/features/tasks/assignment/TaskAssigneeMultiPicker'
import type { MeetingAgendaItem } from '@/features/meetings/types/meeting.types'
import { meetingMutationErrorMessage } from '@/features/meetings/meeting-edit-restrictions'

import type { MeetingActionItem, MeetingActionItemAssigneeOption } from './meeting-action-items.types'
import { useCreateMeetingActionItem, useUpdateMeetingActionItem } from './use-meeting-action-items'
import { newActionCreationRequestId } from './creation-request-id'

interface Props {
  meetingId: number
  item?: MeetingActionItem | null
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
  item = null,
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
  const updateMutation = useUpdateMeetingActionItem(meetingId, item?.taskId ?? 0)
  const pending = createMutation.isPending || updateMutation.isPending
  // Retain this ID through failed/uncertain requests; reset it only after
  // a successful submission or an explicit cancellation.
  const [requestId, setRequestId] = useState(() => newActionCreationRequestId())
  const [tags,setTags]=useState<number[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([])
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [agenda, setAgenda] = useState('NONE')

  const eligibleAssignees = useMemo(
    () => assignees.filter((item) => item.eligible),
    [assignees],
  )
  const hasNoEligibleAssignees = !assigneesLoading && eligibleAssignees.length === 0

  function resetForm() {
    setTags([])
    setTitle('')
    setDescription('')
    setSelectedAssignees([])
    setPriority('MEDIUM')
    setDueDate('')
    setStartDate('')
    setRequestId(newActionCreationRequestId())
    setAgenda('NONE')
  }

  useEffect(() => {
    if (!open) return
    if (item) {
      setTitle(item.title)
      setDescription(item.description ?? '')
      setPriority(item.priority)
      setDueDate(item.dueDate ?? '')
      setStartDate(item.startDate ?? '')
      setAgenda(item.agendaItemId === null ? 'NONE' : String(item.agendaItemId))
      setTags(item.tags?.map(tag => tag.id) ?? [])
      const ids = item.teamRoster?.filter(member => member.mainAssignee).map(member => member.userId) ?? []
      setSelectedAssignees(ids.length ? ids : [item.assigneeUserId])
    } else {
      setAgenda(initialAgendaItemId === null ? 'NONE' : String(initialAgendaItemId))
      setSelectedAssignees(initialAssigneeUserId === null ? [] : [initialAssigneeUserId])
    }
    // A new dialog instance is mounted for each edit/create session.
    // Do not reinitialize form values when the assignee query refetches.
  }, [open, item?.taskId, initialAgendaItemId, initialAssigneeUserId])

  function changeOpen(nextOpen: boolean) {
    if (pending) return
    onOpenChange(nextOpen)
    if (!nextOpen) resetForm()
  }

  function submitForm() {
    if (!title.trim() || !selectedAssignees.length || pending) return
    const fields = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      startDate: startDate || null,
      dueDate: dueDate || null,
      tagIds: tags,
      assigneeUserIds: selectedAssignees,
      agendaItemId: agenda === 'NONE' ? null : Number(agenda),
    }
    const callbacks = {
      onSuccess: () => {
        toast.success(t(item ? 'tasks.updated' : 'meetings.followUp.actionCreated'))
        onOpenChange(false)
        resetForm()
      },
      onError: (error: unknown) => toast.error(meetingMutationErrorMessage(t, error, t(item ? 'tasks.errors.save' : 'meetings.followUp.actionCreateError'))),
    }
    if (item) {
      updateMutation.mutate({ ...fields, rowVersion: item.rowVersion }, callbacks)
    } else {
      createMutation.mutate({
        ...fields,
        requestId,
        assigneeUserId: selectedAssignees[0]!,
      }, callbacks)
    }
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
            {item ? <Pencil aria-hidden="true" className="size-5" /> : <Plus aria-hidden="true" className="size-5" />}
          </div>
          <div className="min-w-0">
            <DialogTitle>{t(item ? 'tasks.editTitle' : 'meetings.followUp.newAction')}</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 max-w-lg text-sm leading-6">
              {t(item ? 'tasks.formDescription' : 'meetings.followUp.newActionDescription')}
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
            <TaskAssigneeMultiPicker
              value={selectedAssignees}
              onChange={setSelectedAssignees}
              meetingId={meetingId}
              knownUsers={eligibleAssignees}
              disabled={pending}
            />
            {hasNoEligibleAssignees ? (
              <p className="border-warning/25 bg-warning/10 text-warning-foreground rounded-lg border px-3 py-2 text-xs leading-5">
                {t('meetings.followUp.noEligibleAssigneesDescription')}
              </p>
            ) : null}
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('tasks.startDate')}</label>
              <DatePicker value={startDate} onChange={setStartDate} />
            </div>
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

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('tags.title')}</label>
        <TagPicker value={tags} onChange={setTags} disabled={pending}/>
      </div>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="outline" disabled={pending} onClick={() => changeOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={pending || !title.trim() || selectedAssignees.length === 0 || (eligibleAssignees.length === 0 && !item)}
              onClick={submitForm}
              aria-busy={pending}
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{t(item ? 'common.save' : 'meetings.followUp.createAction')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

