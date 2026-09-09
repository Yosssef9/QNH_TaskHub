import { FileLock2, Loader2, Pencil, ShieldX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import {
  useContractAccessAdminData,
  useUpdateContractDelegation,
} from '../hooks/use-contract-access'
import type { ContractAccessDelegation } from '../types/access.types'

export function ContractAccessManager() {
  const { t } = useTranslation()
  const query = useContractAccessAdminData()
  const update = useUpdateContractDelegation()
  const [granteeUserId, setGranteeUserId] = useState<number | null>(null)
  const [ownerUserId, setOwnerUserId] = useState<number | null>(null)
  const [view, setView] = useState(true)
  const [manageAttachments, setManageAttachments] = useState(false)

  const users = query.data?.users ?? []
  const owners = useMemo(() => users.filter((user) => user.contractsAccess), [users])

  useEffect(() => {
    if (granteeUserId !== null && ownerUserId === granteeUserId) setOwnerUserId(null)
  }, [granteeUserId, ownerUserId])

  function clearForm() {
    setGranteeUserId(null)
    setOwnerUserId(null)
    setView(true)
    setManageAttachments(false)
  }

  function edit(delegation: ContractAccessDelegation) {
    setGranteeUserId(delegation.granteeUserId)
    setOwnerUserId(delegation.ownerUserId)
    setView(delegation.view)
    setManageAttachments(delegation.manageAttachments)
  }

  function save() {
    if (granteeUserId === null || ownerUserId === null) return
    update.mutate(
      { granteeUserId, ownerUserId, view, manageAttachments },
      {
        onSuccess: () => {
          toast.success(t('access.contractAccess.saved'))
          clearForm()
        },
        onError: () => toast.error(t('access.contractAccess.saveError')),
      },
    )
  }

  function revoke(delegation: ContractAccessDelegation) {
    update.mutate(
      {
        granteeUserId: delegation.granteeUserId,
        ownerUserId: delegation.ownerUserId,
        view: false,
        manageAttachments: false,
      },
      {
        onSuccess: () => toast.success(t('access.contractAccess.revoked')),
        onError: () => toast.error(t('access.contractAccess.saveError')),
      },
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b p-5">
        <div className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
          <FileLock2 aria-hidden="true" className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">{t('access.contractAccess.title')}</h2>
          <p className="text-muted-foreground text-xs">{t('access.contractAccess.description')}</p>
        </div>
      </div>

      {query.isPending ? (
        <LoadingState className="rounded-none border-0" />
      ) : query.isError || !query.data ? (
        <ErrorState className="rounded-none border-0" onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-6 p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('access.contractAccess.grantee')}</label>
              <Select
                value={granteeUserId === null ? undefined : String(granteeUserId)}
                onValueChange={(value) => setGranteeUserId(Number(value))}
              >
                <SelectTrigger aria-label={t('access.contractAccess.grantee')}>
                  <SelectValue placeholder={t('access.contractAccess.selectUser')} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.userId} value={String(user.userId)}>
                      {user.userName} · {user.userCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('access.contractAccess.owner')}</label>
              <Select
                value={ownerUserId === null ? undefined : String(ownerUserId)}
                onValueChange={(value) => setOwnerUserId(Number(value))}
              >
                <SelectTrigger aria-label={t('access.contractAccess.owner')}>
                  <SelectValue placeholder={t('access.contractAccess.selectOwner')} />
                </SelectTrigger>
                <SelectContent>
                  {owners
                    .filter((user) => user.userId !== granteeUserId)
                    .map((user) => (
                      <SelectItem key={user.userId} value={String(user.userId)}>
                        {user.userName} · {user.userCode}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <PermissionSwitch
              title={t('access.contractAccess.view')}
              description={t('access.contractAccess.viewDescription')}
              checked={view}
              onCheckedChange={(checked) => {
                setView(checked)
                if (!checked) setManageAttachments(false)
              }}
            />
            <PermissionSwitch
              title={t('access.contractAccess.manageAttachments')}
              description={t('access.contractAccess.manageAttachmentsDescription')}
              checked={manageAttachments}
              onCheckedChange={(checked) => {
                setManageAttachments(checked)
                if (checked) setView(true)
              }}
            />
          </div>

          <p className="text-muted-foreground text-xs leading-5">
            {t('access.contractAccess.featureAccessHint')}
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={update.isPending} onClick={clearForm}>
              {t('common.clear')}
            </Button>
            <Button
              disabled={
                update.isPending || granteeUserId === null || ownerUserId === null || !view
              }
              onClick={save}
            >
              {update.isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {t('access.contractAccess.apply')}
            </Button>
          </div>

          <div className="border-t pt-5">
            <h3 className="font-semibold">{t('access.contractAccess.existing')}</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              {t('access.contractAccess.existingDescription')}
            </p>

            {query.data.delegations.filter((item) => item.view).length === 0 ? (
              <EmptyState
                icon={ShieldX}
                title={t('access.contractAccess.emptyTitle')}
                description={t('access.contractAccess.emptyDescription')}
                className="mt-4"
              />
            ) : (
              <div className="mt-4 divide-y rounded-xl border">
                {query.data.delegations
                  .filter((item) => item.view)
                  .map((delegation) => (
                    <div
                      key={`${delegation.granteeUserId}:${delegation.ownerUserId}`}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {delegation.granteeUserName}
                          <span className="text-muted-foreground mx-2">→</span>
                          {delegation.ownerUserName}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="secondary">{t('access.contractAccess.view')}</Badge>
                          {delegation.manageAttachments ? (
                            <Badge variant="secondary">
                              {t('access.contractAccess.manageAttachments')}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => edit(delegation)}>
                          <Pencil aria-hidden="true" className="size-4" />
                          {t('common.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={update.isPending}
                          onClick={() => revoke(delegation)}
                        >
                          {t('access.contractAccess.revoke')}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function PermissionSwitch({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="bg-muted/50 flex items-start justify-between gap-4 rounded-xl border p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-5">{description}</p>
      </div>
      <Switch checked={checked} aria-label={title} onCheckedChange={onCheckedChange} />
    </div>
  )
}
