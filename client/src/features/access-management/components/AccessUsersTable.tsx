import { Pencil, UserRoundCog } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/shared/EmptyState'
import { taskHubFadeMotion } from '@/components/shared/TaskHubMotion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { AccessUser } from '../types/access.types'

interface AccessUsersTableProps {
  users: AccessUser[]
  onEdit: (user: AccessUser) => void
}

export function AccessUsersTable({ onEdit, users }: AccessUsersTableProps) {
  const { t } = useTranslation()

  if (users.length === 0) {
    return (
      <EmptyState
        icon={UserRoundCog}
        title={t('access.emptyTitle')}
        description={t('access.emptyDescription')}
        className="rounded-none border-0"
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-3xl text-sm">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-3 text-start font-medium">
              {t('access.user')}
            </th>
            <th scope="col" className="px-5 py-3 text-start font-medium">
              {t('access.userCode')}
            </th>
            <th scope="col" className="px-5 py-3 text-start font-medium">
              {t('access.role')}
            </th>
            <th scope="col" className="px-5 py-3 text-start font-medium">
              {t('access.status')}
            </th>
            <th scope="col" className="px-5 py-3 text-end font-medium">
              {t('access.actions')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <AnimatePresence initial={false}>
            {users.map((user) => (
              <motion.tr
                key={user.userId}
                initial={taskHubFadeMotion.initial}
                animate={taskHubFadeMotion.animate}
                exit={taskHubFadeMotion.exit}
                transition={taskHubFadeMotion.transition}
                className="hover:bg-muted/30"
              >
              <td className="px-5 py-4">
                <p className="font-medium">{user.userName}</p>
                {user.email ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">{user.email}</p>
                ) : null}
              </td>
              <td className="px-5 py-4 font-mono text-xs">{user.userCode}</td>
              <td className="px-5 py-4">
                {user.roleCode ? (
                  <Badge variant={user.roleCode === 'ADMIN' ? 'default' : 'secondary'}>
                    {t(`access.roles.${user.roleCode}`)}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">{t('access.notAssigned')}</span>
                )}
              </td>
              <td className="px-5 py-4">
                <Badge variant={user.accessIsActive ? 'success' : 'secondary'}>
                  {t(
                    user.roleCode === null
                      ? 'access.notAssigned'
                      : user.accessIsActive
                        ? 'access.active'
                        : 'access.inactive',
                  )}
                </Badge>
              </td>
              <td className="px-5 py-4 text-end">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t('access.editUser', { name: user.userName })}
                  onClick={() => onEdit(user)}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                  {t('common.edit')}
                </Button>
              </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}
