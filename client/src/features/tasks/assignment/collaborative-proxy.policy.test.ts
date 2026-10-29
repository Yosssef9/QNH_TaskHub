import { describe, expect, it } from 'vitest';
import type { CollaborativeMember,CollaborativeView } from './collaboration.api';
import { myCollaborativeAssignment,visibleCollaborativeSubmissions } from './collaborative-workspace.policy';
const row=(id:number,subtaskId:number|null,proxyUserId:number|null):CollaborativeMember=>({
  id,taskId:99,subtaskId,userId:200+id,proxyUserId,proxyName:proxyUserId?'Proxy':null,
  userName:'Employee',userCode:'200',email:null,state:'TODO',isActive:true,
  assignedAtUtc:'2026-10-29T00:00:00Z',completedAtUtc:null,
});
const main=row(1,null,300),child=row(2,4,null),sibling=row(3,5,400);
const view:CollaborativeView={enabled:true,canManage:false,members:[main,child,sibling],
  notes:[],files:[],modes:[],progress:[]};
describe('collaborative proxy UI scoping',()=>{
  it('opens only the proxied primary assignment as My Work',()=>{
    expect(myCollaborativeAssignment(view.members,300,null)?.id).toBe(1);
    expect(myCollaborativeAssignment(view.members,300,4)).toBeUndefined();
  });
  it('does not expose sibling submissions to a scoped proxy',()=>{
    expect(visibleCollaborativeSubmissions(view,300,false,null).map(m=>m.id)).toEqual([1]);
    expect(visibleCollaborativeSubmissions(view,300,false,5)).toEqual([]);
    expect(visibleCollaborativeSubmissions(view,400,false,5).map(m=>m.id)).toEqual([3]);
  });
  it('loses delegated UI access after removal',()=>{
    expect(myCollaborativeAssignment([{...main,proxyUserId:null}],300,null)).toBeUndefined();
  });
});
