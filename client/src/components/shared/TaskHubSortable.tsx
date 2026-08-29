import { Feedback, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom'
import { DragDropProvider, useDragOperation } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { GripVertical } from 'lucide-react'
import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

const smoothEase = 'cubic-bezier(0.2, 0, 0, 1)'

const feedbackPlugin = Feedback.configure({
  feedback: 'clone',
  dropAnimation: {
    duration: 180,
    easing: smoothEase,
  },
})

type DragDropProviderProps = ComponentProps<typeof DragDropProvider>

export type TaskHubDropPosition = 'before' | 'after' | null

export function TaskHubDragDropProvider({ children, ...props }: DragDropProviderProps) {
  return (
    <DragDropProvider
      {...props}
      sensors={(defaults) => [
        ...defaults.filter((sensor) => sensor !== PointerSensor),
        PointerSensor.configure({
          activationConstraints(event) {
            if (event.pointerType === 'touch') {
              return [
                new PointerActivationConstraints.Delay({
                  value: 220,
                  tolerance: 6,
                }),
              ]
            }

            return [new PointerActivationConstraints.Distance({ value: 6 })]
          },
        }),
      ]}
    >
      {children}
    </DragDropProvider>
  )
}

export function useTaskHubSortable({
  id,
  index,
  disabled = false,
}: {
  id: string | number
  index: number
  disabled?: boolean
}) {
  const sortable = useSortable({
    id,
    index,
    disabled,
    plugins: [feedbackPlugin],
    transition: {
      duration: 180,
      easing: smoothEase,
      idle: true,
    },
  })

  const { source, target } = useDragOperation()

  let dropPosition: TaskHubDropPosition = null

  if (
    sortable.isDropTarget &&
    source &&
    target &&
    source.id !== target.id &&
    isSortable(source) &&
    isSortable(target)
  ) {
    dropPosition = source.initialIndex < target.index ? 'after' : 'before'
  }

  return {
    ...sortable,
    dropPosition,
  }
}

export function SortableDropIndicator({
  position,
  insetClassName = 'inset-x-2',
}: {
  position: TaskHubDropPosition
  insetClassName?: string
}) {
  if (!position) return null

  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-primary pointer-events-none absolute z-30 h-0.5 rounded-full shadow-[0_0_0_1px_rgb(255_255_255/0.35)]',
        insetClassName,
        position === 'before' ? '-top-[5px]' : '-bottom-[5px]',
      )}
    >
      <span className="bg-primary absolute start-0 top-1/2 size-2 -translate-y-1/2 rounded-full" />
    </span>
  )
}

export function SortableDragHandle({
  handleRef,
  label,
  disabled = false,
  className,
}: {
  handleRef: (element: Element | null) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={(node) => handleRef(node)}
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          aria-label={label}
          data-drag-handle=""
          className={cn(
            'text-muted-foreground/70 hover:bg-muted hover:text-foreground size-8 cursor-grab touch-none select-none active:cursor-grabbing',
            className,
          )}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
