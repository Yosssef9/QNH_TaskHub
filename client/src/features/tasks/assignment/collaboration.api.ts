import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

export interface CollaborativeMember {
  id: number
  taskId: number
  subtaskId: number | null
  userId: number
  userName: string
  userCode: string
  email: string | null
  state: 'TODO' | 'IN_PROGRESS' | 'DONE'
  isActive:boolean
  completedAtUtc: string | null
  assignedAtUtc: string
}
export interface CollaborativeNote {id:number;assignmentId:number;note:string;createdAtUtc:string}
export interface CollaborativeFile {id:string;assignmentId:number;originalFileName:string;mimeType:string;fileExtension:string;sizeBytes:number;uploadedAtUtc:string;uploadedByUserId:number}
export interface CollaborativeMode {subtaskId:number;mode:'INHERIT'|'CUSTOM'}
export interface CollaborativeProgress {scopeId:number|null;total:number;completed:number}
export interface CollaborativeView {
  enabled:boolean
  canManage:boolean
  members:CollaborativeMember[]
  notes:CollaborativeNote[]
  files:CollaborativeFile[]
  modes:CollaborativeMode[]
  progress:CollaborativeProgress[]
}
async function result<T>(operation:Promise<{data:ApiSuccessResponse<T>}>):Promise<T>{
  const response=await operation
  return response.data.data
}
export const collaborativeApi={
  view:(taskId:number)=>result(apiClient.get<ApiSuccessResponse<CollaborativeView>>(`/collaboration/task/${taskId}`)),
  setTeam:(taskId:number,userIds:number[])=>result(apiClient.put<ApiSuccessResponse<CollaborativeView>>(
    `/collaboration/task/${taskId}/assignees`,{userIds})),
  setChildTeam:(taskId:number,subtaskId:number,mode:'INHERIT'|'CUSTOM',userIds:number[])=>result(
    apiClient.put<ApiSuccessResponse<CollaborativeView>>(`/collaboration/task/${taskId}/subtasks/${subtaskId}/assignees`,{mode,userIds})),
  addNote:(assignmentId:number,note:string)=>result(apiClient.post<ApiSuccessResponse<{assignmentId:number}>>(
    `/collaboration/assignments/${assignmentId}/notes`,{note})),
  complete:(assignmentId:number,completed:boolean)=>result(apiClient.patch<ApiSuccessResponse<{assignmentId:number;completed:boolean}>>(
    `/collaboration/assignments/${assignmentId}/completion`,{completed})),
  upload:(assignmentId:number,file:File)=>{
    const data=new FormData();data.append('file',file)
    return result(apiClient.post<ApiSuccessResponse<{id:string}>>(`/collaboration/assignments/${assignmentId}/files`,data))
  },
  removeFile:async(id:string)=>{await apiClient.delete(`/collaboration/files/${id}`)},
  preview:async(id:string,signal:AbortSignal):Promise<Blob>=>{
    const response=await apiClient.get<Blob>(`/collaboration/files/${id}/preview`,{responseType:'blob',signal})
    return response.data
  },
  download:async(id:string,name:string)=>{
    const response=await apiClient.get<Blob>(`/collaboration/files/${id}/download`,{responseType:'blob'})
    const link=document.createElement('a'); const url=URL.createObjectURL(response.data)
    try {link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove()}
    finally{URL.revokeObjectURL(url)}
  },
}

