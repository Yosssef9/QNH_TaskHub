import { useEffect, useState } from 'react'
import { UserRoundCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { TaskAssigneePicker } from '../assignment/TaskAssigneePicker'
import { useSetTaskProxy } from '../assignment/use-general-assignment'
import type { TaskProxyGrant } from '../types/task.types'

/** One active proxy per scope. The owner can see the proxy, but cannot appoint one. */
export function TaskProxyControl({taskId,subtaskId=null,principalUserId,actorUserId,ownerUserId,grant}:
  {taskId:number;subtaskId?:number|null;principalUserId:number|null;actorUserId:number|null;
    ownerUserId:number|null;grant:TaskProxyGrant|null}){
  const {t}=useTranslation()
  const canManage=principalUserId!==null && actorUserId===principalUserId && actorUserId!==ownerUserId
  const [draft,setDraft]=useState<number|null>(grant?.proxyUserId??null)
  const mutation=useSetTaskProxy()
  useEffect(()=>setDraft(grant?.proxyUserId??null),[grant?.proxyUserId,taskId,subtaskId])
  if(!canManage&&!grant)return null
  return <div className="border-border/80 bg-muted/25 space-y-2 rounded-lg border p-3">
    <div className="flex items-center gap-2 text-sm font-semibold">
      <UserRoundCheck className="size-4"/>{t('tasks.proxy.title')}
    </div>
    {canManage ? <>
      <TaskAssigneePicker value={draft} onChange={setDraft}
        disabled={mutation.isPending} excludedUserIds={[principalUserId,ownerUserId].filter((v):v is number=>v!=null)}/>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{t('tasks.proxy.accountability')}</span>
        <Button type="button" size="sm" disabled={mutation.isPending || draft===(grant?.proxyUserId??null)}
          onClick={()=>mutation.mutate({taskId,subtaskId,proxyUserId:draft},{
            onSuccess:()=>toast.success(t('tasks.proxy.saved')),
            onError:()=>toast.error(t('tasks.proxy.failed')),
          })}>{t('common.save')}</Button>
      </div>
    </> : <p className="text-sm">{grant?.proxyName}</p>}
  </div>
}
