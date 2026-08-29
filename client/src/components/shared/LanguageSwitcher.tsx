import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getAppLanguage, setAppLanguage } from '@/i18n'
import { useUpdatePreferences } from '@/features/preferences/hooks/use-update-preferences'
import toast from 'react-hot-toast'

export function LanguageSwitcher() {
  const { t } = useTranslation()
  const currentLanguage = getAppLanguage()
  const nextLanguage = currentLanguage === 'ar' ? 'en' : 'ar'
  const updatePreferences = useUpdatePreferences()

  async function changeLanguage() {
    await setAppLanguage(nextLanguage)
    updatePreferences.mutate(
      { languageCode: nextLanguage === 'ar' ? 'AR' : 'EN' },
      {
        onError: () => {
          void setAppLanguage(currentLanguage)
          toast.error(t('preferences.saveError'))
        },
      },
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('language.change')}
          disabled={updatePreferences.isPending}
          onClick={() => void changeLanguage()}
        >
          <Languages aria-hidden="true" className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('language.change')}</TooltipContent>
    </Tooltip>
  )
}
