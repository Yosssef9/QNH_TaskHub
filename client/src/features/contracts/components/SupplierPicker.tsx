import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SearchInput } from '@/components/shared/SearchInput'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'

import { useSuppliers } from '../hooks/use-contracts'
import type { Supplier } from '../types/contracts.types'
import { SupplierEditorDialog } from './SupplierEditorDialog'

export function SupplierPicker({
  value,
  onChange,
  disabled = false,
  selectedName,
}: {
  value: number
  selectedName?: string | undefined
  onChange: (supplier: Supplier) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const suppliers = useSuppliers({ search, page: 1, pageSize: 50, archived: false })
  const selected = suppliers.data?.items.find((item) => item.id === value)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className="h-10 w-full justify-between px-3 font-normal"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-md">
                <Building2 aria-hidden="true" className="size-3.5" />
              </span>
              <span className="truncate">
                {selected?.name ?? selectedName ?? t('contracts.suppliers.selectPlaceholder')}
              </span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(28rem,calc(100vw-3rem))] p-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('contracts.suppliers.searchPlaceholder')}
            ariaLabel={t('contracts.suppliers.searchLabel')}
          />
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
            {suppliers.data?.items.map((supplier) => (
              <button
                key={supplier.id}
                type="button"
                className={cn(
                  'hover:bg-primary/10 hover:text-primary focus-visible:ring-ring flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm outline-none focus-visible:ring-2',
                  supplier.id === value && 'bg-primary/10 text-primary',
                )}
                onClick={() => {
                  onChange(supplier)
                  setOpen(false)
                }}
              >
                <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-md">
                  <Building2 aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">{supplier.name}</span>
                {supplier.id === value ? <Check aria-hidden="true" className="size-4" /> : null}
              </button>
            ))}
            {!suppliers.isPending && (suppliers.data?.items.length ?? 0) === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                {t('contracts.suppliers.noResults')}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            className="mt-2 w-full justify-start"
            onClick={() => {
              setOpen(false)
              setCreateOpen(true)
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            {search.trim()
              ? t('contracts.suppliers.addNamed', { name: search.trim() })
              : t('contracts.suppliers.add')}
          </Button>
        </PopoverContent>
      </Popover>

      <SupplierEditorDialog
        open={createOpen}
        quickCreateName={search}
        onOpenChange={setCreateOpen}
        onSaved={(supplier) => {
          onChange(supplier)
          setCreateOpen(false)
          setSearch('')
        }}
      />
    </>
  )
}
