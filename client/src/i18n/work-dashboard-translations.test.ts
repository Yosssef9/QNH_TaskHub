import { describe, expect, it } from 'vitest'

import { arTranslation } from './locales/ar/translation'
import { enTranslation } from './locales/en/translation'

const dashboardKeys = [
  'eyebrow', 'title', 'welcomeSubtitle', 'newTask', 'assigned', 'shared',
  'dueToday', 'overdue', 'myLists', 'manageLists', 'inbox', 'activity',
  'taskActivity', 'meetingActivity', 'openFullPage', 'search',
  'inboxPreviewDescription', 'viewRemaining', 'meetingQueue',
] as const

const dashboardTabKeys = ['attention', 'assigned', 'shared', 'personal', 'delegated'] as const
const activityFieldKeys = ['title', 'description', 'priority', 'startDate', 'dueDate'] as const

describe('dashboard translations survive unrelated feature patches', () => {
  for (const [language, resource] of [
    ['ar', arTranslation],
    ['en', enTranslation],
  ] as const) {
    it(`${language} has every required dashboard key`, () => {
      for (const key of dashboardKeys) {
        expect(resource.workDashboard[key], `workDashboard.${key}`).toBeTruthy()
      }
      for (const key of dashboardTabKeys) {
        expect(resource.workDashboard.tabs[key], `workDashboard.tabs.${key}`).toBeTruthy()
      }
    })

    it(`${language} preserves Meeting Task audit field labels`, () => {
      for (const key of activityFieldKeys) {
        expect(resource.tasks.details.activityFields[key], `tasks.details.activityFields.${key}`).toBeTruthy()
      }
    })
  }
})
