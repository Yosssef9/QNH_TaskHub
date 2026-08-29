import { Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { SearchableMultiSelect } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { PersonalKpi } from '@/features/kpis/types/kpi.types'

import { useAddCycleKpis } from '../hooks/use-work-cycles'
import type { WorkCycle } from '../types/work-cycle.types'

export function AddCycleKpisDialog({
  cycle,
  kpis,
  open,
  onOpenChange,
}: {
  cycle: WorkCycle
  kpis: PersonalKpi[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [ids, setIds] = useState<number[]>([])
  const add = useAddCycleKpis()
  const existing = new Set(cycle.instances.map((item) => item.templateId))
  const available = kpis.filter((item) => item.isActive && !existing.has(item.id))

  function submit() {
    if (ids.length === 0) return
    add.mutate(
      { cycleId: cycle.id, kpiIds: ids },
      {
        onSuccess: () => {
          toast.success(t('workCycles.kpisAdded'))
          onOpenChange(false)
        },
        onError: () => toast.error(t('workCycles.errors.addKpis')),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !add.isPending && onOpenChange(next)}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <DialogTitle>{t('workCycles.addKpisTitle')}</DialogTitle>
        <DialogDescription>{t('workCycles.addKpisDescription')}</DialogDescription>
        <div className="mt-5 space-y-4">
          <SearchableMultiSelect
            multiple
            values={ids}
            options={available.map((kpi) => ({
              value: kpi.id,
              label: kpi.name,
              description: t(`kpis.methods.${kpi.calculationMethod}`),
            }))}
            placeholder={t('workCycles.selectKpis')}
            searchPlaceholder={t('workCycles.searchKpis')}
            noResultsText={t('workCycles.noAvailableKpis')}
            ariaLabel={t('workCycles.initialKpis')}
            onChange={(values) => setIds(values.map(Number))}
          />
          <p className="text-muted-foreground text-xs">{t('workCycles.snapshotHint')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={add.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={ids.length === 0 || add.isPending}>
              {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t('workCycles.addKpis')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
