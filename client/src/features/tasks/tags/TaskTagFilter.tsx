import { ChevronDown, Tag } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Popover,PopoverContent,PopoverTrigger } from '@/components/ui/popover'
import { TagPicker } from './TagPicker'

export type TagMatch='ANY'|'ALL'|'UNTAGGED'
export function TaskTagFilter({value,onChange,match,onMatchChange}:{value:number[];onChange:(next:number[])=>void;match:TagMatch;onMatchChange:(next:TagMatch)=>void}) {
 const {i18n}=useTranslation();const ar=i18n.language.startsWith('ar');const [open,setOpen]=useState(false)
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
  <Button variant="outline" aria-label={ar?'تصفية حسب الوسوم':'Filter by tags'}
    aria-expanded={open}
    className="h-10 w-full min-w-0 justify-between gap-2 px-3 font-normal shadow-xs">
    <span className="flex min-w-0 items-center gap-2">
      <Tag aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
      <span className="truncate">{ar?'الوسوم':'Tags'}</span>
      {value.length||match==='UNTAGGED'?<span className="bg-primary/10 text-primary rounded px-1.5 text-xs tabular-nums">{match==='UNTAGGED'? '—':value.length}</span>:null}
    </span>
    <ChevronDown aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
  </Button></PopoverTrigger>
  <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-3 p-3" onClick={e=>e.stopPropagation()}>
   <p className="text-sm font-semibold">{ar?'تصفية حسب الوسوم':'Filter by tags'}</p>
   <TagPicker filterMode value={value} onChange={ids=>{onChange(ids);if(match==='UNTAGGED')onMatchChange('ANY')}}/>
   <div className="flex flex-wrap gap-1.5">{(['ANY','ALL','UNTAGGED'] as const).map(kind=><Button key={kind} type="button" size="sm" variant={kind===match?'default':'outline'} onClick={()=>{onMatchChange(kind);if(kind==='UNTAGGED')onChange([])}}>{ar?({ANY:'أي وسم',ALL:'كل الوسوم',UNTAGGED:'بدون وسوم'})[kind]:({ANY:'Match any',ALL:'Match all',UNTAGGED:'No tags'})[kind]}</Button>)}</div>
   <Button type="button" size="sm" variant="ghost" onClick={()=>{onChange([]);onMatchChange('ANY')}}>{ar?'مسح تصفية الوسوم':'Clear tag filter'}</Button>
  </PopoverContent></Popover>
}
