import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Download, Eye, FileUp, LockKeyhole, Pencil, Plus, RotateCcw, Trash2, UsersRound } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'
import { AttachmentPreviewDialog } from '@/components/shared/AttachmentPreviewDialog'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { attachmentPreviewKind } from '@/components/shared/attachment-preview'

import type { EligibleTaskUser } from './general-assignment.api'
import type { TaskPriority } from '../types/task.types'
import { TaskPriorityIndicator } from '../components/TaskSelectIndicators'
import { TaskAssigneeMultiPicker } from './TaskAssigneeMultiPicker'
import { collaborativeApi, type CollaborativeFile, type CollaborativeMember, type CollaborativeView } from './collaboration.api'
import { useCollaborativeAssignments } from './use-collaboration'
import { collaborativeScopeProgress, myCollaborativeAssignment, visibleCollaborativeSubmissions } from './collaborative-workspace.policy'

type Child = { id: number; title: string; description: string | null; priority: TaskPriority; dueDate: string | null; isCompleted: boolean }
type Tab = 'overview' | 'subtasks' | 'team' | 'activity' | 'discussion'
interface Props {
  taskId: number
  actorId: number | null
  ownerId: number | null
  meetingId: number | null
  children: Child[]
  enabled: boolean
  description: string | null
  overviewContent?: ReactNode
  activityContent?: ReactNode
  discussionContent?: ReactNode
  discussionUnread?: number
  canManageSubtasks: boolean
  onAddSubtask: () => void
  onEditSubtask: (childId: number) => void
  onDeleteSubtask: (childId: number) => void
  onReorderSubtasks: (ids: number[]) => void
  reorderPending: boolean
  subtaskContent?: (subtaskId: number) => ReactNode
  focusSubtaskId?: number | null
}

const activeIds = (rows: CollaborativeMember[]) => [...new Set(rows.filter(row => row.isActive).map(row => row.userId))]

function Status({ row }: { row: CollaborativeMember }) {
  const { t } = useTranslation()
  return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
    !row.isActive ? 'bg-muted text-muted-foreground' : row.state === 'DONE' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary')}>
    {!row.isActive ? t('tasks.workspace.removed') : row.state === 'DONE' ? t('tasks.collaboration.done') : row.state === 'IN_PROGRESS' ? t('tasks.collaboration.inProgress') : t('tasks.collaboration.todo')}
  </span>
}

function Progress({ total, completed, label }: { total: number; completed: number; label: string }) {
  const percentage = total ? Math.round(completed / total * 100) : 0
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums" dir="ltr">{completed} / {total}</span>
    </div>
    <div className="bg-muted h-2 overflow-hidden rounded-full" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}>
      <div className="bg-primary h-full rounded-full transition-[width]" style={{ width: `${percentage}%` }} />
    </div>
  </div>
}

