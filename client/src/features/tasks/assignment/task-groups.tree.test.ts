import { describe, expect, it } from 'vitest'
import { buildGroupTree } from './task-groups.tree'
import type { TaskGroup } from './task-groups.api'

function group(id:number,parentGroupId:number|null,name:string,displayOrder=1):TaskGroup{
  return {id,parentGroupId,name,displayOrder,listId:5,directTaskCount:0,totalTaskCount:0,directDoneCount:0,totalDoneCount:0}
}
describe('Task Group hierarchy',()=>{
  it('orders roots and subgroups and builds full paths',()=>{
    const rows=buildGroupTree([group(3,2,'Orientation'),group(4,null,'IT',2),group(2,1,'Training'),group(1,null,'Nursing')])
    expect(rows.map(x=>x.id)).toEqual([1,2,3,4])
    expect(rows[2]?.path).toEqual('Nursing / Training / Orientation')
    expect(rows[2]?.ancestorIds).toEqual([1,2])
  })
  it('supports deep nested groups without recursive stack usage',()=>{
    const rows=buildGroupTree(Array.from({length:700},(_,n)=>group(n+1,n===0?null:n,`G${n+1}`)))
    expect(rows).toHaveLength(700)
    expect(rows[699]?.depth).toEqual(699)
  })
});
