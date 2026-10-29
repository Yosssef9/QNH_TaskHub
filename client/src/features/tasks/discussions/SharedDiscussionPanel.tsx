import { useEffect, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowDownAZ, Download, ExternalLink, Eye, FileText, FolderOpen, Image as ImageIcon, Link2, LoaderCircle, MessageSquare, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { attachmentPreviewKind, safePreviewMime } from '@/components/shared/attachment-preview'
import { discussionApi, type DiscussionFile, type SharedDiscussionItem, type SharedDiscussionSort, type SharedDiscussionTab } from './discussions.api'

const tabs: {key:SharedDiscussionTab;icon:typeof FileText}[]=[
  {key:'files',icon:FileText},{key:'images',icon:ImageIcon},{key:'links',icon:Link2},
]

const formatSize=(size:number)=>size>=1048576?`${(size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(size/1024))} KB`

function SharedImageThumbnail({file}:{file:DiscussionFile}){
  const [url,setUrl]=useState<string|null>(null)
  useEffect(()=>{
    const controller=new AbortController()
    let previewUrl:string|null=null
    if(!/^image\/(png|jpeg|webp)$/i.test(file.mimeType))return
    void discussionApi.preview(file.id,controller.signal).then(blob=>{
      if(controller.signal.aborted)return
      previewUrl=URL.createObjectURL(new Blob([blob],{type:safePreviewMime({id:file.id,originalFileName:file.name,mimeType:file.mimeType},'image')}))
      setUrl(previewUrl)
    }).catch(()=>{})
    return()=>{controller.abort();if(previewUrl)URL.revokeObjectURL(previewUrl)}
  },[file.id,file.mimeType,file.name])
  return url?<img src={url} alt={file.name} className="size-full object-cover" loading="lazy"/>:<ImageIcon className="text-muted-foreground size-8" aria-hidden="true"/>
}

export function SharedDiscussionPanel({taskId,subtaskId,onClose,onJump,onPreview,onDownload}:{
  taskId:number;subtaskId:number|null;onClose:()=>void;
  onJump:(messageId:number)=>void;
  onPreview:(file:DiscussionFile)=>void;
  onDownload:(file:DiscussionFile)=>void;
}){
  const {t,i18n}=useTranslation()
  const [tab,setTab]=useState<SharedDiscussionTab>('files')
  const [sort,setSort]=useState<SharedDiscussionSort>('newest')
  const [input,setInput]=useState('')
  const [query,setQuery]=useState('')
  useEffect(()=>{const timer=window.setTimeout(()=>setQuery(input.trim()),250);return()=>window.clearTimeout(timer)},[input])
  const results=useInfiniteQuery({
    queryKey:['discussions',taskId,'shared',subtaskId,tab,sort,query],
    initialPageParam:0,
    queryFn:({pageParam})=>discussionApi.shared(taskId,subtaskId,tab,sort,query,pageParam),
    getNextPageParam:last=>last.nextOffset??undefined,
    staleTime:10000,
  })
  const items=results.data?.pages.flatMap(page=>page.items)??[]
  const locale=i18n.language==='ar'?'ar-SA':'en-US'
  const date=(value:string)=>new Date(value).toLocaleDateString(locale,{month:'short',day:'numeric',year:'numeric'})
  const details=(item:SharedDiscussionItem)=>`${item.authorName} · ${date(item.createdAtUtc)}`
  const noResults=!results.isPending&&!results.isError&&!results.isFetchingNextPage&&items.length===0&&!results.hasNextPage
  function handleDownload(file:DiscussionFile){onDownload(file)}
  const canPreview=(file:DiscussionFile)=>attachmentPreviewKind({originalFileName:file.name,mimeType:file.mimeType})!=='unsupported'
  return <aside className="bg-card flex h-full min-h-0 w-full flex-col" aria-label={t('discussions.sharedTitle')}>
    <header className="flex items-center gap-2 border-b px-4 py-3">
      <FolderOpen className="text-primary size-5 shrink-0" aria-hidden="true"/>
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{t('discussions.sharedTitle')}</h3>
      <Button size="icon" variant="ghost" className="size-8" onClick={onClose} aria-label={t('common.close')}><X className="size-4"/></Button>
    </header>
    <div className="space-y-3 border-b px-3 py-3">
      <div className="bg-muted/50 focus-within:ring-primary/40 flex items-center gap-2 rounded-lg border px-3 focus-within:ring-2">
        <Search className="text-muted-foreground size-4 shrink-0"/>
        <input className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" value={input} onChange={e=>setInput(e.target.value)}
          placeholder={t('discussions.sharedSearch')} aria-label={t('discussions.sharedSearch')}/>
        {input&&<button type="button" className="text-muted-foreground hover:text-foreground" onClick={()=>setInput('')} aria-label={t('common.clear')}><X className="size-4"/></button>}
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1" role="tablist" aria-label={t('discussions.sharedTitle')}>
        {tabs.map(({key,icon:Icon})=><button type="button" role="tab" aria-selected={tab===key} key={key}
          onClick={()=>{setTab(key);if(key==='links'&&sort==='name')setSort('newest')}}
          className={`focus-visible:ring-primary flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none ${tab===key?'bg-sky-100 text-sky-800 shadow-sm ring-1 ring-inset ring-sky-300 dark:bg-sky-900/40 dark:text-sky-200 dark:ring-sky-600/60':'text-muted-foreground hover:bg-background/70 hover:text-foreground'}`}>
          <Icon className="size-3.5 shrink-0" aria-hidden="true"/>{t(`discussions.shared${key[0]!.toUpperCase()+key.slice(1)}`)}
        </button>)}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <ArrowDownAZ className="text-muted-foreground size-3.5" aria-hidden="true"/>
        <Select value={sort} onValueChange={value=>setSort(value as SharedDiscussionSort)}>
          <SelectTrigger className="h-8 w-auto min-w-32 px-2.5 text-xs shadow-none" aria-label={t('discussions.sharedSort')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" sideOffset={5} className="z-[90]" data-shared-discussion-sort-menu=""
            onKeyDown={event=>{if(event.key==='Escape')event.stopPropagation()}}>
            <SelectItem value="newest">{t('discussions.sharedNewest')}</SelectItem>
            <SelectItem value="oldest">{t('discussions.sharedOldest')}</SelectItem>
            {tab!=='links'&&<SelectItem value="name">{t('discussions.sharedName')}</SelectItem>}
          </SelectContent>
        </Select>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3" role="tabpanel">
      {results.isPending&&<p className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm"><LoaderCircle className="size-4 animate-spin"/>{t('discussions.sharedLoading')}</p>}
      {results.isError&&<div className="space-y-2 py-10 text-center"><p className="text-destructive text-sm" role="alert">{t('discussions.sharedLoadFailed')}</p><Button variant="outline" size="sm" onClick={()=>void results.refetch()}>{t('common.retry')}</Button></div>}
      {noResults&&<div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16 text-center"><FolderOpen className="size-10 opacity-40"/><p className="text-sm">{query?t('discussions.sharedNoMatches'):t('discussions.sharedEmpty')}</p></div>}
      {tab==='images'?<div className="grid grid-cols-2 gap-2">
        {items.map(item=>item.file&&<div key={`${item.messageId}-${item.file.id}`} className="group overflow-hidden rounded-lg border">
          <button type="button" className="bg-muted/60 focus-visible:ring-primary flex aspect-square w-full items-center justify-center overflow-hidden focus-visible:ring-2" onClick={()=>onPreview(item.file!)} title={item.file.name} aria-label={`${t('attachments.preview')}: ${item.file.name}`}>
            <SharedImageThumbnail file={item.file}/>
          </button>
          <div className="space-y-1.5 p-2">
            <p className="truncate text-xs font-medium" title={item.file.name}>{item.file.name}</p>
            <p className="text-muted-foreground truncate text-[11px]">{details(item)}</p>
            <div className="flex items-center justify-end gap-1">
              <Button size="icon" variant="ghost" className="size-7" aria-label={t('discussions.sharedViewChat')} onClick={()=>onJump(item.messageId)} title={t('discussions.sharedViewChat')}><MessageSquare className="size-3.5"/></Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label={t('attachments.download')} onClick={()=>handleDownload(item.file!)}><Download className="size-3.5"/></Button>
            </div>
          </div>
        </div>)}
      </div>:<div className="space-y-1.5">
        {items.map((item,index)=>{
          const file=item.file
          return <div key={`${item.messageId}-${file?.id??item.url}-${index}`} className="hover:bg-muted/40 rounded-lg border border-transparent px-2 py-3 transition-colors hover:border-border">
            <div className="flex items-start gap-2.5">
              <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">{file?<FileText className="size-5"/>:<Link2 className="size-5"/>}</div>
              <div className="min-w-0 flex-1 space-y-1">
                {file?<p className="break-words text-xs font-semibold" title={file.name}>{file.name}</p>
                :<a className="text-primary break-all text-xs font-semibold hover:underline" href={item.url} target="_blank" rel="noopener noreferrer" title={item.url}>{item.domain}</a>}
                {!file&&<p className="text-muted-foreground line-clamp-2 break-all text-[11px]" title={item.url}>{item.url}</p>}
                <p className="text-muted-foreground text-[11px]">{details(item)}{file?` · ${formatSize(file.sizeBytes)}`:''}</p>
                <div className="flex flex-wrap items-center gap-1">
                  {file?<>
                    {canPreview(file)&&<Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={()=>onPreview(file)}><Eye className="size-3.5"/>{t('attachments.preview')}</Button>}
                    <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={()=>handleDownload(file)}><Download className="size-3.5"/>{t('attachments.download')}</Button>
                  </>:<a className="hover:bg-accent inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5"/>{t('discussions.sharedOpenLink')}</a>}
                  <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={()=>onJump(item.messageId)}><MessageSquare className="size-3.5"/>{t('discussions.sharedViewChat')}</Button>
                </div>
              </div>
            </div>
          </div>
        })}
      </div>}
      {results.hasNextPage&&<div className="flex justify-center py-4"><Button variant="outline" size="sm" disabled={results.isFetchingNextPage} onClick={()=>void results.fetchNextPage()}>
        {results.isFetchingNextPage?<LoaderCircle className="size-4 animate-spin"/>:null}{t('discussions.sharedMore')}
      </Button></div>}
      {items.length===0&&results.hasNextPage&&<p className="text-muted-foreground py-4 text-center text-xs">{t('discussions.sharedMoreHint')}</p>}
    </div>
  </aside>
}