function Submission({ row, view, actorId, owner, actions }: {
  row: CollaborativeMember
  view: CollaborativeView
  actorId: number | null
  owner: boolean
  actions: ReturnType<typeof useCollaborativeAssignments>
}) {
  const { t, i18n } = useTranslation()
  const [note, setNote] = useState('')
  const [previewFile, setPreviewFile] = useState<CollaborativeFile | null>(null)
  const [deleteFile, setDeleteFile] = useState<CollaborativeFile | null>(null)
  const mine = actorId === row.userId
  const updates = view.notes.filter(item => item.assignmentId === row.id)
  const files = view.files.filter(file => file.assignmentId === row.id)
  const canReopen = row.isActive && (mine || owner) && row.state === 'DONE'
  const dateTime = (value: string) => new Date(value).toLocaleString(i18n.language)
  return <div className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">{row.userName}</p>
        <p className="text-muted-foreground text-xs">{t('tasks.assignment.userCodeLabel', { code: row.userCode })}</p>
        {row.email ? <p className="text-muted-foreground break-all text-xs" dir="ltr">{row.email}</p> : null}
      </div>
      <Status row={row} />
    </div>
    {updates.length ? <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-semibold">{t('tasks.workspace.workUpdates')}</p>
      {updates.map(item => <div key={item.id} className="bg-muted/35 rounded-lg p-3">
        <p className="whitespace-pre-wrap break-words text-sm">{item.note}</p>
        <p className="text-muted-foreground mt-2 text-xs">{row.userName} · {row.userCode} · {row.email ?? '—'} · {dateTime(item.createdAtUtc)}</p>
      </div>)}
    </div> : <p className="text-muted-foreground text-sm">{t('tasks.workspace.noUpdates')}</p>}
    {files.length ? <div className="space-y-1 border-t pt-3">
      <p className="text-muted-foreground text-xs font-semibold">{t('tasks.workspace.evidence')}</p>
      {files.map(file => <div key={file.id} className="hover:bg-muted/30 flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5">
        <FileUp aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm" title={file.originalFileName}>{file.originalFileName}</span>
        {attachmentPreviewKind(file) !== 'unsupported' ? <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
          aria-label={t('attachments.previewFile', { name: file.originalFileName })} onClick={() => setPreviewFile(file)}>
          <Eye aria-hidden="true" className="size-4" />
        </Button> : null}
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
          aria-label={t('attachments.downloadFile', { name: file.originalFileName })}
          onClick={() => void collaborativeApi.download(file.id, file.originalFileName).catch(() => toast.error(t('tasks.collaboration.fileError')))}>
          <Download aria-hidden="true" className="size-4" />
        </Button>
        {row.isActive && actorId === file.uploadedByUserId && mine ? <Button type="button" variant="ghost" size="icon"
          className="text-destructive hover:text-destructive size-8 shrink-0"
          aria-label={t('attachments.deleteFile', { name: file.originalFileName })}
          onClick={() => setDeleteFile(file)}>
          <Trash2 aria-hidden="true" className="size-4" />
        </Button> : null}
      </div>)}
      <AttachmentPreviewDialog attachment={previewFile} onOpenChange={open => { if (!open) setPreviewFile(null) }}
        getPreview={collaborativeApi.preview} download={file => collaborativeApi.download(file.id, file.originalFileName)} />
      <ConfirmModal open={deleteFile !== null} danger title={t('attachments.deleteTitle')}
        message={t('attachments.deleteConfirm', { name: deleteFile?.originalFileName ?? '' })}
        confirmText={t('common.delete')} cancelText={t('common.cancel')}
        loading={actions.removeFile.isPending} onCancel={() => setDeleteFile(null)}
        onConfirm={() => { if (deleteFile) actions.removeFile.mutate(deleteFile.id, {
          onSuccess: () => { setDeleteFile(null); toast.success(t('attachments.deleted')) },
          onError: () => toast.error(t('attachments.deleteFailed')),
        }) }} />
    </div> : null}
    {mine && row.isActive ? <div className="space-y-3 border-t pt-3">
      <label htmlFor={`work-notes-${row.id}`} className="text-sm font-medium">{t('tasks.collaboration.myNotes')}</label>
      <Textarea id={`work-notes-${row.id}`} value={note} maxLength={4000} rows={3}
        placeholder={t('tasks.collaboration.notesPlaceholder')} onChange={event => setNote(event.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" type="button" disabled={!note.trim() || actions.note.isPending}
          onClick={() => actions.note.mutate({ assignmentId: row.id, note: note.trim() }, {
            onSuccess: () => { setNote(''); toast.success(t('tasks.assignment.notesSaved')) },
            onError: () => toast.error(t('tasks.collaboration.saveFailed')),
          })}>{t('common.save')}</Button>
        <label className="hover:bg-muted focus-within:ring-ring inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs focus-within:ring-2">
          <FileUp className="size-4" />{t('tasks.collaboration.upload')}
          <input className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) actions.upload.mutate({ assignmentId: row.id, file }, { onError: () => toast.error(t('tasks.collaboration.fileError')) })
              event.target.value = ''
            }} />
        </label>
      </div>
    </div> : null}
    {row.isActive && row.state !== 'DONE' && mine ? <Button type="button" disabled={actions.complete.isPending}
      onClick={() => actions.complete.mutate({ assignmentId: row.id, completed: true }, {
        onError: () => toast.error(t('tasks.collaboration.saveFailed')),
      })}><CheckCircle2 className="size-4" />{t('tasks.collaboration.completeMine')}</Button> : null}
    {canReopen ? <Button type="button" variant="outline" disabled={actions.complete.isPending}
      onClick={() => actions.complete.mutate({ assignmentId: row.id, completed: false }, {
        onError: () => toast.error(t('tasks.collaboration.saveFailed')),
      })}><RotateCcw className="size-4" />{t('tasks.collaboration.reopen')}</Button> : null}
    {row.completedAtUtc ? <p className="text-muted-foreground text-xs">{t('tasks.workspace.completedAt')}: {dateTime(row.completedAtUtc)}</p> : null}
  </div>
}

