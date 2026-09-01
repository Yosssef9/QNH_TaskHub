import { CalendarDays, DoorOpen, ShieldCheck, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { useActiveMeetingRooms } from '@/features/meetings/hooks/use-meeting-rooms'

export function MeetingsPage() {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const rooms = useActiveMeetingRooms()
  const access = currentUser.data?.access
  const canCoordinate = access?.meetingCoordinateEnabled === true
  const canOrganize = access?.meetingOrganizeEnabled === true || canCoordinate

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('meetings.eyebrow')}
        title={t('meetings.title')}
        description={t('meetings.description')}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
        <EmptyState
          icon={CalendarDays}
          title={t('meetings.emptyTitle')}
          description={t('meetings.emptyDescription')}
        />

        <Card className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">{t('meetings.accessTitle')}</h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                {t('meetings.accessDescription')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canOrganize ? (
              <Badge variant="secondary">
                <UsersRound aria-hidden="true" className="me-1 size-3.5" />
                {t('meetings.organizer')}
              </Badge>
            ) : null}
            {canCoordinate ? (
              <Badge variant="default">
                <ShieldCheck aria-hidden="true" className="me-1 size-3.5" />
                {t('meetings.coordinator')}
              </Badge>
            ) : null}
            {!canOrganize && !canCoordinate ? (
              <Badge variant="secondary">{t('meetings.participant')}</Badge>
            ) : null}
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2">
              <DoorOpen aria-hidden="true" className="text-muted-foreground size-4" />
              <h3 className="text-sm font-medium">{t('meetings.availableRooms')}</h3>
            </div>

            {rooms.isPending ? (
              <LoadingState className="mt-3 min-h-28" />
            ) : rooms.isError ? (
              <ErrorState className="mt-3" onRetry={() => void rooms.refetch()} />
            ) : rooms.data.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">
                {t('meetings.noActiveRooms')}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {rooms.data.slice(0, 5).map((room) => (
                  <div
                    key={room.id}
                    className="bg-muted/45 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {i18n.language.startsWith('ar') ? room.nameAr : room.nameEn}
                      </p>
                      {room.locationText ? (
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                          {room.locationText}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t('meetings.capacityValue', { count: room.capacity })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
