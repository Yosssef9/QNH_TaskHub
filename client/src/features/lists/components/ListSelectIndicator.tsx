import { useTranslation } from 'react-i18next'

import type { PersonalList } from '../types/list.types'
import { listIcons } from './list-icons'

export function ListSelectIndicator({ list }: { list: PersonalList }) {
  const { t } = useTranslation()
  const Icon = listIcons[list.iconKey]
  return (
    <span className="inline-flex min-w-0 items-center gap-2 font-medium">
      <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-md">
        <Icon aria-hidden="true" className="size-3.5" style={{ color: list.color }} />
      </span>
      <span className="truncate">{list.isDefault ? t('lists.myTasks') : list.name}</span>
    </span>
  )
}
