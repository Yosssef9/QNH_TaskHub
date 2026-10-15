import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateItemCodeGroup, useDeleteItemCodeGroup, useUpdateItemCodeGroup } from '../hooks/use-item-code-groups'
import type { ItemCodeGroup } from '../api/item-code-groups.api'

export function ItemCodeGroupPicker({
  groups,
  selectedId,
  onSelect,
}: {
  groups: ItemCodeGroup[]
  selectedId: number | null
  onSelect: (id: number | null) => void
}) {
  const { t } = useTranslation()
  const create = useCreateItemCodeGroup()
  const update = useUpdateItemCodeGroup()
  const remove = useDeleteItemCodeGroup()
  const [editing, setEditing] = useState<ItemCodeGroup | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const selected = groups.find(group => group.id === selectedId) ?? null
  const saving = create.isPending || update.isPending
  const valid = name.trim().length > 0 && name.trim().length <= 120 && /^[0-9]{2,20}$/.test(prefix)
  const duplicate = groups.some(group => group.id !== editing?.id && (group.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase() || group.prefix === prefix))

  // New and Edit both use one small dialog; no user-specific ownership restriction.
  function openEditor(group: ItemCodeGroup | null) {
    setEditing(group)
    setName(group?.name ?? '')
    setPrefix(group?.prefix ?? '')
    setDialogOpen(true)
  }
  async function save() {
    if (!valid || duplicate || saving) return
    try {
      const input = { name: name.trim(), prefix }
      const saved = editing
        ? await update.mutateAsync({ id: editing.id, input: { ...input, rowVersion: editing.rowVersion } })
        : await create.mutateAsync(input)
      onSelect(saved.id)
      setDialogOpen(false)
      toast.success(t('itemCodeGroups.saved'))
    } catch {
      toast.error(t('itemCodeGroups.saveError'))
    }
  }
  async function confirmDelete() {
    if (!selected || remove.isPending) return
    try {
      await remove.mutateAsync({ id: selected.id, rowVersion: selected.rowVersion })
      onSelect(null)
      setDeleteOpen(false)
      toast.success(t('itemCodeGroups.deleted'))
    } catch {
      setDeleteOpen(false)
      toast.error(t('itemCodeGroups.deleteError'))
    }
  }
  useEffect(() => {
    if (!dialogOpen) { setEditing(null) }
  }, [dialogOpen])

  return <>
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Tags className="text-primary size-4" aria-hidden="true" />
          {t('itemCodeGroups.title')}
          <span className="text-muted-foreground text-xs font-normal">{t('itemCodeGroups.shared')}</span>
        </div>
        <Select value={selectedId === null ? 'ALL' : String(selectedId)} onValueChange={value => onSelect(value === 'ALL' ? null : Number(value))}>
          <SelectTrigger className="w-full sm:max-w-md" aria-label={t('itemCodeGroups.selectorLabel')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('itemCodeGroups.allItems')}</SelectItem>
            {groups.map(group => <SelectItem key={group.id} value={String(group.id)}>{group.name} ({group.prefix})</SelectItem>)}
          </SelectContent>
        </Select>
        {selected ? <p className="text-muted-foreground text-xs">{t('itemCodeGroups.activeDescription', { prefix: selected.prefix })}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => openEditor(null)}><Plus className="size-4" />{t('itemCodeGroups.create')}</Button>
        {selected ? <>
          <Button size="sm" variant="outline" onClick={() => openEditor(selected)}><Pencil className="size-4" />{t('common.edit')}</Button>
          <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" />{t('common.delete')}</Button>
        </> : null}
      </div>
    </Card>
    <Dialog open={dialogOpen} onOpenChange={open => { if (!saving) setDialogOpen(open) }}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <div className="space-y-4 pe-7">
          <DialogTitle className="text-lg font-semibold">{t(editing ? 'itemCodeGroups.editTitle' : 'itemCodeGroups.createTitle')}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">{t('itemCodeGroups.dialogDescription')}</DialogDescription>
          <div className="space-y-1.5">
            <label htmlFor="code-group-name" className="text-sm font-medium">{t('itemCodeGroups.name')}</label>
            <Input id="code-group-name" maxLength={120} value={name} onChange={event => setName(event.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="code-group-prefix" className="text-sm font-medium">{t('itemCodeGroups.prefix')}</label>
            <Input id="code-group-prefix" inputMode="numeric" dir="ltr" maxLength={20} value={prefix} onChange={event => setPrefix(event.target.value.replace(/[^0-9]/g, ''))} placeholder="02" />
            <p className="text-muted-foreground text-xs">{t('itemCodeGroups.prefixHint')}</p>
          </div>
          {duplicate ? <p className="text-destructive text-sm" role="alert">{t('itemCodeGroups.duplicate')}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{t('common.cancel')}</Button>
            <Button onClick={() => void save()} disabled={!valid || duplicate || saving}>{t('common.save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmModal
      open={deleteOpen} title={t('itemCodeGroups.deleteTitle')}
      message={t('itemCodeGroups.deleteDescription', { name: selected?.name ?? '' })}
      confirmText={t('common.delete')} cancelText={t('common.cancel')} danger loading={remove.isPending}
      onConfirm={() => void confirmDelete()} onCancel={() => setDeleteOpen(false)}
    />
  </>
}
