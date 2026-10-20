import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries: Array<{sqlText:string;params:Record<string,unknown>}> = [];
vi.mock('../../src/database/sql.js',()=>({
  sql:{ Int:'int',Date:'date',NVarChar:()=> 'nvarchar',VarChar:()=> 'varchar' },
  getDatabasePool:vi.fn(async()=>({request:()=>{
    const params:Record<string,unknown>={};
    return {
      input(name:string,_type:unknown,value:unknown){params[name]=value;return this;},
      async query(sqlText:string){
        queries.push({sqlText,params});
        if(queries.length%2===1) return {recordset:[{
          assigned:3,shared:2,personal:4,delegated:1,attention:2,dueToday:1,overdue:1,
        }]};
        return {recordset:[{taskId:'100',ownerUserId:21,ownerName:'Owner',listId:'4',listName:'Tasks',meetingId:null,
          title:'Visible task',status:'TODO',priority:'HIGH',dueDate:'2026-10-21',
          createdAtUtc:new Date('2026-10-20T05:00:00Z'),isAssigned:1,isShared:1,isPersonal:0,isDelegated:0,
          totalAssignments:'2',completedAssignments:'1',total:'1'}]};
      },
    };
  }})
}));
vi.mock('../../src/shared/utils/date.utils.js',()=>({getCurrentDateInAppTimeZone:()=> '2026-10-20'}));

import { dashboardWorkRepository } from '../../src/modules/dashboard/dashboard-work.repository.js';

const base={tab:'assigned' as const,page:1,pageSize:10,search:'',status:'ACTIVE' as const,
  priority:'ALL' as const,due:'ALL' as const,sort:'urgency' as const};

describe('work dashboard permissions and query contract',()=>{
  beforeEach(()=>{queries.length=0;});
  it('deduplicates overlapping shared and assigned tasks and returns database counts',async()=>{
    const result=await dashboardWorkRepository.list(100,base);
    expect(result.summary.assigned).toBe(3);
    expect(result.summary.shared).toBe(2);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({taskId:100,isAssigned:true,isShared:true,totalAssignments:2,completedAssignments:1});
    const sqlText=queries[1]?.sqlText??'';
    expect(sqlText).toContain('dbo.TM_task_shares');
    expect(sqlText).toContain('dbo.TM_collaboration_assignments');
    expect(sqlText).toContain('dbo.TM_meeting_action_items');
    expect(sqlText).toContain('sh.revoked_at_utc IS NULL');
    expect(sqlText).toContain('ca.is_active=1');
    expect(sqlText).toContain('t.deleted_at_utc IS NULL');
    expect(queries[1]?.params.actor).toBe(100);
  });
  it('parameterizes searches rather than putting user text into SQL',async()=>{
    await dashboardWorkRepository.list(100,{...base,search:"abc%' OR 1=1 --",sort:'created'});
    expect(queries[1]?.sqlText).not.toContain("abc%' OR 1=1 --");
    expect(queries[1]?.params.pattern).toContain('[%]');
    expect(queries[1]?.sqlText).toContain('createdAtUtc DESC');
  });
});
