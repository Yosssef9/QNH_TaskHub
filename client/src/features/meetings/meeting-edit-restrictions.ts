import type { TFunction } from 'i18next'
import { toApiClientError } from '@/lib/api-error'

/** Backend reason codes remain the source of truth. Never guess dependencies on the client. */
export interface ProtectedAgendaReference {
  id: number
  taskCount: number
  decisionCount: number
}

export function describeProtectedParticipant(t: TFunction, reasons: readonly string[], name?: string) {
  const labels = [...new Set(reasons)].map((reason) =>
    t(`meetings.historicalEdit.dependencyReasons.${reason}`, {
      defaultValue: t('meetings.historicalEdit.dependencyReasons.other'),
    }),
  )
  return t('meetings.historicalEdit.cannotRemoveParticipant', {
    name: name || t('meetings.historicalEdit.thisParticipant'),
    reasons: labels.join(t('meetings.historicalEdit.reasonSeparator')) || t('meetings.historicalEdit.dependencyReasons.other'),
  })
}

export function describeProtectedAgenda(t: TFunction, reference?: ProtectedAgendaReference | null) {
  if (!reference) return t('meetings.historicalEdit.protectedAgenda')
  const reasons = [
    reference.taskCount > 0 ? t('meetings.historicalEdit.linkedTasks', { count: reference.taskCount }) : null,
    reference.decisionCount > 0 ? t('meetings.historicalEdit.linkedDecisions', { count: reference.decisionCount }) : null,
  ].filter(Boolean)
  return t('meetings.historicalEdit.cannotRemoveAgenda', {
    reasons: reasons.join(t('meetings.historicalEdit.reasonSeparator')) || t('meetings.historicalEdit.protectedAgenda'),
  })
}

/** One localized error path for meeting mutations, including late concurrency conflicts. */
export function meetingMutationErrorMessage(t: TFunction, error: unknown, fallback: string) {
  const apiError = toApiClientError(error)
  const details = apiError.details && typeof apiError.details === 'object'
    ? apiError.details as Record<string, unknown> : {}
  if (apiError.code === 'HISTORICAL_PARTICIPANT_HAS_DEPENDENCIES' && Array.isArray(details.dependencies)) {
    return describeProtectedParticipant(t, details.dependencies.filter((reason): reason is string => typeof reason === 'string'))
  }
  if (apiError.code === 'MEETING_AGENDA_HAS_DEPENDENCIES' && Array.isArray(details.links)) {
    const links = details.links.filter((reason): reason is string => typeof reason === 'string')
    return t('meetings.historicalEdit.cannotRemoveAgenda', {
      reasons: links.map((reason) => t(`meetings.historicalEdit.agendaReasons.${reason}`, {
        defaultValue: t('meetings.historicalEdit.protectedAgenda'),
      })).join(t('meetings.historicalEdit.reasonSeparator')),
    })
  }
  return t(`meetings.errors.${apiError.code}`, { defaultValue: fallback })
}
