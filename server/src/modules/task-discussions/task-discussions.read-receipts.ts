/** Read information is limited to the conversation's currently authorized recipients.
 * The existing read-state table records a last-read cursor, not an exact
 * per-message seen timestamp. Do not infer a time from its updated_at_utc.
 */
export type DiscussionReadReceipt={userId:number;userName:string;read:boolean}

export function discussionReadReceipts(
  members:readonly {userId:number;userName:string}[],
  readCursorByUser:ReadonlyMap<number,number>,
  messageId:number,
  authorUserId:number,
):DiscussionReadReceipt[]{
  return members
    .filter(member=>member.userId!==authorUserId)
    .map(member=>({
      userId:member.userId,
      userName:member.userName,
      read:(readCursorByUser.get(member.userId)??0)>=messageId,
    }));
}
