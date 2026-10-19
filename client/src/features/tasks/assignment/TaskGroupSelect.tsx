import { useTranslation } from 'react-i18next'

import { SearchableMultiSelect } from '@/components/shared/SearchableMultiSelect'
import type { SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import type { TaskGroup } from './task-groups.api'
import { buildGroupTree } from './task-groups.tree'

/** Shared owner-scoped hierarchy picker. 0 is a UI-only root option (DB ids are positive). */
export function TaskGroupSelect({ groups, value, onChange, disabled, excludeIds = [], rootLabel }: {
  groups: TaskGroup[]
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  excludeIds?: number[]
  rootLabel?: string
}) {
  const { t } = useTranslation()
  const options: SearchableSelectOption[] = [
    { value: 0, label: rootLabel ?? t('taskGroups.ungrouped') },
    ...buildGroupTree(groups)
      .filter(group => !excludeIds.includes(group.id))
      .map(group => ({
        value: group.id,
        label: group.path,
        description: group.parentGroupId === null
          ? t('taskGroups.topLevel')
          : t('taskGroups.nestedLevel', { level: group.depth + 1 }),
      })),
  ]

  return (
    <SearchableMultiSelect
      options={options}
      value={value ?? 0}
      onChange={next => onChange(next === null || next === 0 ? null : Number(next))}
      disabled={disabled ?? false}
      disableClear
      placeholder={t('taskGroups.select')}
      searchPlaceholder={t('taskGroups.search')}
      noResultsText={t('taskGroups.noMatchingGroups')}
      ariaLabel={t('taskGroups.select')}
    />
  )
}
