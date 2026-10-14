import { useEffect,useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Hospital,Monitor,Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { appIcons } from '@/config/app-icons'
import { cn } from '@/lib/cn'
import type { TaskTag } from './tags.api'
import { getTagImage } from './tags.api'

export const tagIconMap: Record<string,LucideIcon> = {...appIcons,tag:Tag,hospital:Hospital,monitor:Monitor}
export const builtinIcons = Object.keys(tagIconMap)
export function TagIcon({tag,size=20}:{tag:TaskTag;size?:number}) {
  const query=useQuery({queryKey:['tags','icon',tag.id],queryFn:()=>getTagImage(tag.id),enabled:tag.iconKind==='UPLOAD',staleTime:5*60*1000})
  const [src,setSrc]=useState<string|null>(null)
  useEffect(()=>{
    if(!query.data)return
    const url=URL.createObjectURL(query.data);setSrc(url)
    return ()=>{URL.revokeObjectURL(url);setSrc(null)}
  },[query.data])
  if(tag.iconKind==='SYSTEM') return <img src={tag.iconKey==='qnh'?'/images/tag-qnh.png':'/images/tag-qms.png'} alt="" width={size} height={size} className="shrink-0 object-contain" />
  if(tag.iconKind==='UPLOAD') return src?<img src={src} alt="" width={size} height={size} className="shrink-0 object-contain"/>:<Tag aria-hidden="true" style={{width:size,height:size}}/>
  const Icon=tagIconMap[tag.iconKey??'tag']??Tag
  return <Icon aria-hidden="true" style={{width:size,height:size}} />
}
export function TagChip({tag,iconOverride}:{tag:TaskTag;iconOverride?:ReactNode}) {
  // Brighter QNH/QMS system chips preserve legibility at small task-card sizes.
  const systemStyle = tag.iconKind==='SYSTEM'
    ? tag.iconKey==='qnh'
      ? {backgroundColor:'#D9EEFF',borderColor:'#80BCEC',color:'#164E79'}
      : {backgroundColor:'#E5E8FF',borderColor:'#A4ACEA',color:'#323C7B'}
    : null
  const chosenColor = /^#[0-9a-fA-F]{6}$/.test(tag.color)?tag.color:'#2563EB'
  const customStyle = {backgroundColor:`${chosenColor}26`,borderColor:`${chosenColor}88`,
    color:parseInt(chosenColor.slice(1,3),16)+parseInt(chosenColor.slice(3,5),16)+parseInt(chosenColor.slice(5,7),16)>640?'var(--foreground)':chosenColor}
  return <span className="inline-flex max-w-36 shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold shadow-sm"
    style={systemStyle??customStyle} title={tag.name}>
    {iconOverride??<TagIcon tag={tag} size={20}/>}<span className="truncate">{tag.name}</span>
  </span>
}
export function TaskTags({tags,compact=false,className}:{tags?:TaskTag[];compact?:boolean;className?:string}) {
  const [expanded,setExpanded]=useState(false)
  if(!tags?.length)return null
  const visible=expanded?tags:tags.slice(0,compact?1:2)
  const extra=tags.length-visible.length
  return <div className={cn('flex max-w-full flex-wrap items-center gap-1.5',className)}>
    {visible.map(tag=><TagChip key={tag.id} tag={tag}/>)}
    {extra>0?<button type="button" onClick={event=>{event.stopPropagation();setExpanded(true)}}
      className="bg-muted text-foreground focus-visible:ring-ring rounded-md border px-2 py-1.5 text-xs font-semibold focus-visible:ring-2"
      aria-label={`${extra} more tags`}>+{extra}</button>:null}
    {expanded&&tags.length>(compact?1:2)?<button type="button" onClick={event=>{event.stopPropagation();setExpanded(false)}} className="text-muted-foreground text-xs underline">−</button>:null}
  </div>
}