function ManageTeamDialog({ scope, onClose, view, meetingId, actions }: {
  scope: number | null | undefined
  onClose: () => void
  view: CollaborativeView
  meetingId: number | null
  actions: ReturnType<typeof useCollaborativeAssignments>
}) {
  const { t } = useTranslation()
  const originalMode = scope === null ? 'CUSTOM' : view.modes.find(item => item.subtaskId === scope)?.mode ?? 'INHERIT'
  const assigned = view.members.filter(member => member.subtaskId === scope && member.isActive)
  const [mode, setMode] = useState<'INHERIT' | 'CUSTOM'>(originalMode)
  const [users, setUsers] = useState<number[]>(activeIds(assigned))
  useEffect(() => {
    if (scope !== undefined) {
      setMode(scope === null ? 'CUSTOM' : view.modes.find(item => item.subtaskId === scope)?.mode ?? 'INHERIT')
      setUsers(activeIds(view.members.filter(member => member.subtaskId === scope)))
    }
  }, [scope, view])
  const knownUsers: EligibleTaskUser[] = view.members.filter(member => member.subtaskId === scope).map(member => ({
    userId: member.userId, userName: member.userName, userCode: member.userCode, email: member.email,
  }))
  const pending = actions.team.isPending || actions.childTeam.isPending
  function save() {
    const options = { onSuccess: () => { toast.success(t('tasks.assignment.assignmentSaved')); onClose() },
      onError: () => toast.error(t('tasks.collaboration.saveFailed')) }
    if (scope === null) actions.team.mutate({ userIds: users }, options)
    else if (scope !== undefined) actions.childTeam.mutate({ subtaskId: scope, mode, userIds: mode === 'CUSTOM' ? users : [] }, options)
  }
  return <Dialog open={scope !== undefined} onOpenChange={open => { if (!open && !pending) onClose() }}>
    <DialogContent variant="modal" closeLabel={t('common.close')}>
      <DialogTitle>{t('tasks.workspace.manageAssignees')}</DialogTitle>
      <DialogDescription>{t('tasks.workspace.manageDescription')}</DialogDescription>
      <div className="mt-5 space-y-4">
        {scope !== null && <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">{t('tasks.workspace.assignmentMethod')}</legend>
          <label className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', mode === 'INHERIT' && 'border-primary bg-primary/5')}>
            <input type="radio" name="child-team-mode" checked={mode === 'INHERIT'} onChange={() => setMode('INHERIT')} />
            <span><span className="block text-sm font-semibold">{t('tasks.workspace.inheritTeam')}</span>
              <span className="text-muted-foreground text-xs">{t('tasks.workspace.inheritHelp')}</span></span>
          </label>
          <label className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', mode === 'CUSTOM' && 'border-primary bg-primary/5')}>
            <input type="radio" name="child-team-mode" checked={mode === 'CUSTOM'} onChange={() => setMode('CUSTOM')} />
            <span><span className="block text-sm font-semibold">{t('tasks.workspace.customTeam')}</span>
              <span className="text-muted-foreground text-xs">{t('tasks.workspace.customHelp')}</span></span>
          </label>
        </fieldset>}
        {mode === 'CUSTOM' ? <div className="space-y-2">
          <p className="text-sm font-semibold">{t('tasks.collaboration.selectUsers')}</p>
          <TaskAssigneeMultiPicker value={users} onChange={setUsers} meetingId={meetingId} knownUsers={knownUsers} disabled={pending} />
          <p className="text-muted-foreground text-xs">{t('tasks.workspace.selectedCount', { count: users.length })}</p>
        </div> : null}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" disabled={pending} onClick={onClose}>{t('common.cancel')}</Button>
        <Button disabled={pending || (mode === 'CUSTOM' && users.length === 0)} onClick={save}>{t('common.save')}</Button>
      </div>
    </DialogContent>
  </Dialog>
}

