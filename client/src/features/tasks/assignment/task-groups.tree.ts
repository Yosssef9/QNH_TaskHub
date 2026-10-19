import type { TaskGroup } from './task-groups.api'

export type GroupTreeRow = TaskGroup & { depth: number; path: string; ancestorIds:number[] }

/** Flat, parent-before-child traversal. No recursive calls or artificial depth cap. */
export function buildGroupTree(groups:TaskGroup[]):GroupTreeRow[]{
  const children=new Map<number|null,TaskGroup[]>()
  for(const g of groups){const list=children.get(g.parentGroupId)??[];list.push(g);children.set(g.parentGroupId,list)}
  for(const list of children.values())list.sort((a,b)=>a.displayOrder-b.displayOrder||a.id-b.id)
  const result:GroupTreeRow[]=[]
  const stack=(children.get(null)??[]).slice().reverse().map(g=>({g,depth:0,path:g.name,ancestors:[] as number[]}))
  const seen=new Set<number>()
  while(stack.length){
    const entry=stack.pop()!
    if(seen.has(entry.g.id))continue
    seen.add(entry.g.id)
    result.push({...entry.g,depth:entry.depth,path:entry.path,ancestorIds:entry.ancestors})
    for(const child of (children.get(entry.g.id)??[]).slice().reverse()){
      stack.push({g:child,depth:entry.depth+1,path:`${entry.path} / ${child.name}`,ancestors:[...entry.ancestors,entry.g.id]})
    }
  }
  return result
}
