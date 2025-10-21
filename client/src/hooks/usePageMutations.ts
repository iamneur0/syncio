import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI, addonsAPI } from '@/services/api'
import { invalidateUserQueries, invalidateGroupQueries, invalidateAddonQueries } from '@/utils/queryUtils'
import { userErrorHandlers, groupErrorHandlers, addonErrorHandlers } from '@/utils/errorUtils'
import { userSuccessHandlers, groupSuccessHandlers, addonSuccessHandlers } from '@/utils/toastUtils'

export function useUserMutations() {
  const queryClient = useQueryClient()

  const createUserMutation = useMutation({
    mutationFn: usersAPI.create,
    onSuccess: () => {
      invalidateUserQueries(queryClient)
      userSuccessHandlers.create()
    },
    onError: userErrorHandlers.create
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => usersAPI.update(id, data),
    onSuccess: () => {
      invalidateUserQueries(queryClient)
      userSuccessHandlers.update()
    },
    onError: userErrorHandlers.update
  })

  const deleteUserMutation = useMutation({
    mutationFn: usersAPI.delete,
    onSuccess: () => {
      invalidateUserQueries(queryClient)
      userSuccessHandlers.delete()
    },
    onError: userErrorHandlers.delete
  })

  const syncUserMutation = useMutation({
    mutationFn: (id: string) => usersAPI.sync(id),
    onSuccess: () => {
      invalidateUserQueries(queryClient)
      userSuccessHandlers.sync()
    },
    onError: userErrorHandlers.sync
  })

  return {
    createUserMutation,
    updateUserMutation,
    deleteUserMutation,
    syncUserMutation
  }
}

export function useGroupMutations() {
  const queryClient = useQueryClient()

  const createGroupMutation = useMutation({
    mutationFn: groupsAPI.create,
    onSuccess: () => {
      invalidateGroupQueries(queryClient)
      groupSuccessHandlers.create()
    },
    onError: groupErrorHandlers.create
  })

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => groupsAPI.update(id, data),
    onSuccess: () => {
      invalidateGroupQueries(queryClient)
      // Also refresh all group details to update counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      groupSuccessHandlers.update()
    },
    onError: groupErrorHandlers.update
  })

  const deleteGroupMutation = useMutation({
    mutationFn: groupsAPI.delete,
    onSuccess: () => {
      invalidateGroupQueries(queryClient)
      // Also refresh all group details to update counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      groupSuccessHandlers.delete()
    },
    onError: groupErrorHandlers.delete
  })

  return {
    createGroupMutation,
    updateGroupMutation,
    deleteGroupMutation
  }
}

export function useAddonMutations() {
  const queryClient = useQueryClient()

  const createAddonMutation = useMutation({
    mutationFn: addonsAPI.create,
    onSuccess: () => {
      invalidateAddonQueries(queryClient)
      addonSuccessHandlers.create()
    },
    onError: addonErrorHandlers.create
  })

  const updateAddonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => addonsAPI.update(id, data),
    onSuccess: () => {
      invalidateAddonQueries(queryClient)
      addonSuccessHandlers.update()
    },
    onError: addonErrorHandlers.update
  })

  const deleteAddonMutation = useMutation({
    mutationFn: addonsAPI.delete,
    onSuccess: () => {
      invalidateAddonQueries(queryClient)
      addonSuccessHandlers.delete()
    },
    onError: addonErrorHandlers.delete
  })

  return {
    createAddonMutation,
    updateAddonMutation,
    deleteAddonMutation
  }
}
