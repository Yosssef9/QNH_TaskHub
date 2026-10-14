import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import { normalizeTagIds, normalizeTagRecord } from './tag-id'
export type TaskTag = {
  id:number;name:string;scope:'SYSTEM'|'PERSONAL';iconKind:'SYSTEM'|'LUCIDE'|'UPLOAD';
  iconKey:string|null;color:string;ownerUserId?:number|null;selectable?:boolean
}
export type TagInput = {name:string;color:string;iconKind:'LUCIDE'|'UPLOAD';iconKey?:string;iconDataUrl?:string}
export async function fetchTags():Promise<TaskTag[]> {
  const res = await apiClient.get<ApiSuccessResponse<TaskTag[]>>('/tags')
  return res.data.data.map(normalizeTagRecord)
}
export async function createTag(input:TagInput) {
  const res = await apiClient.post<ApiSuccessResponse<TaskTag>>('/tags', input)
  return normalizeTagRecord(res.data.data)
}
export async function updateTag(id:number,input:TagInput) {await apiClient.patch(`/tags/${id}`,input)}
export async function archiveTag(id:number) {await apiClient.delete(`/tags/${id}`)}
export async function setTaskTags(taskId:number,tagIds:number[]) {
  await apiClient.put(`/tasks/${taskId}/tags`, {tagIds: normalizeTagIds(tagIds)})
}
export async function getTagImage(id:number):Promise<Blob> {
  const res=await apiClient.get<Blob>(`/tags/${id}/icon`,{responseType:'blob'});return res.data
}
