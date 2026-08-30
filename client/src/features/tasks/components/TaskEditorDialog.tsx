import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, Save } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useKpiTaskDeadline } from '@/features/kpis/hooks/use-kpis'
import { KpiSelectIndicator } from '@/features/kpis/components/KpiSelectIndicator'
import { ListSelectIndicator } from '@/features/lists/components/ListSelectIndicator'
import type { PersonalList } from '@/features/lists/types/list.types'
import type { KpiInstance, WorkCycle } from '@/features/work-cycles/types/work-cycle.types'

import {
  useCreateGlobalKpiTask,
  useCreateKpiTask,
  useCreateTask,
  useUpdateTask,
} from '../hooks/use-tasks'
import { TASK_PRIORITIES } from '../types/task.types'
import type { PersonalTask, SaveTaskInput } from '../types/task.types'
import { TaskPriorityIndicator } from './TaskSelectIndicators'

const schema = z
  .object({
    title: z.string().trim().min(1).max(1000),
    description: z.string().trim().max(4000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    listId: z.number().int().positive().nullable().optional(),
    referenceDate: z.string().nullable().optional(),
    cycleId: z.number().int().positive().nullable().optional(),
    kpiInstanceId: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => !value.startDate || !value.dueDate || value.startDate <= value.dueDate, {
    path: ['dueDate'],
    message: 'DATE_RANGE',
  })

type TaskFormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: PersonalTask | null
  initialListId?: number | null
  initialCycleId?: number | null
  initialKpiInstanceId?: number | null
  initialCalendarDate?: string | null
  allowListSelectionOnCreate?: boolean
  onSaved?: () => void
} & (
  | { listId?: number; lists: PersonalList[]; instance?: never; cycle?: never; cycles?: never }
  | { instance: KpiInstance; listId?: never; lists?: never; cycle?: never; cycles?: never }
  | { cycle: WorkCycle; listId?: never; lists?: never; instance?: never; cycles?: never }
  | { cycles: WorkCycle[]; listId?: never; lists?: never; instance?: never; cycle?: never }
)

export function TaskEditorDialog({
  open,
  onOpenChange,
  listId,
  lists,
  instance: fixedInstance,
  cycle: fixedCycle,
  cycles,
  task,
  initialListId,
  initialCycleId,
  initialKpiInstanceId,
  initialCalendarDate,
  allowListSelectionOnCreate = false,
  onSaved,
}: Props) {
  const { t } = useTranslation()
  const createMutation = useCreateTask()
  const createKpiMutation = useCreateKpiTask()
  const createGlobalKpiMutation = useCreateGlobalKpiTask()
  const updateMutation = useUpdateTask()
  const pending =
    createMutation.isPending ||
    createKpiMutation.isPending ||
    createGlobalKpiMutation.isPending ||
    updateMutation.isPending
  const selectableCycles = (cycles ?? (fixedCycle ? [fixedCycle] : [])).filter(
    (item) => !item.closedAtUtc,
  )
  const initialCycle =
    fixedCycle ?? selectableCycles.find((item) => item.id === initialCycleId) ?? null
  const initialSelectableInstances =
    initialCycle?.instances.filter((item) => item.isActive && item.taskPolicy.allowsTasks) ?? []
  const autoInitialInstanceId =
    initialSelectableInstances.length === 1 ? (initialSelectableInstances[0]?.id ?? null) : null
  const requestedInitialInstanceId =
    fixedInstance?.id ?? task?.kpiInstanceId ?? initialKpiInstanceId ?? autoInitialInstanceId
  const initialInstance =
    fixedInstance ??
    initialSelectableInstances.find((item) => item.id === requestedInitialInstanceId) ??
    null

  function calendarDateDefaults(instance: KpiInstance | null) {
    if (!initialCalendarDate || task) return { startDate: null, dueDate: null }
    if (!instance) return { startDate: null, dueDate: initialCalendarDate }

    if (instance.taskPolicy.dueDateMode === 'NONE') {
      return { startDate: initialCalendarDate, dueDate: null }
    }
    if (
      instance.taskPolicy.dueDateMode === 'OPTIONAL' ||
      instance.taskPolicy.dueDateMode === 'REQUIRED'
    ) {
      return { startDate: null, dueDate: initialCalendarDate }
    }
    return { startDate: null, dueDate: null }
  }

  const initialDateDefaults = calendarDateDefaults(initialInstance)

  const {
    control,
    formState: { errors },
    handleSubmit,
    clearErrors,
    register,
    setError,
    setValue,
  } = useForm<TaskFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      priority: task?.priority ?? 'MEDIUM',
      startDate: task?.startDate ?? initialDateDefaults.startDate,
      dueDate:
        fixedInstance?.taskPolicy.dueDateMode === 'AUTO'
          ? null
          : (task?.dueDate ?? initialDateDefaults.dueDate),
      listId: task?.listId ?? listId ?? initialListId ?? null,
      referenceDate: task?.referenceDate ?? null,
      cycleId: fixedInstance?.cycleId ?? fixedCycle?.id ?? task?.cycleId ?? initialCycleId ?? null,
      kpiInstanceId: fixedInstance?.id ?? task?.kpiInstanceId ?? requestedInitialInstanceId,
    },
  })

  const selectedCycleId = useWatch({ control, name: 'cycleId' })
  const selectedInstanceId = useWatch({ control, name: 'kpiInstanceId' })
  const selectedCycle = fixedCycle ?? selectableCycles.find((item) => item.id === selectedCycleId)
  const selectableInstances = selectedCycle?.instances.filter(
    (item) => item.isActive && item.taskPolicy.allowsTasks,
  )
  const kpi = fixedInstance ?? selectableInstances?.find((item) => item.id === selectedInstanceId)
  const referenceDate = useWatch({ control, name: 'referenceDate' })
  const startDate = useWatch({ control, name: 'startDate' })
  const autoDueDateMode = kpi?.taskPolicy.dueDateMode === 'AUTO'
  const requiredDueDateMode = kpi?.taskPolicy.dueDateMode === 'REQUIRED'
  const isKpiTask = Boolean(fixedInstance || fixedCycle || cycles)
  const showDateFields = !isKpiTask || Boolean(kpi)
  const dueDateErrorMessage =
    errors.dueDate?.message === 'DATE_RANGE' ? t('tasks.errors.dateRange') : errors.dueDate?.message
  const useStoredDeadline =
    Boolean(autoDueDateMode && task) && referenceDate === (task?.referenceDate ?? null)

  const deadlineQuery = useKpiTaskDeadline(
    autoDueDateMode && !useStoredDeadline ? kpi?.id : undefined,
    autoDueDateMode && !useStoredDeadline ? referenceDate : null,
  )

  const automaticDueDate = autoDueDateMode
    ? useStoredDeadline
      ? (task?.dueDate ?? null)
      : referenceDate
        ? (deadlineQuery.data?.dueDate ?? null)
        : null
    : null

  const submit = handleSubmit((values) => {
    if (!isKpiTask && !task && allowListSelectionOnCreate && !values.listId) {
      setError('listId', { message: t('tasks.errors.listRequired') })
      return
    }
    if ((cycles || fixedCycle) && !selectedCycle) {
      setError('cycleId', { message: t('tasks.errors.cycleRequired') })
      return
    }
    if (isKpiTask && !kpi) {
      setError('kpiInstanceId', { message: t('tasks.errors.kpiRequired') })
      return
    }
    if (kpi?.taskPolicy.requiresReferenceDate && !values.referenceDate) {
      setError('referenceDate', { message: t('tasks.errors.referenceDateRequired') })
      return
    }

    if (requiredDueDateMode && !values.dueDate) {
      setError('dueDate', { message: t('tasks.errors.dueDateRequired') })
      return
    }

    if (
      autoDueDateMode &&
      automaticDueDate &&
      values.startDate &&
      values.startDate > automaticDueDate
    ) {
      setError('dueDate', { message: t('tasks.errors.dateRange') })
      return
    }

    const baseValues = {
      title: values.title,
      description: values.description ?? null,
      priority: values.priority,
      startDate: values.startDate ?? null,
    }

    let taskValues: SaveTaskInput

    if (kpi) {
      taskValues =
        kpi.taskPolicy.dueDateMode === 'AUTO'
          ? {
              ...baseValues,
              referenceDate: values.referenceDate ?? null,
            }
          : {
              ...baseValues,
              dueDate: values.dueDate ?? null,
              referenceDate: null,
            }
    } else {
      taskValues = {
        ...baseValues,
        dueDate: values.dueDate ?? null,
        ...(task && values.listId ? { listId: values.listId } : {}),
      }
    }

    const options = {
      onSuccess: () => {
        toast.success(t(task ? 'tasks.updated' : 'tasks.created'))
        onSaved?.()
        onOpenChange(false)
      },
      onError: () => toast.error(t('tasks.errors.save')),
    }

    if (task) updateMutation.mutate({ taskId: task.id, values: taskValues }, options)
    else if (fixedInstance) {
      createKpiMutation.mutate({ kpiInstanceId: fixedInstance.id, values: taskValues }, options)
    } else if (kpi) {
      createGlobalKpiMutation.mutate(
        { cycleId: kpi.cycleId, kpiInstanceId: kpi.id, values: taskValues },
        options,
      )
    } else {
      const targetListId = values.listId ?? listId
      if (!targetListId) {
        setError('listId', { message: t('tasks.errors.listRequired') })
        return
      }
      createMutation.mutate({ listId: targetListId, values: taskValues }, options)
    }
  })

  const showEditableDueDate =
    !kpi || kpi.taskPolicy.dueDateMode === 'OPTIONAL' || kpi.taskPolicy.dueDateMode === 'REQUIRED'

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
            {task ? <Save className="size-5" /> : <Plus className="size-5" />}
          </div>
          <div>
            <DialogTitle>{t(task ? 'tasks.editTitle' : 'tasks.createTitle')}</DialogTitle>
            <DialogDescription className="mt-1">{t('tasks.formDescription')}</DialogDescription>
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <label htmlFor="task-title" className="text-sm font-medium">
              {t('tasks.title')}
            </label>
            <Input
              id="task-title"
              autoFocus
              maxLength={1000}
              aria-invalid={Boolean(errors.title)}
              {...register('title')}
            />
            {errors.title ? (
              <p className="text-destructive text-xs">{t('tasks.errors.titleRequired')}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="task-description" className="text-sm font-medium">
              {t('tasks.description')}
            </label>
            <Textarea
              id="task-description"
              rows={3}
              maxLength={4000}
              {...register('description')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {cycles && !task ? (
              <Controller
                name="cycleId"
                control={control}
                render={({ field }) => (
                  <div className="space-y-1.5">
                    <label htmlFor="task-cycle" className="text-sm font-medium">
                      {t('workCycles.singular')}
                    </label>
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(value) => {
                        const nextCycleId = Number(value)
                        const nextCycle = selectableCycles.find((item) => item.id === nextCycleId)
                        const nextInstances =
                          nextCycle?.instances.filter(
                            (item) => item.isActive && item.taskPolicy.allowsTasks,
                          ) ?? []

                        const nextInstance =
                          nextInstances.length === 1 ? (nextInstances[0] ?? null) : null
                        const defaults = nextInstance
                          ? calendarDateDefaults(nextInstance)
                          : { startDate: null, dueDate: null }

                        field.onChange(nextCycleId)
                        setValue('kpiInstanceId', nextInstance?.id ?? null)
                        setValue('startDate', defaults.startDate)
                        setValue('dueDate', defaults.dueDate)
                        setValue('referenceDate', null)
                        clearErrors(['cycleId', 'kpiInstanceId', 'dueDate', 'referenceDate'])
                      }}
                    >
                      <SelectTrigger id="task-cycle" aria-invalid={Boolean(errors.cycleId)}>
                        <SelectValue placeholder={t('workCycles.selectCycle')}>
                          {selectedCycle?.title}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {selectableCycles.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.cycleId ? (
                      <p className="text-destructive text-xs">{errors.cycleId.message}</p>
                    ) : null}
                  </div>
                )}
              />
            ) : null}
            {(cycles || fixedCycle) && !task ? (
              <Controller
                name="kpiInstanceId"
                control={control}
                render={({ field }) => (
                  <div className="space-y-1.5">
                    <label htmlFor="task-kpi" className="text-sm font-medium">
                      {t('tasks.kpi')}
                    </label>
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(value) => {
                        const nextInstanceId = Number(value)
                        const nextInstance =
                          selectableInstances?.find((item) => item.id === nextInstanceId) ?? null
                        const defaults = calendarDateDefaults(nextInstance)

                        field.onChange(nextInstanceId)
                        setValue('startDate', defaults.startDate)
                        setValue('dueDate', defaults.dueDate)
                        setValue('referenceDate', null)
                        clearErrors(['kpiInstanceId', 'dueDate', 'referenceDate'])
                      }}
                    >
                      <SelectTrigger id="task-kpi" aria-invalid={Boolean(errors.kpiInstanceId)}>
                        <SelectValue placeholder={t('tasks.selectKpi')}>
                          {kpi ? <KpiSelectIndicator kpi={kpi} /> : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(selectableInstances ?? []).map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            <KpiSelectIndicator kpi={item} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.kpiInstanceId ? (
                      <p className="text-destructive text-xs">{errors.kpiInstanceId.message}</p>
                    ) : null}
                  </div>
                )}
              />
            ) : null}
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t('tasks.priority')}</label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue>
                        <TaskPriorityIndicator priority={field.value} pill />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          <TaskPriorityIndicator priority={value} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            {(task || allowListSelectionOnCreate) && !isKpiTask ? (
              <Controller
                name="listId"
                control={control}
                render={({ field }) => {
                  const selectedList = lists!.find((item) => item.id === field.value)

                  return (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t('tasks.list')}</label>
                      <Select
                        value={field.value ? String(field.value) : ''}
                        onValueChange={(value) => {
                          field.onChange(Number(value))
                          clearErrors('listId')
                        }}
                      >
                        <SelectTrigger aria-invalid={Boolean(errors.listId)}>
                          <SelectValue placeholder={t('tasks.selectList')}>
                            {selectedList ? <ListSelectIndicator list={selectedList} /> : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {lists!.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              <ListSelectIndicator list={item} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.listId ? (
                        <p className="text-destructive text-xs">{errors.listId.message}</p>
                      ) : null}
                    </div>
                  )
                }}
              />
            ) : null}
          </div>

          {kpi && !kpi.taskPolicy.usesTasks ? (
            <p className="bg-info/10 text-info-foreground border-info/20 rounded-lg border px-3 py-2 text-sm">
              {t('tasks.manualKpiTaskNotice')}
            </p>
          ) : null}

          {showDateFields ? (
            autoDueDateMode ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Controller
                    name="startDate"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        label={t('tasks.startDate')}
                        value={field.value ?? null}
                        maxDate={automaticDueDate ?? undefined}
                        onChange={(value) => field.onChange(value || null)}
                      />
                    )}
                  />

                  <Controller
                    name="referenceDate"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        required
                        label={kpi.referenceDateLabel ?? t('kpis.referenceLabel')}
                        value={field.value ?? null}
                        error={errors.referenceDate?.message}
                        onChange={(value) => field.onChange(value || null)}
                      />
                    )}
                  />
                </div>

                <DatePicker
                  label={t('tasks.dueDate')}
                  value={automaticDueDate}
                  disabled
                  error={dueDateErrorMessage}
                  description={
                    deadlineQuery.isError
                      ? t('tasks.automaticDueDateError')
                      : t('tasks.automaticDueDateDescription')
                  }
                  onChange={() => undefined}
                />
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  name="startDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      label={t('tasks.startDate')}
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value || null)}
                    />
                  )}
                />

                {showEditableDueDate ? (
                  <Controller
                    name="dueDate"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        required={requiredDueDateMode}
                        label={t('tasks.dueDate')}
                        value={field.value ?? null}
                        minDate={startDate ?? undefined}
                        error={dueDateErrorMessage}
                        onChange={(value) => field.onChange(value || null)}
                      />
                    )}
                  />
                ) : null}
              </div>
            )
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