export function CollaborativeAssignmentsPanel({ taskId, actorId, ownerId, meetingId,
  children, enabled, description, overviewContent, activityContent, discussionContent, discussionUnread=0, canManageSubtasks,
  onAddSubtask, onEditSubtask, onDeleteSubtask, onReorderSubtasks, reorderPending,
  subtaskContent, focusSubtaskId = null }: Props) {
  const { t, i18n } = useTranslation()
  const actions = useCollaborativeAssignments(taskId, enabled || actorId === ownerId)
  const view = actions.query.data
  const owner = Boolean(view?.canManage && actorId === ownerId)
  const discussionRequested=typeof window!=='undefined' && new URLSearchParams(window.location.search).get('discussion')==='1'
  const [tab, setTab] = useState<Tab>(discussionRequested?'discussion':focusSubtaskId === null ? 'overview' : 'subtasks')
  const [selectedChildId, setSelectedChildId] = useState<number | null>(focusSubtaskId)
  const [manageScope, setManageScope] = useState<number | null | undefined>(undefined)
  const [teamScope, setTeamScope] = useState<number | null>(null)
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null)
  const [showRemoved, setShowRemoved] = useState(false)
  const main = useMemo(() => view?.members.filter(member => member.subtaskId === null && member.isActive) ?? [], [view])
  const myMain = myCollaborativeAssignment(view?.members ?? [], actorId, null)
  const mainProgress = view ? collaborativeScopeProgress(view, null) : null
  const accessibleChildren = children
  const selectedChild = accessibleChildren.find(child => child.id === selectedChildId)
  const childMembers = selectedChild ? view?.members.filter(member => member.subtaskId === selectedChild.id && member.isActive) ?? [] : []
  const childProgress = selectedChild ? view?.progress.find(progress => progress.scopeId === selectedChild.id) : null
  const myChild = selectedChild ? myCollaborativeAssignment(view?.members ?? [], actorId, selectedChild.id) : undefined
  const availableTabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('tasks.workspace.overview') },
    { id: 'subtasks', label: t('tasks.details.subtasks') },
    ...(owner ? [{ id: 'team' as const, label: t('tasks.workspace.teamProgress') }] : []),
    { id: 'discussion', label: `${t('discussions.title')}${discussionUnread>0?` (${discussionUnread})`:''}` },
    { id: 'activity', label: t('tasks.details.activity') },
  ]
  const focusedSubtaskAvailable = focusSubtaskId !== null && accessibleChildren.some(child => child.id === focusSubtaskId)
  useEffect(() => {
    if (focusedSubtaskAvailable) {
      setTab(discussionRequested?'discussion':'subtasks')
      setSelectedChildId(focusSubtaskId)
    }
  }, [focusSubtaskId, focusedSubtaskAvailable, discussionRequested])
  if (actions.query.isLoading) return <div className="text-muted-foreground p-5 text-sm">{t('common.loading')}</div>
  if (actions.query.isError) return <div className="text-destructive p-5 text-sm">{t('tasks.collaboration.loadFailed')}</div>
  if (!view || (!view.enabled && !owner)) return null

  const teamMembers = showRemoved && owner ? view.members.filter(member => member.subtaskId === teamScope) :
    visibleCollaborativeSubmissions(view, actorId, owner, teamScope)
  if (!view.enabled && owner) return <Card className="mb-5">
    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{t('tasks.collaboration.title')}</p>
        <p className="text-muted-foreground text-xs">{t('tasks.collaboration.enableHint')}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setManageScope(null)}>
        <UsersRound className="size-4" />{t('tasks.collaboration.enable')}
      </Button>
    </CardContent>
    {manageScope !== undefined && <ManageTeamDialog scope={manageScope} onClose={() => setManageScope(undefined)}
      view={view} meetingId={meetingId} actions={actions} />}
  </Card>
  const teamProgress = collaborativeScopeProgress(view, teamScope)
  return <section className="space-y-5" aria-label={t('tasks.collaboration.title')}>
    <div className="border-border/80 bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3 shadow-sm sm:px-4">
      <div role="tablist" aria-label={t('tasks.workspace.navigation')} className="flex max-w-full gap-1 overflow-x-auto">
        {availableTabs.map(item => <button type="button" role="tab" key={item.id}
          aria-selected={tab === item.id} onClick={() => setTab(item.id)}
          className={cn('shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
            tab === item.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          {item.label}
        </button>)}
      </div>
      {owner && <Button variant="outline" size="sm" onClick={() => setManageScope(null)}>
        <UsersRound className="size-4" />{t('tasks.workspace.manageAssignees')}
      </Button>}
    </div>

    {tab === 'overview' && <div role="tabpanel" className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(17rem,.8fr)]">
      <div className="min-w-0 space-y-5">
        <Card><CardHeader className="pb-2"><CardTitle>{t('tasks.workspace.description')}</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm leading-6">{description || t('tasks.details.noDescription')}</p></CardContent>
        </Card>
        {myMain && view.enabled ? <Card>
          <CardHeader className="pb-2"><CardTitle>{t('tasks.workspace.myWork')}</CardTitle></CardHeader>
          <CardContent><Submission row={myMain} view={view} actorId={actorId} owner={owner} actions={actions} /></CardContent>
        </Card> : <Card><CardContent className="py-5 text-sm text-muted-foreground">
          {owner ? t('tasks.workspace.creatorHelp') : t('tasks.workspace.subtaskOnlyHelp')}
          {!owner && <div className="mt-3"><Button size="sm" variant="outline" onClick={() => setTab('subtasks')}>{t('tasks.workspace.openSubtasks')}</Button></div>}
        </CardContent></Card>}
        {overviewContent}
      </div>
      <aside className="min-w-0 space-y-5">
        <Card><CardHeader className="pb-3"><CardTitle>{t('tasks.workspace.teamSummary')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Progress total={mainProgress?.total ?? main.length} completed={mainProgress?.completed ?? 0} label={t('tasks.workspace.mainAssignments')} />
            <div className="text-muted-foreground flex items-center gap-2 text-sm"><UsersRound className="size-4" />
              {t('tasks.workspace.selectedCount', { count: mainProgress?.total ?? main.length })}</div>
            {owner ? <Button variant="outline" size="sm" onClick={() => { setTeamScope(null); setTab('team') }}>{t('tasks.workspace.reviewContributions')}</Button> : null}
            {!view.enabled && owner ? <p className="text-muted-foreground text-xs">{t('tasks.collaboration.enableHint')}</p> : null}
          </CardContent>
        </Card>
        <Card><CardHeader className="pb-3"><CardTitle>{t('tasks.details.subtasks')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Progress total={accessibleChildren.length} completed={accessibleChildren.filter(child => child.isCompleted).length}
              label={t('tasks.workspace.visibleSubtasks')} />
            <Button variant="outline" size="sm" onClick={() => setTab('subtasks')}>{t('tasks.workspace.openSubtasks')}</Button>
          </CardContent>
        </Card>
      </aside>
    </div>}

    {tab === 'subtasks' && <div role="tabpanel" className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
          <div><CardTitle>{t('tasks.details.subtasks')}</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">{t('tasks.details.subtaskCount', { count: accessibleChildren.length })}</p></div>
          {owner && canManageSubtasks && <Button size="sm" onClick={onAddSubtask}><Plus className="size-4" />{t('tasks.details.add')}</Button>}
        </CardHeader>
        <CardContent className="space-y-1">
          {!accessibleChildren.length && <p className="text-muted-foreground py-6 text-center text-sm">{t('tasks.assignment.noAssignedSubtasks')}</p>}
          {accessibleChildren.map((child, index) => {
            const progress = collaborativeScopeProgress(view, child.id)
            const selected = selectedChildId === child.id
            return <div key={child.id} className={cn('flex items-center gap-1 rounded-lg border-b last:border-b-0', selected && 'bg-primary/5')}>
              <button type="button" id={`subtask-${child.id}`} onClick={() => setSelectedChildId(selected ? null : child.id)}
                aria-expanded={selected} className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-3 text-start">
                <CheckCircle2 className={cn('size-5 shrink-0', child.isCompleted ? 'text-success' : 'text-muted-foreground/50')} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{child.title}</span>
                  <span className="mt-1 block"><TaskPriorityIndicator priority={child.priority} /></span>
                  <span className="text-muted-foreground mt-1 block text-xs">{progress.completed}/{progress.total} · {child.dueDate ? new Date(`${child.dueDate}T12:00:00`).toLocaleDateString(i18n.language) : t('tasks.details.notSet')}</span></span>
                {child.isCompleted && <span className="text-success text-xs font-semibold">{t('tasks.collaboration.done')}</span>}
                <ChevronDown className={cn('text-muted-foreground size-4 shrink-0 transition-transform', selected && 'rotate-180')} />
              </button>
              {owner && canManageSubtasks && <div className="flex shrink-0 flex-col pe-2">
                <Button type="button" variant="ghost" size="icon" className="size-7"
                  aria-label={t('tasks.workspace.moveUp', {name:child.title})} disabled={reorderPending || index === 0}
                  onClick={() => { const order=accessibleChildren.map(item=>item.id); [order[index-1],order[index]]=[order[index]!,order[index-1]!]; onReorderSubtasks(order) }}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7"
                  aria-label={t('tasks.workspace.moveDown', {name:child.title})} disabled={reorderPending || index === accessibleChildren.length-1}
                  onClick={() => { const order=accessibleChildren.map(item=>item.id); [order[index],order[index+1]]=[order[index+1]!,order[index]!]; onReorderSubtasks(order) }}>
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>}
            </div>
          })}
        </CardContent>
      </Card>
      {selectedChild && <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
          <div className="min-w-0"><CardTitle>{selectedChild.title}</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">{t('tasks.workspace.subtaskDetails')}</p></div>
          {owner && canManageSubtasks && <Button size="sm" variant="outline" onClick={() => onEditSubtask(selectedChild.id)}>
            <Pencil className="size-4" />{t('tasks.details.editSubtask')}
          </Button>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <TaskPriorityIndicator priority={selectedChild.priority} pill />
            {selectedChild.dueDate && <span className="text-muted-foreground">{t('tasks.dueDate')}: {new Date(`${selectedChild.dueDate}T12:00:00`).toLocaleDateString(i18n.language)}</span>}
          </div>
          {selectedChild.description && <p className="whitespace-pre-wrap break-words text-sm">{selectedChild.description}</p>}
          <Progress total={childProgress?.total ?? childMembers.length} completed={childProgress?.completed ?? 0} label={t('tasks.workspace.mainAssignments')} />
          {owner && <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setManageScope(selectedChild.id)}>
              <UsersRound className="size-4" />{t('tasks.workspace.manageAssignees')}</Button>
            <Button size="sm" variant="outline" onClick={() => {setTeamScope(selectedChild.id);setExpandedMemberId(null);setTab('team')}}>
              {t('tasks.workspace.reviewContributions')}
            </Button>
            {canManageSubtasks && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDeleteSubtask(selectedChild.id)}>
              {t('tasks.details.deleteSubtask')}</Button>}
          </div>}
          {myChild && view.enabled ? <Submission row={myChild} view={view} actorId={actorId} owner={owner} actions={actions} /> :
            <p className="text-muted-foreground text-sm">{owner ? t('tasks.workspace.creatorHelp') : t('tasks.workspace.noAssignment')}</p>}
          {subtaskContent?.(selectedChild.id)}
        </CardContent>
      </Card>}
    </div>}

    {tab === 'team' && owner && <Card role="tabpanel">
      <CardHeader className="pb-3"><CardTitle>{t('tasks.workspace.teamProgress')}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {[{ id: null, title: t('tasks.collaboration.mainTask') }, ...accessibleChildren.map(child => ({ id: child.id, title: child.title }))].map(scope =>
            <Button key={scope.id ?? 'main'} type="button" variant={teamScope === scope.id ? 'default' : 'outline'} size="sm"
              onClick={() => {setTeamScope(scope.id);setExpandedMemberId(null)}}>{scope.title}</Button>)}
        </div>
        <Progress total={teamProgress.total} completed={teamProgress.completed} label={t('tasks.workspace.mainAssignments')} />
        <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => {setShowRemoved(value=>!value);setExpandedMemberId(null)}}>
          {showRemoved ? t('tasks.workspace.hideRemoved') : t('tasks.workspace.showRemoved')}
        </Button></div>
        {!teamMembers.length && <p className="text-muted-foreground py-4 text-sm">{t('tasks.workspace.noAssignees')}</p>}
        <div className="divide-border divide-y">
          {teamMembers.map(member => <div key={member.id} className="py-2">
            <button type="button" className="hover:bg-muted/40 flex w-full items-center gap-3 rounded-lg p-3 text-start"
              aria-expanded={expandedMemberId === member.id}
              onClick={() => setExpandedMemberId(expandedMemberId === member.id ? null : member.id)}>
              <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full"><UsersRound className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{member.userName}</span>
                <span className="text-muted-foreground block text-xs">{member.userCode}</span>
                {member.email && <span dir="ltr" className="text-muted-foreground block truncate text-start text-xs">{member.email}</span>}</span>
              <Status row={member} />
              <ChevronDown className={cn('text-muted-foreground size-4', expandedMemberId === member.id && 'rotate-180')} />
            </button>
            {expandedMemberId === member.id && <div className="px-3 pb-3"><Submission row={member} view={view} actorId={actorId} owner={owner} actions={actions}/></div>}
          </div>)}
        </div>
      </CardContent>
    </Card>}

    {tab === 'discussion' && <div role="tabpanel">{discussionContent}</div>}
    {tab === 'activity' && <div role="tabpanel">{activityContent}</div>}
    <div className="text-muted-foreground flex items-start gap-2 px-2 text-xs">
      <LockKeyhole className="mt-0.5 size-4 shrink-0" />{t('tasks.collaboration.privateDescription')}
    </div>
    {manageScope !== undefined && <ManageTeamDialog scope={manageScope} onClose={() => setManageScope(undefined)}
      view={view} meetingId={meetingId} actions={actions} />}
  </section>
}

