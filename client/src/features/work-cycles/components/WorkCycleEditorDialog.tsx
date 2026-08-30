import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { IconPicker } from '@/components/shared/IconPicker'
import { SearchableMultiSelect } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { kpiIcons } from '@/features/kpis/components/kpi-icons'
import { KPI_COLORS, KPI_ICON_KEYS } from '@/features/kpis/types/kpi.types'
import type { PersonalKpi } from '@/features/kpis/types/kpi.types'
import { ApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'

import { useCreateWorkCycle, useUpdateWorkCycle } from '../hooks/use-work-cycles'
import type { SaveWorkCycleInput, WorkCycle } from '../types/work-cycle.types'

const blank: SaveWorkCycleInput = {
  title: '',
  description: null,
  iconKey: 'briefcase',
  color: '#2563EB',
  startDate: null,
  endDate: null,
  kpiIds: [],
}

function valuesFromCycle(cycle?: WorkCycle | null): SaveWorkCycleInput {
  if (!cycle) return { ...blank }
  return {
    title: cycle.title,
    description: cycle.description,
    iconKey: cycle.iconKey,
    color: cycle.color as SaveWorkCycleInput['color'],
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    kpiIds: cycle.instances.map((item) => item.templateId),
  }
}

export function WorkCycleEditorDialog({
  cycle,
  kpis,
  open,
  onOpenChange,
}: {
  cycle?: WorkCycle | null
  kpis: PersonalKpi[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<SaveWorkCycleInput>(() => valuesFromCycle(cycle))
  const [error, setError] = useState('')
  const create = useCreateWorkCycle()
  const update = useUpdateWorkCycle()
  const pending = create.isPending || update.isPending
  const selectableKpis = kpis.filter((item) => item.isActive)

  function patch<K extends keyof SaveWorkCycleInput>(key: K, value: SaveWorkCycleInput[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function submit() {
    if (!values.title.trim()) {
      setError(t('workCycles.errors.titleRequired'))
      return
    }
    if (values.startDate && values.endDate && values.startDate > values.endDate) {
      setError(t('workCycles.errors.dateRange'))
      return
    }
    if (!cycle && values.kpiIds.length === 0) {
      setError(t('workCycles.errors.kpiRequired'))
      return
    }

    const options = {
      onSuccess: () => {
        toast.success(t(cycle ? 'workCycles.updated' : 'workCycles.created'))
        onOpenChange(false)
      },
      onError: (reason: unknown) =>
        toast.error(
          reason instanceof ApiClientError && reason.code === 'WORK_CYCLE_NAME_ALREADY_EXISTS'
            ? t('workCycles.errors.duplicateName')
            : t('workCycles.errors.save'),
        ),
    }

    if (cycle) {
      const metadata = {
        title: values.title,
        description: values.description,
        iconKey: values.iconKey,
        color: values.color,
        startDate: values.startDate,
        endDate: values.endDate,
      }
      update.mutate({ cycleId: cycle.id, values: metadata }, options)
    } else {
      create.mutate(values, options)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="w-[min(46rem,calc(100vw-2rem))]"
      >
        <DialogTitle>{t(cycle ? 'workCycles.editTitle' : 'workCycles.createTitle')}</DialogTitle>
        <DialogDescription>{t('workCycles.formDescription')}</DialogDescription>

        <div className="mt-6 space-y-5">
          <label className="space-y-1.5 text-sm font-medium">
            <span>{t('workCycles.titleLabel')}</span>
            <Input
              autoFocus
              maxLength={1000}
              value={values.title}
              onChange={(event) => patch('title', event.target.value)}
            />
          </label>

          <label className="space-y-1.5 text-sm font-medium">
            <span>{t('workCycles.descriptionLabel')}</span>
            <Textarea
              rows={3}
              maxLength={1500}
              value={values.description ?? ''}
              onChange={(event) => patch('description', event.target.value || null)}
            />
          </label>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">{t('workCycles.icon')}</span>
              <IconPicker
                value={values.iconKey}
                options={KPI_ICON_KEYS}
                icons={kpiIcons}
                getLabel={(iconKey) => t(`common.icons.${iconKey}`)}
                searchLabel={t('common.iconPicker.searchLabel')}
                searchPlaceholder={t('common.iconPicker.searchPlaceholder')}
                clearSearchLabel={t('common.iconPicker.clearSearch')}
                noResultsText={t('common.iconPicker.noResults')}
                selectedLabel={t('common.iconPicker.selected')}
                accentColor={values.color}
                onChange={(iconKey) => patch('iconKey', iconKey)}
              />
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">{t('workCycles.color')}</span>
              <div className="flex flex-wrap gap-3">
                {KPI_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={t('workCycles.selectColor', { color })}
                    className={cn(
                      'size-8 rounded-full border-2 border-white',
                      values.color === color && 'ring-ring ring-2 ring-offset-2',
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => patch('color', color)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DatePicker
              label={t('workCycles.startDate')}
              value={values.startDate}
              onChange={(value) => patch('startDate', value || null)}
            />
            <DatePicker
              label={t('workCycles.endDate')}
              value={values.endDate}
              onChange={(value) => patch('endDate', value || null)}
            />
          </div>

          {!cycle ? (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">{t('workCycles.initialKpis')}</span>
              <SearchableMultiSelect
                multiple
                values={values.kpiIds}
                options={selectableKpis.map((kpi) => ({
                  value: kpi.id,
                  label: kpi.name,
                  description: t(`kpis.methods.${kpi.calculationMethod}`),
                }))}
                placeholder={t('workCycles.selectKpis')}
                searchPlaceholder={t('workCycles.searchKpis')}
                noResultsText={t('workCycles.noAvailableKpis')}
                ariaLabel={t('workCycles.initialKpis')}
                onChange={(ids) => patch('kpiIds', ids.map(Number))}
              />
              <p className="text-muted-foreground text-xs">{t('workCycles.snapshotHint')}</p>
            </div>
          ) : null}

          {error ? <p className="text-destructive text-sm font-medium">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
