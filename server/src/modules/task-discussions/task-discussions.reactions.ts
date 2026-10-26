/** Supported discussion reactions. Keep API validation and persistence in sync. */
export const DISCUSSION_REACTIONS = ['👍','❤️','😂','🎉','👏','😮','🙏','✅'] as const;

export function isDiscussionReaction(value:string):value is (typeof DISCUSSION_REACTIONS)[number] {
  return DISCUSSION_REACTIONS.some(emoji=>emoji===value);
}

/** Literal substring for SQL Server LIKE ... ESCAPE '~'. */
export function discussionLikePattern(value:string):string {
  return '%'+value.replace(/[~%_\[]/g,char=>'~'+char)+'%';
}
