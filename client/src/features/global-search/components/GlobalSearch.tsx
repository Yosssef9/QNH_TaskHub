import {
  Briefcase,
  CheckCircle2,
  Gauge,
  House,
  ListChecks,
  ListTodo,
  Loader2,
  Search,
  Settings,
  Star,
  Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

import { useGlobalSearch } from '../hooks/use-global-search'
import type {
  GlobalSearchResult,
  GlobalSearchResultType,
} from '../types/global-search.types'

const SEARCH_DEBOUNCE_MS = 250

const resultIcons: Record<GlobalSearchResultType, LucideIcon> = {
  TASK: ListChecks,
  SUBTASK: CheckCircle2,
  WORK_CYCLE: Briefcase,
  KPI_INSTANCE: Gauge,
  KPI_TEMPLATE: Target,
  LIST: ListTodo,
}

const resultOrder: GlobalSearchResultType[] = [
  'TASK',
  'SUBTASK',
  'WORK_CYCLE',
  'KPI_INSTANCE',
  'KPI_TEMPLATE',
  'LIST',
]

interface GlobalSearchProps {
  className?: string
}

export function GlobalSearch({ className }: GlobalSearchProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const searchQuery = useGlobalSearch(debouncedQuery)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
    }

    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const results = searchQuery.data?.results ?? []
  const currentResults = useMemo(
    () => results.filter((result) => result.isCurrentContext),
    [results],
  )
  const otherResults = useMemo(
    () => results.filter((result) => !result.isCurrentContext),
    [results],
  )

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
      setDebouncedQuery('')
    }
  }

  function openHref(href: string) {
    changeOpen(false)
    navigate(href)
  }

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        className="border-input bg-muted/35 text-muted-foreground hover:bg-muted/55 hover:text-foreground focus-visible:ring-ring hidden h-10 w-full min-w-0 items-center gap-2 rounded-xl border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 md:flex"
        aria-label={t('globalSearch.open')}
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-start">{t('globalSearch.placeholder')}</span>
        <kbd className="border-border bg-background text-muted-foreground hidden shrink-0 rounded-md border px-1.5 py-0.5 font-sans text-[11px] font-medium lg:inline-flex">
          Ctrl K
        </kbd>
      </button>

      <button
        type="button"
        className="hover:bg-accent focus-visible:ring-ring grid size-10 place-items-center rounded-md outline-none focus-visible:ring-2 md:hidden"
        aria-label={t('globalSearch.open')}
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden="true" className="size-5" />
      </button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          variant="modal"
          closeLabel={t('common.close')}
          className="top-[10vh] max-h-[80vh] w-[min(46rem,calc(100vw-1rem))] max-w-none -translate-y-0 overflow-hidden p-0"
        >
          <DialogTitle className="sr-only">{t('globalSearch.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('globalSearch.description')}</DialogDescription>

          <Command shouldFilter={false} loop className="max-h-[80vh]">
            <CommandInput
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder={t('globalSearch.placeholder')}
              aria-label={t('globalSearch.inputLabel')}
              className="h-14 pe-12 text-base"
            />

            <CommandList className="max-h-[min(62vh,34rem)] p-2">
              {query.trim().length < 2 ? (
                <QuickDestinations onOpen={openHref} />
              ) : debouncedQuery !== query.trim() ? (
                <SearchLoading />
              ) : searchQuery.isError ? (
                <div className="text-destructive px-3 py-8 text-center text-sm">
                  {t('globalSearch.error')}
                </div>
              ) : searchQuery.isFetching && !searchQuery.data ? (
                <SearchLoading />
              ) : results.length === 0 ? (
                <div className="text-muted-foreground px-3 py-10 text-center text-sm">
                  <Search className="mx-auto mb-3 size-6 opacity-50" />
                  <p className="font-medium">{t('globalSearch.noResults')}</p>
                  <p className="mt-1 text-xs">{t('globalSearch.noResultsHint')}</p>
                </div>
              ) : (
                <>
                  {currentResults.length ? (
                    <ResultSection
                      title={t('globalSearch.currentCycleMatches')}
                      results={currentResults}
                      onOpen={openHref}
                    />
                  ) : null}

                  {resultOrder.map((type) => {
                    const typedResults = otherResults.filter((result) => result.type === type)
                    return typedResults.length ? (
                      <ResultSection
                        key={type}
                        title={t(`globalSearch.groups.${type}`)}
                        results={typedResults}
                        onOpen={openHref}
                      />
                    ) : null
                  })}
                </>
              )}
            </CommandList>

            <div className="border-border text-muted-foreground flex items-center justify-between gap-3 border-t px-4 py-2 text-[11px]">
              <span>{t('globalSearch.keyboardHint')}</span>
              <span className="hidden sm:inline">Esc · {t('globalSearch.closeHint')}</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SearchLoading() {
  const { t } = useTranslation()
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 px-3 py-10 text-sm">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      {t('globalSearch.searching')}
    </div>
  )
}

function QuickDestinations({ onOpen }: { onOpen: (href: string) => void }) {
  const { t } = useTranslation()
  const destinations = [
    { href: '/', icon: House, label: t('navigation.home') },
    { href: '/work-cycles', icon: Briefcase, label: t('workCycles.title') },
    { href: '/kpi-tasks', icon: ListChecks, label: t('navigation.kpiTasks') },
    { href: '/kpis', icon: Target, label: t('kpis.title') },
    { href: '/settings', icon: Settings, label: t('navigation.settings') },
  ]

  return (
    <section className="py-1">
      <p className="text-muted-foreground px-2 py-2 text-xs font-semibold tracking-wide">
        {t('globalSearch.quickDestinations')}
      </p>
      {destinations.map(({ href, icon: Icon, label }) => (
        <CommandItem key={href} value={`destination-${href}`} onSelect={() => onOpen(href)}>
          <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <span className="font-medium">{label}</span>
        </CommandItem>
      ))}
      <p className="text-muted-foreground px-2 pt-4 pb-2 text-xs">
        {t('globalSearch.startTyping')}
      </p>
    </section>
  )
}

function ResultSection({
  title,
  results,
  onOpen,
}: {
  title: string
  results: GlobalSearchResult[]
  onOpen: (href: string) => void
}) {
  return (
    <section className="py-1">
      <p className="text-muted-foreground px-2 py-2 text-xs font-semibold tracking-wide">{title}</p>
      {results.map((result) => (
        <SearchResultItem key={`${result.type}-${result.id}`} result={result} onOpen={onOpen} />
      ))}
    </section>
  )
}

function SearchResultItem({
  result,
  onOpen,
}: {
  result: GlobalSearchResult
  onOpen: (href: string) => void
}) {
  const { t } = useTranslation()
  const Icon = resultIcons[result.type]

  return (
    <CommandItem
      value={`${result.type}-${result.id}-${result.title}`}
      className="items-start px-2.5 py-2.5"
      onSelect={() => onOpen(result.href)}
    >
      <span className="bg-primary/8 text-primary mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{result.title}</span>
          {result.isCurrentContext ? (
            <span className="bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold">
              <Star aria-hidden="true" className="size-2.5 fill-current" />
              {t('globalSearch.current')}
            </span>
          ) : null}
        </span>
        {result.subtitle ? (
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
            {result.subtitle}
          </span>
        ) : null}
      </span>
      <span className="text-muted-foreground mt-1 shrink-0 text-[10px] font-medium">
        {t(`globalSearch.types.${result.type}`)}
      </span>
    </CommandItem>
  )
}
