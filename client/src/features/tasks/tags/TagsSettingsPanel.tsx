import { useState } from 'react'
import { useMutation,useQueryClient } from '@tanstack/react-query'
import { Pencil,Trash2,Plus,Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { archiveTag,updateTag } from './tags.api'
import type { TaskTag,TagInput } from './tags.api'
import { useTags,TagEditor } from './TagPicker'
import { TagIcon } from './TaskTags'

export function TagsSettingsPanel() {
 const {i18n}=useTranslation();const ar=i18n.language.startsWith('ar');const q=useTags();const qc=useQueryClient()
 const [editing,setEditing]=useState<TaskTag|null>(null);const [creating,setCreating]=useState(false)
 const archive=useMutation({mutationFn:archiveTag,onSuccess:async()=>{await qc.invalidateQueries({queryKey:['tags']});
   await qc.invalidateQueries({queryKey:['tasks']});toast.success(ar?'تم أرشفة الوسم':'Tag archived')},onError:()=>toast.error(ar?'تعذر أرشفة الوسم':'Could not archive tag')})
 const system=q.data?.filter(t=>t.scope==='SYSTEM')??[]
 const mine=q.data?.filter(t=>t.scope==='PERSONAL'&&t.selectable)??[]
 // Shared foreign tags remain filterable but are never editable in My Tags.
 async function update(input:TagInput) {if(!editing)return;await updateTag(editing.id,input);await qc.invalidateQueries({queryKey:['tasks']})}
 return <Card className="space-y-5 p-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-bold"><Tags className="size-5" />{ar?'إدارة الوسوم':'Manage tags'}</h2>
   <p className="text-muted-foreground mt-1 text-sm">{ar?'الوسوم العامة للجميع، والوسوم الشخصية تنتمي إلى منشئها.':'Shared tags for everyone, personal tags belong to their creator.'}</p></div>
   <Button onClick={()=>setCreating(true)}><Plus className="size-4"/>{ar?'وسم جديد':'New tag'}</Button></div>
  <section className="space-y-2"><h3 className="text-sm font-semibold">{ar?'الوسوم العامة':'Shared tags'}</h3>
   {system.map(t=><div key={t.id} className="bg-muted/25 flex items-center gap-3 rounded-lg border px-3 py-2">
     <TagIcon tag={t} size={28}/><strong className="flex-1 text-sm">{t.name}</strong><span className="text-muted-foreground text-xs">{ar?'عام':'Shared'}</span></div>)}</section>
  <section className="space-y-2"><h3 className="text-sm font-semibold">{ar?'وسومي':'My tags'}</h3>
   {mine.length===0?<p className="text-muted-foreground text-sm">{ar?'لا توجد وسوم شخصية':'No personal tags yet'}</p>:null}
   {mine.map(t=><div key={t.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
     <TagIcon tag={t} size={28}/><strong className="min-w-0 flex-1 truncate text-sm">{t.name}</strong>
     <Button size="icon" variant="ghost" aria-label={ar?'تعديل':'Edit'} onClick={()=>setEditing(t)}><Pencil className="size-4"/></Button>
     <Button size="icon" variant="ghost" aria-label={ar?'أرشفة':'Archive'} disabled={archive.isPending} onClick={()=>{
       if(window.confirm(ar?'هل تريد أرشفة هذا الوسم؟':'Archive this tag?'))archive.mutate(t.id)
     }}><Trash2 className="text-destructive size-4"/></Button></div>)}</section>
  {creating?<TagEditor open onClose={()=>setCreating(false)}/>:null}
  {editing?<TagEditor key={editing.id} initial={editing} open onClose={()=>setEditing(null)} onSave={update}/>:null}
 </Card>
}
