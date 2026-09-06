import { Check, ChevronsUpDown, Loader2, PackageSearch } from 'lucide-react'
import { useMemo, useState, type UIEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchInput } from '@/components/shared/SearchInput'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'
import { useInfiniteItemOptions } from '../hooks/use-items'
import type { ItemOption } from '../types/item.types'

export function ItemPicker({
  value,
  onChange,
  disabled = false,
  selectedName,
}: {
  value: number
  selectedName?: string | undefined
  onChange: (item: ItemOption) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const items = useInfiniteItemOptions({ search, pageSize: 50 }, open)
  const itemOptions = useMemo(
    () => items.data?.pages.flatMap((page) => page.items) ?? [],
    [items.data],
  )
  const selected = itemOptions.find((item) => item.id === value)

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 64
    if (nearBottom && items.hasNextPage && !items.isFetchingNextPage) {
      void items.fetchNextPage()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className="h-10 w-full justify-between px-3 font-normal">
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-md">
              <PackageSearch aria-hidden="true" className="size-3.5" />
            </span>
            <span className="truncate">{selected?.name ?? selectedName ?? t('priceQuotes.selectItem')}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(34rem,calc(100vw-3rem))] p-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('items.searchPlaceholder')} ariaLabel={t('items.searchLabel')} />
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto" onScroll={handleScroll}>
          {itemOptions.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'hover:bg-primary/10 hover:text-primary focus-visible:ring-ring flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm outline-none focus-visible:ring-2',
                item.id === value && 'bg-primary/10 text-primary',
              )}
              onClick={() => { onChange(item); setOpen(false) }}
            >
              <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-md">
                <PackageSearch aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="text-muted-foreground flex gap-2 text-xs">
                  <span dir="ltr">{item.code}</span>
                  {item.unit ? <span>· {item.unit}</span> : null}
                </span>
              </span>
              {item.id === value ? <Check aria-hidden="true" className="size-4" /> : null}
            </button>
          ))}
          {items.isPending && itemOptions.length === 0 ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 px-3 py-4 text-sm">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : null}
          {!items.isPending && !items.isError && itemOptions.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t('items.emptyTitle')}</p>
          ) : null}
          {items.isFetchingNextPage ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 px-3 py-3 text-xs">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

