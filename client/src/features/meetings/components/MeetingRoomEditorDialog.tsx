import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-error'

import { useSaveMeetingRoom } from '../hooks/use-meeting-rooms'
import type { MeetingRoom } from '../types/meeting.types'

export function MeetingRoomEditorDialog({
  room,
  open,
  onOpenChange,
}: {
  room: MeetingRoom | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const save = useSaveMeetingRoom()
  const [code, setCode] = useState(room?.code ?? '')
  const [nameAr, setNameAr] = useState(room?.nameAr ?? '')
  const [nameEn, setNameEn] = useState(room?.nameEn ?? '')
  const [locationText, setLocationText] = useState(room?.locationText ?? '')
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 1))
  const [equipmentNotes, setEquipmentNotes] = useState(room?.equipmentNotes ?? '')
  const [isActive, setIsActive] = useState(room?.isActive ?? true)

  const capacityNumber = Number(capacity)
  const valid =
    nameAr.trim().length > 0 &&
    nameEn.trim().length > 0 &&
    Number.isInteger(capacityNumber) &&
    capacityNumber > 0

  function submit() {
    const baseValues = {
      code: code.trim() || null,
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      locationText: locationText.trim() || null,
      capacity: capacityNumber,
      equipmentNotes: equipmentNotes.trim() || null,
      isActive,
    }

    save.mutate(
      {
        ...(room ? { roomId: room.id } : {}),
        values: room ? { ...baseValues, rowVersion: room.rowVersion } : baseValues,
      },
      {
        onSuccess: () => {
          toast.success(t('meetingRooms.saved'))
          onOpenChange(false)
        },
        onError: (error) => {
          const key =
            error instanceof ApiClientError && error.code === 'MEETING_ROOM_CODE_EXISTS'
              ? 'meetingRooms.errors.duplicateCode'
              : error instanceof ApiClientError && error.code === 'MEETING_ROOM_STALE'
                ? 'meetingRooms.errors.stale'
                : 'meetingRooms.errors.save'
          toast.error(t(key))
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <DialogTitle>
          {t(room ? 'meetingRooms.editTitle' : 'meetingRooms.createTitle')}
        </DialogTitle>
        <DialogDescription>{t('meetingRooms.formDescription')}</DialogDescription>

        <div className="mt-5 space-y-4">
          <label className="space-y-1.5 text-sm font-medium">
            <span>{t('meetingRooms.code')}</span>
            <Input
              value={code}
              maxLength={50}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t('meetingRooms.codePlaceholder')}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              <span>{t('meetingRooms.nameAr')}</span>
              <Input
                dir="rtl"
                value={nameAr}
                maxLength={150}
                onChange={(event) => setNameAr(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>{t('meetingRooms.nameEn')}</span>
              <Input
                dir="ltr"
                value={nameEn}
                maxLength={150}
                onChange={(event) => setNameEn(event.target.value)}
              />
            </label>
          </div>

          <label className="space-y-1.5 text-sm font-medium">
            <span>{t('meetingRooms.location')}</span>
            <Input
              value={locationText}
              maxLength={300}
              onChange={(event) => setLocationText(event.target.value)}
              placeholder={t('meetingRooms.locationPlaceholder')}
            />
          </label>

          <label className="space-y-1.5 text-sm font-medium">
            <span>{t('meetingRooms.capacity')}</span>
            <Input
              type="number"
              min={1}
              max={10000}
              inputMode="numeric"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
            />
          </label>

          <label className="space-y-1.5 text-sm font-medium">
            <span>{t('meetingRooms.equipmentNotes')}</span>
            <Textarea
              value={equipmentNotes}
              maxLength={1000}
              rows={4}
              onChange={(event) => setEquipmentNotes(event.target.value)}
              placeholder={t('meetingRooms.equipmentNotesPlaceholder')}
            />
          </label>

          <div className="bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t('meetingRooms.active')}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('meetingRooms.activeDescription')}
              </p>
            </div>
            <Switch
              checked={isActive}
              aria-label={t('meetingRooms.active')}
              onCheckedChange={setIsActive}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button disabled={!valid || save.isPending} onClick={submit}>
              {save.isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
