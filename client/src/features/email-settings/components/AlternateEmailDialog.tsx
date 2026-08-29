import { CheckCircle2, Loader2, MailCheck, RefreshCw, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ApiClientError } from '@/lib/api-error'

import {
  useRequestAlternateEmailVerification,
  useResendAlternateEmailVerification,
  useVerifyAlternateEmail,
} from '../hooks/use-email-settings'
import type { PendingEmailVerification } from '../types/email-settings.types'

interface AlternateEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pendingVerification: PendingEmailVerification | null
}

function secondsUntil(value: string | null): number {
  if (!value) return 0
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000))
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

function verificationErrorMessage(error: unknown, t: ReturnType<typeof useTranslation>['t']): string {
  if (!(error instanceof ApiClientError)) return t('emailSettings.errors.generic')

  const keyByCode: Record<string, string> = {
    ALTERNATE_EMAIL_EQUALS_PORTAL: 'emailSettings.errors.sameAsPortal',
    ALTERNATE_EMAIL_ALREADY_VERIFIED: 'emailSettings.errors.alreadyVerified',
    ALTERNATE_EMAIL_UNAVAILABLE: 'emailSettings.errors.unavailable',
    EMAIL_VERIFICATION_COOLDOWN: 'emailSettings.errors.cooldown',
    EMAIL_VERIFICATION_RATE_LIMITED: 'emailSettings.errors.rateLimited',
    EMAIL_VERIFICATION_SEND_FAILED: 'emailSettings.errors.sendFailed',
    EMAIL_VERIFICATION_NOT_CONFIGURED: 'emailSettings.errors.notConfigured',
    EMAIL_DELIVERY_DISABLED: 'emailSettings.errors.systemDisabled',
    EMAIL_VERIFICATION_CODE_INVALID: 'emailSettings.errors.invalidCode',
    EMAIL_VERIFICATION_CODE_EXPIRED: 'emailSettings.errors.expiredCode',
    EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED: 'emailSettings.errors.attemptsExceeded',
    EMAIL_VERIFICATION_NOT_PENDING: 'emailSettings.errors.notPending',
  }

  const key = keyByCode[error.code]
  if (!key) return t('emailSettings.errors.generic')

  if (error.code === 'EMAIL_VERIFICATION_CODE_INVALID') {
    const details =
      typeof error.details === 'object' && error.details !== null
        ? (error.details as { attemptsRemaining?: unknown })
        : null
    const remaining = Number(details?.attemptsRemaining)
    if (Number.isFinite(remaining)) {
      return t(key, { count: remaining })
    }
  }

  return t(key)
}

