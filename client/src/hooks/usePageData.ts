import { useQuery } from '@tanstack/react-query'
import { usersAPI, groupsAPI, addonsAPI } from '@/services/api'

export function useUsersData() {
  return useQuery({
    queryKey: ['users'],
    queryFn: usersAPI.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useGroupsData() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useAddonsData() {
  return useQuery({
    queryKey: ['addons'],
    queryFn: addonsAPI.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useGroupDetails(groupId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['groupDetails', groupId],
    queryFn: () => groupsAPI.getById(groupId!),
    enabled: enabled && !!groupId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

export function useUserDetails(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['userDetails', userId],
    queryFn: () => usersAPI.getById(userId!),
    enabled: enabled && !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}
