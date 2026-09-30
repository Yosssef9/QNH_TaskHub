import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  LockKeyhole,
  Plus,
  Search,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { MeetingActionItemCreateDialog } from '@/features/meetings/action-items/MeetingActionItemCreateDialog'
import type { MeetingActionItem } from '@/features/meetings/action-items/meeting-action-items.types'
import {
  useMeetingActionItemAssignees,
  useMeetingActionItems,
} from '@/features/meetings/action-items/use-meeting-action-items'
import {
  useBulkUpdateMeetingAttendance,
  useUpdateMeetingAttendance,
} from '@/features/meetings/hooks/use-meetings'
import type {
  MeetingAttendanceStatus,
  MeetingDetail,
  MeetingParticipant,
} from '@/features/meetings/types/meeting.types'
import { TaskDetailsDrawer } from '@/features/tasks/components/TaskDetailsDrawer'
import { TaskPriorityIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import { toApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'

const ALL = 'ALL'
type AttendanceFilter = typeof ALL | MeetingAttendanceStatus
type TaskFilter = 'ALL' | 'HAS_TASKS' | 'NO_TASKS' | 'OVERDUE'
type ParticipantSort = 'NAME' | 'TASKS' | 'OVERDUE'

function participantInitials(participant: MeetingParticipant): string {
  const parts = participant.userName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return participant.userCode.slice(0, 2).toUpperCase()
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function actionItemStats(items: readonly MeetingActionItem[]) {
  return {
    total: items.length,
    open: items.filter((item) => item.status === 'TODO' || item.status === 'IN_PROGRESS').length,
    done: items.filter((item) => item.status === 'DONE').length,
    cancelled: items.filter((item) => item.status === 'CANCELLED').length,
    overdue: items.filter((item) => item.isOverdue).length,
  }
}

function Metric({ label, value, icon: Icon, tone }: {
  label: string
  value: number | string
  icon: LucideIcon
  tone?: string
}) {
  return (
    <Card className="border-border/70 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        </div>
        <span className={cn('bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-xl', tone)}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
    </Card>
  )
}

function AttendanceValue({
  status,
  participantName,
  editable,
  disabled,
  onChange,
}: {
  status: MeetingAttendanceStatus | null
  participantName: string
  editable: boolean
  disabled: boolean
  onChange: (status: MeetingAttendanceStatus) => void
}) {
  const { t } = useTranslation()
  if (status === null) {
    return <span className="text-muted-foreground text-xs">{t('meetings.participantsWorkspace.notAttending')}</span>
  }
  if (!editable) {
    return (
      <Badge variant={status === 'ATTENDED' ? 'success' : status === 'ABSENT' ? 'destructive' : 'secondary'}>
        {t(`meetings.workspace.attendance.status.${status}`)}
      </Badge>
    )
  }
  return (
    <Select value={status} disabled={disabled} onValueChange={(value) => onChange(value as MeetingAttendanceStatus)}>
      <SelectTrigger className="w-36" aria-label={t('meetings.workspace.attendance.statusLabel', { name: participantName })}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="NOT_MARKED">{t('meetings.workspace.attendance.status.NOT_MARKED')}</SelectItem>
        <SelectItem value="ATTENDED">{t('meetings.workspace.attendance.status.ATTENDED')}</SelectItem>
        <SelectItem value="ABSENT">{t('meetings.workspace.attendance.status.ABSENT')}</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function MeetingParticipantsWorkspace({
  detail,
  meetingHasStarted,
  onOpenAllActionItems,
}: {
  detail: MeetingDetail
  meetingHasStarted: boolean
  onOpenAllActionItems: () => void
}) {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const meeting = detail.meeting
  const currentUserId = currentUser.data?.user.userId ?? null
  const isOrganizer = currentUserId === meeting.organizer.userId
  const actionItemsEnabled = meeting.status === 'SCHEDULED' || meeting.status === 'CANCELLED'
  const actionItems = useMeetingActionItems(meeting.id, actionItemsEnabled)
  const assignees = useMeetingActionItemAssignees(meeting.id, isOrganizer)
  const updateAttendance = useUpdateMeetingAttendance()
  const bulkUpdateAttendance = useBulkUpdateMeetingAttendance()

  const [search, setSearch] = useState('')
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('ALL')
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('ALL')
  const [sortBy, setSortBy] = useState<ParticipantSort>('NAME')
  const [taskListParticipantId, setTaskListParticipantId] = useState<number | null>(null)
  const [taskId, setTaskId] = useState<number | null>(null)
  const [createAssigneeUserId, setCreateAssigneeUserId] = useState<number | null>(null)

  const participants = useMemo(
    () => [meeting.organizer, ...meeting.attendees.filter((item) => item.userId !== meeting.organizer.userId)],
    [meeting.attendees, meeting.organizer],
  )
  const attendanceByUserId = useMemo(
    () => new Map(detail.attendance.map((item) => [item.participant.userId, item] as const)),
    [detail.attendance],
  )
  const attendanceCounts = useMemo(
    () => detail.attendance.reduce(
      (counts, item) => {
        counts[item.status] += 1
        return counts
      },
      { NOT_MARKED: 0, ATTENDED: 0, ABSENT: 0 } as Record<MeetingAttendanceStatus, number>,
    ),
    [detail.attendance],
  )
  const allItems = actionItems.data?.items ?? []
  const taskDataAvailable = !actionItemsEnabled || actionItems.data !== undefined
  const itemsByAssignee = useMemo(() => {
    const result = new Map<number, MeetingActionItem[]>()
    for (const item of allItems) {
      const current = result.get(item.assigneeUserId)
      if (current) current.push(item)
      else result.set(item.assigneeUserId, [item])
    }
    return result
  }, [allItems])
  const participantsWithTasks = useMemo(
    () => new Set(allItems.map((item) => item.assigneeUserId)).size,
    [allItems],
  )
  const assigneeByUserId = useMemo(
    () => new Map((assignees.data ?? []).map((item) => [item.userId, item] as const)),
    [assignees.data],
  )

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return participants
      .filter((participant) => {
        if (normalizedSearch) {
          const text = `${participant.userName} ${participant.userCode}`.toLocaleLowerCase()
          if (!text.includes(normalizedSearch)) return false
        }
        const attendance = attendanceByUserId.get(participant.userId) ?? null
        if (attendanceFilter !== 'ALL' && attendance?.status !== attendanceFilter) return false
        const stats = actionItemStats(itemsByAssignee.get(participant.userId) ?? [])
        if (taskDataAvailable) {
          if (taskFilter === 'HAS_TASKS' && stats.total === 0) return false
          if (taskFilter === 'NO_TASKS' && stats.total > 0) return false
          if (taskFilter === 'OVERDUE' && stats.overdue === 0) return false
        }
        return true
      })
      .sort((left, right) => {
        const leftStats = actionItemStats(itemsByAssignee.get(left.userId) ?? [])
        const rightStats = actionItemStats(itemsByAssignee.get(right.userId) ?? [])
        if (taskDataAvailable && sortBy === 'TASKS' && leftStats.total !== rightStats.total) return rightStats.total - leftStats.total
        if (taskDataAvailable && sortBy === 'OVERDUE' && leftStats.overdue !== rightStats.overdue) return rightStats.overdue - leftStats.overdue
        return left.userName.localeCompare(right.userName)
      })
  }, [attendanceByUserId, attendanceFilter, itemsByAssignee, participants, search, sortBy, taskDataAvailable, taskFilter])

  const selectedTaskParticipant = participants.find((item) => item.userId === taskListParticipantId) ?? null
  const selectedParticipantTasks = selectedTaskParticipant
    ? itemsByAssignee.get(selectedTaskParticipant.userId) ?? []
    : []
  const selectedCreateAssignee = createAssigneeUserId === null
    ? null
    : assigneeByUserId.get(createAssigneeUserId) ?? null
  const attendanceMutationPending = updateAttendance.isPending || bulkUpdateAttendance.isPending
  const canEditAttendance = detail.permissions.canManageAttendance && meetingHasStarted
  const canCreateActionItems = actionItems.data?.canCreate === true

  async function changeAttendance(participantUserId: number, status: MeetingAttendanceStatus) {
    try {
      await updateAttendance.mutateAsync({ meetingId: meeting.id, participantUserId, status })
      toast.success(t('meetings.workspace.attendance.updated'))
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(t(`meetings.errors.${apiError.code}`, { defaultValue: t('meetings.workspace.attendance.updateError') }))
    }
  }

  async function changeAllAttendance(status: 'ATTENDED' | 'NOT_MARKED') {
    try {
      await bulkUpdateAttendance.mutateAsync({ meetingId: meeting.id, status })
      toast.success(t(status === 'ATTENDED'
        ? 'meetings.workspace.attendance.markAllSuccess'
        : 'meetings.workspace.attendance.clearSuccess'))
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(t(`meetings.errors.${apiError.code}`, { defaultValue: t('meetings.workspace.attendance.updateError') }))
    }
  }

  function openParticipantTasks(userId: number) {
    setTaskListParticipantId(userId)
  }

  function openTaskDetails(nextTaskId: number) {
    setTaskListParticipantId(null)
    setTaskId(nextTaskId)
  }

  function openCreateFor(userId: number) {
    const option = assigneeByUserId.get(userId)
    if (!canCreateActionItems || !option?.eligible) return
    setCreateAssigneeUserId(userId)
  }

  const metricTaskValue = !actionItemsEnabled ? 0 : actionItems.isPending ? '…' : actionItems.isError ? '—' : allItems.length
  const metricAssignedValue = !actionItemsEnabled ? 0 : actionItems.isPending ? '…' : actionItems.isError ? '—' : participantsWithTasks

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
            <UsersRound aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold">{t('meetings.participantsWorkspace.title')}</h2>
            <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
              {t('meetings.participantsWorkspace.description')}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={onOpenAllActionItems}>
          <ClipboardCheck aria-hidden="true" className="size-4" />
          {t('meetings.participantsWorkspace.viewAllActionItems')}
          <ArrowRight aria-hidden="true" className={cn("size-4", i18n.language.startsWith('ar') && "rotate-180")} />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label={t('meetings.participantsWorkspace.summary.total')} value={meeting.participantCount} icon={UsersRound} />
        <Metric label={t('meetings.workspace.attendance.status.ATTENDED')} value={attendanceCounts.ATTENDED} icon={CheckCircle2} tone="bg-success/12 text-success-foreground" />
        <Metric label={t('meetings.workspace.attendance.status.ABSENT')} value={attendanceCounts.ABSENT} icon={AlertTriangle} tone="bg-destructive/10 text-destructive" />
        <Metric label={t('meetings.workspace.attendance.status.NOT_MARKED')} value={attendanceCounts.NOT_MARKED} icon={UserRound} />
        <Metric label={t('meetings.participantsWorkspace.summary.actionItems')} value={metricTaskValue} icon={ListChecks} tone="bg-primary/10 text-primary" />
        <Metric label={t('meetings.participantsWorkspace.summary.withTasks')} value={metricAssignedValue} icon={ClipboardCheck} tone="bg-info/12 text-info-foreground" />
      </div>

      <Card className="border-border/70 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1.4fr)_minmax(10rem,0.7fr)_minmax(10rem,0.7fr)_minmax(10rem,0.7fr)]">
            <div className="relative">
              <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
              <Input
                className="ps-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('meetings.participantsWorkspace.searchPlaceholder')}
                aria-label={t('meetings.participantsWorkspace.searchLabel')}
              />
            </div>
            <Select value={attendanceFilter} onValueChange={(value) => setAttendanceFilter(value as AttendanceFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('meetings.participantsWorkspace.filters.allAttendance')}</SelectItem>
                <SelectItem value="ATTENDED">{t('meetings.workspace.attendance.status.ATTENDED')}</SelectItem>
                <SelectItem value="ABSENT">{t('meetings.workspace.attendance.status.ABSENT')}</SelectItem>
                <SelectItem value="NOT_MARKED">{t('meetings.workspace.attendance.status.NOT_MARKED')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={taskFilter} onValueChange={(value) => setTaskFilter(value as TaskFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('meetings.participantsWorkspace.filters.allTasks')}</SelectItem>
                <SelectItem value="HAS_TASKS">{t('meetings.participantsWorkspace.filters.hasTasks')}</SelectItem>
                <SelectItem value="NO_TASKS">{t('meetings.participantsWorkspace.filters.noTasks')}</SelectItem>
                <SelectItem value="OVERDUE">{t('meetings.participantsWorkspace.filters.overdueTasks')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as ParticipantSort)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NAME">{t('meetings.participantsWorkspace.sort.name')}</SelectItem>
                <SelectItem value="TASKS">{t('meetings.participantsWorkspace.sort.tasks')}</SelectItem>
                <SelectItem value="OVERDUE">{t('meetings.participantsWorkspace.sort.overdue')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {detail.permissions.canManageAttendance && meetingHasStarted && detail.attendance.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={attendanceMutationPending} onClick={() => void changeAllAttendance('ATTENDED')}>
                {t('meetings.workspace.attendance.markAll')}
              </Button>
              <Button size="sm" variant="ghost" disabled={attendanceMutationPending} onClick={() => void changeAllAttendance('NOT_MARKED')}>
                {t('meetings.workspace.attendance.clear')}
              </Button>
            </div>
          ) : null}
        </div>

        {isOrganizer && !meetingHasStarted && meeting.status === 'SCHEDULED' ? (
          <div className="bg-muted/25 text-muted-foreground mt-4 rounded-xl border border-dashed px-3.5 py-3 text-xs leading-5">
            {t('meetings.workspace.attendance.availableAtStart')}
          </div>
        ) : null}

        {actionItemsEnabled && actionItems.isError ? (
          <div className="border-warning/25 bg-warning/10 text-warning-foreground mt-4 rounded-xl border px-4 py-3 text-sm">
            {t('meetings.participantsWorkspace.taskLoadError')}
          </div>
        ) : null}
        {isOrganizer && assignees.isError ? (
          <div className="border-warning/25 bg-warning/10 text-warning-foreground mt-4 rounded-xl border px-4 py-3 text-sm">
            {t('meetings.participantsWorkspace.eligibilityLoadError')}
          </div>
        ) : null}

        <div className="mt-5 hidden max-h-[65vh] overflow-auto rounded-xl border md:block">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead className="bg-muted/80 sticky top-0 z-10 backdrop-blur">
              <tr className="text-muted-foreground border-b text-start text-xs font-semibold">
                <th className="px-4 py-3 text-start">{t('meetings.participantsWorkspace.columns.participant')}</th>
                <th className="px-4 py-3 text-start">{t('meetings.participantsWorkspace.columns.role')}</th>
                <th className="px-4 py-3 text-start">{t('meetings.participantsWorkspace.columns.attendance')}</th>
                <th className="px-4 py-3 text-start">{t('meetings.participantsWorkspace.columns.actionItems')}</th>
                <th className="px-4 py-3 text-end">{t('meetings.participantsWorkspace.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((participant) => {
                const organizer = participant.userId === meeting.organizer.userId
                const attendance = attendanceByUserId.get(participant.userId) ?? null
                const items = itemsByAssignee.get(participant.userId) ?? []
                const stats = actionItemStats(items)
                const assigneeOption = assigneeByUserId.get(participant.userId) ?? null
                return (
                  <tr key={participant.userId} className="border-b border-border/70 last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold">
                          {participantInitials(participant)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold [overflow-wrap:anywhere]" dir="auto">{participant.userName}</p>
                          <p className="text-muted-foreground mt-0.5 text-xs"><bdi>{participant.userCode}</bdi></p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={organizer ? 'default' : 'secondary'}>
                        {organizer ? t('meetings.organizer') : t('meetings.participantsWorkspace.attendee')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <AttendanceValue
                        status={attendance?.status ?? null}
                        participantName={participant.userName}
                        editable={canEditAttendance && attendance !== null}
                        disabled={attendanceMutationPending}
                        onChange={(status) => void changeAttendance(participant.userId, status)}
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      {actionItemsEnabled && actionItems.isPending ? (
                        <span className="text-muted-foreground text-xs">{t('common.loading')}</span>
                      ) : actionItemsEnabled && actionItems.isError ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : stats.total > 0 ? (
                        <button type="button" className="group text-start" onClick={() => openParticipantTasks(participant.userId)}>
                          <span className="text-primary block font-semibold group-hover:underline">
                            {t('meetings.participantsWorkspace.taskCount', { count: stats.total })}
                          </span>
                          <span className="text-muted-foreground mt-0.5 block text-xs">
                            {t('meetings.participantsWorkspace.taskBreakdown', { open: stats.open, done: stats.done })}
                            {stats.cancelled > 0 ? ` · ${t('meetings.participantsWorkspace.cancelledCount', { count: stats.cancelled })}` : ''}
                            {stats.overdue > 0 ? ` · ${t('meetings.participantsWorkspace.overdueCount', { count: stats.overdue })}` : ''}
                          </span>
                          <span className="text-primary mt-1 block text-xs font-semibold group-hover:underline">
                            {t('meetings.participantsWorkspace.viewTasks')}
                          </span>
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">{t('meetings.participantsWorkspace.noTasks')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-end">
                      {organizer ? (
                        <span className="text-muted-foreground text-xs">{t('meetings.participantsWorkspace.organizerTaskOwner')}</span>
                      ) : isOrganizer && assignees.isPending ? (
                        <span className="text-muted-foreground text-xs">{t('common.loading')}</span>
                      ) : isOrganizer && assignees.isError ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : isOrganizer && !assigneeOption?.eligible ? (
                        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs" title={t('meetings.participantsWorkspace.taskHubAccessRequired')}>
                          <LockKeyhole aria-hidden="true" className="size-3.5" />
                          {t('meetings.participantsWorkspace.assignmentUnavailable')}
                        </span>
                      ) : canCreateActionItems && assigneeOption?.eligible ? (
                        <Button size="sm" variant="outline" onClick={() => openCreateFor(participant.userId)}>
                          <Plus aria-hidden="true" className="size-4" />
                          {t('meetings.participantsWorkspace.addTask')}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 space-y-3 md:hidden">
          {rows.map((participant) => {
            const organizer = participant.userId === meeting.organizer.userId
            const attendance = attendanceByUserId.get(participant.userId) ?? null
            const items = itemsByAssignee.get(participant.userId) ?? []
            const stats = actionItemStats(items)
            const assigneeOption = assigneeByUserId.get(participant.userId) ?? null
            return (
              <div key={participant.userId} className="rounded-xl border border-border/70 p-4">
                <div className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold">
                    {participantInitials(participant)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold [overflow-wrap:anywhere]" dir="auto">{participant.userName}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs"><bdi>{participant.userCode}</bdi></p>
                  </div>
                  <Badge variant={organizer ? 'default' : 'secondary'}>
                    {organizer ? t('meetings.organizer') : t('meetings.participantsWorkspace.attendee')}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground mb-1.5 text-xs font-medium">{t('meetings.participantsWorkspace.columns.attendance')}</p>
                    <AttendanceValue
                      status={attendance?.status ?? null}
                      participantName={participant.userName}
                      editable={canEditAttendance && attendance !== null}
                      disabled={attendanceMutationPending}
                      onChange={(status) => void changeAttendance(participant.userId, status)}
                    />
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1.5 text-xs font-medium">{t('meetings.participantsWorkspace.columns.actionItems')}</p>
                    {actionItemsEnabled && actionItems.isPending ? (
                      <span className="text-muted-foreground text-xs">{t('common.loading')}</span>
                    ) : actionItemsEnabled && actionItems.isError ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : stats.total > 0 ? (
                      <button type="button" className="text-primary text-start text-sm font-semibold hover:underline" onClick={() => openParticipantTasks(participant.userId)}>
                        {t('meetings.participantsWorkspace.taskCount', { count: stats.total })}
                        {stats.cancelled > 0 ? ` · ${t('meetings.participantsWorkspace.cancelledCount', { count: stats.cancelled })}` : ''}
                        {stats.overdue > 0 ? ` · ${t('meetings.participantsWorkspace.overdueCount', { count: stats.overdue })}` : ''}
                        <span className="mt-1 block text-xs">{t('meetings.participantsWorkspace.viewTasks')}</span>
                      </button>
                    ) : <span className="text-muted-foreground text-xs">{t('meetings.participantsWorkspace.noTasks')}</span>}
                  </div>
                </div>
                {!organizer && canCreateActionItems && assigneeOption?.eligible ? (
                  <Button className="mt-4 w-full" size="sm" variant="outline" onClick={() => openCreateFor(participant.userId)}>
                    <Plus aria-hidden="true" className="size-4" />
                    {t('meetings.participantsWorkspace.addTask')}
                  </Button>
                ) : !organizer && isOrganizer && !assignees.isPending && !assignees.isError && !assigneeOption?.eligible ? (
                  <p className="text-muted-foreground mt-4 inline-flex items-center gap-1.5 text-xs">
                    <LockKeyhole aria-hidden="true" className="size-3.5" />
                    {t('meetings.participantsWorkspace.assignmentUnavailable')} · {t('meetings.participantsWorkspace.taskHubAccessRequired')}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>

        {rows.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed px-4 py-10 text-center">
            <UsersRound aria-hidden="true" className="text-muted-foreground mx-auto size-7" />
            <p className="mt-3 font-semibold">{t('meetings.participantsWorkspace.noMatches')}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t('meetings.participantsWorkspace.noMatchesDescription')}</p>
          </div>
        ) : null}
      </Card>

      <Dialog open={selectedTaskParticipant !== null} onOpenChange={(open) => !open && setTaskListParticipantId(null)}>
        <DialogContent variant="modal" closeLabel={t('common.close')} className="w-[min(42rem,calc(100vw-2rem))] max-w-none">
          <div className="flex items-start gap-3 pe-10">
            <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
              <ClipboardCheck aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{t('meetings.participantsWorkspace.tasksTitle', { name: selectedTaskParticipant?.userName ?? '' })}</DialogTitle>
              <DialogDescription className="mt-1">
                {t('meetings.participantsWorkspace.tasksDescription')}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-5 max-h-[60vh] space-y-2 overflow-y-auto pe-1">
            {selectedParticipantTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {t('meetings.participantsWorkspace.noTasks')}
              </div>
            ) : selectedParticipantTasks.map((item) => (
              <button
                key={item.taskId}
                type="button"
                className="hover:bg-muted/35 focus-visible:ring-ring w-full rounded-xl border border-border/70 p-3.5 text-start outline-none transition-colors focus-visible:ring-2"
                onClick={() => openTaskDetails(item.taskId)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold [overflow-wrap:anywhere]">{item.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <TaskStatusIndicator status={item.status} pill />
                      <TaskPriorityIndicator priority={item.priority} pill />
                      {item.isOverdue ? (
                        <Badge variant="destructive">{t('tasks.dueFilters.OVERDUE')}</Badge>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-primary text-xs font-semibold">{t('meetings.participantsWorkspace.openTaskDetails')}</span>
                </div>
              </button>
            ))}
          </div>

          {selectedTaskParticipant && canCreateActionItems && assigneeByUserId.get(selectedTaskParticipant.userId)?.eligible ? (
            <div className="mt-4 flex justify-end border-t pt-4">
              <Button onClick={() => {
                const userId = selectedTaskParticipant.userId
                setTaskListParticipantId(null)
                openCreateFor(userId)
              }}>
                <Plus aria-hidden="true" className="size-4" />
                {t('meetings.participantsWorkspace.addTask')}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <MeetingActionItemCreateDialog
        meetingId={meeting.id}
        agendaItems={detail.agendaItems}
        assignees={assignees.data ?? []}
        assigneesLoading={assignees.isPending}
        open={createAssigneeUserId !== null}
        onOpenChange={(open) => { if (!open) setCreateAssigneeUserId(null) }}
        initialAssigneeUserId={selectedCreateAssignee?.userId ?? null}
      />

      <TaskDetailsDrawer taskId={taskId} onOpenChange={(open) => !open && setTaskId(null)} />
    </div>
  )
}
