import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TaskPriorityIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import { TASK_PRIORITIES } from '@/features/tasks/types/task.types'
import { apiClient } from '@/lib/api-client'
import type { SharedTask } from './task-shares.api'

export function EditSharedTaskDialog({ task, open, onOpenChange }: { task: SharedTask; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [dueDate, setDueDate] = useState(task.dueDate ?? '')
  useEffect(() => {
    setTitle(task.title); setDescription(task.description ?? ''); setPriority(task.priority); setDueDate(task.dueDate ?? '')
  }, [task])
  const mutation = useMutation({
    mutationFn: () => apiClient.patch(`/tasks/${task.taskId}`, {
      title: title.trim(), description: description.trim() || null, priority, dueDate: dueDate || null,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['task-shares'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ])
      onOpenChange(false)
    },
    onError: () => toast.error(t('taskSharing.error')),
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <div className="space-y-4 pe-8">
          <DialogTitle className="text-lg font-semibold">{t('taskSharing.edit')}</DialogTitle>
          <DialogDescription>{t('taskSharing.editorNotice')}</DialogDescription>
          <label className="block space-y-1">
            <span className="text-xs font-semibold">{t('tasks.title')}</span>
            <Input value={title} maxLength={1000} onChange={event => setTitle(event.target.value)}/>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold">{t('tasks.description')}</span>
            <Textarea value={description} maxLength={4000} onChange={event => setDescription(event.target.value)}/>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">{t('tasks.priority')}</label>
              <Select value={priority} onValueChange={next => setPriority(next as SharedTask['priority'])}>
                <SelectTrigger aria-label={t('tasks.priority')}>
                  <SelectValue><TaskPriorityIndicator priority={priority} pill/></SelectValue>
                </SelectTrigger>
                <SelectContent>{TASK_PRIORITIES.map(value =>
                  <SelectItem value={value} key={value}><TaskPriorityIndicator priority={value}/></SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DatePicker label={t('tasks.dueDate')} labelPlacement="above" value={dueDate} onChange={setDueDate}/>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button disabled={!title.trim() || mutation.isPending} onClick={() => mutation.mutate()}>{t('common.save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
