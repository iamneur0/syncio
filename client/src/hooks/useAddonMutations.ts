import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addonsAPI, type CreateAddonData } from '@/services/api'
import toast from 'react-hot-toast'

export default function useAddonMutations(queryClient: any) {
  // Create addon mutation
  const createAddonMutation = useMutation({
    mutationFn: (data: CreateAddonData) => addonsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Addon created successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to create addon'
      toast.error(message)
    }
  })

  // Delete addon mutation
  const deleteAddonMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => addonsAPI.delete(id),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success(`"${name}" deleted successfully`)
    },
    onError: (error: any, { name }) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to delete addon'
      toast.error(`Failed to delete "${name}": ${message}`)
    }
  })

  // Update addon mutation
  const updateAddonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => addonsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Addon updated successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to update addon'
      toast.error(message)
    }
  })

  // Reload addon mutation
  const reloadAddonMutation = useMutation({
    mutationFn: (id: string) => addonsAPI.reload(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Addon reloaded successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to reload addon'
      toast.error(message)
    }
  })

  // Reload all addons mutation
  const reloadAllMutation = useMutation({
    mutationFn: () => addonsAPI.reloadAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('All addons reloaded successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to reload addons'
      toast.error(message)
    }
  })

  return {
    createAddonMutation,
    deleteAddonMutation,
    updateAddonMutation,
    reloadAddonMutation,
    reloadAllMutation
  }
}
