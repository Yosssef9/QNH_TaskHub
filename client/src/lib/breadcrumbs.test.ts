import { describe, expect, it } from 'vitest'

import { buildBreadcrumbs } from './breadcrumbs'

describe('buildBreadcrumbs', () => {
  it('uses TaskHub route labels and readable fallbacks', () => {
    expect(
      buildBreadcrumbs('/tasks/assigned-to-me', {
        '/tasks': 'Tasks',
        '/tasks/assigned-to-me': 'Assigned to me',
      }),
    ).toEqual([
      { label: 'Dashboard', path: '/' },
      { label: 'Tasks', path: '/tasks' },
      { label: 'Assigned to me', path: '/tasks/assigned-to-me' },
    ])

    expect(buildBreadcrumbs('/task-groups')[1]).toEqual({
      label: 'Task Groups',
      path: '/task-groups',
    })
  })
})
