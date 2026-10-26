import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, CheckCircle2, Maximize2, MessageCircleMore, Sparkles } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { featureAnnouncementsApi } from './feature-announcements.api'

const screenshots = ['00-open-discussions.png', '01-access-task-details.png', '01-chat.png', '02-inbox.png', '03-mentions.png', '04-start.png'] as const
const accessPointScreenshots = {
  task: '01-access-task-details.png',
  sidebar: '01-access-sidebar.png',
} as const
const appBase = import.meta.env.BASE_URL
// Bump the preview asset revision when an onboarding screenshot is replaced.
const screenshotVersion = "spotlight-20261026-access-tabs-1"
const tourQueryKey = (userId: number) => ['feature-announcements', 'discussions-v1', userId] as const

const tourContent = {
  ar: [
    { title: 'كيف تصل إلى محادثاتك؟', description: 'من الصفحة الرئيسية، اضغط على «فتح المحادثات» في بطاقة «محادثاتي» لعرض مناقشات مهامك والتواصل مع زملائك.' },
    { title: 'افتح المحادثات من أي مكان', description: 'يمكنك فتح المناقشة من تبويب «المناقشات» داخل تفاصيل المهمة، أو الانتقال مباشرة إلى «محادثاتي» من القائمة الجانبية.' },
    { title: 'ناقش مهامك مع زملائك', description: 'أرسل الرسائل داخل المهمة أو المهمة الفرعية مباشرة. ستبقى المناقشة مرتبطة بسياق العمل.' },
    { title: 'جميع محادثاتك في مكان واحد', description: 'افتح «محادثاتي» للعثور على المناقشات، والرسائل غير المقروءة، والإشارات إليك.' },
    { title: 'الإشارات والتفاعلات', description: 'استخدم @ للإشارة إلى أحد المشاركين، وتفاعل مع الرسائل باستخدام الرموز التعبيرية.' },
    { title: 'ابدأ المحادثة من أي مهمة مشتركة', description: 'يمكنك فتح مناقشة المهمة وكتابة أول رسالة حتى إن لم تكن هناك رسائل سابقة.' },
  ],
  en: [
    { title: 'How to open My Discussions', description: 'From Home, select Open Discussions in the My Discussions card to find task conversations and communicate with colleagues.' },
    { title: 'Open Discussions from Anywhere', description: 'Use the Discussions tab in Task Details to open a task conversation, or select My Discussions in the sidebar to access your conversations.' },
    { title: 'Discuss tasks with your team', description: 'Send messages directly within a task or subtask. The conversation stays linked to its work context.' },
    { title: 'All your discussions in one place', description: 'Open My Discussions to find conversations, unread messages, and mentions addressed to you.' },
    { title: 'Mentions and reactions', description: 'Use @ to mention an authorized participant and react to messages with quick emojis.' },
    { title: 'Start a discussion from a shared task', description: 'Open a shared task discussion and send its first message, even if the thread is empty.' },
  ],
} as const

interface WhatsNewContextValue { open: () => void; isNew: boolean }
const defaultWhatsNewContext: WhatsNewContextValue = { open: () => {}, isNew: false }
const WhatsNewContext = createContext<WhatsNewContextValue>(defaultWhatsNewContext)

export function useDiscussionsWhatsNew(): WhatsNewContextValue {
  return useContext(WhatsNewContext)
}

export function DiscussionsWhatsNewProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  const user = useCurrentUser().data?.user
  const userId = user?.userId ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [accessMethod, setAccessMethod] = useState<'task' | 'sidebar'>('task')
  const [accessHovered, setAccessHovered] = useState(false)
  const [accessFocused, setAccessFocused] = useState(false)
  const [accessSwitchReset, setAccessSwitchReset] = useState(0)
  const [previewStep, setPreviewStep] = useState<number | null>(null)
  const reducedMotion = useReducedMotion()
  const autoOpenedFor = useRef<number | null>(null)
  const seenQuery = useQuery({
    queryKey: tourQueryKey(userId),
    queryFn: featureAnnouncementsApi.getDiscussionsIntro,
    enabled: userId > 0,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const acknowledge = useMutation({
    mutationFn: featureAnnouncementsApi.acknowledgeDiscussionsIntro,
    onSuccess: () => queryClient.setQueryData(tourQueryKey(userId), true),
  })

  // Auto-cycle only while the access-methods slide is visible and not being inspected.
  // A timeout (rather than an interval) gives each displayed image a full 3 seconds.
  useEffect(() => {
    if (!isOpen || step !== 1 || previewStep !== null || accessHovered || accessFocused || reducedMotion) return
    const timeout = window.setTimeout(() => {
      setAccessMethod(method => method === 'task' ? 'sidebar' : 'task')
    }, 3000)
    return () => window.clearTimeout(timeout)
  }, [isOpen, step, previewStep, accessHovered, accessFocused, accessMethod, accessSwitchReset, reducedMotion])

  const changeStep = (nextStep: number) => {
    setStep(nextStep)
    setAccessHovered(false)
    setAccessFocused(false)
  }

  const chooseAccessMethod = (method: 'task' | 'sidebar') => {
    setAccessMethod(method)
    setAccessSwitchReset(value => value + 1)
  }

  useEffect(() => {
    if (userId > 0 && seenQuery.isSuccess && !seenQuery.data && autoOpenedFor.current !== userId) {
      autoOpenedFor.current = userId
      setStep(0)
      setAccessMethod('task')
      setAccessHovered(false)
      setAccessFocused(false)
      setIsOpen(true)
    }
  }, [seenQuery.data, seenQuery.isSuccess, userId])

  const open = useCallback(() => { setStep(0); setAccessMethod('task'); setAccessHovered(false); setAccessFocused(false); setIsOpen(true) }, [])
  const close = useCallback(() => {
    setIsOpen(false)
    if (userId > 0 && seenQuery.isSuccess && seenQuery.data === false && !acknowledge.isPending) {
      acknowledge.mutate(undefined, {
        onError: () => toast.error(ar ? 'تعذّر حفظ حالة الإطلاع على الجديد.' : 'Could not save the announcement status.'),
      })
    }
  }, [acknowledge, ar, seenQuery.data, seenQuery.isSuccess, userId])

  const steps = tourContent[ar ? 'ar' : 'en']
  const current = steps[step]!
  const atLastStep = step === screenshots.length - 1
  const DirectionArrow = ar ? ArrowLeft : ArrowRight
  const activeScreenshot = step === 1 ? accessPointScreenshots[accessMethod] : screenshots[step]
  const enlargedScreenshot = previewStep === 1 ? accessPointScreenshots[accessMethod] : screenshots[previewStep ?? step]
  const accessMethodHint = accessMethod === 'task'
    ? (ar ? 'افتح تفاصيل المهمة، ثم اختر تبويب «المناقشات» لبدء المحادثة أو متابعة الرسائل.' : 'Open a task, then select the Discussions tab to start or continue its conversation.')
    : (ar ? 'اضغط على «محادثاتي» في القائمة الجانبية لعرض كل المحادثات المتاحة لك.' : 'Select My Discussions in the sidebar to access all conversations available to you.')

  return <WhatsNewContext.Provider value={{ open, isNew: userId > 0 && seenQuery.isSuccess && seenQuery.data === false }}>
    {children}
    <Dialog open={isOpen} onOpenChange={next => { if (!next) close() }}>
      <DialogContent variant="modal" closeLabel={ar ? 'إغلاق' : 'Close'} className="w-[min(70rem,calc(100vw-1.5rem))] max-h-[min(92dvh,950px)] overflow-hidden p-0">
        <div className="flex min-h-0 flex-col" dir={ar ? 'rtl' : 'ltr'}>
          <div className="shrink-0 border-b bg-gradient-to-l from-primary/10 via-background to-background px-5 py-4 pe-14 sm:px-8">
            <span className="text-primary inline-flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="size-4" />{ar ? 'جديد في TaskHub' : 'New in TaskHub'}</span>
            <DialogTitle className="mt-2 flex items-center gap-2 text-xl font-bold sm:text-2xl"><MessageCircleMore className="text-primary size-6" />{ar ? 'اكتشف محادثات المهام' : 'Discover Task Discussions'}</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-2 text-sm">{ar ? 'تعرّف على طرق أسرع للتعاون داخل مهامك.' : 'A quicker way to collaborate directly in your tasks.'}</DialogDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-7 sm:py-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={reducedMotion ? false : { opacity: 0, x: ar ? -16 : 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion ? {} : { opacity: 0, x: ar ? 16 : -16 }}
                transition={{ duration: reducedMotion ? 0 : 0.18 }}
                onFocusCapture={step === 1 ? event => setAccessFocused(event.target instanceof HTMLElement && event.target.matches(':focus-visible')) : undefined}
                onBlurCapture={step === 1 ? event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setAccessFocused(false)
                } : undefined}
              >
                {step === 1 && <div
                  role="group"
                  aria-label={ar ? 'طرق فتح المحادثات' : 'Ways to open discussions'}
                  className="mx-auto mb-3 flex w-full max-w-xl items-center gap-1 rounded-xl border bg-muted/60 p-1"
                >
                  {(['task', 'sidebar'] as const).map(method => <button
                    key={method}
                    type="button"
                    aria-pressed={accessMethod === method}
                    onClick={() => chooseAccessMethod(method)}
                    className={`relative isolate min-w-0 flex-1 rounded-lg px-2 py-2.5 text-center text-xs font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm ${accessMethod === method ? 'text-primary' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'}`}
                  >
                    {accessMethod === method && <motion.span
                      layoutId="discussions-tour-active-access-method"
                      className="pointer-events-none absolute inset-0 -z-10 rounded-lg bg-background shadow-sm ring-1 ring-primary/20"
                      transition={{ duration: reducedMotion ? 0 : 0.35, ease: 'easeInOut' }}
                    />}
                    <span className="relative z-10">{method === 'task' ? (ar ? 'من تفاصيل المهمة' : 'From Task Details') : (ar ? 'من القائمة الجانبية' : 'From Sidebar')}</span>
                  </button>)}
                </div>}
                <div className={step === 3 ? 'grid items-center gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(14rem,0.85fr)]' : 'space-y-3'}>
                  <button
                    type="button"
                    onClick={() => setPreviewStep(step)}
                    onMouseEnter={step === 1 ? () => setAccessHovered(true) : undefined}
                    onMouseLeave={step === 1 ? () => setAccessHovered(false) : undefined}
                    aria-label={ar ? `تكبير الصورة: ${current.title}` : `Enlarge image: ${current.title}`}
                    className={`group relative flex min-w-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30 p-2 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-3 ${step === 3 ? 'mx-auto w-full' : 'w-full'}`}
                  >
                    {step === 1 ? <div className="relative h-[min(48dvh,510px)] w-full overflow-hidden">
                      {(['task', 'sidebar'] as const).map(method => <motion.img
                        key={method}
                        src={`${appBase}images/discussions-tour/${accessPointScreenshots[method]}?v=${screenshotVersion}`}
                        alt={method === 'task' ? (ar ? 'تبويب المناقشات داخل تفاصيل المهمة' : 'Discussions tab inside Task Details') : (ar ? 'رابط محادثاتي داخل القائمة الجانبية' : 'My Discussions shortcut in the sidebar')}
                        aria-hidden={accessMethod !== method}
                        initial={false}
                        animate={{ opacity: accessMethod === method ? 1 : 0, x: reducedMotion ? 0 : accessMethod === method ? 0 : (method === 'task' ? -12 : 12) }}
                        transition={{ duration: reducedMotion ? 0 : 0.4, ease: 'easeInOut' }}
                        className="pointer-events-none absolute inset-0 size-full rounded-md object-contain"
                      />)}
                    </div> : <img
                      src={`${appBase}images/discussions-tour/${activeScreenshot}?v=${screenshotVersion}`}
                      alt={ar ? `مثال من TaskHub: ${current.title}` : `TaskHub example: ${current.title}`}
                      className={step === 3
                        ? 'mx-auto max-h-[min(51dvh,560px)] w-auto max-w-full rounded-md object-contain'
                        : step === 4
                          ? 'mx-auto max-h-[min(43dvh,470px)] w-full rounded-md object-contain'
                          : 'mx-auto max-h-[min(49dvh,540px)] w-full rounded-md object-contain'}
                    />}
                    <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-lg border bg-background/95 px-2.5 py-1.5 text-xs font-medium text-foreground opacity-90 shadow-sm transition-opacity group-hover:opacity-100">
                      <Maximize2 className="size-3.5" aria-hidden="true" />{ar ? 'تكبير الصورة' : 'Enlarge image'}
                    </span>
                  </button>
                  <div className={step === 3 ? 'space-y-3 lg:px-2' : 'space-y-2'}>
                    <p className="text-muted-foreground text-xs font-semibold">{ar ? `الخطوة ${step + 1} من ${screenshots.length}` : `Step ${step + 1} of ${screenshots.length}`}</p>
                    <h3 className="text-lg font-bold sm:text-xl">{current.title}</h3>
                    {step === 1 ? <AnimatePresence mode="wait" initial={false}>
                      <motion.p
                        key={accessMethod}
                        initial={reducedMotion ? false : { opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reducedMotion ? {} : { opacity: 0, y: -5 }}
                        transition={{ duration: reducedMotion ? 0 : 0.2 }}
                        className="text-muted-foreground text-sm leading-relaxed"
                      >{accessMethodHint}</motion.p>
                    </AnimatePresence> : <p className="text-muted-foreground text-sm leading-relaxed">{current.description}</p>}
                    {step === 3 && <div className="space-y-2 pt-3 text-sm">
                      <p className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full bg-primary" />{ar ? 'استخدم البحث للعثور على مناقشة.' : 'Find a discussion using search.'}</p>
                      <p className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full bg-primary" />{ar ? 'تنقّل بين الكل وغير المقروء والإشارات.' : 'Switch between All, Unread, and Mentions.'}</p>
                    </div>}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-3 sm:px-8">
            <Button variant="ghost" size="sm" onClick={close}>{ar ? 'تخطي' : 'Skip'}</Button>
            <div className="flex items-center gap-1.5" aria-label={ar ? 'تقدم التعريف' : 'Tour progress'}>
              {screenshots.map((file, index) => <button type="button" key={file} onClick={() => changeStep(index)} aria-label={ar ? `الانتقال إلى الخطوة ${index + 1}` : `Go to step ${index + 1}`} aria-current={step === index ? 'step' : undefined} className={`focus-visible:ring-ring rounded-full transition-all focus-visible:ring-2 ${step === index ? 'bg-primary h-2.5 w-6' : 'bg-muted-foreground/30 hover:bg-primary/40 size-2'}`} />)}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && <Button size="sm" variant="outline" onClick={() => changeStep(step - 1)}>{ar ? 'السابق' : 'Back'}</Button>}
              <Button size="sm" onClick={() => { if (atLastStep) { close(); navigate('/discussions') } else changeStep(step + 1) }}>
                {atLastStep ? <><CheckCircle2 className="size-4" />{ar ? 'فتح محادثاتي' : 'Open My Discussions'}</> : <>{ar ? 'التالي' : 'Next'}<DirectionArrow className="size-4" /></>}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={previewStep !== null} onOpenChange={next => { if (!next) setPreviewStep(null) }}>
      <DialogContent
        variant="modal"
        closeLabel={ar ? 'إغلاق الصورة المكبرة' : 'Close enlarged image'}
        className="w-[min(96vw,1500px)] max-h-[94dvh] overflow-hidden p-4 sm:p-6"
      >
        <div className="flex max-h-[calc(94dvh-3rem)] min-h-0 flex-col gap-3" dir={ar ? 'rtl' : 'ltr'}>
          <DialogTitle className="shrink-0 pe-12 text-base font-bold sm:text-lg">{steps[previewStep ?? step]!.title}</DialogTitle>
          <DialogDescription className="sr-only">{ar ? 'صورة توضيحية مكبرة من TaskHub.' : 'Enlarged example image from TaskHub.'}</DialogDescription>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-muted/40 p-2">
            <img
              src={`${appBase}images/discussions-tour/${enlargedScreenshot}?v=${screenshotVersion}`}
              alt={ar ? 'صورة توضيحية مكبرة' : 'Enlarged example screenshot'}
              className="max-h-[calc(94dvh-9rem)] max-w-full object-contain"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </WhatsNewContext.Provider>
}

