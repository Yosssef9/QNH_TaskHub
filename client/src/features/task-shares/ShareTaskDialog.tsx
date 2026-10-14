import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Loader2, Pencil, Share2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskAssigneeMultiPicker } from '@/features/tasks/assignment/TaskAssigneeMultiPicker'
import { getShareRecipients, saveShareRecipients } from './task-shares.api'
import type { SharePermission } from './task-shares.api'

function PermissionChoice({ permission, description = false }: { permission: SharePermission; description?: boolean }) {
  const { t } = useTranslation()
  const Icon = permission === 'VIEW' ? Eye : Pencil
  return (
    <span className="flex min-w-0 items-center gap-2 text-start">
      <Icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0"/>
      <span className="min-w-0">
        <span className="block truncate">{t(permission === 'VIEW' ? 'taskSharing.view' : 'taskSharing.edit')}</span>
        {description ? <span className="text-muted-foreground block max-w-[18rem] whitespace-normal text-xs leading-5">
          {t(permission === 'VIEW' ? 'taskSharing.viewDescription' : 'taskSharing.editDescription')}
        </span> : null}
      </span>
    </span>
  )
}

export function ShareTaskDialog({ taskId, open, onOpenChange }: { taskId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['task-shares', 'recipients', taskId], queryFn: () => getShareRecipients(taskId), enabled: open })
  const [selected, setSelected] = useState<number[]>([])
  const [newUsers, setNewUsers] = useState<Array<{userId:number;userName:string;userCode:string;email:string|null}>>([])
  const [permissions, setPermissions] = useState<Record<number, SharePermission>>({})

  useEffect(() => {
    if (!query.data) return
    setSelected(query.data.map(user => user.userId))
    setPermissions(Object.fromEntries(query.data.map(user => [user.userId, user.permission])))
  }, [query.data])
  const knownUsers = useMemo(() => {
    const previous = (query.data ?? []).map(user => ({ userId: user.userId, userName: user.userName, userCode: user.userCode, email: user.email }))
    return [...new Map([...previous, ...newUsers].map(user => [user.userId, user])).values()]
  }, [query.data, newUsers])
  const save = useMutation({
    mutationFn: () => saveShareRecipients(taskId, selected.map(userId => ({ userId, permission: permissions[userId] ?? 'VIEW' }))),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['task-shares'] }),
        client.invalidateQueries({ queryKey: ['tasks'] }),
        client.invalidateQueries({ queryKey: ['notifications'] }),
      ])
      toast.success(t('taskSharing.success'))
      onOpenChange(false)
    },
    onError: () => toast.error(t('taskSharing.error')),
  })
  function updateSelection(ids: number[]) {
    setSelected(ids)
    setPermissions(previous => Object.fromEntries(ids.map(id => [id, previous[id] ?? 'VIEW'])))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" closeLabel={t('common.close')} className="w-[min(42rem,calc(100vw-2rem))]">
        <div className="space-y-4 pe-8">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Share2 className="text-primary size-5"/>{t('taskSharing.share')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">{t('taskSharing.people')}</DialogDescription>
          {query.isPending ? <Loader2 className="size-5 animate-spin"/>
            : query.isError ? <p className="text-destructive text-sm">{t('taskSharing.error')}</p>
            : <>
              <div className="space-y-2">
                <span className="text-muted-foreground block text-xs font-semibold">{t('taskSharing.add')}</span>
                <TaskAssigneeMultiPicker value={selected} onChange={updateSelection} knownUsers={knownUsers}
                  onUserPicked={user => setNewUsers(previous => [...previous.filter(item => item.userId !== user.userId), user])} />
              </div>
              <div className="max-h-[44vh] space-y-2 overflow-y-auto px-0.5">
                {selected.map(userId => {
                  const user = knownUsers.find(person => person.userId === userId)
                  return (
                    <div key={userId} className="border-border flex flex-wrap items-center gap-2 rounded-xl border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{user?.userName ?? `#${userId}`} - {user?.userCode ?? userId}</p>
                        {user?.email ? <p dir="ltr" className="text-muted-foreground truncate text-start text-xs">{user.email}</p> : null}
                      </div>
                      <Select value={permissions[userId] ?? 'VIEW'}
                        onValueChange={next => setPermissions(previous => ({ ...previous, [userId]: next as SharePermission }))}>
                        <SelectTrigger className="w-[min(12rem,100%)] min-w-[9rem]" aria-label={`${t('taskSharing.permissions')}: ${user?.userName ?? userId}`}>
                          <SelectValue><PermissionChoice permission={permissions[userId] ?? 'VIEW'}/></SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-w-[min(22rem,calc(100vw-2rem))]">
                          <SelectItem value="VIEW"><PermissionChoice permission="VIEW" description/></SelectItem>
                          <SelectItem value="EDIT"><PermissionChoice permission="EDIT" description/></SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" type="button" aria-label={t('taskSharing.remove')}
                        onClick={() => updateSelection(selected.filter(id => id !== userId))}>
                        <Trash2 className="text-destructive size-4"/>
                      </Button>
                    </div>
                  )
                })}
                {!selected.length ? <p className="text-muted-foreground py-5 text-center text-sm">{t('taskSharing.noUsers')}</p> : null}
              </div>
              <div className="text-muted-foreground space-y-1 border-t pt-3 text-xs">
                <p><Eye className="me-1 inline size-3.5"/>{t('taskSharing.view')}: {t('taskSharing.viewDescription')}</p>
                <p><Pencil className="me-1 inline size-3.5"/>{t('taskSharing.edit')}: {t('taskSharing.editDescription')}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                <Button type="button" disabled={save.isPending || selected.length > 30} onClick={() => save.mutate()}>
                  {save.isPending ? <Loader2 className="size-4 animate-spin"/> : null}{t('taskSharing.save')}
                </Button>
              </div>
            </>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
