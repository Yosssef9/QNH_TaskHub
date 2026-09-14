import {
  CheckCircle2,
  FileText,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { MeetingDetail } from '@/features/meetings/types/meeting.types'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { toApiClientError } from '@/lib/api-error'
import { formatDateTime } from '@/lib/date-time'

import type {
  MeetingDecision,
  MeetingFollowUpData,
  MeetingFollowUpLaunchRequest,
} from './meeting-follow-up.types'
import {
  FollowUpDetailHeader,
  FollowUpWorkspaceCard,
} from './MeetingFollowUpWorkspace'
import {
  useCreateMeetingDecision,
  useSaveMeetingFollowUpNotes,
  useUpdateMeetingDecision,
} from './use-meeting-follow-up'

interface FollowUpQueryState {
  data: MeetingFollowUpData | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
}

type WorkspaceMode = 'preview' | 'detail'

export function MeetingDecisionsWorkspace({
  detail,
  isOrganizer,
  launchRequest,
  onLaunchRequestHandled,
  data,
  isPending,
  isError,
  onRetry,
  mode,
  onViewAll,
  onBack,
}: FollowUpQueryState & {
  detail: MeetingDetail
  isOrganizer: boolean
  launchRequest?: MeetingFollowUpLaunchRequest | null
  onLaunchRequestHandled?: () => void
  mode: WorkspaceMode
  onViewAll?: () => void
  onBack?: () => void
}) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-SA'
  const meetingId = detail.meeting.id
  const decisions = data?.decisions ?? []
  const canManage = data?.canManageContent === true
  const createDecision = useCreateMeetingDecision(meetingId)
  const [editingDecision, setEditingDecision] = useState<MeetingDecision | null>(null)
  const updateDecision = useUpdateMeetingDecision(meetingId, editingDecision?.id ?? null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [decisionText, setDecisionText] = useState('')
  const [agendaItemId, setAgendaItemId] = useState('NONE')
  const [search, setSearch] = useState('')
  const direction = i18n.dir()
  const mutationPending = createDecision.isPending || updateDecision.isPending

  const waitingForStart =
    isOrganizer &&
    detail.meeting.status === 'SCHEDULED' &&
    new Date(detail.meeting.startAtUtc).getTime() > Date.now()

  const filteredDecisions = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase()
    if (!normalized) return decisions
    return decisions.filter((decision) =>
      [decision.decisionText, decision.agendaTitle ?? '', decision.createdBy.userName]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized),
    )
  }, [decisions, search])

  const previewDecisions = decisions.slice(0, 3)

  function resetDialog() {
    setEditingDecision(null)
    setDecisionText('')
    setAgendaItemId('NONE')
  }

  function openCreate(preselectedAgendaItemId?: number) {
    setEditingDecision(null)
    setDecisionText('')
    setAgendaItemId(preselectedAgendaItemId ? String(preselectedAgendaItemId) : 'NONE')
    setDialogOpen(true)
  }

  function openEdit(decision: MeetingDecision) {
    setEditingDecision(decision)
    setDecisionText(decision.decisionText)
    setAgendaItemId(decision.agendaItemId === null ? 'NONE' : String(decision.agendaItemId))
    setDialogOpen(true)
  }

  useEffect(() => {
    if (!launchRequest || launchRequest.kind !== 'DECISION') return
    setEditingDecision(null)
    setDecisionText('')
    setAgendaItemId(launchRequest.agendaItemId === null ? 'NONE' : String(launchRequest.agendaItemId))
    setDialogOpen(true)
    onLaunchRequestHandled?.()
  }, [launchRequest, onLaunchRequestHandled])

  function submitDecision() {
    const text = decisionText.trim()
    if (!text) return
    const selectedAgenda = agendaItemId === 'NONE' ? null : Number(agendaItemId)

    if (editingDecision) {
      updateDecision.mutate(
        {
          decisionText: text,
          agendaItemId: selectedAgenda,
          rowVersion: editingDecision.rowVersion,
        },
        {
          onSuccess: () => {
            toast.success(t('meetings.followUp.decisions.updated'))
            setDialogOpen(false)
            resetDialog()
          },
          onError: (error) => {
            const apiError = toApiClientError(error)
            toast.error(
              t(`meetings.errors.${apiError.code}`, {
                defaultValue: t('meetings.followUp.decisions.saveError'),
              }),
            )
          },
        },
      )
      return
    }

    createDecision.mutate(
      { decisionText: text, agendaItemId: selectedAgenda },
      {
        onSuccess: () => {
          toast.success(t('meetings.followUp.decisions.created'))
          setDialogOpen(false)
          resetDialog()
        },
        onError: (error) => {
          const apiError = toApiClientError(error)
          toast.error(
            t(`meetings.errors.${apiError.code}`, {
              defaultValue: t('meetings.followUp.decisions.saveError'),
            }),
          )
        },
      },
    )
  }

  const decisionList = (items: MeetingDecision[], compactEmpty = false) => {
    if (isPending) return <LoadingState />
    if (isError || !data) return <ErrorState onRetry={onRetry} />
    if (decisions.length === 0) {
      return (
        <EmptyState
          compact={compactEmpty}
          icon={CheckCircle2}
          title={t('meetings.followUp.decisions.emptyTitle')}
          description={
            waitingForStart
              ? t('meetings.followUp.contentStartsAtMeeting')
              : isOrganizer && !canManage
                ? t('meetings.followUp.contentReadOnly')
                : t('meetings.followUp.decisions.emptyDescription')
          }
        />
      )
    }
    if (items.length === 0) {
      return (
        <EmptyState
          icon={Search}
          title={t('meetings.followUp.decisions.noSearchResults')}
          description={t('meetings.followUp.decisions.noSearchResultsDescription')}
        />
      )
    }

    return (
      <ul className="space-y-3">
        {items.map((decision) => (
          <li
            key={decision.id}
            className="bg-card rounded-xl border border-border/70 p-4 shadow-sm sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="bg-success/10 text-success mt-0.5 grid size-9 shrink-0 place-items-center rounded-full">
                <CheckCircle2 aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-sm font-semibold leading-6">
                  {decision.decisionText}
                </p>
                <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  {decision.agendaTitle ? (
                    <span className="bg-primary/[0.08] text-primary inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 font-medium">
                      <ListChecks aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="truncate">{decision.agendaTitle}</span>
                    </span>
                  ) : null}
                  <span>
                    {t('meetings.followUp.decisions.createdBy', {
                      name: decision.createdBy.userName,
                    })}
                  </span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {formatDateTime(decision.updatedAtUtc ?? decision.createdAtUtc, locale, timeFormat, {
                      dateStyle: 'medium',
                    })}
                  </span>
                </div>
              </div>
              {canManage ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t('meetings.followUp.decisions.edit')}
                  onClick={() => openEdit(decision)}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      {mode === 'preview' ? (
        <FollowUpWorkspaceCard
          icon={CheckCircle2}
          title={t('meetings.followUp.decisions.title')}
          description={t('meetings.followUp.decisions.description')}
          action={
            onViewAll ? (
              <Button variant="outline" size="sm" onClick={onViewAll}>
                {t('meetings.followUp.workspace.viewAll')}
              </Button>
            ) : null
          }
        >
          {decisionList(previewDecisions, true)}
          {decisions.length > previewDecisions.length && onViewAll ? (
            <Button variant="ghost" className="mt-3 w-full" onClick={onViewAll}>
              {t('meetings.followUp.decisions.viewRemaining', {
                count: decisions.length - previewDecisions.length,
              })}
            </Button>
          ) : null}
        </FollowUpWorkspaceCard>
      ) : (
        <div className="space-y-5">
          <FollowUpDetailHeader
            icon={CheckCircle2}
            title={t('meetings.followUp.decisions.title')}
            description={t('meetings.followUp.decisions.detailDescription')}
            backLabel={t('meetings.followUp.workspace.backToOverview')}
            onBack={() => onBack?.()}
            action={
              canManage ? (
                <Button onClick={() => openCreate()}>
                  <Plus aria-hidden="true" className="size-4" />
                  {t('meetings.followUp.decisions.add')}
                </Button>
              ) : null
            }
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-primary/[0.045] rounded-2xl border border-primary/15 px-5 py-4">
              <p className="text-muted-foreground text-xs font-semibold">
                {t('meetings.followUp.decisions.total')}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{decisions.length}</p>
            </div>
            <div className="bg-muted/20 rounded-2xl border px-5 py-4">
              <p className="text-muted-foreground text-xs font-semibold">
                {t('meetings.followUp.decisions.linkedToAgenda')}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {decisions.filter((item) => item.agendaItemId !== null).length}
              </p>
            </div>
          </div>

          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('meetings.followUp.decisions.searchPlaceholder')}
              aria-label={t('meetings.followUp.decisions.searchPlaceholder')}
              className="ps-10"
            />
          </div>

          {decisionList(filteredDecisions)}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (mutationPending) return
          setDialogOpen(open)
          if (!open) resetDialog()
        }}
      >
        <DialogContent
          variant="modal"
          closeLabel={t('common.close')}
          className="w-[min(42rem,calc(100vw-2rem))] max-w-none"
        >
          <div className="flex items-start gap-3 pe-10">
            <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
              <CheckCircle2 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <DialogTitle>
                {editingDecision
                  ? t('meetings.followUp.decisions.editTitle')
                  : t('meetings.followUp.decisions.newTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1 text-sm leading-6">
                {t('meetings.followUp.decisions.dialogDescription')}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="meeting-decision-text" className="text-sm font-medium">
                {t('meetings.followUp.decisions.textLabel')}
              </label>
              <Textarea
                id="meeting-decision-text"
                autoFocus
                rows={7}
                maxLength={10000}
                value={decisionText}
                onChange={(event) => setDecisionText(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t('meetings.followUp.relatedAgenda')}
                <span className="text-muted-foreground ms-1 text-xs font-normal">
                  · {t('meetings.followUp.optional')}
                </span>
              </label>
              <Select value={agendaItemId} onValueChange={setAgendaItemId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder={t('meetings.followUp.relatedAgenda')} />
                </SelectTrigger>
                <SelectContent dir={direction}>
                  <SelectItem value="NONE">{t('common.none')}</SelectItem>
                  {detail.agendaItems.length === 0 ? (
                    <SelectItem value="__NO_AGENDA__" disabled>
                      {t('meetings.followUp.noAgendaTopics')}
                    </SelectItem>
                  ) : (
                    detail.agendaItems.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.topic}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                disabled={mutationPending}
                onClick={() => {
                  setDialogOpen(false)
                  resetDialog()
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button disabled={mutationPending || !decisionText.trim()} onClick={submitDecision}>
                {editingDecision
                  ? t('meetings.followUp.decisions.save')
                  : t('meetings.followUp.decisions.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function MeetingNotesWorkspace({
  detail,
  isOrganizer,
  data,
  isPending,
  isError,
  onRetry,
  mode,
  onViewAll,
  onBack,
}: FollowUpQueryState & {
  detail: MeetingDetail
  isOrganizer: boolean
  mode: WorkspaceMode
  onViewAll?: () => void
  onBack?: () => void
}) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-SA'
  const notes = data?.notes ?? null
  const canManage = data?.canManageContent === true
  const saveNotes = useSaveMeetingFollowUpNotes(detail.meeting.id)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setDraft(notes?.notesText ?? '')
  }, [notes?.notesText, notes?.rowVersion])

  const normalizedDraft = useMemo(() => draft.trim(), [draft])
  const changed = normalizedDraft !== (notes?.notesText ?? '')
  const waitingForStart =
    isOrganizer &&
    detail.meeting.status === 'SCHEDULED' &&
    new Date(detail.meeting.startAtUtc).getTime() > Date.now()

  function save() {
    saveNotes.mutate(
      {
        notesText: normalizedDraft,
        rowVersion: notes?.rowVersion ?? null,
      },
      {
        onSuccess: () => toast.success(t('meetings.followUp.notes.saved')),
        onError: (error) => {
          const apiError = toApiClientError(error)
          toast.error(
            t(`meetings.errors.${apiError.code}`, {
              defaultValue: t('meetings.followUp.notes.saveError'),
            }),
          )
        },
      },
    )
  }

  function content(preview = false) {
    if (isPending) return <LoadingState />
    if (isError || !data) return <ErrorState onRetry={onRetry} />

    if (preview) {
      if (!notes?.notesText) {
        return (
          <EmptyState
            compact
            icon={FileText}
            title={t('meetings.followUp.notes.emptyTitle')}
            description={
              waitingForStart
                ? t('meetings.followUp.contentStartsAtMeeting')
                : isOrganizer
                  ? t('meetings.followUp.contentReadOnly')
                  : t('meetings.followUp.notes.emptyDescription')
            }
          />
        )
      }

      return (
        <div className="space-y-3">
          <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-7">{notes.notesText}</p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-xs">
            <span>{t('meetings.followUp.notes.updatedBy', { name: notes.updatedBy.userName })}</span>
            <span>·</span>
            <span className="tabular-nums">
              {formatDateTime(notes.updatedAtUtc, locale, timeFormat, { dateStyle: 'medium' })}
            </span>
          </div>
        </div>
      )
    }

    if (canManage) {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <label htmlFor="meeting-follow-up-notes" className="text-sm font-semibold">
              {t('meetings.followUp.notes.editorLabel')}
            </label>
            <Textarea
              id="meeting-follow-up-notes"
              rows={18}
              maxLength={50000}
              value={draft}
              placeholder={t('meetings.followUp.notes.placeholder')}
              className="mt-3 min-h-[24rem] resize-y leading-7"
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <p>{t('meetings.followUp.notes.editorHint')}</p>
              {notes ? (
                <p>
                  {t('meetings.followUp.notes.updatedBy', { name: notes.updatedBy.userName })}
                  {' · '}
                  {formatDateTime(notes.updatedAtUtc, locale, timeFormat, { dateStyle: 'medium' })}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end">
            <Button disabled={!changed || saveNotes.isPending} onClick={save}>
              <Save aria-hidden="true" className="size-4" />
              {t('meetings.followUp.notes.save')}
            </Button>
          </div>
        </div>
      )
    }

    if (notes?.notesText) {
      return (
        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
          <p className="whitespace-pre-wrap text-sm leading-8 sm:text-base">{notes.notesText}</p>
          <div className="text-muted-foreground mt-6 flex flex-wrap items-center gap-2 border-t pt-4 text-xs">
            <span>{t('meetings.followUp.notes.updatedBy', { name: notes.updatedBy.userName })}</span>
            <span>·</span>
            <span>{formatDateTime(notes.updatedAtUtc, locale, timeFormat, { dateStyle: 'medium' })}</span>
          </div>
        </div>
      )
    }

    return (
      <EmptyState
        icon={FileText}
        title={t('meetings.followUp.notes.emptyTitle')}
        description={t('meetings.followUp.notes.emptyDescription')}
      />
    )
  }

  if (mode === 'preview') {
    return (
      <FollowUpWorkspaceCard
        icon={FileText}
        title={t('meetings.followUp.notes.title')}
        description={t('meetings.followUp.notes.description')}
        action={
          onViewAll ? (
            <Button variant="outline" size="sm" onClick={onViewAll}>
              {canManage ? t('meetings.followUp.notes.edit') : t('meetings.followUp.workspace.open')}
            </Button>
          ) : null
        }
      >
        {content(true)}
      </FollowUpWorkspaceCard>
    )
  }

  return (
    <div className="space-y-5">
      <FollowUpDetailHeader
        icon={FileText}
        title={t('meetings.followUp.notes.title')}
        description={t('meetings.followUp.notes.detailDescription')}
        backLabel={t('meetings.followUp.workspace.backToOverview')}
        onBack={() => onBack?.()}
      />
      {content(false)}
    </div>
  )
}

