import type { Response } from 'express';
import { assertDiscussionAccess, type DiscussionScope } from './task-discussions.policy.js';

/** No external sockets/Redis: an SSE stream is sufficient for single-PM2-instance live UI.
 * All events are hints; clients reload persisted SQL rows rather than trusting event bodies. */
const clients=new Map<number,Set<{userId:number;scope:DiscussionScope;res:Response}>>();

export function subscribeToDiscussion(userId:number,scope:DiscussionScope,res:Response):()=>void {
  const connection={userId,scope,res};
  const current=clients.get(scope.taskId)??new Set();current.add(connection);clients.set(scope.taskId,current);
  const tick=setInterval(()=>{
    void assertDiscussionAccess(userId,scope).then(()=>{
      if(!res.writableEnded) res.write(': keepalive\n\n');
    }).catch(()=>res.end());
  },20_000);
  const cleanup=()=>{
    clearInterval(tick);
    const group=clients.get(scope.taskId);group?.delete(connection);
    if(group?.size===0) clients.delete(scope.taskId);
  };
  res.on('close',cleanup);
  return cleanup;
}

export function publishDiscussionEvent(scope:DiscussionScope,type:string,data:object):void {
  const group=clients.get(scope.taskId);
  if(!group) return;
  for(const client of group){
    if(client.scope.subtaskId!==scope.subtaskId || client.res.writableEnded) continue;
    void assertDiscussionAccess(client.userId,scope).then(()=>{
      if(client.res.writableEnded) return;
      client.res.write(`event: discussion\ndata: ${JSON.stringify({type,...data})}\n\n`);
    }).catch(()=>client.res.end());
  }
}
