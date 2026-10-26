import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, LoaderCircle, MessageCircle, ShieldCheck, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { discussionApi } from './discussions.api'

/** View-only presentation of the live discussion ACL. Sharing a task does not grant chat rights. */
export function DiscussionParticipantsPopover({taskId,subtaskId,count,compact=false}:{taskId:number;subtaskId:number|null;count?:number;compact?:boolean}){
  const [open,setOpen]=useState(false)
  const {i18n}=useTranslation()
  const ar=i18n.language==='ar'
  const members=useQuery({
    queryKey:['discussions',taskId,'members',subtaskId],
    queryFn:()=>discussionApi.members(taskId,subtaskId),
    enabled:open,staleTime:10000,refetchInterval:open?30000:false,
  })
  const label=ar?'المشاركون':'Participants'
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" title={label} aria-label={label} aria-expanded={open}
        className={`text-muted-foreground hover:text-primary hover:bg-primary/5 focus-visible:ring-primary inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none ${compact?'border-transparent':'border-border'}`}>
        <Users className="size-4"/>{(count??members.data?.length)!==undefined&&<span>{count??members.data?.length}</span>}{!compact&&<span>{label}</span>}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" side="bottom" className="z-[100] w-[min(90vw,350px)] space-y-3 p-3" onOpenAutoFocus={e=>e.preventDefault()}>
      <div className="flex items-start justify-between gap-2">
        <div><h4 className="text-sm font-semibold">{label}</h4>
          <p className="text-muted-foreground mt-1 text-xs">{ar?'من يمكنه قراءة الرسائل وإرسالها في هذه المحادثة':'Who can read and send messages in this conversation'}</p>
        </div>
        <button type="button" onClick={()=>setOpen(false)} className="hover:bg-muted rounded-md p-1" aria-label={ar?'إغلاق':'Close'}><X className="size-4"/></button>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {members.isPending&&<div className="text-muted-foreground flex items-center gap-2 py-4 text-xs"><LoaderCircle className="size-4 animate-spin"/>{ar?'جاري التحميل':'Loading'}</div>}
        {members.isError&&<p role="alert" className="text-destructive py-3 text-xs">{ar?'تعذر تحميل المشاركين أو تم إلغاء صلاحيتك':'Unable to load participants or access revoked'}</p>}
        {members.data?.map(person=><div key={person.userId} className="flex items-center gap-2.5 rounded-lg border p-2">
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{person.userName.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold" title={person.userName}>{person.userName}</p>
            <p className="text-muted-foreground truncate text-[11px]">{person.userCode} · {person.role==='owner'?(ar?'مالك المهمة':'Task owner'):(ar?'مشارك':'Participant')}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1 text-[10px]">
            <span className="text-emerald-600 inline-flex items-center gap-1"><Eye className="size-3"/>{ar?'قراءة':'Read'}</span>
            <span className={`${person.canSend?'text-emerald-600':'text-muted-foreground'} inline-flex items-center gap-1`}><MessageCircle className="size-3"/>{person.canSend?(ar?'مراسلة':'Send'):(ar?'قراءة فقط':'Read only')}</span>
          </div>
        </div>)}
      </div>
      <p className="text-muted-foreground flex items-start gap-1.5 border-t pt-2 text-[11px]"><ShieldCheck className="mt-0.5 size-3.5 shrink-0"/>{ar?'تُحدّد الصلاحيات بواسطة التكليفات الحالية. تُحدّث القائمة تلقائياً ولا يمكن تعديل المشاركين هنا.':'Permissions follow current task assignments. This list updates automatically and cannot be edited here.'}</p>
    </PopoverContent>
  </Popover>
}
