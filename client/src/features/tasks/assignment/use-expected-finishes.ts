import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { expectedFinishesApi } from './expected-finishes.api'

export function useExpectedFinishes(taskId: number) {
  const queryClient=useQueryClient()
  const query=useQuery({queryKey:['expected-finishes',taskId],queryFn:()=>expectedFinishesApi.view(taskId)})
  const save=useMutation({mutationFn:({subtaskId,date}:{subtaskId:number|null;date:string|null})=>
    expectedFinishesApi.save(taskId,subtaskId,date),onSuccess:async(data)=>{
      queryClient.setQueryData(['expected-finishes',taskId],data)
      await Promise.all([
        queryClient.invalidateQueries({queryKey:['tasks']}),
        queryClient.invalidateQueries({queryKey:['general-assignments']}),
      ])
    }})
  return {query,save}
}
