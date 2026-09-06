import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import type { SupplierSource } from '../types/supplier.types'

export function SupplierSourceBadge({ source }: { source: SupplierSource }) {
  const { t } = useTranslation()
  return (
    <Badge variant={source === 'MANUAL' ? 'secondary' : 'default'}>
      {t(source === 'MANUAL' ? 'suppliers.sourceManual' : 'suppliers.sourceOracle')}
    </Badge>
  )
}
