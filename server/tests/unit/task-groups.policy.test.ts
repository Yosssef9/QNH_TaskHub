import { describe, expect, it } from 'vitest';
import { assertCompleteSiblingReorder, assertNoGroupCycle } from '../../src/modules/task-groups/task-groups.policy.js';

const hierarchy = [
  {id:1,parentGroupId:null},
  {id:2,parentGroupId:1},
  {id:3,parentGroupId:2},
  {id:4,parentGroupId:null},
];

describe('nested Task Group cycle protections',()=>{
  it('permits unlimited-depth structures without a hard depth limit',()=>{
    const rows=Array.from({length:800},(_,n)=>({id:n+1,parentGroupId:n===0?null:n}));
    expect(()=>assertNoGroupCycle(rows,800,null)).not.toThrow();
  });
  it('accepts SQL BIGINT identifiers returned as numeric strings',()=>{
    const rows = [
      { id: '1', parentGroupId: null },
      { id: '2', parentGroupId: '1' },
      { id: '3', parentGroupId: '2' },
    ];
    expect(()=>assertNoGroupCycle(rows,3,null)).not.toThrow();
    expect(()=>assertNoGroupCycle(rows,1,3)).toThrow();
  });
  it('rejects reparenting a group to itself',()=>{
    expect(()=>assertNoGroupCycle(hierarchy,2,2)).toThrow();
  });
  it('rejects moving a group into one of its descendants',()=>{
    expect(()=>assertNoGroupCycle(hierarchy,1,3)).toThrow();
  });
  it('permits valid moves to siblings or the List root',()=>{
    expect(()=>assertNoGroupCycle(hierarchy,3,4)).not.toThrow();
    expect(()=>assertNoGroupCycle(hierarchy,3,null)).not.toThrow();
  });
  it('rejects parent groups from another list or missing parents',()=>{
    expect(()=>assertNoGroupCycle(hierarchy,3,99)).toThrow();
  });
});


describe('nested Task Group reorder validation',()=>{
  // mssql/tedious can expose BIGINT values as strings on some installations.
  const databaseRows=[
    {id:'1',parentGroupId:null},
    {id:'2',parentGroupId:'1'},
    {id:'3',parentGroupId:'1'},
    {id:'4',parentGroupId:null},
  ];
  it('accepts the full reorder payload even if SQL BIGINT parent IDs are strings',()=>{
    expect(()=>assertCompleteSiblingReorder(databaseRows,1,[3,2])).not.toThrow();
  });
  it('accepts a reordered root sibling set when the parent is null',()=>{
    expect(()=>assertCompleteSiblingReorder(databaseRows,null,[4,1])).not.toThrow();
  });
  it('rejects incomplete and duplicate sibling sets',()=>{
    expect(()=>assertCompleteSiblingReorder(databaseRows,1,[2])).toThrow();
    expect(()=>assertCompleteSiblingReorder(databaseRows,1,[2,2])).toThrow();
  });
  it('rejects a group belonging to a different parent',()=>{
    expect(()=>assertCompleteSiblingReorder(databaseRows,1,[2,4])).toThrow();
  });
});
