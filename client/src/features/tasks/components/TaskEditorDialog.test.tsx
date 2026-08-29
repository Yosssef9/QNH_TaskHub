import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MuiDateProvider } from '@/app/providers/MuiDateProvider'
import { ThemeProvider } from '@/app/providers/ThemeProvider'
import type { KpiInstance, WorkCycle } from '@/features/work-cycles/types/work-cycle.types'

import { TaskEditorDialog } from './TaskEditorDialog'

const mutations = vi.hoisted(() => ({
  create: vi.fn(),
  createKpi: vi.fn(),
  createGlobalKpi: vi.fn(),
  update: vi.fn(),
}))

const deadlineQuery = vi.hoisted(() => ({
  data: undefined as { dueDate: string } | undefined,
  isError: false,
}))

vi.mock('@/features/kpis/hooks/use-kpis', () => ({
  useKpiTaskDeadline: () => deadlineQuery,
}))

vi.mock('../hooks/use-tasks', () => ({
  useCreateTask: () => ({ isPending: false, mutate: mutations.create }),
  useCreateKpiTask: () => ({ isPending: false, mutate: mutations.createKpi }),
  useCreateGlobalKpiTask: () => ({ isPending: false, mutate: mutations.createGlobalKpi }),
  useUpdateTask: () => ({ isPending: false, mutate: mutations.update }),
}))

const lists = [
  {
    id: 1,
    name: 'My Tasks',
    iconKey: 'list-todo' as const,
    color: '#2563EB' as const,
    isDefault: true,
    displayOrder: 0,
  },
]

const completionInstance: KpiInstance = {
  id: 101,
  templateId: 10,
  cycleId: 50,
  cycleTitle: 'Board cycle',
  cycleClosedAtUtc: null,
  name: 'Completion',
  description: null,
  iconKey: 'gauge',
  color: '#0F766E',
  calculationMethod: 'TASK_COMPLETION_RATE',
  periodType: 'MONTHLY',
  measurementUnit: 'PERCENT',
  targetValue: 90,
  targetDirection: 'HIGHER_IS_BETTER',
  deadlineSource: null,
  businessDayOffset: null,
  deadlineDirection: null,
  referenceDateLabel: null,
  numeratorLabel: null,
  denominatorLabel: null,
  valueLabel: null,
  displayOrder: 1,
  isActive: true,
  taskCount: 0,
  taskPolicy: {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: 'OPTIONAL',
    requiresReferenceDate: false,
    subtaskDueDateMode: 'OPTIONAL',
  },
}

const onTimeInstance: KpiInstance = {
  ...completionInstance,
  id: 102,
  templateId: 11,
  name: 'On time',
  calculationMethod: 'ON_TIME_RATE',
  deadlineSource: 'REFERENCE_DATE',
  businessDayOffset: 5,
  deadlineDirection: 'BEFORE',
  referenceDateLabel: 'Meeting date',
  taskPolicy: {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: 'AUTO',
    requiresReferenceDate: true,
    subtaskDueDateMode: 'OPTIONAL',
  },
}

const cycle: WorkCycle = {
  id: 50,
  title: 'Board cycle',
  description: null,
  iconKey: 'calendar',
  color: '#2563EB',
  startDate: null,
  endDate: null,
  displayOrder: 1,
  closedAtUtc: null,
  archivedAtUtc: null,
  isCurrent: false,
  taskCount: 0,
  completedTaskCount: 0,
  overdueTaskCount: 0,
  instances: [completionInstance, onTimeInstance],
}

function renderDialog(props: ComponentProps<typeof TaskEditorDialog>) {
  return render(
    <ThemeProvider>
      <MuiDateProvider>
        <TaskEditorDialog {...props} />
      </MuiDateProvider>
    </ThemeProvider>,
  )
}

