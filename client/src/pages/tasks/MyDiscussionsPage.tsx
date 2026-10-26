import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { MessageCircleMore, Search, Loader2, ArrowDown, Inbox, AtSign, ExternalLink, ListTodo } from 'lucide-react'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { discussionApi, type DiscussionInboxItem } from '@/features/tasks/discussions/discussions.api'
import { TaskDiscussions } from '@/features/tasks/discussions/TaskDiscussions'
import { TaskDetailsDrawer } from '@/features/tasks/components/TaskDetailsDrawer'

type InboxFilter='all'|'unread'|'mentions'
type GroupMode='recent'|'task'
export function MyDiscussionsPage(){
  const {i18n}=useTranslation()
  const ar=i18n.language==='ar'
  const {data:user}=useCurrentUser()
  const [searchParams]=useSearchParams()
  const incomingTask=Number(searchParams.get('taskId'))
  const incomingSubtask=searchParams.get('subtaskId')?Number(searchParams.get('subtaskId')):null
  const incomingMessage=Number(searchParams.get('messageId'))
  const safeIncomingTask=Number.isSafeInteger(incomingTask)&&incomingTask>0?incomingTask:null
  const safeIncomingSubtask=incomingSubtask!==null&&Number.isSafeInteger(incomingSubtask)&&incomingSubtask>0?incomingSubtask:null
  const safeIncomingMessage=Number.isSafeInteger(incomingMessage)&&incomingMessage>0?incomingMessage:null
  const totalUnread=useQuery({queryKey:['discussions','inbox-total'],queryFn:discussionApi.unreadTotal,refetchInterval:30000})
  const [filter,setFilter]=useState<InboxFilter>('all')
  const [mode,setMode]=useState<GroupMode>('recent')
  const [search,setSearch]=useState('')
  const [selected,setSelected]=useState<{taskId:number;subtaskId:number|null}|null>(safeIncomingTask?{taskId:safeIncomingTask,subtaskId:safeIncomingSubtask}:null)
  const [mobileChat,setMobileChat]=useState(!!safeIncomingTask)
  const [details,setDetails]=useState<{taskId:number;subtaskId:number|null}|null>(null)
  const inbox=useInfiniteQuery({queryKey:['discussions','inbox'],initialPageParam:undefined as number|undefined,
    queryFn:({pageParam})=>discussionApi.inbox(pageParam),
    getNextPageParam:last=>last.nextCursor??undefined,
    refetchInterval:15000,
  })
  const all=useMemo(()=>inbox.data?.pages.flatMap(page=>page.conversations)??[],[inbox.data])
  const visible=useMemo(()=>all.filter(item=>{
    if(filter==='unread'&&!item.unread)return false
    if(filter==='mentions'&&!item.mentions)return false
    const query=search.trim().toLocaleLowerCase()
    return !query || [item.taskTitle,item.subtaskTitle,item.senderName,item.lastPreview].some(s=>s?.toLocaleLowerCase().includes(query))
  }).sort((a,b)=>mode==='task'?a.taskTitle.localeCompare(b.taskTitle):b.lastMessageId-a.lastMessageId),[all,filter,mode,search])
  const selectedItem=all.find(item=>item.taskId===selected?.taskId&&item.subtaskId===selected.subtaskId)
  // A selected conversation can disappear after a refresh (e.g. access revoked).
  useEffect(()=>{if(!inbox.isLoading&&!inbox.isError&&selected&&!safeIncomingTask&&!all.some(item=>item.taskId===selected.taskId&&item.subtaskId===selected.subtaskId)){
    setSelected(null);setMobileChat(false)
  }},[all,inbox.isLoading,inbox.isError,selected,safeIncomingTask])
  const keyFor=(item:DiscussionInboxItem)=>`${item.taskId}:${item.subtaskId??'main'}`
  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{ar?'محادثاتي':'My Discussions'}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{ar?'مناقشات المهام والمهام الفرعية التي يمكنك الوصول إليها':'Authorized task and subtask conversations in one place'}</p></div>
      <span className="bg-muted rounded-full px-3 py-1 text-xs">{ar?'إجمالي الرسائل غير المقروءة':'Total unread messages'}: {totalUnread.data??0}</span>
    </header>
    <div className="grid min-h-[min(75vh,850px)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]">
      <section className={`${mobileChat?'hidden lg:flex':'flex'} bg-card order-2 min-h-0 flex-col rounded-xl border lg:order-2`} aria-label={ar?'قائمة المحادثات':'Conversation list'}>
        <div className="space-y-3 border-b p-3">
          <label className="flex items-center gap-2 rounded-lg border px-3 py-2"><Search className="text-muted-foreground size-4"/><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={ar?'بحث في المحادثات':'Search conversations'} value={search} onChange={e=>setSearch(e.target.value)}/></label>
          <div className="flex flex-wrap gap-1">{(['all','unread','mentions'] as const).map(name=><button key={name} type="button" aria-pressed={filter===name} onClick={()=>setFilter(name)} className={`rounded-lg px-3 py-1.5 text-xs ${filter===name?'bg-primary text-primary-foreground':'bg-muted hover:bg-muted/70'}`}>{name==='all'?(ar?'الكل':'All'):name==='unread'?(ar?'غير مقروء':'Unread'):(ar?'الإشارات إليّ':'Mentions')}</button>)}</div>
          <button type="button" onClick={()=>setMode(old=>old==='recent'?'task':'recent')} className="text-muted-foreground hover:text-foreground text-xs">{mode==='recent'?(ar?'تجميع حسب المهمة':'Group by task'):(ar?'ترتيب حسب الأحدث':'Sort by recent')}</button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {inbox.isLoading&&<p className="text-muted-foreground p-3 text-sm"><Loader2 className="inline size-4 animate-spin"/> {ar?'جاري التحميل...':'Loading...'}</p>}
          {inbox.isError&&<div className="space-y-2 p-3 text-sm"><p role="alert" className="text-destructive">{ar?'تعذّر تحميل المحادثات':'Could not load conversations'}</p><button className="text-primary underline" onClick={()=>void inbox.refetch()}>{ar?'إعادة المحاولة':'Retry'}</button></div>}
          {visible.map(item=><div key={keyFor(item)} className={`flex items-start gap-1 rounded-lg border p-1 transition-colors ${selected?.taskId===item.taskId&&selected?.subtaskId===item.subtaskId?'border-primary bg-primary/5':'border-transparent hover:bg-muted'}`}>
            <button type="button" onClick={()=>{setSelected({taskId:item.taskId,subtaskId:item.subtaskId});setMobileChat(true)}}
              className="focus-visible:ring-primary min-w-0 flex-1 rounded-md p-2 text-start focus-visible:ring-2 focus-visible:outline-none">
              <span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold">{item.taskTitle}</span>{item.unread>0&&<span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">{item.unread>99?'99+':item.unread}</span>}</span>
              <span className="text-muted-foreground mt-1 block truncate text-xs">{item.subtaskTitle??(ar?'المهمة الرئيسية':'Main task')}{item.mentions>0&&<AtSign className="text-primary ms-1 inline size-3"/>}</span>
              <span className="text-muted-foreground mt-2 block truncate text-xs">{item.senderName}: {item.lastPreview}</span>
              <time className="text-muted-foreground mt-1 block text-[10px]">{new Date(item.lastAtUtc).toLocaleString(ar?'ar-SA':'en-US')}</time>
            </button>
            <button type="button" className="text-muted-foreground hover:text-primary hover:bg-background focus-visible:ring-primary mt-1 shrink-0 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
              title={item.subtaskId!==null?(ar?'فتح المهمة الفرعية':'Open subtask'):(ar?'فتح المهمة الرئيسية':'Open task')}
              aria-label={item.subtaskId!==null?(ar?'فتح المهمة الفرعية':'Open subtask'):(ar?'فتح المهمة الرئيسية':'Open task')}
              onClick={()=>setDetails({taskId:item.taskId,subtaskId:item.subtaskId})}><ExternalLink className="size-4"/></button>
          </div>)}
          {!inbox.isLoading&&!inbox.isError&&visible.length===0&&<p className="text-muted-foreground p-6 text-center text-sm"><Inbox className="mx-auto mb-2 size-7 opacity-40"/>{ar?'لا توجد محادثات مطابقة':'No matching conversations'}</p>}
          {inbox.hasNextPage&&<button type="button" disabled={inbox.isFetchingNextPage} className="text-primary flex w-full items-center justify-center gap-2 p-3 text-xs" onClick={()=>void inbox.fetchNextPage()}><ArrowDown className="size-4"/>{ar?'عرض محادثات أقدم':'Load older conversations'}</button>}
        </div>
      </section>
      <section className={`${mobileChat?'flex':'hidden lg:flex'} order-1 min-w-0 flex-col lg:order-1`}>
        {selected?<>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
            <button type="button" className="text-primary shrink-0 text-sm lg:hidden" onClick={()=>setMobileChat(false)}>{ar?'العودة إلى المحادثات':'Back to conversations'}</button>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="hover:bg-muted focus-visible:ring-primary inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
                onClick={()=>setDetails({taskId:selected.taskId,subtaskId:null})}>
                <ListTodo className="size-3.5"/>{ar?'فتح المهمة الرئيسية':'Open task'}
              </button>
              {selected.subtaskId!==null&&<button type="button" className="hover:bg-muted focus-visible:ring-primary inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
                onClick={()=>setDetails({taskId:selected.taskId,subtaskId:selected.subtaskId})}>
                <ExternalLink className="size-3.5"/>{ar?'فتح المهمة الفرعية':'Open subtask'}
              </button>}
            </div>
            <span className="min-w-0 flex-1 truncate text-end text-sm font-semibold" title={selectedItem?.taskTitle}>{selectedItem?.taskTitle??(ar?'مناقشة المهمة':'Task Discussion')}{selectedItem?.subtaskTitle?` · ${selectedItem.subtaskTitle}`:''}</span>
          </div>
          <TaskDiscussions key={`${selected.taskId}:${selected.subtaskId??'main'}`} taskId={selected.taskId} initialSubtaskId={selected.subtaskId} initialMessageId={safeIncomingTask===selected.taskId?safeIncomingMessage:null} actorId={user?.user.userId??null} inboxMode/>
        </>:<div className="bg-card text-muted-foreground flex min-h-[28rem] flex-1 flex-col items-center justify-center gap-3 rounded-xl border text-sm"><MessageCircleMore className="size-12 opacity-30"/>{ar?'اختر محادثة من القائمة لبدء المتابعة':'Select a conversation to start'}</div>}
      </section>
    </div>
    <TaskDetailsDrawer taskId={details?.taskId??null} focusSubtaskId={details?.subtaskId??null} onOpenChange={open=>{if(!open)setDetails(null)}}/>
  </div>
}