export function AlternateEmailDialog({
  open,
  onOpenChange,
  pendingVerification,
}: AlternateEmailDialogProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'email' | 'code'>(() =>
    pendingVerification ? 'code' : 'email',
  )
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [verification, setVerification] = useState<PendingEmailVerification | null>(
    pendingVerification,
  )
  const [clock, setClock] = useState(() => Date.now())
  const requestMutation = useRequestAlternateEmailVerification()
  const resendMutation = useResendAlternateEmailVerification()
  const verifyMutation = useVerifyAlternateEmail()

  useEffect(() => {
    if (!open) return
    setVerification(pendingVerification)
    setStep(pendingVerification ? 'code' : 'email')
    setCode('')
  }, [open, pendingVerification])

  useEffect(() => {
    if (!open || step !== 'code') return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [open, step])

  const expiresSeconds = useMemo(
    () => secondsUntil(verification?.expiresAtUtc ?? null),
    [verification?.expiresAtUtc, clock],
  )
  const resendSeconds = useMemo(
    () => secondsUntil(verification?.resendAvailableAtUtc ?? null),
    [verification?.resendAvailableAtUtc, clock],
  )

  async function requestCode() {
    const normalized = email.trim()
    if (!normalized) return
    try {
      const result = await requestMutation.mutateAsync(normalized)
      setVerification(result)
      setCode('')
      setStep('code')
      setClock(Date.now())
      toast.success(t('emailSettings.verification.sent'))
    } catch (error) {
      toast.error(verificationErrorMessage(error, t))
    }
  }

  async function resendCode() {
    try {
      const result = await resendMutation.mutateAsync()
      setVerification(result)
      setCode('')
      setClock(Date.now())
      toast.success(t('emailSettings.verification.resent'))
    } catch (error) {
      toast.error(verificationErrorMessage(error, t))
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(code)) return
    try {
      await verifyMutation.mutateAsync(code)
      toast.success(t('emailSettings.verification.verified'))
      onOpenChange(false)
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'EMAIL_VERIFICATION_CODE_INVALID') {
        const details =
          typeof error.details === 'object' && error.details !== null
            ? (error.details as { attemptsRemaining?: unknown })
            : null
        const remaining = Number(details?.attemptsRemaining)
        if (Number.isFinite(remaining)) {
          setVerification((current) =>
            current ? { ...current, attemptsRemaining: Math.max(0, remaining) } : current,
          )
          if (remaining <= 0) setStep('email')
        }
      }
      toast.error(verificationErrorMessage(error, t))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} variant="modal" className="w-[min(32rem,calc(100vw-2rem))]">
        <div className="pe-10">
          <span className="bg-primary/10 text-primary grid size-12 place-items-center rounded-xl">
            {step === 'email' ? <MailCheck className="size-5" /> : <Send className="size-5" />}
          </span>
          <DialogTitle className="mt-4 text-xl font-semibold">
            {t(step === 'email' ? 'emailSettings.alternate.dialogTitle' : 'emailSettings.verification.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-2 leading-6">
            {t(
              step === 'email'
                ? 'emailSettings.alternate.dialogDescription'
                : 'emailSettings.verification.description',
              { email: verification?.maskedEmail ?? '' },
            )}
          </DialogDescription>
        </div>

        {step === 'email' ? (
          <div className="mt-6 space-y-5">
            <div>
              <label htmlFor="alternate-email" className="mb-2 block text-sm font-medium">
                {t('emailSettings.alternate.emailLabel')}
              </label>
              <Input
                id="alternate-email"
                type="email"
                autoComplete="email"
                value={email}
                placeholder={t('emailSettings.alternate.emailPlaceholder')}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void requestCode()
                }}
              />
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                {t('emailSettings.alternate.verificationHint')}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={!email.trim() || requestMutation.isPending}
                onClick={() => void requestCode()}
              >
                {requestMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Send aria-hidden="true" className="size-4" />
                )}
                {t('emailSettings.alternate.sendCode')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div>
              <label htmlFor="verification-code" className="mb-2 block text-sm font-medium">
                {t('emailSettings.verification.codeLabel')}
              </label>
              <Input
                id="verification-code"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                className="h-14 text-center font-mono text-xl font-bold tracking-[0.5em]"
                placeholder="000000"
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void verifyCode()
                }}
              />
            </div>

            <div className="bg-muted/50 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('emailSettings.verification.expires')}</span>
                <span className={expiresSeconds === 0 ? 'text-destructive font-semibold' : 'font-semibold'}>
                  {expiresSeconds > 0
                    ? formatCountdown(expiresSeconds)
                    : t('emailSettings.verification.expired')}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-sm">
                <span className="text-muted-foreground">
                  {t('emailSettings.verification.attempts', {
                    count: verification?.attemptsRemaining ?? 0,
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={resendSeconds > 0 || resendMutation.isPending}
                  onClick={() => void resendCode()}
                >
                  {resendMutation.isPending ? (
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw aria-hidden="true" className="size-3.5" />
                  )}
                  {resendSeconds > 0
                    ? t('emailSettings.verification.resendIn', { seconds: resendSeconds })
                    : t('emailSettings.verification.resend')}
                </Button>
              </div>
            </div>

            <button
              type="button"
              className="text-primary hover:bg-primary/5 rounded-md px-2 py-1 text-sm font-medium"
              onClick={() => {
                setStep('email')
                setCode('')
              }}
            >
              {t('emailSettings.verification.useDifferent')}
            </button>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={!/^\d{6}$/.test(code) || expiresSeconds === 0 || verifyMutation.isPending}
                onClick={() => void verifyCode()}
              >
                {verifyMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                )}
                {t('emailSettings.verification.verify')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
