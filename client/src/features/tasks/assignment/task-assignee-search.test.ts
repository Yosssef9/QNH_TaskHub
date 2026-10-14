import { describe, expect, it } from 'vitest'

import { matchesTaskAssigneeSearch } from './task-assignee-search'

const user = {
  userName: 'Yasser Hamza ياسر حمزة',
  userCode: '2101',
  email: 'yasser.hamza@qnhospital.com.sa',
}

describe('task assignee search', () => {
  it('matches either language of the name', () => {
    expect(matchesTaskAssigneeSearch(user, 'YASSER')).toBe(true)
    expect(matchesTaskAssigneeSearch(user, 'ياسر')).toBe(true)
  })
  it('preserves matching by employee code', () => {
    expect(matchesTaskAssigneeSearch(user, '2101')).toBe(true)
  })
  it('matches email username, address and domain with mixed case', () => {
    expect(matchesTaskAssigneeSearch(user, 'HAMZA@QNHOSPITAL')).toBe(true)
    expect(matchesTaskAssigneeSearch(user, '@qnhospital.com.sa')).toBe(true)
  })
  it('trims search and safely handles null email', () => {
    expect(matchesTaskAssigneeSearch(user, '  2101  ')).toBe(true)
    expect(matchesTaskAssigneeSearch({ ...user, email: null }, '@qnhospital')).toBe(false)
    expect(matchesTaskAssigneeSearch({ ...user, email: null }, 'yasser')).toBe(true)
  })
  it('rejects unrelated input and accepts an empty query', () => {
    expect(matchesTaskAssigneeSearch(user, '9999')).toBe(false)
    expect(matchesTaskAssigneeSearch(user, '   ')).toBe(true)
  })
})
