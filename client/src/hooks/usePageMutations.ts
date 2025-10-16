import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI, addonsAPI } from '@/services/api'
import toast from 'react-hot-toast'

export function useUserMutations() {
  const queryClient = useQueryClient()

  const createUserMutation = useMutation({
    mutationFn: usersAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create user')
    }
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => usersAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update user')
    }
  })

  const deleteUserMutation = useMutation({
    mutationFn: usersAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete user')
    }
  })

  const syncUserMutation = useMutation({
    mutationFn: (id: string) => usersAPI.sync(id),
    // mutationFn: usersAPI.sync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User synced successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to sync user')
    }
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
      queryClient.invalidateQueries({ queryKey: ['group'] })
      toast.success('Group created successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create group')
    }
  })

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => groupsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      // Also refresh all group details to update counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      toast.success('Group updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update group')
    }
  })

  const deleteGroupMutation = useMutation({
    mutationFn: groupsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      // Also refresh all group details to update counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      toast.success('Group deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete group')
    }
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
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Addon created successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Failed to create addon'
      toast.error(message)
    }
  })

  const updateAddonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => addonsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Addon updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update addon')
    }
  })

  const deleteAddonMutation = useMutation({
    mutationFn: addonsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Addon deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete addon')
    }
  })

  return {
    createAddonMutation,
    updateAddonMutation,
    deleteAddonMutation
  }
}
