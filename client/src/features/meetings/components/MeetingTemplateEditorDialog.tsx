import {
  Clock3,
  DoorOpen,
  FileText,
  Info,
  LayoutTemplate,
  Save,
  Settings2,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { InputField, TextareaField } from '@/components/shared/Input'
import {
  SearchableMultiSelect,
  type SearchableSelectOption,
} from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { toApiClientError } from '@/lib/api-error'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import {
  useCreateMeetingTemplate,
  useMeetingParticipants,
  useUpdateMeetingTemplate,
} from '../hooks/use-meetings'
import type { MeetingParticipant, MeetingTemplate } from '../types/meeting.types'
import { MeetingParticipantPicker } from './MeetingParticipantPicker'

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 150, 180] as const
const CUSTOM_DURATION_VALUE = 'CUSTOM'

function participantOption(participant: MeetingParticipant): SearchableSelectOption {
  return {
    value: participant.userId,
    label: participant.userName,
    description: participant.userCode,
  }
}

function durationChoiceFor(value: string): string {
  const numeric = Number(value)
  return DURATION_PRESETS.includes(numeric as (typeof DURATION_PRESETS)[number])
    ? String(numeric)
    : CUSTOM_DURATION_VALUE
}

export function MeetingTemplateEditorDialog({
  template = null,
  initialMeeting = null,
  open,
  onOpenChange,
}: {
  template?: MeetingTemplate | null
  initialMeeting?: {
    title: string
    description: string | null
    roomId: number
    attendeeUserIds: number[]
    attendees?: MeetingParticipant[]
    durationMinutes: number
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const rooms = useActiveMeetingRooms()
  const createMutation = useCreateMeetingTemplate()
  const updateMutation = useUpdateMeetingTemplate()

  const initialDuration = String(
    template?.durationMinutes ?? initialMeeting?.durationMinutes ?? 60,
  )
  const [name, setName] = useState(template?.name ?? initialMeeting?.title ?? '')
  const [title, setTitle] = useState(template?.title ?? initialMeeting?.title ?? '')
  const [description, setDescription] = useState(
    template?.description ?? initialMeeting?.description ?? '',
  )
  const [durationMinutes, setDurationMinutes] = useState(initialDuration)
  const [durationChoice, setDurationChoice] = useState(() =>
    durationChoiceFor(initialDuration),
  )
  const [roomId, setRoomId] = useState<number | null>(
    template?.defaultRoom?.isActive
      ? template.defaultRoom.id
      : initialMeeting?.roomId ?? null,
  )
  const initialAttendees = template?.attendees ?? initialMeeting?.attendees ?? []
  const [attendeeUserIds, setAttendeeUserIds] = useState<number[]>(
    template?.attendees.map((attendee) => attendee.userId) ??
      initialMeeting?.attendeeUserIds ??
      [],
  )
  const [search, setSearch] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<SearchableSelectOption[]>(
    initialAttendees.map(participantOption),
  )

  const participants = useMeetingParticipants(search, open)

  const participantOptions = useMemo(() => {
    const byUserId = new Map<number, MeetingParticipant>()
    for (const page of participants.data?.pages ?? []) {
      for (const participant of page.items) {
        if (participant.userId !== currentUser.data?.user.userId) {
          byUserId.set(participant.userId, participant)
        }
      }
    }
    return [...byUserId.values()].map(participantOption)
  }, [currentUser.data?.user.userId, participants.data?.pages])

  useEffect(() => {
    setSelectedOptions((current) => {
      const map = new Map(current.map((item) => [String(item.value), item]))
      participantOptions.forEach((item) => map.set(String(item.value), item))
      return [...map.values()].filter((item) =>
        attendeeUserIds.includes(Number(item.value)),
      )
    })
  }, [attendeeUserIds, participantOptions])

  const roomOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (rooms.data ?? []).map((room) => ({
        value: room.id,
        label: i18n.language.startsWith('ar') ? room.nameAr : room.nameEn,
        description: room.locationText ?? t('meetings.noRoomLocation'),
      })),
    [i18n.language, rooms.data, t],
  )

  const pending = createMutation.isPending || updateMutation.isPending
  const duration = Number(durationMinutes)
  const durationValid =
    Number.isInteger(duration) && duration >= 1 && duration <= 1440
  const selectedRoom = (rooms.data ?? []).find((room) => room.id === roomId) ?? null
  const selectedRoomName = selectedRoom
    ? i18n.language.startsWith('ar')
      ? selectedRoom.nameAr
      : selectedRoom.nameEn
    : null
  const participantCount = 1 + attendeeUserIds.length
  const canSave =
    !pending && Boolean(name.trim()) && Boolean(title.trim()) && durationValid

  function updateDurationChoice(value: string) {
    setDurationChoice(value)
    if (value !== CUSTOM_DURATION_VALUE) setDurationMinutes(value)
  }

  async function save() {
    if (!canSave) return

    const values = {
      name: name.trim(),
      title: title.trim(),
      description: description.trim() || null,
      durationMinutes: duration,
      defaultRoomId: roomId,
      attendeeUserIds,
    }

    try {
      if (template) {
        await updateMutation.mutateAsync({
          templateId: template.id,
          rowVersion: template.rowVersion,
          ...values,
        })
      } else {
        await createMutation.mutateAsync(values)
      }

      toast.success(t(template ? 'meetings.templates.updated' : 'meetings.templates.created'))
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.templates.saveError'),
        }),
      )
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pending) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="max-h-[94vh] w-[min(50rem,calc(100vw-1rem))] overflow-hidden p-0"
      >
        <header className="border-b px-5 py-5 pe-14 sm:px-6 sm:py-6 sm:pe-16">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
              <LayoutTemplate aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-semibold">
                {t(
                  template
                    ? 'meetings.templates.editTitle'
                    : 'meetings.templates.createTitle',
                )}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">
                {t('meetings.templates.editorDescription')}
              </DialogDescription>
            </div>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <section className="rounded-xl border bg-card">
            <div className="flex items-start gap-3 border-b px-4 py-4 sm:px-5">
              <span className="bg-primary/8 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  {t('meetings.templates.informationTitle')}
                </h2>
                <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                  {t('meetings.templates.informationDescription')}
                </p>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div>
                <InputField
                  required
                  label={t('meetings.templates.name')}
                  value={name}
                  maxLength={150}
                  onChange={(event) => setName(event.target.value)}
                />
                <p className="text-muted-foreground mt-1.5 text-xs leading-5">
                  {t('meetings.templates.nameHint')}
                </p>
              </div>

              <div>
                <InputField
                  required
                  label={t('meetings.fields.title')}
                  value={title}
                  maxLength={250}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <p className="text-muted-foreground mt-1.5 text-xs leading-5">
                  {t('meetings.templates.titleHint')}
                </p>
              </div>

              <TextareaField
                label={t('meetings.fields.descriptionPurpose')}
                value={description}
                maxLength={10000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="flex items-start gap-3 border-b px-4 py-4 sm:px-5">
              <span className="bg-primary/8 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                <Settings2 aria-hidden="true" className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  {t('meetings.templates.defaultsTitle')}
                </h2>
                <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                  {t('meetings.templates.defaultsDescription')}
                </p>
              </div>
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                    <Clock3
                      aria-hidden="true"
                      className="text-muted-foreground size-4"
                    />
                    {t('meetings.templates.durationLabel')}
                    <span className="text-destructive">*</span>
                  </label>

                  <Select
                    value={durationChoice}
                    disabled={pending}
                    onValueChange={updateDurationChoice}
                  >
                    <SelectTrigger>
                      <Clock3
                        aria-hidden="true"
                        className="text-muted-foreground size-4 shrink-0"
                      />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_PRESETS.map((minutes) => (
                        <SelectItem key={minutes} value={String(minutes)}>
                          <span className="flex items-center gap-2">
                            <Clock3
                              aria-hidden="true"
                              className="text-muted-foreground size-3.5"
                            />
                            {t('meetings.templates.durationOption', {
                              count: minutes,
                            })}
                          </span>
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_DURATION_VALUE}>
                        <span className="flex items-center gap-2">
                          <Settings2
                            aria-hidden="true"
                            className="text-muted-foreground size-3.5"
                          />
                          {t('meetings.templates.customDuration')}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {durationChoice === CUSTOM_DURATION_VALUE ? (
                    <div className="mt-3">
                      <InputField
                        required
                        type="number"
                        min={1}
                        max={1440}
                        label={t('meetings.templates.customDurationMinutes')}
                        value={durationMinutes}
                        error={
                          durationMinutes && !durationValid
                            ? t('meetings.templates.durationInvalid')
                            : undefined
                        }
                        onChange={(event) => setDurationMinutes(event.target.value)}
                      />
                      <p className="text-muted-foreground mt-1.5 text-xs leading-5">
                        {t('meetings.templates.customDurationHint')}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                    <DoorOpen
                      aria-hidden="true"
                      className="text-muted-foreground size-4"
                    />
                    {t('meetings.templates.defaultRoom')}
                  </label>
                  <SearchableMultiSelect
                    value={roomId}
                    options={roomOptions}
                    placeholder={t('meetings.templates.noDefaultRoom')}
                    searchPlaceholder={t('meetings.fields.roomSearch')}
                    disabled={pending}
                    onChange={(value) =>
                      setRoomId(value === null ? null : Number(value))
                    }
                  />
                  <p className="text-muted-foreground mt-1.5 text-xs leading-5">
                    {t('meetings.templates.defaultRoomHint')}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                  <UsersRound
                    aria-hidden="true"
                    className="text-muted-foreground size-4"
                  />
                  {t('meetings.templates.defaultParticipants')}
                </label>
                <MeetingParticipantPicker
                  values={attendeeUserIds}
                  options={participantOptions}
                  selectedOptions={selectedOptions}
                  searchValue={search}
                  participantCount={participantCount}
                  roomCapacity={selectedRoom?.capacity ?? null}
                  loading={participants.isPending}
                  loadingMore={participants.isFetchingNextPage}
                  hasMore={participants.hasNextPage}
                  disabled={pending}
                  onSearchChange={setSearch}
                  onLoadMore={() => {
                    void participants.fetchNextPage()
                  }}
                  onChange={(values) => setAttendeeUserIds(values)}
                />
                <p className="text-muted-foreground mt-1.5 text-xs leading-5">
                  {t('meetings.templates.defaultParticipantsHint')}
                </p>
              </div>
            </div>
          </section>

          <section className="border-primary/20 bg-primary/[0.045] rounded-xl border px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                <Info aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-primary text-sm font-semibold">
                  {t('meetings.templates.summaryTitle')}
                </h2>
                <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                  {t('meetings.templates.summaryDescription')}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="bg-background/80 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium">
                    <Clock3 aria-hidden="true" className="text-muted-foreground size-3.5" />
                    {durationValid
                      ? t('meetings.templates.durationValue', { count: duration })
                      : t('meetings.templates.durationNotSet')}
                  </span>

                  <span className="bg-background/80 inline-flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium">
                    <DoorOpen aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="max-w-64 truncate">
                      {selectedRoomName ?? t('meetings.templates.noDefaultRoom')}
                    </span>
                  </span>

                  <span className="bg-background/80 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium">
                    <UsersRound aria-hidden="true" className="text-muted-foreground size-3.5" />
                    {t('meetings.templates.participantsSummary', {
                      count: attendeeUserIds.length,
                    })}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="bg-background/95 sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            <Save aria-hidden="true" className="size-4" />
            {t(
              pending
                ? 'meetings.templates.saving'
                : 'meetings.templates.saveTemplate',
            )}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
