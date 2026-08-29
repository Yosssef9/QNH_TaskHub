import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { archiveList, createList, getLists, reorderLists, updateList } from '../api/lists.api'
import type { PersonalList } from '../types/list.types'

export const listsQueryKey = ['lists'] as const

export function useLists() {
  return useQuery({
    queryKey: listsQueryKey,
    queryFn: getLists,
    staleTime: 60_000,
  })
}

export function useCreateList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createList,
    onSuccess: (created) => {
      queryClient.setQueryData<PersonalList[]>(listsQueryKey, (current = []) => [
        ...current,
        created,
      ])
    },
  })
}

export function useUpdateList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateList,
    onSuccess: (updated) => {
      queryClient.setQueryData<PersonalList[]>(listsQueryKey, (current = []) =>
        current.map((list) => (list.id === updated.id ? updated : list)),
      )
    },
  })
}

export function useReorderLists() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reorderLists,
    onMutate: async (listIds) => {
      await queryClient.cancelQueries({ queryKey: listsQueryKey })

      const previous = queryClient.getQueryData<PersonalList[]>(listsQueryKey)

      if (previous) {
        const defaultLists = previous.filter((list) => list.isDefault)
        const customListsById = new Map(
          previous.filter((list) => !list.isDefault).map((list) => [list.id, list]),
        )

        const reordered = listIds.flatMap((id, index) => {
          const list = customListsById.get(id)
          return list ? [{ ...list, displayOrder: index + 1 }] : []
        })

        queryClient.setQueryData<PersonalList[]>(listsQueryKey, [...defaultLists, ...reordered])
      }

      return { previous }
    },
    onError: (_error, _listIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listsQueryKey, context.previous)
      }
    },
    onSuccess: (lists) => queryClient.setQueryData(listsQueryKey, lists),
  })
}

export function useArchiveList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: archiveList,
    onSuccess: (_result, listId) => {
      queryClient.setQueryData<PersonalList[]>(listsQueryKey, (current = []) =>
        current.filter((list) => list.id !== listId),
      )
    },
  })
}
