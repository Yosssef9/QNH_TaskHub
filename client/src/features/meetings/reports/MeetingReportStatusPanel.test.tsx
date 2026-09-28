// @vitest-environment jsdom
import '@/test/setup'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { MeetingReportStatusPanel } from './MeetingReportStatusPanel'
import { useMeetingReportStatus } from './use-meeting-report-status'
import { downloadMeetingReport } from './meeting-report.api'
import type { MeetingReportSchedule } from './meeting-report-status.types'

vi.mock('./use-meeting-report-status', () => ({ useMeetingReportStatus: vi.fn() }))
vi.mock('./meeting-report.api', () => ({ downloadMeetingReport: vi.fn(async () => undefined) }))
vi.mock('@/features/preferences/hooks/use-time-format', () => ({ useTimeFormatPreference: () => '24H' }))
const data: MeetingReportSchedule = {
  meetingId: 127, meetingStatus: 'SCHEDULED', approvedRevisionId: 12,
  approvedStartAtUtc: '2026-09-27T06:00:00Z', approvedEndAtUtc: '2026-09-27T07:00:00Z',
  reportDueAtUtc: '2026-09-27T07:30:00Z', graceMinutes: 30, scheduleState: 'DUE', hasPendingReschedule: false,
  checkedAtUtc: '2026-09-27T07:31:00Z', timeZone: 'Asia/Riyadh', automaticDeliveryEnabled: false,
  delivery: { state: 'NOT_QUEUED', totalRecipients: 2, sent: 0, queued: 0, processing: 0, retrying: 0, failed: 0, skipped: 0, notQueued: 2, needsReview: 0, lastSentAtUtc: null, nextAttemptAtUtc: null },
}
const refetch = vi.fn()
function arrange(overrides: object = {}) {
  vi.mocked(useMeetingReportStatus).mockReturnValue({ data, isPending: false, isError: false, isFetching: false, refetch, ...overrides } as unknown as ReturnType<typeof useMeetingReportStatus>)
}
function renderPanel() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MeetingReportStatusPanel meetingId={127} meetingRowVersion="v1" /></QueryClientProvider>)
}
beforeEach(async () => { await i18n.changeLanguage('en'); vi.clearAllMocks(); arrange() })
afterEach(async () => { await i18n.changeLanguage('ar') })

describe('Integrated Meeting report row and dialog', () => {
  it('shows a disabled calculation with only one export button and no open dialog', () => {
    renderPanel()
    expect(screen.getByText('Automatic email disabled')).toBeVisible()
    expect(screen.getByText('Calculated report time')).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Export PDF' })).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/Planned audience/)).not.toBeInTheDocument()
  })
  it('opens details without sending/exporting anything and refreshes the same query', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'View details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Report delivery details' })
    expect(within(dialog).getByRole('heading', { name: 'Audience' })).toBeVisible()
    expect(within(dialog).getByText('No report emails have been queued.')).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh report status' }))
    expect(refetch).toHaveBeenCalledOnce()
    expect(downloadMeetingReport).not.toHaveBeenCalled()
  })
  it('keeps partial counts visible without opening details', () => {
    arrange({ data: { ...data, delivery: { ...data.delivery, state: 'PARTIAL', sent: 1, failed: 1, notQueued: 0, lastSentAtUtc: '2026-09-27T07:31:00Z' } } })
    renderPanel()
    expect(screen.getByText('Partially sent')).toBeVisible()
    expect(screen.getByText('1 sent · 1 failed')).toBeVisible()
    expect(screen.queryByText('Sent to all current recipients')).not.toBeInTheDocument()
    expect(screen.getByText('Last recorded send')).toBeVisible()
  })
  it('suppresses stale success on query error but still allows PDF export', async () => {
    arrange({ isError: true, data: { ...data, delivery: { ...data.delivery, state: 'SENT', sent: 2, notQueued: 0 } } })
    renderPanel()
    expect(screen.getByRole('alert')).toHaveTextContent('Status unavailable')
    expect(screen.queryByText('Sent')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(downloadMeetingReport).toHaveBeenCalledWith(127, 'en'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh report status' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
  it('keeps export enabled while status is loading', () => {
    arrange({ data: undefined, isPending: true, isFetching: true })
    renderPanel()
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled()
  })
  it('shows the activation explanation without an active scheduled time', async () => {
    arrange({ data: { ...data, automaticDeliveryEnabled: true, scheduleState: 'BEFORE_ACTIVATION', reportDueAtUtc: null, activatedAtUtc: '2026-09-28T00:00:00Z' } })
    renderPanel()
    expect(screen.getByText('Not scheduled — Before activation')).toBeVisible()
    expect(screen.queryByText('Automatic report due')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View details' }))
    expect(await screen.findByText(i18n.t('meetings.report.automatic.reason.BEFORE_ACTIVATION'))).toBeVisible()
  })
  it('closes on Escape and returns focus to the details button', async () => {
    renderPanel(); const trigger = screen.getByRole('button', { name: 'View details' })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
  it('renders the row and delivery modal in Arabic', async () => {
    await i18n.changeLanguage('ar'); renderPanel()
    expect(screen.getByLabelText('تقرير الاجتماع والبريد التلقائي')).toHaveAttribute('dir', 'rtl')
    fireEvent.click(screen.getByRole('button', { name: 'عرض التفاصيل' }))
    expect(await screen.findByRole('dialog', { name: 'تفاصيل إرسال التقرير' })).toHaveAttribute('dir', 'rtl')
  })
})
