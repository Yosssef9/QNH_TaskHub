import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, Save } from 'lucide-react'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { IconPicker } from '@/components/shared/IconPicker'
import { Input } from '@/components/ui/input'
import { ApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'

import { useCreateList, useUpdateList } from '../hooks/use-lists'
import { LIST_COLORS, LIST_ICON_KEYS } from '../types/list.types'
import type { PersonalList, SaveListInput } from '../types/list.types'
import { listIcons } from './list-icons'

const listFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  iconKey: z.enum(LIST_ICON_KEYS),
  color: z.enum(LIST_COLORS),
})

interface ListEditorDialogProps {
  list?: PersonalList | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ListEditorDialog({ list, onOpenChange, open }: ListEditorDialogProps) {
  const { t } = useTranslation()
  const createMutation = useCreateList()
  const updateMutation = useUpdateList()
  const isEditing = Boolean(list)
  const isPending = createMutation.isPending || updateMutation.isPending
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<SaveListInput>({
    resolver: zodResolver(listFormSchema),
    defaultValues: {
      name: list?.name ?? '',
      iconKey: list?.iconKey ?? 'list-todo',
      color: list?.color ?? '#2563EB',
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      name: list?.name ?? '',
      iconKey: list?.iconKey ?? 'list-todo',
      color: list?.color ?? '#2563EB',
    })
  }, [list, open, reset])

  const selectedIcon = useWatch({ control, name: 'iconKey' })
  const selectedColor = useWatch({ control, name: 'color' })

  function handleError(error: unknown) {
    const message =
      error instanceof ApiClientError && error.code === 'LIST_NAME_ALREADY_EXISTS'
        ? t('lists.errors.duplicateName')
        : t('lists.errors.save')
    toast.error(message)
  }

  const submit = handleSubmit((values) => {
    if (list) {
      updateMutation.mutate(
        { listId: list.id, values },
        {
          onSuccess: () => {
            toast.success(t('lists.updated'))
            onOpenChange(false)
          },
          onError: handleError,
        },
      )
      return
    }

    createMutation.mutate(values, {
      onSuccess: () => {
        toast.success(t('lists.created'))
        onOpenChange(false)
      },
      onError: handleError,
    })
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
            {isEditing ? <Save className="size-5" /> : <Plus className="size-5" />}
          </div>
          <div>
            <DialogTitle className="text-lg font-semibold">
              {t(isEditing ? 'lists.editTitle' : 'lists.createTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-sm">
              {t(isEditing ? 'lists.editDescription' : 'lists.createDescription')}
            </DialogDescription>
          </div>
        </div>

        <form className="mt-6 space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <label htmlFor="list-name" className="text-sm font-medium">
              {t('lists.name')}
            </label>
            <Input
              id="list-name"
              autoFocus
              maxLength={120}
              aria-invalid={Boolean(errors.name)}
              placeholder={t('lists.namePlaceholder')}
              {...register('name')}
            />
            {errors.name ? (
              <p className="text-destructive text-xs">{t('lists.errors.nameRequired')}</p>
            ) : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('lists.icon')}</legend>
            <IconPicker
              value={selectedIcon}
              options={LIST_ICON_KEYS}
              icons={listIcons}
              getLabel={(iconKey) => t(`common.icons.${iconKey}`)}
              searchLabel={t('common.iconPicker.searchLabel')}
              searchPlaceholder={t('common.iconPicker.searchPlaceholder')}
              clearSearchLabel={t('common.iconPicker.clearSearch')}
              noResultsText={t('common.iconPicker.noResults')}
              selectedLabel={t('common.iconPicker.selected')}
              accentColor={selectedColor}
              onChange={(iconKey) =>
                setValue('iconKey', iconKey, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('lists.color')}</legend>
            <div className="flex flex-wrap gap-3" aria-label={t('lists.color')}>
              {LIST_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={t('lists.selectColor', { color })}
                  aria-pressed={selectedColor === color}
                  className={cn(
                    'size-8 rounded-full border-2 border-white shadow-sm transition-transform outline-none hover:scale-110',
                    selectedColor === color && 'ring-ring ring-2 ring-offset-2',
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setValue('color', color, { shouldValidate: true })}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