describe('TaskEditorDialog', () => {
  beforeEach(() => {
    Object.values(mutations).forEach((mock) => mock.mockReset())
    deadlineQuery.data = undefined
    deadlineQuery.isError = false
  })

  it('creates a normal private-list task', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: vi.fn(), listId: 1, lists, task: null })

    await user.type(screen.getByLabelText('عنوان المهمة'), 'إعداد التقرير')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(mutations.create).toHaveBeenCalledWith(
      {
        listId: 1,
        values: {
          title: 'إعداد التقرير',
          description: '',
          priority: 'MEDIUM',
          startDate: null,
          dueDate: null,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })


  it('prefills a Calendar-selected date as the due date for a normal task', async () => {
    const user = userEvent.setup()
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      listId: 1,
      lists,
      task: null,
      initialCalendarDate: '2026-08-29',
    })

    await user.type(screen.getByLabelText('عنوان المهمة'), 'مهمة من التقويم')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(mutations.create).toHaveBeenCalledWith(
      {
        listId: 1,
        values: {
          title: 'مهمة من التقويم',
          description: '',
          priority: 'MEDIUM',
          startDate: null,
          dueDate: '2026-08-29',
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('uses the Calendar-selected date as a start date when the KPI forbids due dates', async () => {
    const user = userEvent.setup()
    const noDueDateInstance: KpiInstance = {
      ...completionInstance,
      id: 103,
      name: 'Supporting tasks',
      taskPolicy: {
        ...completionInstance.taskPolicy,
        dueDateMode: 'NONE',
      },
    }

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      instance: noDueDateInstance,
      task: null,
      initialCalendarDate: '2026-08-29',
    })

    await user.type(screen.getByLabelText('عنوان المهمة'), 'مهمة مساندة')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(mutations.createKpi).toHaveBeenCalledWith(
      {
        kpiInstanceId: noDueDateInstance.id,
        values: {
          title: 'مهمة مساندة',
          description: '',
          priority: 'MEDIUM',
          startDate: '2026-08-29',
          dueDate: null,
          referenceDate: null,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('creates directly under a fixed KPI instance', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: vi.fn(), instance: completionInstance, task: null })

    await user.type(screen.getByLabelText('عنوان المهمة'), 'تنفيذ قرار')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(mutations.createKpi).toHaveBeenCalledWith(
      {
        kpiInstanceId: completionInstance.id,
        values: {
          title: 'تنفيذ قرار',
          description: '',
          priority: 'MEDIUM',
          startDate: null,
          dueDate: null,
          referenceDate: null,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('requires a Work Cycle before a KPI instance in the global workspace', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: vi.fn(), cycles: [cycle], task: null })

    await user.type(screen.getByLabelText('عنوان المهمة'), 'مهمة مؤشر جديدة')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(await screen.findByText('اختر دورة العمل التي تنتمي إليها هذه المهمة.')).toBeVisible()
    expect(mutations.createGlobalKpi).not.toHaveBeenCalled()
  })

  it('creates a global KPI task after selecting Cycle then instance', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: vi.fn(), cycles: [cycle], task: null })

    await user.click(screen.getByRole('combobox', { name: 'دورة العمل' }))
    await user.click(screen.getByRole('option', { name: 'Board cycle' }))
    await user.click(screen.getByRole('combobox', { name: 'مؤشر الأداء' }))
    await user.click(screen.getByRole('option', { name: /Completion/ }))
    await user.type(screen.getByLabelText('عنوان المهمة'), 'تنفيذ الطلب')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(mutations.createGlobalKpi).toHaveBeenCalledWith(
      {
        cycleId: cycle.id,
        kpiInstanceId: completionInstance.id,
        values: {
          title: 'تنفيذ الطلب',
          description: '',
          priority: 'MEDIUM',
          startDate: null,
          dueDate: null,
          referenceDate: null,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('uses the instance snapshot deadline policy for automatic due dates', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: vi.fn(), instance: onTimeInstance, task: null })

    expect(screen.getByText('يُحتسب تلقائياً من التاريخ المرجعي وقاعدة أيام العمل للمؤشر.')).toBeVisible()
    await user.type(screen.getByLabelText('عنوان المهمة'), 'إرسال جدول الأعمال')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(await screen.findByText('أدخل التاريخ المرجعي المستخدم في هذا المؤشر.')).toBeVisible()
    expect(mutations.createKpi).not.toHaveBeenCalled()
  })
})
