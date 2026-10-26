import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AtSign, CheckCheck, Download, Eye, FileText, Image as ImageIcon, LoaderCircle,
  Maximize2, Minimize2, MessageCircle, MoreHorizontal, Paperclip, Pencil,
  Reply, Search, Send, Smile, Trash2, X, ArrowDown, Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AttachmentPreviewDialog } from '@/components/shared/AttachmentPreviewDialog'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useDialogFloatingContainer } from '@/components/ui/dialog'
import { attachmentPreviewKind } from '@/components/shared/attachment-preview'
import { discussionApi, watchDiscussion, type DiscussionFile, type DiscussionMessage } from './discussions.api'
import { newActionCreationRequestId } from '@/features/meetings/action-items/creation-request-id'

const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏', '😮', '🙏', '✅'] as const
const EMOJIS = [
  ['😀','smile happy ابتسامة'],['😊','smile blush سعيد'],['😂','laugh ضحك'],['😍','love eyes'],['🥰','love'],
  ['👍','thumbs up موافق'],['👏','clap'],['🙏','thanks شكرا'],['❤️','heart love قلب'],['✅','check done'],
  ['🎉','celebrate'],['💪','strong'],['🔥','fire'],['💯','hundred'],['🙂','smile'],
  ['😃','smile'],['😅','nervous'],['😢','sad'],['😮','surprised'],['🤔','thinking'],
  ['👀','eyes'],['👋','wave'],['🚀','rocket'],['📌','pin'],['📎','attachment'],
  ['💡','idea'],['⚠️','warning'],['📅','calendar'],['🔍','search'],['✨','sparkle'],
] as const

const fileForPreview=(file:DiscussionFile)=>({id:file.id,originalFileName:file.name,mimeType:file.mimeType})
const shortName=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]??'').join('').toUpperCase()
const dateKey=(iso:string)=>iso.slice(0,10)
const readTime=(iso:string,locale:string)=>new Date(iso).toLocaleTimeString(locale,{hour:'numeric',minute:'2-digit'})
const readDay=(iso:string,locale:string)=>new Date(iso).toLocaleDateString(locale,{weekday:'short',day:'numeric',month:'short',year:'numeric'})
const fileSize=(size:number)=>size>=1048576?`${(size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(size/1024))} KB`

