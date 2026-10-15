import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createItemCodeGroup, deleteItemCodeGroup, listItemCodeGroups, updateItemCodeGroup } from '../api/item-code-groups.api'
import type { ItemCodeGroup, ItemCodeGroupInput } from '../api/item-code-groups.api'

const groupsKey = ['procurement', 'item-code-groups'] as const
export function useItemCodeGroups() {
  return useQuery({ queryKey: groupsKey, queryFn: listItemCodeGroups, retry: false, staleTime: 30_000, refetchInterval: 60_000 })
}
function useRefreshGroups() {
  const client = useQueryClient()
  return {
    insertOrUpdate(group: ItemCodeGroup) {
      client.setQueryData<ItemCodeGroup[]>(groupsKey, old =>
        [...(old ?? []).filter(entry => entry.id !== group.id), group].sort((a, b) => a.name.localeCompare(b.name)))
      void client.invalidateQueries({ queryKey: groupsKey })
    },
    remove(id: number) {
      client.setQueryData<ItemCodeGroup[]>(groupsKey, old => (old ?? []).filter(entry => entry.id !== id))
      void client.invalidateQueries({ queryKey: groupsKey })
    },
  }
}
export function useCreateItemCodeGroup() {
  const refresh = useRefreshGroups()
  return useMutation({ mutationFn: createItemCodeGroup, onSuccess: group => refresh.insertOrUpdate(group) })
}
export function useUpdateItemCodeGroup() {
  const refresh = useRefreshGroups()
  return useMutation({ mutationFn: ({ id, input }: { id: number; input: ItemCodeGroupInput & { rowVersion: string } }) => updateItemCodeGroup(id, input), onSuccess: group => refresh.insertOrUpdate(group) })
}
export function useDeleteItemCodeGroup() {
  const refresh = useRefreshGroups()
  return useMutation({ mutationFn: ({ id, rowVersion }: { id: number; rowVersion: string }) => deleteItemCodeGroup(id, rowVersion), onSuccess: (_result, input) => refresh.remove(input.id) })
}
