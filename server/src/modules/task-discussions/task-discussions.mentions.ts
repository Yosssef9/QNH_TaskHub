/** Accept only explicit @employee-code tokens. This is a parser, not an access check. */
export function mentionedMemberIds(body:string,members:readonly {userId:number;userCode:string}[]):number[]{
  const found=new Set<number>();
  for(const match of body.matchAll(/(^|[^A-Za-z0-9_])@([A-Za-z0-9]{1,30})(?![A-Za-z0-9_])/g)){
    const code=match[2].toLowerCase();
    const member=members.find(person=>person.userCode.toLowerCase()===code);
    if(member)found.add(member.userId);
  }
  return [...found];
}
