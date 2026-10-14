import { useMemo,useRef,useState } from 'react'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { Check,ImagePlus,Palette,Plus,Search,UploadCloud,X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { IconPicker } from '@/components/shared/IconPicker'
import { fetchTags,createTag } from './tags.api'
import type { TaskTag,TagInput } from './tags.api'
import { TagChip,TagIcon,builtinIcons,tagIconMap } from './TaskTags'
import { TAG_COLOR_PRESETS,validateTagImageFile } from './tag-editor-options'

export function useTags() {return useQuery({queryKey:['tags','library'],queryFn:fetchTags,staleTime:30000})}
export function TagPicker({value,onChange,disabled=false,filterMode=false}:{value:number[];onChange:(ids:number[])=>void;disabled?:boolean;filterMode?:boolean}) {
 const {i18n}=useTranslation();const ar=i18n.language.startsWith('ar');const q=useTags();const [search,setSearch]=useState('');const [createOpen,setCreateOpen]=useState(false)
 const tags=useMemo(()=>q.data?.filter(t=>`${t.name} ${t.scope}`.toLowerCase().includes(search.toLowerCase()))??[],[q.data,search]);
 return <div className="space-y-2">
  <div className="flex flex-wrap gap-1.5">{value.map(id=>{const tag=q.data?.find(t=>t.id===id);return tag?<button type="button" key={id} disabled={disabled}
    onClick={()=>onChange(value.filter(x=>x!==id))} className="bg-muted inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
    ><TagIcon tag={tag} size={18}/>{tag.name}<span aria-hidden="true">×</span></button>:null})}</div>
  <div className="relative"><Search className="text-muted-foreground absolute start-3 top-2.5 size-4"/>
    <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder={ar?'ابحث عن الوسوم...':'Search tags...'} className="ps-9"/></div>
  <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-1.5" role="group" aria-label={ar?'الوسوم':'Tags'}>
    {tags.map(tag=><label key={tag.id} className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm">
      <input type="checkbox" disabled={disabled||(!filterMode&&!tag.selectable)||(!filterMode&&value.length>=8&&!value.includes(tag.id))} checked={value.includes(tag.id)} onChange={e=>onChange(e.target.checked?[...value,tag.id]:value.filter(id=>id!==tag.id))}/>
      <TagIcon tag={tag} size={20}/><span className="min-w-0 flex-1 truncate">{tag.name}</span>
      <span className="text-muted-foreground text-[10px]">{tag.scope==='SYSTEM'?(ar?'عام':'Shared'):tag.selectable?(ar?'شخصي':'Personal'):(ar?'من مهمة مشتركة':'Shared task')}</span>
    </label>)}
    {q.isPending?<p className="text-muted-foreground p-2 text-xs">{ar?'جار التحميل...':'Loading...'}</p>:null}
    {!q.isPending&&!tags.length?<p className="text-muted-foreground p-2 text-xs">{ar?'لا توجد وسوم':'No tags'}</p>:null}
  </div>
  {!filterMode?<Button type="button" variant="outline" size="sm" disabled={disabled} onClick={()=>setCreateOpen(true)}><Plus className="size-4"/>{ar?'إنشاء وسم':'New tag'}</Button>:null}
  <TagEditor open={createOpen} onClose={()=>setCreateOpen(false)} onCreated={tag=>onChange([...value,tag.id])}/>
 </div>
}

type SelectedTagImage = { name: string; size: number; dataUrl: string }

export function TagEditor({open,onClose,onCreated,initial,onSave}:{open:boolean;onClose:()=>void;onCreated?:(tag:TaskTag)=>void;initial?:TaskTag;onSave?:(input:TagInput)=>Promise<void>}) {
  const {i18n}=useTranslation()
  const ar=i18n.language.startsWith('ar')
  const client=useQueryClient()
  const fileInputRef=useRef<HTMLInputElement>(null)
  const [name,setName]=useState(initial?.name??'')
  const [color,setColor]=useState(initial?.color??'#2563EB')
  const [kind,setKind]=useState<'LUCIDE'|'UPLOAD'>(initial?.iconKind==='UPLOAD'?'UPLOAD':'LUCIDE')
  const [icon,setIcon]=useState(initial?.iconKey??'tag')
  const [image,setImage]=useState<SelectedTagImage|null>(null)
  const [dragging,setDragging]=useState(false)
  const [reading,setReading]=useState(false)
  const [busy,setBusy]=useState(false)

  const originalUpload=initial?.iconKind==='UPLOAD'
  const hasUpload=Boolean(image||originalUpload)
  const previewTag:TaskTag={
    id:initial?.id??0,name:name.trim()||(ar?'اسم الوسم':'Tag name'),
    color,scope:'PERSONAL',iconKind:kind,iconKey:kind==='LUCIDE'?icon:null,
  }
  const iconPreview=kind==='UPLOAD'
    ? image
      ? <img src={image.dataUrl} alt="" className="size-9 shrink-0 object-contain" />
      : originalUpload&&initial
        ? <TagIcon tag={initial} size={36}/>
        : <ImagePlus className="text-muted-foreground size-7" aria-hidden="true" />
    : null

  const reset=()=>{
    setName(initial?.name??'')
    setColor(initial?.color??'#2563EB')
    setKind(initial?.iconKind==='UPLOAD'?'UPLOAD':'LUCIDE')
    setIcon(initial?.iconKey??'tag')
    setImage(null)
    setDragging(false)
    setReading(false)
    if(fileInputRef.current)fileInputRef.current.value=''
  }
  const close=()=>{if(busy||reading)return;reset();onClose()}

  function onFile(file?:File) {
    if(!file)return
    const error=validateTagImageFile(file)
    if(error){
      const message=error==='type'
        ? (ar?'تُقبل صور PNG وJPG وWebP فقط':'Only PNG, JPG and WebP images are supported')
        : error==='size'
          ? (ar?'يجب ألا يتجاوز حجم الصورة 256 كيلوبايت':'Image must be 256 KB or smaller')
          : (ar?'ملف الصورة فارغ':'The image file is empty')
      toast.error(message)
      return
    }
    setReading(true)
    const reader=new FileReader()
    reader.onload=()=>{
      setImage({name:file.name,size:file.size,dataUrl:String(reader.result)})
      setReading(false)
    }
    reader.onerror=()=>{
      setReading(false)
      toast.error(ar?'تعذر قراءة ملف الصورة':'Could not read the image file')
    }
    reader.readAsDataURL(file)
  }

  async function save(){
    if(!name.trim()||busy||reading||(kind==='UPLOAD'&&!hasUpload))return
    setBusy(true)
    try{
      const input:TagInput={name:name.trim(),color,iconKind:kind,
        ...(kind==='LUCIDE'?{iconKey:icon}:image?{iconDataUrl:image.dataUrl}:{})}
      if(onSave)await onSave(input)
      else{const result=await createTag(input);onCreated?.(result)}
      await client.invalidateQueries({queryKey:['tags']})
      reset()
      onClose()
    }catch{
      toast.error(ar?'تعذر حفظ الوسم':'Could not save tag')
    }finally{setBusy(false)}
  }

  return <Dialog open={open} onOpenChange={value=>{if(!value)close()}}>
    <DialogContent variant="modal" closeLabel={ar?'إغلاق':'Close'}
      className="w-[min(39rem,calc(100vw-1.5rem))] max-h-[min(92vh,830px)] p-4 sm:p-6">
      <DialogTitle className="pe-10 text-lg font-bold">
        {ar?(initial?'تعديل الوسم':'وسم جديد'):(initial?'Edit tag':'Create tag')}
      </DialogTitle>
      <DialogDescription className="text-muted-foreground mt-1 pe-10 text-sm">
        {ar?'اختر اسم الوسم وأيقونته ولونه':'Choose a name, icon and color for your tag'}
      </DialogDescription>
      <div className="space-y-5 pt-5">
        <div className="space-y-1.5">
          <label htmlFor="tag-editor-name" className="block text-sm font-semibold">
            {ar?'اسم الوسم':'Tag name'} <span className="text-destructive">*</span>
          </label>
          <Input id="tag-editor-name" maxLength={80} value={name} onChange={event=>setName(event.target.value)}
            placeholder={ar?'مثال: الأمن السيبراني':'e.g. Cybersecurity'} autoComplete="off" />
        </div>

        <section className="space-y-3" aria-label={ar?'أيقونة الوسم':'Tag icon'}>
          <p className="text-sm font-semibold">{ar?'أيقونة الوسم':'Tag icon'}</p>
          <div className="bg-muted/40 inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border p-1">
            <Button type="button" size="sm" variant={kind==='LUCIDE'?'default':'ghost'}
              aria-pressed={kind==='LUCIDE'} onClick={()=>setKind('LUCIDE')}>
              <Palette className="size-4" />{ar?'أيقونة جاهزة':'Built-in icon'}
            </Button>
            <Button type="button" size="sm" variant={kind==='UPLOAD'?'default':'ghost'}
              aria-pressed={kind==='UPLOAD'} onClick={()=>setKind('UPLOAD')}>
              <ImagePlus className="size-4" />{ar?'تحميل صورة':'Upload image'}
            </Button>
          </div>
          {kind==='LUCIDE'
            ? <IconPicker value={icon} options={builtinIcons} icons={tagIconMap}
                onChange={setIcon} getLabel={value=>value.replaceAll('-',' ')}
                searchLabel={ar?'بحث الأيقونات':'Search icons'} searchPlaceholder={ar?'ابحث عن أيقونة':'Search icons'}
                clearSearchLabel={ar?'مسح البحث':'Clear icon search'} noResultsText={ar?'لا نتائج':'No icons found'}
                selectedLabel={ar?'الأيقونة المختارة':'Selected icon'} accentColor={color}/>
            : <div className="space-y-3">
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp"
                  className="sr-only" tabIndex={-1} aria-label={ar?'اختر صورة الوسم':'Choose tag image'}
                  onChange={event=>{onFile(event.target.files?.[0]);event.target.value=''}} />
                <button type="button" onClick={()=>fileInputRef.current?.click()}
                  onDragEnter={event=>{event.preventDefault();setDragging(true)}}
                  onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';setDragging(true)}}
                  onDragLeave={event=>{event.preventDefault();setDragging(false)}}
                  onDrop={event=>{event.preventDefault();setDragging(false);onFile(event.dataTransfer.files[0])}}
                  className={`focus-visible:ring-ring flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none ${dragging?'border-primary bg-primary/10':'border-border hover:border-primary/60 hover:bg-muted/40'}`}>
                  <span className="bg-muted grid size-12 place-items-center rounded-xl">
                    {hasUpload?iconPreview:<UploadCloud aria-hidden="true" className="text-primary size-6"/>}
                  </span>
                  <span className="text-sm font-semibold">
                    {reading?(ar?'جارٍ قراءة الصورة...':'Reading image...'):
                      hasUpload?(ar?'اضغط لاستبدال الصورة أو اسحب صورة جديدة':'Click or drop a new image to replace'):
                      (ar?'اضغط لاختيار صورة أو اسحبها هنا':'Choose an image or drag it here')}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {ar?'PNG أو JPG أو WebP · حتى 256 كيلوبايت · يُفضّل شكل مربع':'PNG, JPG or WebP · up to 256 KB · square recommended'}
                  </span>
                </button>
                {hasUpload?<div className="bg-muted/30 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border p-3">
                  <span className="bg-background grid size-10 shrink-0 place-items-center rounded-md border">{iconPreview}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{image?.name??(ar?'الصورة الحالية':'Current image')}</p>
                    <p className="text-muted-foreground text-xs">{image?`${Math.ceil(image.size/1024)} KB`:(ar?'صورة الوسم المحفوظة':'Saved tag icon')}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={()=>fileInputRef.current?.click()}>
                    {ar?'استبدال':'Replace'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={()=>{setImage(null);setKind('LUCIDE')}}>
                    <X className="size-3.5"/>{ar?'إزالة':'Remove'}
                  </Button>
                </div>:null}
              </div>}
        </section>

        <section className="space-y-2" aria-label={ar?'لون الوسم':'Tag color'}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-semibold">{ar?'لون الوسم':'Tag color'}</label>
            <span className="text-muted-foreground font-mono text-xs" dir="ltr">{color.toUpperCase()}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TAG_COLOR_PRESETS.map(preset=><button key={preset} type="button"
              aria-label={`${ar?'اختر اللون':'Select color'} ${preset}`} aria-pressed={color.toUpperCase()===preset}
              onClick={()=>setColor(preset)}
              className={`focus-visible:ring-ring grid size-9 shrink-0 place-items-center rounded-full border-[3px] border-background shadow-sm ring-offset-1 transition-transform hover:scale-110 focus-visible:ring-2 ${color.toUpperCase()===preset?'ring-foreground ring-2':'ring-border ring-1'}`}
              style={{backgroundColor:preset}}>
              {color.toUpperCase()===preset?<Check className="size-4 text-white drop-shadow-sm" aria-hidden="true"/>:null}
            </button>)}
            <label className="focus-within:ring-ring hover:bg-muted relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium focus-within:ring-2">
              <Palette className="size-4" aria-hidden="true"/>{ar?'لون مخصص':'Custom'}
              <input type="color" aria-label={ar?'اختيار لون مخصص':'Choose custom color'} value={color}
                onChange={event=>setColor(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
          </div>
        </section>

        <section className="bg-muted/30 space-y-2 rounded-xl border p-3" aria-label={ar?'معاينة الوسم':'Tag preview'}>
          <p className="text-muted-foreground text-xs font-semibold">{ar?'معاينة الوسم على بطاقة المهمة':'Preview on a task card'}</p>
          <div className="bg-background flex min-h-14 items-center rounded-lg border p-3">
            <TagChip tag={previewTag} iconOverride={kind==='UPLOAD'&&image
              ? <img src={image.dataUrl} alt="" className="size-5 object-contain"/>
              : kind==='UPLOAD'&&!originalUpload
                ? <ImagePlus className="size-5" aria-hidden="true"/>
                : undefined}/>
          </div>
        </section>

        <div className="bg-background sticky bottom-0 z-10 -mx-1 flex flex-wrap justify-end gap-2 border-t px-1 py-3">
          <Button type="button" variant="outline" onClick={close} disabled={busy||reading}>{ar?'إلغاء':'Cancel'}</Button>
          <Button type="button" disabled={busy||reading||!name.trim()||(kind==='UPLOAD'&&!hasUpload)} onClick={()=>void save()}>
            {ar?'حفظ':'Save'}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
