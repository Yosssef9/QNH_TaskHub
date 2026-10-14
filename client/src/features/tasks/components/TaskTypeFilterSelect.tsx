import { ListTodo, LockKeyhole, UserRound, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TaskTypeFilter } from '../types/task.types'

const TASK_TYPE_OPTIONS = [
  { value: 'ALL', Icon: ListTodo },
  { value: 'TEAM', Icon: UsersRound },
  { value: 'SINGLE', Icon: UserRound },
  { value: 'PERSONAL', Icon: LockKeyhole },
] as const

export function TaskTypeFilterSelect({
  value,
  onChange,
}: {
  value: TaskTypeFilter
  onChange: (value: TaskTypeFilter) => void
}) {
  const { t } = useTranslation()
  const selected = TASK_TYPE_OPTIONS.find(option => option.value === value) ?? TASK_TYPE_OPTIONS[0]

  return (
    <Select value={value} onValueChange={next => onChange(next as TaskTypeFilter)}>
      <SelectTrigger className="h-10 w-full min-w-0" aria-label={t('tasks.taskTypeFilter.label')}>
        <SelectValue>
          <span className="flex min-w-0 items-center gap-2">
            <selected.Icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">{t(`tasks.taskTypeFilter.${selected.value}`)}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TASK_TYPE_OPTIONS.map(({ value: option, Icon }) => (
          <SelectItem key={option} value={option}>
            <span className="inline-flex min-w-0 items-center gap-2">
              <Icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
              <span>{t(`tasks.taskTypeFilter.${option}`)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
