import { Bookmark, Copy, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDeleteProcurementSavedView, useDuplicateProcurementSavedView, useProcurementSavedViews, useSetDefaultProcurementSavedView } from '../hooks/use-procurement-saved-views'
import { ProcurementSavedViewEditorDialog } from './ProcurementSavedViewEditorDialog'

export function ProcurementSavedViewsBar({ activeId, onActiveChange }: { activeId: number | null; onActiveChange: (id: number | null) => void }) {
  const { t } = useTranslation()
  const views = useProcurementSavedViews()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const remove = useDeleteProcurementSavedView()
  const duplicate = useDuplicateProcurementSavedView()
  const setDefault = useSetDefaultProcurementSavedView()
  const active = views.data?.find((view) => view.id === activeId) ?? null

  async function removeActive() {
    if (!active) return
    try { await remove.mutateAsync({ id: active.id, rowVersion: active.rowVersion }); onActiveChange(null); toast.success(t('savedViews.deleted')) }
    catch { toast.error(t('savedViews.errors.delete')) }
    setDeleteOpen(false)
  }
  async function duplicateActive() {
    if (!active) return
    try { const copy = await duplicate.mutateAsync({ id: active.id, name: t('savedViews.copyName', { name: active.name }) }); onActiveChange(copy.id); toast.success(t('savedViews.duplicated')) }
    catch { toast.error(t('savedViews.errors.save')) }
  }
  async function defaultActive() {
    if (!active) return
    try { await setDefault.mutateAsync(active.id); toast.success(t('savedViews.defaultSaved')) }
    catch { toast.error(t('savedViews.errors.save')) }
  }

  return <>
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2"><Bookmark className="text-primary size-4 shrink-0" /><Select value={activeId === null ? 'ALL' : String(activeId)} onValueChange={(value) => onActiveChange(value === 'ALL' ? null : Number(value))}><SelectTrigger className="w-full lg:max-w-sm" aria-label={t('savedViews.selectorLabel')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('savedViews.allItems')}</SelectItem>{views.data?.map((view) => <SelectItem key={view.id} value={String(view.id)}>{view.isDefault ? `★ ${view.name}` : view.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setEditId(null); setEditorOpen(true) }}><Plus className="size-4" />{t('savedViews.create')}</Button>{active ? <><Button variant="outline" size="sm" onClick={() => { setEditId(active.id); setEditorOpen(true) }}><Pencil className="size-4" />{t('common.edit')}</Button><Button variant="outline" size="sm" onClick={() => void duplicateActive()}><Copy className="size-4" />{t('savedViews.duplicate')}</Button><Button variant="outline" size="sm" disabled={active.isDefault} onClick={() => void defaultActive()}><Star className="size-4" />{t('savedViews.setDefault')}</Button><Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" />{t('common.delete')}</Button></> : null}</div>
    </div>
    {active ? <p className="text-muted-foreground mt-2 text-xs">{t('savedViews.activeSummary', { items: active.config.itemIds.length, suppliers: active.config.supplierIds.length, period: t(`savedViews.periods.${active.config.period}`) })}</p> : null}
    {editorOpen ? <ProcurementSavedViewEditorDialog open savedViewId={editId} onOpenChange={setEditorOpen} onSaved={(id) => onActiveChange(id)} /> : null}
    <ConfirmModal open={deleteOpen} title={t('savedViews.deleteTitle')} message={t('savedViews.deleteDescription')} confirmText={t('common.delete')} cancelText={t('common.cancel')} danger onConfirm={() => void removeActive()} onCancel={() => setDeleteOpen(false)} />
  </>
}

