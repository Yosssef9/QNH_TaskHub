import { CircleAlert, LoaderCircle, ShieldX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type AuthGateState =
  | 'loading'
  | 'missing-token'
  | 'invalid-token'
  | 'access-not-assigned'
  | 'access-inactive'
  | 'server-error'

interface AuthGateProps {
  state: AuthGateState
  onRetry?: () => void
}

const contentKeys: Record<AuthGateState, { title: string; description: string }> = {
  loading: {
    title: 'auth.verifyingTitle',
    description: 'auth.verifyingDescription',
  },
  'missing-token': {
    title: 'auth.missingTokenTitle',
    description: 'auth.missingTokenDescription',
  },
  'invalid-token': {
    title: 'auth.invalidTokenTitle',
    description: 'auth.invalidTokenDescription',
  },
  'access-not-assigned': {
    title: 'auth.accessNotAssignedTitle',
    description: 'auth.accessNotAssignedDescription',
  },
  'access-inactive': {
    title: 'auth.accessInactiveTitle',
    description: 'auth.accessInactiveDescription',
  },
  'server-error': {
    title: 'auth.serverErrorTitle',
    description: 'auth.serverErrorDescription',
  },
}

export function AuthGate({ state, onRetry }: AuthGateProps) {
  const { t } = useTranslation()
  const message = contentKeys[state]
  const Icon =
    state === 'loading' ? LoaderCircle : state === 'missing-token' ? ShieldX : CircleAlert

  return (
    <main className="bg-background text-foreground grid min-h-screen place-items-center px-6">
      <section className="bg-card w-full max-w-lg rounded-xl border p-8 text-center shadow-sm">
        <Icon
          aria-hidden="true"
          className={
            state === 'loading'
              ? 'text-primary mx-auto animate-spin'
              : 'text-muted-foreground mx-auto'
          }
          size={36}
          strokeWidth={1.75}
        />
        <h1 className="mt-5 text-xl font-semibold tracking-tight">{t(message.title)}</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">{t(message.description)}</p>
        {state === 'server-error' && onRetry ? (
          <button
            type="button"
            className="bg-primary text-primary-foreground mt-5 rounded-md px-4 py-2 text-sm font-medium"
            onClick={onRetry}
          >
            {t('common.retry')}
          </button>
        ) : null}
      </section>
    </main>
  )
}
