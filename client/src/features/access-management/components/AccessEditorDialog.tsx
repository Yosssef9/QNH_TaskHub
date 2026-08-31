import { Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { TaskHubRoleCode } from '@/features/auth/types/auth.types'
import { ApiClientError } from '@/lib/api-error'

import { useUpdateAccess } from '../hooks/use-update-access'
import type { AccessUser } from '../types/access.types'
import { AccessRoleIndicator } from './AccessRoleIndicator'

interface AccessEditorDialogProps {
  user: AccessUser | null
  open: boolean
  onClose: () => void
}

export function AccessEditorDialog({ onClose, open, user }: AccessEditorDialogProps) {
  if (!user) return null

  return <AccessEditorDialogContent key={user.userId} user={user} open={open} onClose={onClose} />
}

interface AccessEditorDialogContentProps {
  user: AccessUser
  open: boolean
  onClose: () => void
}

function AccessEditorDialogContent({ onClose, open, user }: AccessEditorDialogContentProps) {
  const { t } = useTranslation()
  const updateAccess = useUpdateAccess()
  const [roleCode, setRoleCode] = useState<TaskHubRoleCode>(user.roleCode ?? 'USER')
  const [isActive, setIsActive] = useState(user.roleCode ? user.accessIsActive : true)
  const [contractsEnabled, setContractsEnabled] = useState(user.contractsEnabled)

  function save() {
    updateAccess.mutate(
      { userId: user.userId, roleCode, isActive, contractsEnabled },
      {
        onSuccess: () => {
          toast.success(t('access.saved'))
          onClose()
        },
        onError: (error) => {
          const key =
            error instanceof ApiClientError && error.code === 'LAST_ACTIVE_ADMIN_REQUIRED'
              ? 'access.lastAdminError'
              : 'access.saveError'
          toast.error(t(key))
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && !updateAccess.isPending && onClose()}
    >
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-lg font-semibold">{t('access.editTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-sm">
              {t('access.editDescription', { name: user.userName })}
            </DialogDescription>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <label htmlFor="access-role" className="text-sm font-medium">
              {t('access.role')}
            </label>
            <Select
              value={roleCode}
              onValueChange={(value) => setRoleCode(value as TaskHubRoleCode)}
            >
              <SelectTrigger id="access-role" aria-label={t('access.role')}>
                <SelectValue>
                  <AccessRoleIndicator role={roleCode} pill />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">
                  <AccessRoleIndicator role="USER" />
                </SelectItem>
                <SelectItem value="ADMIN">
                  <AccessRoleIndicator role="ADMIN" />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted/60 flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">{t('access.activeAccess')}</p>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                {t('access.activeAccessDescription')}
              </p>
            </div>
            <Switch
              checked={isActive}
              aria-label={t('access.activeAccess')}
              onCheckedChange={setIsActive}
            />
          </div>

          <div className="bg-muted/60 flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">{t('access.contractsModule')}</p>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                {t('access.contractsModuleDescription')}
              </p>
            </div>
            <Switch
              checked={contractsEnabled}
              aria-label={t('access.contractsModule')}
              onCheckedChange={setContractsEnabled}
            />
          </div>
        </div>

        <div className="mt-7 flex justify-end gap-2">
          <Button variant="outline" disabled={updateAccess.isPending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={updateAccess.isPending} onClick={save}>
            {updateAccess.isPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

