import { CalendarDays, Pencil, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { AnimatedState, taskHubItemMotion } from '@/components/shared/TaskHubMotion'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HolidayEditorDialog } from '@/features/holidays/components/HolidayEditorDialog'
import { useHolidays } from '@/features/holidays/hooks/use-holidays'
import type { Holiday } from '@/features/holidays/types/holiday.types'

export function HolidaysPage() {
  const { i18n, t } = useTranslation()
  const query = useHolidays()
  const [editing, setEditing] = useState<Holiday | null>(null)
  const [open, setOpen] = useState(false)
  const resultsState = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : query.data.length === 0
        ? 'empty'
        : 'content'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('holidays.eyebrow')}
        title={t('holidays.title')}
        description={t('holidays.description')}
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            <Plus className="size-4" />
            {t('holidays.create')}
          </Button>
        }
      />
      <AnimatedState stateKey={resultsState}>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={t('holidays.emptyTitle')}
            description={t('holidays.emptyDescription')}
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="relative divide-y">
              <AnimatePresence initial={false} mode="popLayout">
                {query.data.map((holiday) => (
                  <motion.div
                    key={holiday.id}
                    layout="position"
                    initial={taskHubItemMotion.initial}
                    animate={taskHubItemMotion.animate}
                    exit={taskHubItemMotion.exit}
                    transition={taskHubItemMotion.transition}
                    className="flex flex-wrap items-center gap-4 p-4 sm:p-5"
                  >
                    <span className="bg-primary/10 text-primary grid size-11 place-items-center rounded-xl">
                      <CalendarDays className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {i18n.language.startsWith('ar') ? holiday.nameAr : holiday.nameEn}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {new Date(`${holiday.holidayDate}T00:00:00`).toLocaleDateString(
                          i18n.language,
                          {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          },
                        )}
                      </p>
                    </div>
                    <span
                      className={
                        holiday.isActive
                          ? 'bg-success/10 text-success rounded-full px-3 py-1 text-xs font-medium'
                          : 'bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium'
                      }
                    >
                      {t(holiday.isActive ? 'holidays.active' : 'holidays.inactive')}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(holiday)
                        setOpen(true)
                      }}
                    >
                      <Pencil className="size-4" />
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
        <HolidayEditorDialog
          key={editing?.id ?? 'create'}
          holiday={editing}
          open
          onOpenChange={setOpen}
        />
      ) : null}
    </div>
  )
}
