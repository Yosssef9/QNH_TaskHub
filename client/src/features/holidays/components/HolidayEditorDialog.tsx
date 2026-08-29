import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ApiClientError } from '@/lib/api-error'

import { useSaveHoliday } from '../hooks/use-holidays'
import type { Holiday } from '../types/holiday.types'

export function HolidayEditorDialog({
  holiday,
  open,
  onOpenChange,
}: {
  holiday: Holiday | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const save = useSaveHoliday()
  const [holidayDate, setHolidayDate] = useState(holiday?.holidayDate ?? '')
  const [nameAr, setNameAr] = useState(holiday?.nameAr ?? '')
  const [nameEn, setNameEn] = useState(holiday?.nameEn ?? '')
  const [isActive, setIsActive] = useState(holiday?.isActive ?? true)
  const valid = Boolean(holidayDate && nameAr.trim() && nameEn.trim())

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <DialogTitle>{t(holiday ? 'holidays.editTitle' : 'holidays.createTitle')}</DialogTitle>
        <DialogDescription>{t('holidays.formDescription')}</DialogDescription>
        <div className="mt-5 space-y-4">
          <DatePicker
            required
            label={t('holidays.date')}
            value={holidayDate}
            onChange={setHolidayDate}
          />
          <label className="space-y-1.5 text-sm font-medium">
            <span>{t('holidays.nameAr')}</span>
            <Input
              dir="rtl"
              value={nameAr}
              maxLength={150}
              onChange={(event) => setNameAr(event.target.value)}
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>{t('holidays.nameEn')}</span>
            <Input
              dir="ltr"
              value={nameEn}
              maxLength={150}
              onChange={(event) => setNameEn(event.target.value)}
            />
          </label>
          <div className="bg-muted/50 flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm font-medium">{t('holidays.active')}</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!valid || save.isPending}
              onClick={() =>
                save.mutate(
                  {
                    ...(holiday ? { holidayId: holiday.id } : {}),
                    values: { holidayDate, nameAr: nameAr.trim(), nameEn: nameEn.trim(), isActive },
                  },
                  {
                    onSuccess: () => {
                      toast.success(t('holidays.saved'))
                      onOpenChange(false)
                    },
                    onError: (error) =>
                      toast.error(
                        error instanceof ApiClientError && error.code === 'HOLIDAY_DATE_EXISTS'
                          ? t('holidays.duplicate')
                          : t('holidays.saveError'),
                      ),
                  },
                )
              }
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
