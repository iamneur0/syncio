import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addonsAPI, type CreateAddonData } from '@/services/api'
import { invalidateAddonQueries } from '@/utils/queryUtils'
import { addonErrorHandlers } from '@/utils/errorUtils'
import { addonSuccessHandlers } from '@/utils/toastUtils'

export default function useAddonMutations(queryClient: any) {
  // Create addon mutation
  const createAddonMutation = useMutation({
    mutationFn: (data: CreateAddonData) => addonsAPI.create(data),
    onSuccess: () => {
      invalidateAddonQueries(queryClient)
      addonSuccessHandlers.create()
    },
    onError: addonErrorHandlers.create
  })

  // Delete addon mutation
  const deleteAddonMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => addonsAPI.delete(id),
    onSuccess: (_, { name }) => {
      invalidateAddonQueries(queryClient)
      addonSuccessHandlers.delete()
    },
    onError: addonErrorHandlers.delete
  })

  // Update addon mutation
  const updateAddonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => addonsAPI.update(id, data),
    onSuccess: () => {
      invalidateAddonQueries(queryClient)
      addonSuccessHandlers.update()
    },
    onError: addonErrorHandlers.update
  })

  // Reload addon mutation
  const reloadAddonMutation = useMutation({
    mutationFn: (id: string) => addonsAPI.reload(id),
    onSuccess: () => {
      invalidateAddonQueries(queryClient)
      addonSuccessHandlers.reload()
    },
    onError: addonErrorHandlers.reload
  })

  // Note: Bulk reload all addons is not supported by the API
  // Individual addon reload is available via reloadMutation

  return {
    createAddonMutation,
    deleteAddonMutation,
    updateAddonMutation,
    reloadAddonMutation
  }
}
