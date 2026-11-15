// @vitest-environment jsdom
import '@/test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { TaskAssigneePicker } from './TaskAssigneePicker'

const permission = vi.hoisted(() => ({canAssignOthers: false}))
vi.mock('./use-task-assignment-permission', () => ({
  useTaskAssignmentPermission: () => ({currentUserId: 573,canAssignOthers: permission.canAssignOthers}),
}))
vi.mock('./use-general-assignment', () => ({
  useInfiniteEligibleTaskUsers: () => ({data:{pages:[{items:[
    {userId:573,userName:'Self',userCode:'573',email:null},
    {userId:750,userName:'Other Employee',userCode:'750',email:null},
  ]}]},isPending:false,isError:false,hasNextPage:false,isFetching:false,isFetchingNextPage:false}),
  useEligibleTaskUser: () => ({data:null}),
}))
vi.mock('@/features/meetings/action-items/use-meeting-action-items', () => ({
  useMeetingActionItemAssignees: () => ({data:[],isLoading:false,isError:false}),
}))

describe('assignment selector authorization UX', () => {
  beforeEach(async () => {permission.canAssignOthers=false;await i18n.changeLanguage('en')})
  it('warns rather than silently assigning another employee', async () => {
    const onChange = vi.fn();const u=userEvent.setup();
    render(<TaskAssigneePicker value={null} onChange={onChange}/>);
    await u.click(screen.getByRole('button',{name:'Assign to'}));
    expect(screen.getByText(/You do not have permission/)).toBeVisible();
    await u.click(screen.getByRole('option',{name:/Other Employee/}));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('still allows self-assignment', async () => {
    const onChange = vi.fn();const u=userEvent.setup();
    render(<TaskAssigneePicker value={null} onChange={onChange}/>);
    await u.click(screen.getByRole('button',{name:'Assign to'}));
    await u.click(screen.getByRole('option',{name:/Self/}));
    expect(onChange).toHaveBeenCalledWith(573);
  });
});
