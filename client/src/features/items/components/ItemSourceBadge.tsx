import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { ItemSource } from '../types/item.types'

export function ItemSourceBadge({ source }: { source: ItemSource }) {
  const { t } = useTranslation()
  return <Badge variant={source === 'MANUAL' ? 'secondary' : 'default'}>{t(source === 'MANUAL' ? 'items.sourceManual' : 'items.sourceOracle')}</Badge>
}
