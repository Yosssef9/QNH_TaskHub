import { apiClient } from '@/lib/api-client'
import { clientEnv } from '@/config/env'
import { getPortalToken } from '@/lib/get-portal-token'
import type { ApiSuccessResponse } from '@/types/api.types'

export type DiscussionScope={subtaskId:number|null;title:string|null;unread:number;lastReadMessageId:number;lastPreview:string|null;lastAtUtc:string|null}
export type DiscussionInboxItem={taskId:number;subtaskId:number|null;taskTitle:string;subtaskTitle:string|null;
  lastMessageId:number;lastPreview:string;lastAtUtc:string;senderName:string;unread:number;mentions:number}
export type DiscussionInboxPage={conversations:DiscussionInboxItem[];nextCursor:number|null}
export type DiscussionFile={id:string;name:string;mimeType:string;sizeBytes:number}
export type DiscussionMessage={
  id:number;taskId:number;subtaskId:number|null;authorUserId:number;authorName:string;
  body:string|null;replyToMessageId:number|null;createdAtUtc:string;
  editedAtUtc:string|null;deletedAtUtc:string|null;files:DiscussionFile[];
  reactions:{emoji:string;count:number;reacted:boolean;users:{userId:number;userName:string}[]}[];readByCount:number;recipientCount:number;
  mentions:{userId:number;userCode:string;userName:string}[];
}
function scopeParams(subtaskId:number|null){return subtaskId===null?{}:{subtaskId}}
export const discussionApi={
  async unreadTotal(){const r=await apiClient.get<ApiSuccessResponse<{unread:number}>>('/task-discussions/inbox/unread-total');return r.data.data.unread},
  async inbox(beforeId?:number,limit=25){
    const r=await apiClient.get<ApiSuccessResponse<DiscussionInboxPage>>('/task-discussions/inbox',{params:{... (beforeId?{beforeId}:{}),limit}});
    return r.data.data;
  },
  async unread(taskIds:number[]){if(!taskIds.length)return {} as Record<number,number>;
    const r=await apiClient.get<ApiSuccessResponse<Record<number,number>>>('/task-discussions/unread',{params:{taskIds:taskIds.join(',')}});return r.data.data},
  async members(taskId:number,subtaskId:number|null){const r=await apiClient.get<ApiSuccessResponse<{userId:number;userCode:string;userName:string}[]>>(`/task-discussions/${taskId}/members`,{params:scopeParams(subtaskId)});return r.data.data},
  async scopes(taskId:number){const r=await apiClient.get<ApiSuccessResponse<DiscussionScope[]>>(`/task-discussions/${taskId}/scopes`);return r.data.data},
  async messages(taskId:number,subtaskId:number|null,beforeId?:number){const r=await apiClient.get<ApiSuccessResponse<DiscussionMessage[]>>(`/task-discussions/${taskId}/messages`,{params:{...scopeParams(subtaskId),beforeId}});return r.data.data},
  async search(taskId:number,subtaskId:number|null,q:string){
    const r=await apiClient.get<ApiSuccessResponse<{id:number;authorName:string;body:string;createdAtUtc:string}[]>>(`/task-discussions/${taskId}/search`,{params:{...scopeParams(subtaskId),q}});return r.data.data},
  async react(messageId:number,emoji:string,active:boolean){await apiClient.put(`/task-discussions/messages/${messageId}/reactions`,{emoji,active})},
  async send(taskId:number,subtaskId:number|null,body:string,replyToMessageId:number|null,clientRequestId:string){
    const r=await apiClient.post<ApiSuccessResponse<{id:number}>>(`/task-discussions/${taskId}/messages`,{body,replyToMessageId,clientRequestId},{params:scopeParams(subtaskId)})
    return r.data.data},
  async typing(taskId:number,subtaskId:number|null,typing:boolean){await apiClient.post(`/task-discussions/${taskId}/typing`,{typing},{params:scopeParams(subtaskId)})},
  async edit(id:number,body:string){await apiClient.patch(`/task-discussions/messages/${id}`,{body})},
  async remove(id:number){await apiClient.delete(`/task-discussions/messages/${id}`)},
  async read(taskId:number,subtaskId:number|null,lastMessageId:number){await apiClient.post(`/task-discussions/${taskId}/read`,{lastMessageId},{params:scopeParams(subtaskId)})},
  async upload(messageId:number,file:File){const form=new FormData();form.append('file',file);await apiClient.post(`/task-discussions/messages/${messageId}/files`,form)},
  async removeFile(id:string){await apiClient.delete(`/task-discussions/files/${id}`)},
  async preview(id:string,signal:AbortSignal){const r=await apiClient.get(`/task-discussions/files/${id}/preview`,{signal,responseType:'blob'});return r.data as Blob},
  async download(file:DiscussionFile){const r=await apiClient.get(`/task-discussions/files/${file.id}/download`,{responseType:'blob'});
    const url=URL.createObjectURL(r.data as Blob);try{const a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove()}finally{setTimeout(()=>URL.revokeObjectURL(url),1000)}},
}

/** Authorized fetch-based event stream: EventSource cannot send TaskHub's Bearer header.
 * Server events contain identifiers only; REST remains the source of truth. */
export async function watchDiscussion(taskId:number,subtaskId:number|null,onEvent:(event:{type:string;userId?:number;typing?:boolean})=>void,signal:AbortSignal){
  const token=getPortalToken();if(!token)return;
  const base=clientEnv.VITE_API_BASE_URL.replace(/\/$/,'')
  const url=`${base}/task-discussions/${taskId}/live${subtaskId===null?'':`?subtaskId=${subtaskId}`}`;
  const res=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'text/event-stream'},signal});
  if(!res.ok || !res.body){const error=new Error(`Discussion stream error: ${res.status}`) as Error & {status?:number};error.status=res.status;throw error}
  const reader=res.body.getReader();const decoder=new TextDecoder();let pending='';
  try{
    while(!signal.aborted){const {value,done}=await reader.read();if(done)break;
      pending+=decoder.decode(value,{stream:true});let boundary=pending.indexOf('\n\n');
      while(boundary>=0){const event=pending.slice(0,boundary).replace(/\r/g,'');pending=pending.slice(boundary+2);
        if(event.includes('event: discussion')){const dataLine=event.split('\n').find(line=>line.startsWith('data: '));
          if(dataLine){try{onEvent(JSON.parse(dataLine.slice(6)) as {type:string;userId?:number;typing?:boolean})}catch{/* ignore invalid event */}}}
        boundary=pending.indexOf('\n\n');
      }
    }
  }finally{reader.releaseLock()}
}

