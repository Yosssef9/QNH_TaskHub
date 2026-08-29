import { move } from '@dnd-kit/helpers'
import { Archive, ListTodo, LockKeyhole, Pencil } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { taskHubItemMotion } from '@/components/shared/TaskHubMotion'
import {
  SortableDragHandle,
  SortableDropIndicator,
  TaskHubDragDropProvider,
  useTaskHubSortable,
} from '@/components/shared/TaskHubSortable'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'

import { useArchiveList, useReorderLists } from '../hooks/use-lists'
import type { PersonalList } from '../types/list.types'
import { ListEditorDialog } from './ListEditorDialog'
import { listIcons } from './list-icons'

interface ListsManagerDialogProps {
  lists: PersonalList[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function sameIds(left: PersonalList[], right: PersonalList[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id)
}

function sameIdSet(left: PersonalList[], right: PersonalList[]) {
  if (left.length !== right.length) return false
  const ids = new Set(right.map((item) => item.id))
  return left.every((item) => ids.has(item.id))
}

export function ListsManagerDialog({ lists, onOpenChange, open }: ListsManagerDialogProps) {
  const { t } = useTranslation()
  const reorderMutation = useReorderLists()
  const archiveMutation = useArchiveList()
  const [editingList, setEditingList] = useState<PersonalList | null>(null)
  const [archivingList, setArchivingList] = useState<PersonalList | null>(null)
  const [orderedCustomLists, setOrderedCustomLists] = useState<PersonalList[]>(() =>
    lists.filter((list) => !list.isDefault),
  )
  const [recentlyMovedId, setRecentlyMovedId] = useState<number | null>(null)
  const draggingRef = useRef(false)

  const defaultList = lists.find((list) => list.isDefault)
  const customLists = lists.filter((list) => !list.isDefault)
  const displayedCustomLists = sameIdSet(orderedCustomLists, customLists)
    ? orderedCustomLists
    : customLists
  const isPending = reorderMutation.isPending || archiveMutation.isPending

  useEffect(() => {
    if (!draggingRef.current) {
      setOrderedCustomLists(lists.filter((list) => !list.isDefault))
    }
  }, [lists])

  useEffect(() => {
    if (recentlyMovedId === null) return

    const timeout = window.setTimeout(() => setRecentlyMovedId(null), 650)
    return () => window.clearTimeout(timeout)
  }, [recentlyMovedId])

  function archive() {
    if (!archivingList) return
    archiveMutation.mutate(archivingList.id, {
      onSuccess: () => {
        toast.success(t('lists.archived'))
        setArchivingList(null)
      },
      onError: (error) => {
        const message =
          error instanceof ApiClientError && error.code === 'LIST_NOT_EMPTY'
            ? t('lists.errors.notEmpty')
            : t('lists.errors.archive')
        toast.error(message)
      },
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
        <DialogContent variant="modal" closeLabel={t('common.close')}>
          <div className="pe-10">
            <DialogTitle className="text-lg font-semibold">{t('lists.manageTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-sm">
              {t('lists.manageDescription')}
            </DialogDescription>
          </div>

          <div className="mt-6 space-y-2">
            {defaultList ? (
              <ListRow list={defaultList} label={t('lists.myTasks')}>
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <LockKeyhole aria-hidden="true" className="size-3.5" />
                  {t('lists.permanent')}
                </span>
              </ListRow>
            ) : null}

            <AnimatePresence initial={false} mode="wait">
              {customLists.length === 0 ? (
                <motion.div
                  key="no-custom-lists"
                  initial={taskHubItemMotion.initial}
                  animate={taskHubItemMotion.animate}
                  exit={taskHubItemMotion.exit}
                  transition={taskHubItemMotion.transition}
                  className="bg-muted/50 text-muted-foreground rounded-lg border border-dashed p-5 text-center text-sm"
                >
                  {t('lists.noCustomLists')}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {customLists.length > 0 ? (
              <TaskHubDragDropProvider
                onDragStart={() => {
                  draggingRef.current = true
                }}
                onDragEnd={(event) => {
                  draggingRef.current = false

                  if (event.canceled) {
                    setOrderedCustomLists(customLists)
                    return
                  }

                  const next = move(displayedCustomLists, event)
                  if (sameIds(next, displayedCustomLists)) return

                  const movedId = Number(event.operation.source?.id)
                  if (Number.isSafeInteger(movedId)) {
                    setRecentlyMovedId(movedId)
                  }

                  setOrderedCustomLists(next)
                  reorderMutation.mutate(
                    next.map((list) => list.id),
                    {
                      onError: () => toast.error(t('lists.errors.reorder')),
                    },
                  )
                }}
              >
                <div className="space-y-2" aria-busy={reorderMutation.isPending}>
                  <AnimatePresence initial={false}>
                    {displayedCustomLists.map((list, index) => (
                      <motion.div
                        key={list.id}
                        initial={taskHubItemMotion.initial}
                        animate={taskHubItemMotion.animate}
                        exit={taskHubItemMotion.exit}
                        transition={taskHubItemMotion.transition}
                      >
                        <SortableListRow
                      list={list}
                      index={index}
                      disabled={isPending}
                      label={list.name}
                      dragLabel={t('common.dragToReorder', { name: list.name })}
                      justMoved={recentlyMovedId === list.id}
                    >
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={isPending}
                          aria-label={t('lists.editList', { name: list.name })}
                          onClick={() => setEditingList(list)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={isPending}
                          aria-label={t('lists.archiveList', { name: list.name })}
                          onClick={() => setArchivingList(list)}
                        >
                          <Archive className="text-destructive size-4" />
                        </Button>
                      </div>
                        </SortableListRow>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </TaskHubDragDropProvider>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ListEditorDialog
        list={editingList}
        open={Boolean(editingList)}
        onOpenChange={(next) => !next && setEditingList(null)}
      />

      <ConfirmModal
        open={Boolean(archivingList)}
        title={t('lists.archiveTitle')}
        message={t('lists.archiveDescription', { name: archivingList?.name })}
        confirmText={t('lists.archiveAction')}
        cancelText={t('common.cancel')}
        danger
        loading={archiveMutation.isPending}
        onCancel={() => setArchivingList(null)}
        onConfirm={archive}
      />
    </>
  )
}

function SortableListRow({
  children,
  disabled,
  dragLabel,
  index,
  label,
  list,
  justMoved,
}: {
  children: React.ReactNode
  disabled: boolean
  dragLabel: string
  index: number
  label: string
  list: PersonalList
  justMoved: boolean
}) {
  const sortable = useTaskHubSortable({ id: list.id, index })
  const Icon = listIcons[list.iconKey]

  return (
    <div ref={sortable.ref} className="relative">
      <SortableDropIndicator position={sortable.dropPosition} />

      <div
        className={cn(
          'bg-card flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2',
          'origin-center transition-[transform,border-color,background-color,box-shadow] duration-180 ease-out motion-reduce:transition-none motion-reduce:transform-none',
          sortable.isDragging &&
            'border-primary/35 scale-[1.012] shadow-xl ring-1 ring-primary/15',
          sortable.isDropTarget &&
            !sortable.isDragging &&
            'border-primary/45 bg-primary/[0.035] scale-[1.006] shadow-md ring-1 ring-primary/10',
          justMoved && !sortable.isDragging && 'bg-primary/[0.06] ring-1 ring-primary/15',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <SortableDragHandle
            handleRef={sortable.handleRef}
            label={dragLabel}
            disabled={disabled}
            className="-ms-1 shrink-0"
          />
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg text-white"
            style={{ backgroundColor: list.color }}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <span className="truncate text-sm font-medium">{label}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function ListRow({
  children,
  label,
  list,
}: {
  children: React.ReactNode
  label: string
  list: PersonalList
}) {
  const Icon = list.isDefault ? ListTodo : listIcons[list.iconKey]
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg text-white"
          style={{ backgroundColor: list.color }}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="truncate text-sm font-medium">{label}</span>
      </div>
      {children}
    </div>
  )
}
