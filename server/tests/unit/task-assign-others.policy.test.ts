import { describe, expect, it, vi } from 'vitest';
import { assertMayAssignOthers, taskAssignmentPermissionError } from '../../src/modules/task-assignments/task-assign-others.permission.js';
import type { DatabaseTransaction } from '../../src/database/types.js';

function databaseStub(allowed: number) {
  const query = vi.fn().mockResolvedValue({recordset:[{allowed}]});
  const input = vi.fn();
  const request = {input, query};
  input.mockReturnValue(request);
  const transaction = {request: vi.fn().mockReturnValue(request)} as unknown as DatabaseTransaction;
  return {transaction,query};
}
describe('task assignment authorization', () => {
  it('returns the precise permission error', () => {
    expect(taskAssignmentPermissionError()).toMatchObject({statusCode:403,code:'TASK_ASSIGN_OTHERS_REQUIRED'});
  });
  it('allows creating personal/self-assigned work without a query', async () => {
    const {transaction,query} = databaseStub(0);
    await expect(assertMayAssignOthers(573,[null,573],transaction)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
  it('denies another employee assignment by default', async () => {
    const {transaction,query} = databaseStub(0);
    await expect(assertMayAssignOthers(573,[750],transaction)).rejects.toMatchObject({
      statusCode:403,code:'TASK_ASSIGN_OTHERS_REQUIRED',
    });
    expect(query).toHaveBeenCalledOnce();
  });
  it('allows a live Admin/granted permission', async () => {
    const {transaction} = databaseStub(1);
    await expect(assertMayAssignOthers(573,[750],transaction)).resolves.toBeUndefined();
  });
  it('also checks removals and reassignment of a former employee', async () => {
    const {transaction} = databaseStub(0);
    await expect(assertMayAssignOthers(573,[750,null],transaction)).rejects.toMatchObject({
      code:'TASK_ASSIGN_OTHERS_REQUIRED',
    });
  });
});
