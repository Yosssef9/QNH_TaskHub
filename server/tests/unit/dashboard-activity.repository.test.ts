import { describe, expect, it, vi } from 'vitest';

let capturedSql='';
vi.mock('../../src/database/sql.js',()=>({
  sql:{Int:'int'},
  getDatabasePool:vi.fn(async()=>({request:()=>({
    input(){return this;},
    async query(text:string){capturedSql=text;return {recordset:[]};},
  })})),
}));
import { dashboardActivityRepository } from '../../src/modules/dashboard/dashboard-activity.repository.js';

describe('dashboard activity visibility',()=>{
  it('never relies solely on historical actor identity or revoked shares',async()=>{
    expect(await dashboardActivityRepository.recent(7)).toEqual([]);
    expect(capturedSql).toContain('shareRow.revoked_at_utc IS NULL');
    expect(capturedSql).toContain('assignment.is_active=1');
    expect(capturedSql).toContain('meeting.organizer_user_id=@actor');
    expect(capturedSql).not.toContain('WHERE activity.actor_user_id=@actor OR');
    expect(capturedSql).not.toContain('event_data_json');
    expect(capturedSql).not.toContain('changes_json');
  });
});
