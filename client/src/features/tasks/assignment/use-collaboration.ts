import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collaborativeApi } from './collaboration.api'

const root=['collaboration'] as const
function useCollaborationMutation<T>(fn:(input:T)=>Promise<unknown>){
  const client=useQueryClient()
  return useMutation({mutationFn:fn,onSuccess:async()=>{
    await Promise.all([
      client.invalidateQueries({queryKey:root}),
      client.invalidateQueries({queryKey:['tasks']}),
      client.invalidateQueries({queryKey:['calendar']}),
      client.invalidateQueries({queryKey:['general-assignments']}),
      client.invalidateQueries({queryKey:['assigned-action-items']}),
      client.invalidateQueries({queryKey:['meetings','action-items']}),
      client.invalidateQueries({queryKey:['notifications']}),
    ])
  }})
}
export function useCollaborativeAssignments(taskId:number|null,enabled:boolean){
  const query=useQuery({queryKey:[...root,taskId],queryFn:()=>collaborativeApi.view(taskId!),
    enabled:enabled&&taskId!==null})
  const team=useCollaborationMutation(({userIds}:{userIds:number[]})=>collaborativeApi.setTeam(taskId!,userIds))
  const childTeam=useCollaborationMutation(({subtaskId,mode,userIds}:{subtaskId:number;mode:'INHERIT'|'CUSTOM';userIds:number[]})=>
    collaborativeApi.setChildTeam(taskId!,subtaskId,mode,userIds))
  const note=useCollaborationMutation(({assignmentId,note}:{assignmentId:number;note:string})=>collaborativeApi.addNote(assignmentId,note))
  const complete=useCollaborationMutation(({assignmentId,completed}:{assignmentId:number;completed:boolean})=>collaborativeApi.complete(assignmentId,completed))
  const upload=useCollaborationMutation(({assignmentId,file}:{assignmentId:number;file:File})=>collaborativeApi.upload(assignmentId,file))
  return {query,team,childTeam,note,complete,upload}
}

