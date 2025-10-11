import { useQuery } from '@tanstack/react-query'
import { addonsAPI, groupsAPI } from '@/services/api'

export default function useAddonData(authed: boolean) {
  // Fetch addons
  const {
    data: addons,
    isLoading: addonsLoading,
    error: addonsError
  } = useQuery({
    queryKey: ['addons'],
    queryFn: () => addonsAPI.getAll(),
    retry: 1,
    enabled: authed,
  })

  // Fetch groups
  const {
    data: groups,
    isLoading: groupsLoading,
    error: groupsError
  } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsAPI.getAll(),
    retry: 1,
    enabled: authed,
  })

  return {
    addons,
    groups,
    isLoading: addonsLoading || groupsLoading,
    error: addonsError || groupsError
  }
}