export function TaskDiscussions({taskId,actorId,initialSubtaskId=null,inboxMode=false,initialMessageId=null}:{taskId:number;actorId:number|null;initialSubtaskId?:number|null;inboxMode?:boolean;initialMessageId?:number|null}){
  const {t,i18n}=useTranslation()
  const qc=useQueryClient()
  // Keep the full-screen view inside the active TaskHub dialog's focus/inert layer.
  const dialogContainer=useDialogFloatingContainer()
  const locale=i18n.language==='ar'?'ar-SA':'en-US'
  const [selected,setSelected]=useState<number|null>(initialSubtaskId)
  const [fullScreen,setFullScreen]=useState(false)
  const [text,setText]=useState('')
  const [reply,setReply]=useState<DiscussionMessage|null>(null)
  const [editing,setEditing]=useState<DiscussionMessage|null>(null)
  const [preview,setPreview]=useState<ReturnType<typeof fileForPreview>|null>(null)
  const [deleteFile,setDeleteFile]=useState<DiscussionFile|null>(null)
  const [deleteMessage,setDeleteMessage]=useState<DiscussionMessage|null>(null)
  const [pendingFile,setPendingFile]=useState<File|null>(null)
  const [mentionOpen,setMentionOpen]=useState(false)
  const [mentionQuery,setMentionQuery]=useState('')
  const [mentionIndex,setMentionIndex]=useState(0)
  const [mentionRange,setMentionRange]=useState<{start:number;end:number}|null>(null)
  const [emojiOpen,setEmojiOpen]=useState(false)
  const [emojiSearch,setEmojiSearch]=useState('')
  const [actionMessage,setActionMessage]=useState<number|null>(null)
  const [reactionMessage,setReactionMessage]=useState<number|null>(null)
  const [typingUsers,setTypingUsers]=useState<number[]>([])
  const [older,setOlder]=useState<DiscussionMessage[]>([])
  const [loadingOlder,setLoadingOlder]=useState(false)
  const [searchOpen,setSearchOpen]=useState(false)
  const [searchText,setSearchText]=useState('')
  const [searchTerm,setSearchTerm]=useState('')
  const [showNew,setShowNew]=useState(false)
  const [atBottom,setAtBottom]=useState(true)
  const [highlightId,setHighlightId]=useState<number|null>(null)
  const [highlightPhase,setHighlightPhase]=useState<'active'|'fading'|null>(null)
  // A fresh token also replays the focus animation when the same result is clicked twice.
  const [focusTarget,setFocusTarget]=useState<{id:number;token:number}|null>(null)
  const navigationToken=useRef(0)
  const initialMessageDone=useRef<number|null>(null)
  const lastTyping=useRef(0)
  const fileRef=useRef<HTMLInputElement>(null)
  const composerRef=useRef<HTMLTextAreaElement>(null)
  const searchInputRef=useRef<HTMLInputElement>(null)
  const scrollRef=useRef<HTMLDivElement>(null)
  const lastSeenMessage=useRef<number|null>(null)
  const [unreadBoundary,setUnreadBoundary]=useState<{taskId:number;scope:number|null;messageId:number}|null>(null)
  const scopes=useQuery({queryKey:['discussions',taskId,'scopes'],queryFn:()=>discussionApi.scopes(taskId),refetchInterval:30000})
  const canSee=useMemo(()=>scopes.data?.some(s=>s.subtaskId===selected)??false,[scopes.data,selected])
  const selectedScope=scopes.data?.find(s=>s.subtaskId===selected)
  const members=useQuery({queryKey:['discussions',taskId,'members',selected],queryFn:()=>discussionApi.members(taskId,selected),enabled:canSee})
  const messagesKey=['discussions',taskId,'messages',selected] as const
  const msgs=useQuery({queryKey:messagesKey,queryFn:()=>discussionApi.messages(taskId,selected),enabled:canSee,refetchInterval:60000})
  const searchResults=useQuery({queryKey:['discussions',taskId,'search',selected,searchTerm],
    queryFn:()=>discussionApi.search(taskId,selected,searchTerm),enabled:canSee&&searchOpen&&searchTerm.length>=2})
  const displayed=useMemo(()=>[...older,...(msgs.data??[])]
    .filter((m,i,arr)=>arr.findIndex(x=>x.id===m.id)===i).sort((a,b)=>a.id-b.id),[older,msgs.data])
  const messageById=useMemo(()=>new Map(displayed.map(m=>[m.id,m])),[displayed])
  const focusTargetLoaded=focusTarget!==null&&messageById.has(focusTarget.id)
  // Search results and reply quotes use exactly the same scroller/focus behavior.
  // Wait for the message to render (including older pages) before attempting to scroll.
  useEffect(()=>{
    if(!focusTarget||!focusTargetLoaded)return
    const focusId=focusTarget.id
    const frame=window.requestAnimationFrame(()=>{
      const scroller=scrollRef.current
      const node=scroller?.querySelector<HTMLElement>(`[data-discussion-message-id="${focusId}"]`)
      if(!scroller||!node)return
      const scrollBox=scroller.getBoundingClientRect()
      const targetBox=node.getBoundingClientRect()
      const top=scroller.scrollTop+targetBox.top-scrollBox.top-(scroller.clientHeight-targetBox.height)/2
      scroller.scrollTo({top:Math.max(0,top),behavior:'smooth'})
      setHighlightId(focusId)
      setHighlightPhase('active')
    })
    // The ring stays visible for 2.5s, then softly fades instead of snapping off.
    const fade=window.setTimeout(()=>setHighlightPhase('fading'),2500)
    const finish=window.setTimeout(()=>{setHighlightId(null);setHighlightPhase(null)},3050)
    return()=>{window.cancelAnimationFrame(frame);window.clearTimeout(fade);window.clearTimeout(finish)}
  },[focusTarget,focusTargetLoaded])
  const newest=msgs.data?.at(-1)?.id??null
  const firstUnreadId=displayed.find(m=>m.id>(unreadBoundary?.taskId===taskId&&unreadBoundary.scope===selected?unreadBoundary.messageId:Number.MAX_SAFE_INTEGER)&&m.authorUserId!==actorId)?.id

  useEffect(()=>setSelected(initialSubtaskId),[initialSubtaskId,taskId])
  useEffect(()=>{if(initialMessageId&&canSee&&msgs.isSuccess&&initialMessageDone.current!==initialMessageId){
    initialMessageDone.current=initialMessageId;void jumpTo(initialMessageId)
  }},[initialMessageId,canSee,msgs.isSuccess,taskId,selected])
  useEffect(()=>{const firstScope=scopes.data?.[0];if(firstScope&&!canSee)setSelected(firstScope.subtaskId)},[scopes.data,canSee])
  useEffect(()=>{setOlder([]);setSearchOpen(false);setSearchText('');setSearchTerm('');setTypingUsers([]);
    setShowNew(false);setAtBottom(true);lastSeenMessage.current=null;
    navigationToken.current+=1;setFocusTarget(null);setHighlightId(null);setHighlightPhase(null);
    setReply(null);setEditing(null);setText('');setPendingFile(null);
    setEmojiOpen(false);setMentionOpen(false);setActionMessage(null);setReactionMessage(null)},[taskId,selected])
  useEffect(()=>{if(selectedScope&&canSee&&(!unreadBoundary||unreadBoundary.taskId!==taskId||unreadBoundary.scope!==selected))
    setUnreadBoundary({taskId,scope:selected,messageId:selectedScope.lastReadMessageId})
  },[selectedScope,canSee,unreadBoundary,taskId,selected])
  useEffect(()=>{const timer=window.setTimeout(()=>setSearchTerm(searchText.trim()),300);return ()=>window.clearTimeout(timer)},[searchText])
  useEffect(()=>{if(searchOpen){const frame=window.requestAnimationFrame(()=>searchInputRef.current?.focus());return()=>window.cancelAnimationFrame(frame)}},[searchOpen])
  useEffect(()=>{if(!fullScreen)return;const onKey=(event:KeyboardEvent)=>{
    if(event.key!=='Escape')return
    // Escape dismisses the active picker/confirmation before leaving full screen.
    if(emojiOpen||mentionOpen||actionMessage!==null||reactionMessage!==null||deleteMessage||deleteFile||preview)return
    setFullScreen(false)
  };
    document.addEventListener('keydown',onKey);const old=document.body.style.overflow;document.body.style.overflow='hidden';
    return ()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=old}},
  [fullScreen,emojiOpen,mentionOpen,actionMessage,reactionMessage,deleteMessage,deleteFile,preview])

  const update=useCallback(()=>{void qc.invalidateQueries({queryKey:['discussions',taskId]});void qc.invalidateQueries({queryKey:['discussions','cards']});void qc.invalidateQueries({queryKey:['discussions','assigned-cards']});void qc.invalidateQueries({queryKey:['discussions','meeting-cards']});void qc.invalidateQueries({queryKey:['discussions','shared-cards']});void qc.invalidateQueries({queryKey:['discussions','inbox']});void qc.invalidateQueries({queryKey:['discussions','inbox-total']})},[qc,taskId])
  useEffect(()=>{if(!canSee)return;const controller=new AbortController();let alive=true
    async function connect(){while(alive&&!controller.signal.aborted){try{
      await watchDiscussion(taskId,selected,event=>{
        if(event.type==='typing'&&event.userId!==undefined&&event.userId!==actorId){
          setTypingUsers(list=>event.typing?[...new Set([...list,event.userId!])]:list.filter(id=>id!==event.userId))
        }else{update()}
      },controller.signal)
    }catch(error){if([401,403,404].includes((error as {status?:number})?.status??0))break}
    if(!alive||controller.signal.aborted)break;update();await new Promise(r=>setTimeout(r,2500))}}
    void connect();return()=>{alive=false;controller.abort()}
  },[taskId,selected,canSee,update,actorId])
  useEffect(()=>{if(!canSee||!text.trim()||editing)return
    if(Date.now()-lastTyping.current>1000){lastTyping.current=Date.now();void discussionApi.typing(taskId,selected,true).catch(()=>{})}
    const timeout=window.setTimeout(()=>void discussionApi.typing(taskId,selected,false).catch(()=>{}),1900)
    return()=>window.clearTimeout(timeout)
  },[taskId,selected,text,canSee,editing])
  useEffect(()=>{if(!newest||!canSee||!atBottom||document.visibilityState!=='visible')return;
    void discussionApi.read(taskId,selected,newest).then(()=>{void qc.invalidateQueries({queryKey:['discussions',taskId,'scopes']});void qc.invalidateQueries({queryKey:['discussions','inbox']});void qc.invalidateQueries({queryKey:['discussions','inbox-total']})}).catch(()=>{})
  },[newest,taskId,selected,canSee,atBottom,qc])
  useEffect(()=>{if(newest===null)return;
    if(lastSeenMessage.current===null){lastSeenMessage.current=newest;requestAnimationFrame(()=>scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight}));return}
    if(newest>lastSeenMessage.current){if(atBottom){requestAnimationFrame(()=>scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'}))}
      else setShowNew(true)}lastSeenMessage.current=newest
  },[newest,atBottom])

  async function loadOlder(){const oldest=displayed[0]?.id;if(!oldest||loadingOlder)return
    setLoadingOlder(true);const el=scrollRef.current;const oldHeight=el?.scrollHeight??0
    try{const extra=await discussionApi.messages(taskId,selected,oldest);setOlder(prev=>[...extra,...prev]);
      requestAnimationFrame(()=>{if(el)el.scrollTop+=el.scrollHeight-oldHeight})}
    catch{toast.error(t('discussions.loadFailed'))}finally{setLoadingOlder(false)}
  }
  const send=useMutation({mutationFn:async()=>{
    const body=text.trim();if(!body&&!pendingFile)return
    const posted=await discussionApi.send(taskId,selected,body||t('discussions.fileMessage'),reply?.id??null,newActionCreationRequestId())
    if(pendingFile){try{await discussionApi.upload(posted.id,pendingFile)}catch{toast.error(t('discussions.fileFailed'))}}
  },onSuccess:()=>{setText('');setReply(null);setPendingFile(null);setAtBottom(true);update()},onError:()=>toast.error(t('discussions.sendFailed'))})
  const edit=useMutation({mutationFn:async()=>{if(editing)await discussionApi.edit(editing.id,text.trim())},
    onSuccess:()=>{setEditing(null);setText('');update()},onError:()=>toast.error(t('discussions.sendFailed'))})
  const remove=useMutation({mutationFn:discussionApi.remove,
    onSuccess:()=>{setDeleteMessage(null);update()},onError:()=>toast.error(t('discussions.sendFailed'))})
  const removeFile=useMutation({mutationFn:discussionApi.removeFile,
    onSuccess:()=>{setDeleteFile(null);setOlder([]);update();toast.success(t('attachments.deleted'))},
    onError:()=>toast.error(t('attachments.deleteFailed'))})
  const react=useMutation({mutationFn:({messageId,emoji,active}:{messageId:number;emoji:string;active:boolean})=>discussionApi.react(messageId,emoji,active),
    onSuccess:update,onError:()=>toast.error(t('discussions.reactionFailed'))})
  function switchTo(subtaskId:number|null){if(subtaskId===selected)return;setSelected(subtaskId)}
  function toggleReaction(message:DiscussionMessage,emoji:string){
    const alreadyReacted=message.reactions?.some(r=>r.emoji===emoji&&r.reacted)??false
    react.mutate({messageId:message.id,emoji,active:!alreadyReacted})
    setReactionMessage(null)
  }
  const mentionSuggestions=(members.data??[]).filter(person=>person.userId!==actorId &&
    `${person.userName} ${person.userCode}`.toLocaleLowerCase().includes(mentionQuery.toLocaleLowerCase())).slice(0,8)
  function onComposerInput(value:string,position:number){
    setText(value)
    if(editing)return
    const before=value.slice(0,position)
    const match=/(^|\s)@([^\s@]{0,35})$/.exec(before)
    const mentionText=match?.[2];
    if(mentionText!==undefined){setMentionRange({start:position-mentionText.length-1,end:position});setMentionQuery(mentionText);setMentionIndex(0);setMentionOpen(true);setEmojiOpen(false)}
    else {setMentionRange(null);setMentionOpen(false)}
  }
  function chooseMention(person:{userCode:string}){
    const cursor=composerRef.current?.selectionStart??text.length
    const start=mentionRange?.start??cursor
    const end=mentionRange?.end??cursor
    const prefix=text.slice(0,start);const suffix=text.slice(end)
    const insert=`@${person.userCode} `
    const adjusted=prefix+(prefix&&!/\s$/.test(prefix)?' ':'')+insert+suffix
    const nextCaret=(prefix+(prefix&&!/\s$/.test(prefix)?' ':'')+insert).length
    setText(adjusted);setMentionOpen(false);setMentionRange(null)
    requestAnimationFrame(()=>{composerRef.current?.focus();composerRef.current?.setSelectionRange(nextCaret,nextCaret)})
  }
  function formatMentionBody(message:DiscussionMessage){
    const names=new Map(message.mentions?.map(m=>[m.userCode.toLowerCase(),m.userName])??[])
    // Also render legacy @CODE tokens for still-authorized members without changing stored text.
    for(const m of members.data??[]){if(!names.has(m.userCode.toLowerCase()))names.set(m.userCode.toLowerCase(),m.userName)}
    return (message.body??'').split(/(@[A-Za-z0-9]{1,30})/g).map((part,index)=>{
      const display=part.startsWith('@')?names.get(part.slice(1).toLowerCase()):undefined
      return display?<span key={index} className="bg-primary/10 text-primary rounded px-1 font-medium" title={part}>@{display}</span>:part
    })
  }
  function addEmoji(emoji:string){setText(v=>v+emoji);setEmojiOpen(false);composerRef.current?.focus()}
  function submit(){if(editing){if(text.trim())edit.mutate()}else if(text.trim()||pendingFile)send.mutate()}
  function onComposerKeyDown(e:ReactKeyboardEvent<HTMLTextAreaElement>){
    if(mentionOpen&&mentionSuggestions.length){
      if(e.key==='ArrowDown'){e.preventDefault();setMentionIndex(i=>(i+1)%mentionSuggestions.length);return}
      if(e.key==='ArrowUp'){e.preventDefault();setMentionIndex(i=>(i+mentionSuggestions.length-1)%mentionSuggestions.length);return}
      if(e.key==='Escape'){e.preventDefault();setMentionOpen(false);return}
      if(e.key==='Enter'&&!e.nativeEvent.isComposing){
        const suggestion=mentionSuggestions[mentionIndex]??mentionSuggestions[0];
        if(suggestion){e.preventDefault();chooseMention(suggestion);return}
      }
    }
    if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit()}
  }
  function closeSearch(){setSearchOpen(false);setSearchText('');setSearchTerm('')}
  async function jumpTo(id:number){
    const token=++navigationToken.current
    closeSearch()
    // Loaded messages need no additional query. An unloaded reply/search match is
    // fetched through the same authorized, scope-filtered history endpoint.
    if(messageById.has(id)){setFocusTarget({id,token});return}
    try{
      const batch=await discussionApi.messages(taskId,selected,id+1)
      if(navigationToken.current!==token)return // conversation changed while loading
      if(!batch.some(message=>message.id===id)){
        toast.error(t('discussions.originalUnavailable'))
        return
      }
      setOlder(previous=>[...batch,...previous])
      setFocusTarget({id,token})
    }catch{if(navigationToken.current===token)toast.error(t('discussions.loadFailed'))}
  }
  function onScroll(){const el=scrollRef.current;if(!el)return;const bottom=el.scrollHeight-el.scrollTop-el.clientHeight<100;
    setAtBottom(bottom);if(bottom)setShowNew(false)}
  const emojiResults=EMOJIS.filter(item=>!emojiSearch.trim()||item[1].includes(emojiSearch.toLowerCase())||item[0].includes(emojiSearch))
  const discussion=(<TooltipProvider delayDuration={180}><section className={`bg-background text-foreground flex min-w-0 flex-col overflow-hidden ${fullScreen?'fixed inset-0 z-[70] h-dvh w-screen p-3 sm:p-6':inboxMode?'h-full min-h-0 rounded-xl border':'rounded-xl border'}`} aria-label={t('discussions.title')}
    onKeyDownCapture={event=>{if(fullScreen&&event.key==='Escape'&&!emojiOpen&&!mentionOpen&&actionMessage===null&&reactionMessage===null&&!deleteMessage&&!deleteFile&&!preview){
      event.stopPropagation();setFullScreen(false)
    }}}>
    {fullScreen&&<header className="mb-3 flex items-center justify-between gap-3 border-b pb-3">
      <h2 className="font-semibold">{t('discussions.title')}</h2>
      <Button variant="outline" size="sm" onClick={()=>setFullScreen(false)}><Minimize2 className="size-4"/>{t('discussions.exitFullScreen')}</Button>
    </header>}
    <div className={`grid min-h-0 flex-1 gap-3 ${!inboxMode&&scopes.data&&scopes.data.length>1?'lg:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)]':'grid-cols-1'}`}>
      {!inboxMode&&scopes.data&&scopes.data.length>1&&<nav className="bg-card flex max-h-32 min-h-0 gap-2 overflow-x-auto rounded-xl border p-3 lg:block lg:max-h-none lg:space-y-2 lg:overflow-y-auto" aria-label={t('discussions.conversations')}>
        <p className="mb-3 hidden items-center gap-2 text-sm font-semibold lg:flex"><MessageCircle className="size-4"/>{t('discussions.conversations')}</p>
        {scopes.data.map(s=><button key={s.subtaskId??'main'} type="button" onClick={()=>switchTo(s.subtaskId)}
          aria-current={selected===s.subtaskId?'true':undefined}
          className={`flex min-w-40 items-center gap-2 rounded-lg border p-3 text-start transition-colors lg:w-full lg:min-w-0 ${selected===s.subtaskId?'border-primary bg-primary/5 shadow-sm':'border-transparent hover:bg-muted/60'}`}>
          <MessageCircle className="text-muted-foreground size-4 shrink-0"/><span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{s.title||t('discussions.main')}</span>
            <span className="text-muted-foreground block truncate text-xs">{s.lastPreview|| (s.subtaskId===null?t('discussions.mainScope'):t('discussions.childScope'))}</span>
          </span>
          {s.unread>0&&<span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">{s.unread}</span>}
        </button>)}
      </nav>}
      <div className={`bg-card flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border ${fullScreen?'h-full':'h-[min(72vh,690px)] min-h-[27rem]'}`}>
        <header className="relative z-20 flex flex-wrap items-center gap-3 border-b px-3 py-2.5 sm:px-4">
          <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full"><Users className="size-4"/></div>
          <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{selectedScope?.title||t('discussions.main')}</h3>
            <p className="text-muted-foreground truncate text-xs">{t('discussions.scopeNotice')} · {members.data?.length??0} {t('discussions.members')}</p>
          </div>
          <Button size="icon" variant="ghost" aria-label={t('discussions.search')} aria-expanded={searchOpen} onClick={()=>searchOpen?closeSearch():setSearchOpen(true)}><Search className="size-4"/></Button>
          <Button size="icon" variant="ghost" aria-label={fullScreen?t('discussions.exitFullScreen'):t('discussions.fullScreen')}
            onClick={()=>setFullScreen(v=>!v)}>{fullScreen?<Minimize2 className="size-4"/>:<Maximize2 className="size-4"/>}</Button>
          <AnimatePresence initial={false}>
            {searchOpen&&<motion.div key="discussion-search" initial={{opacity:0,y:-10,scale:0.985}} animate={{opacity:1,y:0,scale:1}}
              exit={{opacity:0,y:-10,scale:0.985}} transition={{duration:0.22,ease:[0.2,0.8,0.2,1]}}
              className="bg-card absolute inset-x-2 top-full z-30 mt-1 origin-top rounded-xl border p-3 shadow-xl sm:inset-x-4"
              role="search" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSearch()}}}>
              <div className="flex items-center gap-2 rounded-lg border px-2 py-1">
                <Search className="text-muted-foreground size-4 shrink-0"/>
                <input ref={searchInputRef} className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none" value={searchText} onChange={e=>setSearchText(e.target.value)}
                  placeholder={t('discussions.searchPlaceholder')} aria-label={t('discussions.search')}/>
                <Button size="icon" variant="ghost" className="size-7" onClick={closeSearch} aria-label={t('common.close')}><X className="size-4"/></Button>
              </div>
              {searchTerm.length>=2&&<div className="mt-2 max-h-64 space-y-1 overflow-y-auto" role="list" aria-label={t('discussions.search')}>
                {searchResults.isFetching&&<p className="text-muted-foreground p-2 text-xs">{t('discussions.searching')}</p>}
                {searchResults.isError&&<p className="text-destructive p-2 text-xs">{t('discussions.loadFailed')}</p>}
                {!searchResults.isFetching&&!searchResults.isError&&searchResults.data?.length===0&&<p className="text-muted-foreground p-2 text-sm">{t('discussions.noResults')}</p>}
                {searchResults.data?.map(r=><button key={r.id} type="button" className="hover:bg-muted focus-visible:ring-primary block w-full rounded-lg p-2 text-start text-sm focus-visible:ring-2 focus-visible:outline-none" onClick={()=>void jumpTo(r.id)}>
                  <span className="text-muted-foreground block text-xs">{r.authorName} · {readDay(r.createdAtUtc,locale)}</span>
                  <span className="line-clamp-2 break-words">{r.body}</span></button>)}
              </div>}
            </motion.div>}
          </AnimatePresence>
        </header>
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={onScroll} className="h-full space-y-3 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5" aria-live="polite" aria-relevant="additions text">
            {displayed.length>0&&<div className="flex justify-center"><Button size="sm" variant="ghost" disabled={loadingOlder} onClick={()=>void loadOlder()}>{loadingOlder?<LoaderCircle className="size-4 animate-spin"/>:null}{t('discussions.older')}</Button></div>}
            {msgs.data?.length===0&&<div className="text-muted-foreground flex h-48 flex-col items-center justify-center gap-2 text-center text-sm"><MessageCircle className="size-9 opacity-40"/>{t('discussions.empty')}</div>}
            {displayed.map((m,i)=>{
              const own=m.authorUserId===actorId
              const prior=displayed[i-1]
              const newDay=!prior||dateKey(prior.createdAtUtc)!==dateKey(m.createdAtUtc)
              const grouped=prior&&prior.authorUserId===m.authorUserId&&!newDay&&m.id-prior.id<=5
              const originalReply=m.replyToMessageId?messageById.get(m.replyToMessageId):null
              return <div key={m.id}>
                {firstUnreadId===m.id&&<div className="my-3 flex items-center gap-2"><div className="bg-primary/50 h-px flex-1"/><span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs">{t('discussions.newMessages')}</span><div className="bg-primary/50 h-px flex-1"/></div>}
                {newDay&&<div className="my-5 flex items-center justify-center gap-3"><span className="bg-muted/70 text-muted-foreground rounded-full px-3 py-1 text-[11px]">{readDay(m.createdAtUtc,locale)}</span></div>}
                <div className={`group flex w-full items-start gap-2 ${own?'justify-start':'justify-end'}`} data-discussion-message-id={m.id}>
                  {!own&&(!grouped?<span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{shortName(m.authorName)}</span>:<span className="w-8 shrink-0"/>)}
                  <div className="max-w-[min(88%,44rem)] min-w-0 space-y-1">
                    {!grouped&&<div className="flex items-baseline justify-between gap-3 px-1"><span className="truncate text-xs font-semibold">{m.authorName}</span><time className="text-muted-foreground shrink-0 text-[10px]">{readTime(m.createdAtUtc,locale)}</time></div>}
                    <div className={`relative rounded-2xl px-3 py-2 text-sm shadow-sm ${own?'rounded-se-sm':'rounded-ss-sm'} transition-[background-color,box-shadow] duration-500 ease-out ${highlightId===m.id&&highlightPhase==='active'?'bg-sky-100/90 ring-2 ring-sky-400/70 shadow-md dark:bg-sky-900/40':own?'border border-sky-300/70 bg-sky-100 text-slate-900 dark:border-sky-600/60 dark:bg-sky-900/60 dark:text-sky-50':'border border-border/60 bg-muted/70'}`}>
                      {m.replyToMessageId&&<button type="button"
                        className="border-primary/60 bg-background/55 hover:bg-primary/10 focus-visible:ring-primary mb-2 block w-full rounded-md border-s-2 px-2 py-1 text-start text-xs transition-colors focus-visible:outline-none focus-visible:ring-2"
                        title={t('discussions.jumpToOriginal')} aria-label={t('discussions.jumpToOriginal')}
                        onClick={()=>void jumpTo(m.replyToMessageId!)}>
                        <span className="font-medium">{originalReply?.authorName||t('discussions.reply')}</span>
                        <span className="text-muted-foreground block truncate">{originalReply?.deletedAtUtc?t('discussions.deleted'):(originalReply?.body??`#${m.replyToMessageId}`)}</span>
                      </button>}
                      {m.deletedAtUtc?<p className="text-muted-foreground italic">{t('discussions.deleted')}</p>:<p className="whitespace-pre-wrap break-words leading-relaxed">{formatMentionBody(m)}</p>}
                      {m.editedAtUtc&&!m.deletedAtUtc&&<span className="text-muted-foreground mt-1 block text-[10px]">{t('discussions.edited')}</span>}
                    </div>
                    {!m.deletedAtUtc&&m.files.map(file=><div key={file.id} className="bg-card flex min-w-0 items-center gap-2 rounded-xl border p-2">
                      <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">{file.mimeType.startsWith('image/')?<ImageIcon className="size-5"/>:<FileText className="size-5"/>}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium" title={file.name}>{file.name}</p><span className="text-muted-foreground text-[11px]">{fileSize(file.sizeBytes)}</span></div>
                      {attachmentPreviewKind(fileForPreview(file))!=='unsupported'&&<Button size="icon" variant="ghost" aria-label={t('attachments.preview')} onClick={()=>setPreview(fileForPreview(file))}><Eye className="size-4"/></Button>}
                      <Button size="icon" variant="ghost" aria-label={t('attachments.download')} onClick={()=>void discussionApi.download(file)}><Download className="size-4"/></Button>
                      {own&&<Button size="icon" variant="ghost" className="text-destructive" aria-label={t('attachments.deleteFile',{name:file.name})} onClick={()=>setDeleteFile(file)}><Trash2 className="size-4"/></Button>}
                    </div>)}
                    <div className="flex min-h-6 flex-wrap items-center gap-1 px-1">
                      {!m.deletedAtUtc&&m.reactions?.map(reaction=><Tooltip key={reaction.emoji}><TooltipTrigger asChild><button type="button" disabled={react.isPending} onClick={()=>toggleReaction(m,reaction.emoji)}
                          className={`rounded-full border px-2 py-0.5 text-xs ${reaction.reacted?'border-primary bg-primary/10':'bg-background hover:bg-muted'}`} aria-label={`${reaction.emoji} ${reaction.count}`}>
                          {reaction.emoji} {reaction.count}</button></TooltipTrigger>
                          <TooltipContent side="top" collisionPadding={12} sideOffset={10} className="z-[90] w-60 rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-xl" aria-label={`${reaction.emoji} ${reaction.count}`}>
                            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
                              <span className="text-xs font-semibold">{locale==='ar-SA'?'المتفاعلون':'Reactions'}</span>
                              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">{reaction.emoji} {reaction.count}</span>
                            </div>
                            <div className="max-h-52 space-y-0.5 overflow-y-auto p-1.5">
                              {reaction.users?.slice(0,12).map(person=><div key={person.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                                <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">{shortName(person.userName)}</span>
                                <span className="min-w-0 flex-1 truncate text-xs font-medium">{person.userName}{person.userId===actorId?<span className="text-muted-foreground ms-1">({locale==='ar-SA'?'أنت':'You'})</span>:null}</span>
                              </div>)}
                              {(reaction.users?.length??0)>12&&<p className="text-muted-foreground px-2 py-1 text-xs">+{reaction.users.length-12}</p>}
                              {!reaction.users?.length&&<p className="text-muted-foreground p-2 text-xs">{locale==='ar-SA'?'لا توجد بيانات للمشاركين':'Participant details unavailable'}</p>}
                            </div>
                          </TooltipContent></Tooltip>)}
                      {own&&m.readByCount>0&&<span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]" title={t('discussions.readBy',{count:m.readByCount,total:m.recipientCount})}><CheckCheck className="size-3 text-primary"/>{m.readByCount}/{m.recipientCount}</span>}
                      <span className="flex-1"/>
                      {!m.deletedAtUtc&&<div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <Popover open={reactionMessage===m.id} onOpenChange={open=>{setReactionMessage(open?m.id:null);if(open)setActionMessage(null)}}>
                          <PopoverTrigger asChild><Button size="icon" variant="ghost" className="size-7" aria-label={t('discussions.react')} aria-expanded={reactionMessage===m.id}><Smile className="size-4"/></Button></PopoverTrigger>
                          <PopoverContent side="top" align="end" sideOffset={10} collisionPadding={12} className="z-[90] w-auto max-w-[min(95vw,25rem)] rounded-2xl border border-border bg-popover p-2.5 shadow-xl" aria-label={t('discussions.react')}>
                            <div className="text-muted-foreground mb-2 px-1 text-[11px] font-medium">{locale==='ar-SA'?'اختر تفاعلاً':'Choose a reaction'}</div>
                            <div className="flex flex-wrap items-center gap-1">
                              {REACTIONS.map(emoji=><button key={emoji} type="button" className={`focus-visible:ring-primary flex size-9 items-center justify-center rounded-xl text-xl transition-all duration-150 hover:-translate-y-0.5 hover:scale-110 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 ${m.reactions?.some(r=>r.emoji===emoji&&r.reacted)?'bg-primary/15 ring-1 ring-primary/50':''}`} aria-label={emoji} aria-pressed={m.reactions?.some(r=>r.emoji===emoji&&r.reacted)??false}
                                disabled={react.isPending} onClick={()=>toggleReaction(m,emoji)}>{emoji}</button>)}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Popover open={actionMessage===m.id} onOpenChange={open=>{setActionMessage(open?m.id:null);if(open)setReactionMessage(null)}}>
                          <PopoverTrigger asChild><Button size="icon" variant="ghost" className="size-7" aria-label={t('discussions.actions')} aria-expanded={actionMessage===m.id}><MoreHorizontal className="size-4"/></Button></PopoverTrigger>
                          <PopoverContent side="top" align="end" sideOffset={8} collisionPadding={12} className="z-[90] flex w-auto gap-1 p-1.5" aria-label={t('discussions.actions')}>
                            <Button size="icon" variant="ghost" aria-label={t('discussions.reply')} title={t('discussions.reply')} onClick={()=>{setReply(m);setEditing(null);setActionMessage(null);composerRef.current?.focus()}}><Reply className="size-4"/></Button>
                            {own&&<><Button size="icon" variant="ghost" aria-label={t('discussions.edit')} title={t('discussions.edit')} onClick={()=>{setEditing(m);setText(m.body??'');setReply(null);setActionMessage(null);composerRef.current?.focus()}}><Pencil className="size-4"/></Button>
                              <Button size="icon" variant="ghost" className="text-destructive" aria-label={t('discussions.delete')} title={t('discussions.delete')} onClick={()=>{setActionMessage(null);setDeleteMessage(m)}}><Trash2 className="size-4"/></Button></>}
                          </PopoverContent>
                        </Popover>
                      </div>}
                    </div>
                  </div>
                  {own&&(!grouped?<span className="bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{shortName(m.authorName)}</span>:<span className="w-8 shrink-0"/>)}
                </div>
              </div>
            })}
          </div>
          {showNew&&<button type="button" className="bg-primary text-primary-foreground absolute bottom-3 start-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 text-xs shadow-lg" onClick={()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'});setShowNew(false);setAtBottom(true)}}>
            <ArrowDown className="size-4"/>{t('discussions.newMessages')}</button>}
        </div>
        {typingUsers.length>0&&<p className="text-muted-foreground px-4 py-1 text-xs">{typingUsers.map(id=>members.data?.find(m=>m.userId===id)?.userName||'…').join(', ')} {t('discussions.typing')}</p>}
        <div className="border-t px-3 py-2 sm:px-4">
          {reply&&<div className="bg-muted/60 mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"><Reply className="size-4"/><span className="min-w-0 flex-1 truncate">{reply.authorName} · {reply.body?.slice(0,100)}</span><Button size="icon" variant="ghost" className="size-7" onClick={()=>setReply(null)}><X className="size-4"/></Button></div>}
          {editing&&<div className="text-primary mb-1 flex items-center gap-2 text-xs"><Pencil className="size-3"/>{t('discussions.edit')}<Button size="sm" variant="ghost" onClick={()=>{setEditing(null);setText('')}}>{t('common.cancel')}</Button></div>}
          {pendingFile&&<div className="bg-muted/50 mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"><Paperclip className="size-4"/><span className="min-w-0 flex-1 truncate">{pendingFile.name}</span><Button size="icon" variant="ghost" className="size-6" onClick={()=>setPendingFile(null)}><X className="size-4"/></Button></div>}
          <div className="bg-background flex items-end gap-2 rounded-xl border p-1.5 focus-within:ring-1 focus-within:ring-primary/50">
            <Textarea ref={composerRef} rows={1} maxLength={4000} value={text} onChange={e=>onComposerInput(e.target.value,e.target.selectionStart)} onKeyDown={onComposerKeyDown}
              placeholder={t('discussions.placeholder')} aria-label={t('discussions.placeholder')} className="max-h-36 min-h-9 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"/>
            {!editing&&<><input type="file" ref={fileRef} hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e=>{setPendingFile(e.target.files?.[0]??null);e.target.value=''}}/>
              <Button size="icon" variant="ghost" aria-label={t('discussions.attachment')} onClick={()=>fileRef.current?.click()}><Paperclip className="size-4"/></Button>
              <Popover open={emojiOpen} onOpenChange={open=>{setEmojiOpen(open);if(open)setMentionOpen(false)}}>
                <PopoverTrigger asChild><Button size="icon" variant="ghost" aria-label={t('discussions.emoji')} aria-expanded={emojiOpen}><Smile className="size-4"/></Button></PopoverTrigger>
                <PopoverContent side="top" align="end" sideOffset={8} collisionPadding={12} className="z-[90] w-72 rounded-2xl border border-border bg-popover p-3 shadow-xl" aria-label={t('discussions.emoji')}>
                  <input className="bg-muted mb-2 w-full rounded-md px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/50" value={emojiSearch} onChange={e=>setEmojiSearch(e.target.value)} placeholder={t('discussions.searchEmoji')} aria-label={t('discussions.searchEmoji')}/>
                  <div className="grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto rounded-xl p-1">{emojiResults.map(([emoji,name])=><button key={name} type="button" className="hover:bg-primary/10 focus-visible:ring-primary flex size-9 items-center justify-center rounded-lg text-xl transition-all duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2" onClick={()=>addEmoji(emoji)} title={name}>{emoji}</button>)}</div>
                </PopoverContent>
              </Popover>
              <Popover open={mentionOpen} onOpenChange={open=>{setMentionOpen(open);if(open){setEmojiOpen(false);setMentionIndex(0)}}}>
                <PopoverTrigger asChild><Button size="icon" variant="ghost" aria-label={t('discussions.mention')} aria-expanded={mentionOpen}><AtSign className="size-4"/></Button></PopoverTrigger>
                <PopoverContent side="top" align="end" sideOffset={8} collisionPadding={12} onOpenAutoFocus={e=>e.preventDefault()} onCloseAutoFocus={e=>e.preventDefault()} className="z-[90] max-h-60 w-72 overflow-y-auto p-2" aria-label={t('discussions.mention')}>
                  <input value={mentionQuery} onChange={e=>{setMentionQuery(e.target.value);setMentionIndex(0);setMentionRange(null)}}
                  placeholder={i18n.language==='ar'?'ابحث بالاسم أو الرقم':'Search name or code'} aria-label={t('discussions.mention')}
                  className="bg-muted mb-2 w-full rounded-md p-2 text-xs outline-none"/>
                  {mentionSuggestions.map((m,i)=><button key={m.userId} type="button" className={`block w-full rounded-md p-2 text-start text-sm ${mentionIndex===i?'bg-primary/10':'hover:bg-muted'}`} onClick={()=>chooseMention(m)}>{m.userName}<span className="text-muted-foreground ms-2 text-xs">{m.userCode}</span></button>)}
                  {mentionSuggestions.length===0&&<p className="text-muted-foreground p-2 text-xs">{i18n.language==='ar'?'لا يوجد مشاركون مطابقون':'No matching participants'}</p>}
                </PopoverContent>
              </Popover>
            </>}
            <Button size="icon" className="shrink-0" aria-label={t('discussions.send')} disabled={send.isPending||edit.isPending||(!text.trim()&&!pendingFile)} onClick={submit}><Send className="size-4"/></Button>
          </div>
          <p className="text-muted-foreground mt-1 text-[10px]">{t('discussions.sendHint')}</p>
        </div>
      </div>
    </div>
    <ConfirmModal open={deleteMessage!==null} title={t('discussions.delete')} message={t('discussions.deleteConfirm')} danger
      confirmText={t('common.delete')} cancelText={t('common.cancel')} loading={remove.isPending} onCancel={()=>setDeleteMessage(null)} onConfirm={()=>{if(deleteMessage)remove.mutate(deleteMessage.id)}}/>
    <ConfirmModal open={deleteFile!==null} title={t('attachments.deleteTitle')} message={t('attachments.deleteConfirm',{name:deleteFile?.name??''})} danger
      confirmText={t('common.delete')} cancelText={t('common.cancel')} loading={removeFile.isPending} onCancel={()=>setDeleteFile(null)} onConfirm={()=>{if(deleteFile)removeFile.mutate(deleteFile.id)}}/>
    <AttachmentPreviewDialog attachment={preview} onOpenChange={open=>{if(!open)setPreview(null)}} getPreview={discussionApi.preview}
      download={async file=>discussionApi.download({id:file.id,name:file.originalFileName,mimeType:file.mimeType??'',sizeBytes:0})}/>
  </section></TooltipProvider>)
  // Portalling to body escapes the parent Radix Dialog's focus layer and hides the chat.
  // Render inside its own DialogContent instead, while avoiding scroll clipping.
  return fullScreen?createPortal(discussion,dialogContainer??document.body):discussion
}
