import { Building2, MapPin, Pencil, Plus, UsersRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { AnimatedState, taskHubItemMotion } from '@/components/shared/TaskHubMotion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MeetingRoomEditorDialog } from '@/features/meetings/components/MeetingRoomEditorDialog'
import { useAdminMeetingRooms } from '@/features/meetings/hooks/use-meeting-rooms'
import type { MeetingRoom } from '@/features/meetings/types/meeting.types'

export function MeetingRoomsPage() {
  const { i18n, t } = useTranslation()
  const query = useAdminMeetingRooms()
  const [editing, setEditing] = useState<MeetingRoom | null>(null)
  const [open, setOpen] = useState(false)
  const state = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : query.data.length === 0
        ? 'empty'
        : 'content'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('meetingRooms.eyebrow')}
        title={t('meetingRooms.title')}
        description={t('meetingRooms.description')}
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t('meetingRooms.create')}
          </Button>
        }
      />

      <AnimatedState stateKey={state}>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={t('meetingRooms.emptyTitle')}
            description={t('meetingRooms.emptyDescription')}
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="relative divide-y">
              <AnimatePresence initial={false} mode="popLayout">
                {query.data.map((room) => (
                  <motion.div
                    key={room.id}
                    layout="position"
                    initial={taskHubItemMotion.initial}
                    animate={taskHubItemMotion.animate}
                    exit={taskHubItemMotion.exit}
                    transition={taskHubItemMotion.transition}
                    className="flex flex-wrap items-center gap-4 p-4 sm:p-5"
                  >
                    <span className="bg-primary/10 text-primary grid size-11 place-items-center rounded-xl">
                      <Building2 aria-hidden="true" className="size-5" />
                    </span>

                    <div className="min-w-52 flex-1">
                      <p className="font-semibold">
                        {i18n.language.startsWith('ar') ? room.nameAr : room.nameEn}
                      </p>
                      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {room.code ? <span>{room.code}</span> : null}
                        {room.locationText ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin aria-hidden="true" className="size-3.5" />
                            {room.locationText}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1">
                          <UsersRound aria-hidden="true" className="size-3.5" />
                          {t('meetingRooms.capacityValue', { count: room.capacity })}
                        </span>
                      </div>
                    </div>

                    <span
                      className={
                        room.isActive
                          ? 'bg-success/10 text-success rounded-full px-3 py-1 text-xs font-medium'
                          : 'bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium'
                      }
                    >
                      {t(room.isActive ? 'meetingRooms.active' : 'meetingRooms.inactive')}
                    </span>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(room)
                        setOpen(true)
                      }}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                      {t('common.edit')}
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Card>
        )}
      </AnimatedState>

      {open ? (
        <MeetingRoomEditorDialog
          key={editing?.id ?? 'create'}
          room={editing}
          open
          onOpenChange={setOpen}
        />
      ) : null}
    </div>
  )
}
