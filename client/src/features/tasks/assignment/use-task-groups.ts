import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import { createTaskGroup,deleteTaskGroup,bulkMoveTasks,getTaskGroups,moveTaskToGroup,reorderTaskGroups,updateTaskGroup } from './task-groups.api'
import type { TaskGroupFilters } from './task-groups.api'

export function useTaskGroups(listId:number|null, filters?:TaskGroupFilters){
  return useQuery({queryKey:['task-groups',listId,filters ?? null],queryFn:()=>getTaskGroups(listId!,filters),enabled:listId!==null})
}
export function useTaskGroupActions(){
  const client=useQueryClient()
  const invalidate=async()=>{
    await Promise.all([
      client.invalidateQueries({queryKey:['task-groups']}),
      client.invalidateQueries({queryKey:['tasks']}),
      client.invalidateQueries({queryKey:['dashboard']}),
    ])
  }
  return {
    create:useMutation({mutationFn:createTaskGroup,onSuccess:invalidate}),
    update:useMutation({mutationFn:updateTaskGroup,onSuccess:invalidate}),
    remove:useMutation({mutationFn:deleteTaskGroup,onSuccess:invalidate}),
    bulkMove:useMutation({mutationFn:bulkMoveTasks,onSuccess:invalidate}),
    reorder:useMutation({mutationFn:reorderTaskGroups,onSuccess:invalidate}),
    moveTask:useMutation({mutationFn:moveTaskToGroup,onSuccess:invalidate}),
  }
}
