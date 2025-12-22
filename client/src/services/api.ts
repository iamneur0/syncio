import axios, { AxiosResponse } from 'axios'

// API Configuration - use Next.js proxy for browser requests
const API_BASE_URL = typeof window !== 'undefined' 
  ? '/api'  // Use Next.js proxy in browser
  : 'http://localhost:4000/api'  // Direct URL for SSR

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Authorization comes from httpOnly cookie; no header injection needed
api.interceptors.request.use((config) => {
  try {
    if (typeof window !== 'undefined' && config.method && config.method.toUpperCase() !== 'GET') {
      // Read CSRF token cookie and send via header
      const cookies = document.cookie?.split(';') || []
      const find = (name: string) => {
        const key = `${name}=`
        const entry = cookies.find(c => c.trim().startsWith(key))
        return entry ? decodeURIComponent(entry.split('=')[1]) : ''
      }
      const csrf = find('__Host-sfm_csrf') || find('sfm_csrf')
      if (csrf) {
        (config.headers as any)['X-CSRF-Token'] = csrf
      }
    }
  } catch {}
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only log out on actual authentication errors, not on Stremio connection errors
    const isStremioEndpoint = error.config?.url?.includes('/stremio/') || 
                             error.config?.url?.includes('/stremio-addons') ||
                             error.config?.url?.includes('/connect-stremio') ||
                             error.config?.url?.includes('/clear-stremio-credentials') ||
                             error.config?.url?.includes('/stremio-credentials')
    
    // Admin auth: 401 errors
    if (error.response?.status === 401 && !isStremioEndpoint) {
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: false } }))
        } catch {}
      }
    }
    
    return Promise.reject(error)
  }
)

// Types
export interface User {
  id: string
  email: string
  username: string
  status: 'active' | 'inactive'
  groups: string[]
  isActive: boolean
  colorIndex?: number
}

export interface Group {
  id: string
  name: string
  description: string
  users: number
  addons: number
  restrictions: 'none' | 'low' | 'medium' | 'high'
  colorIndex: number
  created: string
  isActive: boolean
}

export interface Addon {
  id: string
  name: string
  description: string
  url: string
  version?: string
  iconUrl?: string
  status: 'active' | 'inactive'
  users: number
  groups: number
}

export interface CreateUserData {
  email?: string
  password?: string
  authKey?: string
  username?: string
  groupName?: string
  colorIndex?: number
}

export interface StremioAuthVerification {
  authKey: string
  user: {
    username: string
    email: string
  }
}

export interface CreateGroupData {
  name: string
  description: string
  restrictions: 'none' | 'low' | 'medium' | 'high'
  colorIndex: number
  userIds?: string[]
  addonIds?: string[]
}

export interface CreateAddonData {
  url: string
  name?: string
  description?: string
  groupIds?: string[]
  manifestData?: any
}

export interface UpdateAddonData {
  name?: string
  description?: string
  version?: string | null
  iconUrl?: string | null
  url?: string
  groupIds?: string[]
  resources?: any[]
  catalogs?: any[]
}

// API Functions

// Health Check
export const healthCheck = async (): Promise<{ status: string; message: string; timestamp: string }> => {
  const response = await api.get(`/health`)
  return response.data
}

// Users API
export const usersAPI = {
  // Check if user exists by email or username
  check: async (email?: string, username?: string): Promise<{ exists: boolean; conflicts: { email?: boolean; username?: boolean } }> => {
    const params = new URLSearchParams()
    if (email) params.append('email', email)
    if (username) params.append('username', username)
    const response: AxiosResponse<{ exists: boolean; conflicts: { email?: boolean; username?: boolean } }> = await api.get(`/users/check?${params.toString()}`)
    return response.data
  },

  // Get all users
  getAll: async (): Promise<User[]> => {
    const response: AxiosResponse<User[]> = await api.get('/users')
    return response.data
  },

  // Get user by ID with detailed information
  getById: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/users/${id}`)
    // Handle axios response wrapper
    if (response.data && typeof response.data === 'object' && response.data.data) {
      return response.data.data
    }
    return response.data
  },

  // Get user sync status (lightweight)
  getSyncStatus: async (id: string, groupId?: string, unsafeMode?: boolean): Promise<any> => {
    const params = new URLSearchParams()
    if (groupId) params.append('groupId', groupId)
    if (unsafeMode) params.append('unsafe', 'true')
    const url = `/users/${id}/sync-status${params.toString() ? '?' + params.toString() : ''}`
    const response: AxiosResponse<any> = await api.get(url)
    return response.data
  },

  // Sync one user via the dedicated endpoint
  sync: async (id: string, excludedManifestUrls: string[] = [], unsafeMode?: boolean): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      `/users/${id}/sync`,
      { excludedManifestUrls, unsafe: unsafeMode }
    )
    return response.data
  },

  // Reload all group addons for a user (calls reloadGroupAddons on user's group)
  reloadUserAddons: async (id: string): Promise<any> => {
    // Get user details to find their group ID
    const userResponse = await api.get(`/users/${id}`)
    const user = userResponse.data
    
    // Find the group ID from user's groups
    const groupId = user?.groups?.[0]?.id
    
    if (!groupId) {
      return Promise.resolve({ 
        message: 'User not in any group',
        reloadedCount: 0,
        failedCount: 0,
        total: 0
      })
    }
    
    // Call reloadGroupAddons on the user's group
    const response = await api.post(`/groups/${groupId}/reload-addons`)
    return response.data
  },

  // Create new user (via Stremio connect endpoint)
  create: async (userData: CreateUserData): Promise<User> => {
    if (userData.authKey) {
      const payload: any = {
        authKey: userData.authKey,
        username: userData.username,
        email: userData.email,
        groupName: userData.groupName,
        colorIndex: userData.colorIndex,
        create: true,
      }
      const response: AxiosResponse<any> = await api.post('/stremio/connect-authkey', payload)
      return response.data?.user || response.data
    }

    if (!userData.email || !userData.password) {
      throw new Error('Email and password are required to create a user')
    }

    const payload: any = {
      email: userData.email,
      password: userData.password,
      username: userData.username,
      groupName: userData.groupName,
      colorIndex: userData.colorIndex,
    }

    // If registerIfMissing is true, call the register endpoint directly instead of connect
    const shouldRegister = (userData as any).registerIfMissing === true
    if (shouldRegister) {
      const response: AxiosResponse<any> = await api.post('/stremio/register', payload)
      return response.data?.user || response.data
    }

    // Otherwise, call connect endpoint with registerIfMissing: false to prevent auto-registration
    payload.registerIfMissing = false
    const response: AxiosResponse<any> = await api.post('/stremio/connect', payload)
    return response.data?.user || response.data
  },

  verifyAuthKey: async (payload: { authKey: string; username?: string; email?: string }): Promise<StremioAuthVerification> => {
    const response: AxiosResponse<StremioAuthVerification> = await api.post('/stremio/connect-authkey', payload)
    return response.data
  },

  // Update user
  update: async (id: string, userData: { username?: string; email?: string; password?: string; groupName?: string; groupId?: string; expiresAt?: string | null; discordWebhookUrl?: string | null; discordUserId?: string | null }): Promise<User> => {
    const response: AxiosResponse<User> = await api.put(`/users/${id}`, userData)
    // Handle axios response wrapper
    if (response.data && typeof response.data === 'object' && (response.data as any).data) {
      return (response.data as any).data
    }
    return response.data
  },

  // Delete user
  delete: async (id: string, options?: { clearAddons?: boolean }): Promise<void> => {
    // If clearAddons is requested, clear addons first, then delete user
    // This reuses the same pattern as the opt-out endpoint
    if (options?.clearAddons) {
      try {
        // Get user to check if they need to be enabled
        const user = await usersAPI.getById(id)
        let wasDisabled = false
        
        // Temporarily enable user if they're disabled (required for addon clearing)
        if (user && !user.isActive && user.hasStremioConnection) {
          wasDisabled = true
          await usersAPI.enable(id)
        }
        
        try {
          await usersAPI.clearStremioAddons(id)
        } finally {
          // Re-disable user if we enabled them (before deletion)
          if (wasDisabled) {
            try {
              await usersAPI.disable(id)
            } catch (e) {
              // Ignore disable errors, we're about to delete anyway
            }
          }
        }
      } catch (error: any) {
        const errorMsg = error?.response?.data?.message || error?.message || 'Failed to clear addons'
        console.error('Error clearing addons before deletion:', error)
        // Continue with deletion even if addon clearing fails
        // The user will be deleted regardless
      }
    }
    await api.delete(`/users/${id}`)
  },

  // Search users
  search: async (query: string): Promise<User[]> => {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    
    const response: AxiosResponse<User[]> = await api.get(`/users/search?${params}`)
    return response.data
  },

  // Sync all enabled users
  syncAll: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/users/sync-all')
    return response.data
  },

  // Send invite webhook (generated or summary)
  sendInviteWebhook: async (data: { type: 'generated' | 'summary', invites?: Array<{ code: string; link: string }>, createdUsers?: Array<{ username?: string; email?: string; code?: string; link?: string; synced?: boolean }>, totalInvites: number, groupName?: string }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/users/invite-webhook', data)
    return response.data
  },

  // Enable user
  enable: async (id: string): Promise<User> => {
    const response: AxiosResponse<User> = await api.put(`/users/${id}/enable`)
    return response.data
  },

  // Disable user
  disable: async (id: string): Promise<User> => {
    const response: AxiosResponse<User> = await api.put(`/users/${id}/disable`)
    return response.data
  },

  // Get Stremio addons for user
  getStremioAddons: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/users/${id}/stremio-addons`)
    return response.data
  },

  // Get desired addons for user (group addons + protected addons)
  getDesiredAddons: async (id: string, unsafe = false): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/users/${id}/desired-addons?unsafe=${unsafe}`)
    return response.data
  },

  // Get group addons for user
  getGroupAddons: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/users/${id}/group-addons`)
    return response.data
  },

  // Get user addons (raw Stremio API response)
  getUserAddons: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/users/${id}/user-addons`)
    return response.data
  },

  // Get user's library/watch history
  getLibrary: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/users/${id}/library`)
    return response.data
  },

  // Get combined library/watch history from all users (for Activity page)
  getActivityLibrary: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/users/activity/library`)
    return response.data
  },

  // Get metrics data
  getMetrics: async (period: string = '30d'): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/users/metrics?period=${period}`)
    return response.data
  },

  // Get watch time for a user
  getWatchTime: async (userId: string, params?: { startDate?: string; endDate?: string; itemId?: string; itemType?: string; groupBy?: string }): Promise<any> => {
    const queryParams = new URLSearchParams()
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    if (params?.itemId) queryParams.append('itemId', params.itemId)
    if (params?.itemType) queryParams.append('itemType', params.itemType)
    if (params?.groupBy) queryParams.append('groupBy', params.groupBy)
    const response: AxiosResponse<any> = await api.get(`/users/${userId}/watch-time?${queryParams.toString()}`)
    return response.data
  },

  // Get top items for a user
  getTopItems: async (userId: string, params?: { period?: string; itemType?: string; limit?: number }): Promise<any> => {
    const queryParams = new URLSearchParams()
    if (params?.period) queryParams.append('period', params.period)
    if (params?.itemType) queryParams.append('itemType', params.itemType)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    const response: AxiosResponse<any> = await api.get(`/users/${userId}/top-items?${queryParams.toString()}`)
    return response.data
  },

  // Get watch streaks for a user
  getStreaks: async (userId: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/users/${userId}/streaks`)
    return response.data
  },

  // Get watch velocity for a user
  getVelocity: async (userId: string, params?: { itemId?: string; period?: string }): Promise<any> => {
    const queryParams = new URLSearchParams()
    if (params?.itemId) queryParams.append('itemId', params.itemId)
    if (params?.period) queryParams.append('period', params.period)
    const response: AxiosResponse<any> = await api.get(`/users/${userId}/velocity?${queryParams.toString()}`)
    return response.data
  },

  // Delete a library item from a user's Stremio library
  deleteLibraryItem: async (userId: string, itemId: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.delete(`/users/${userId}/library/${encodeURIComponent(itemId)}`)
    return response.data
  },

  // Get like/love status for a media item in Stremio
  getLikeStatus: async (userId: string, mediaId: string, mediaType: 'series' | 'movie'): Promise<{ status: 'liked' | 'loved' | null }> => {
    const response: AxiosResponse<any> = await api.get(`/users/${userId}/status`, {
      params: { mediaId, mediaType }
    })
    return response.data
  },

  // Update like/love status for a media item in Stremio
  // status: 'liked', 'loved', or null to unlike/unlove
  updateLikeStatus: async (userId: string, mediaId: string, mediaType: 'series' | 'movie', status: 'liked' | 'loved' | null): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/users/${userId}/statusUpdate`, {
      mediaId,
      mediaType,
      status
    })
    return response.data
  },

  // Toggle library status (add/remove) for selected items
  toggleLibraryItems: async (userId: string, items: Array<{ itemId: string; itemType: 'series' | 'movie'; itemName: string; poster?: string; addToLibrary: boolean }>): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/users/${userId}/library/toggle`, {
      items
    })
    return response.data
  },

  // Shares API
  getShares: async (userId: string): Promise<{ sent: any[]; received: any[] }> => {
    const response: AxiosResponse<{ sent: any[]; received: any[] }> = await api.get(`/users/${userId}/shares`)
    return response.data
  },

  getReceivedShares: async (userId: string): Promise<{ received: any[] }> => {
    const response: AxiosResponse<{ received: any[] }> = await api.get(`/users/${userId}/shares/received`)
    return response.data
  },

  getGroupMembers: async (userId: string): Promise<{ members: any[] }> => {
    const response: AxiosResponse<{ members: any[] }> = await api.get(`/users/${userId}/shares/group-members`)
    return response.data
  },

  shareItems: async (userId: string, items: Array<{ itemId: string; itemName?: string; itemType?: string; poster?: string }>, targetUserIds: string[]): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/users/${userId}/shares`, {
      items,
      targetUserIds
    })
    return response.data
  },

  removeShare: async (userId: string, shareId: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.delete(`/users/${userId}/shares/${shareId}`)
    return response.data
  },

  markShareAsViewed: async (userId: string, shareId: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.put(`/users/${userId}/shares/${shareId}/viewed`)
    return response.data
  },

  // Update user's activity visibility
  updateActivityVisibility: async (userId: string, visibility: 'public' | 'private'): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(`/users/${userId}/activity-visibility`, {
      activityVisibility: visibility
    })
    return response.data
  },

  // Backup user's library (download as JSON file)
  backupLibrary: async (userId: string): Promise<void> => {
    const response: AxiosResponse<Blob> = await api.get(`/users/${userId}/library/backup`, {
      responseType: 'blob'
    })
    
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition']
    let filename = `Stremio-Library-${userId}.json`
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/i)
      if (filenameMatch) {
        filename = filenameMatch[1]
      }
    }
    
    // Create download link and trigger download
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  // Remove a Stremio addon from user's account
  removeStremioAddon: async (id: string, addonName: string, unsafe: boolean = false): Promise<any> => {
    const response: AxiosResponse<any> = await api.delete(`/users/${id}/stremio-addons/${encodeURIComponent(addonName)}${unsafe ? '?unsafe=true' : ''}`)
    return response.data
  },

  // Clear all Stremio addons from a user's account
  clearStremioAddons: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/users/${id}/stremio-addons/clear`)
    return response.data
  },

  // Reorder Stremio addons for a user (by manifest.name)
  reorderStremioAddons: async (id: string, orderedNames: string[]): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/users/${id}/stremio-addons/reorder`, { orderedNames })
    return response.data
  },

  // Import user addons to a new group
  importUserAddons: async (id: string): Promise<any> => {
    // Fetch live addons from Stremio for this user first
    const stremioResponse: AxiosResponse<any> = await api.get(`/users/${id}/stremio-addons`)
    const addons: any[] = Array.isArray(stremioResponse.data?.addons)
      ? stremioResponse.data.addons
      : []

    // Post the collected addons to the import endpoint
    const response: AxiosResponse<any> = await api.post(`/users/${id}/import-addons`, { addons })
    return response.data
  },

  // Update user excluded addons
  updateExcludedAddons: async (id: string, excludedAddons: string[]): Promise<any> => {
    const response: AxiosResponse<any> = await api.put(`/users/${id}/excluded-addons`, { excludedAddons })
    return response.data
  },

  // Update user protected addons
  updateProtectedAddons: async (id: string, protectedAddons: string[]): Promise<any> => {
    const response: AxiosResponse<any> = await api.put(`/users/${id}/protected-addons`, { protectedAddons })
    return response.data
  },

  // Toggle protect status for a single addon (by name)
  toggleProtectAddon: async (id: string, name: string, unsafe: boolean = false): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/users/${id}/protect-addon?unsafe=${unsafe}`, { name })
    return response.data
  },

  // Reconnect user with new Stremio credentials
  reconnectStremio: async (userData: { username: string; email: string; password: string }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/stremio/connect', userData)
    return response.data
  },
}

// Groups API
export const groupsAPI = {
  // Get all groups
  getAll: async (): Promise<Group[]> => {
    const response: AxiosResponse<Group[]> = await api.get('/groups')
    return response.data
  },

  // Get group by ID
  getById: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/groups/${id}`)
    // Handle axios response wrapper
    if (response.data && typeof response.data === 'object' && response.data.group) {
      return response.data
    }
    return response.data
  },

  // Create new group
  create: async (groupData: CreateGroupData): Promise<Group> => {
    const response: AxiosResponse<Group> = await api.post('/groups', groupData)
    return response.data
  },

  // Update group
  update: async (id: string, groupData: Partial<CreateGroupData>): Promise<Group> => {
    const response: AxiosResponse<Group> = await api.put(`/groups/${id}`, groupData)
    return response.data
  },

  // Delete group
  delete: async (id: string): Promise<void> => {
    await api.delete(`/groups/${id}`)
  },

  // Reorder addons in group (try legacy alias first for compatibility, then canonical path)
  reorderAddons: async (id: string, orderedAddonIds: string[]): Promise<void> => {
    try {
      await api.post(`/groups/${id}/reorder-addons`, { orderedAddonIds })
    } catch (e: any) {
      await api.post(`/groups/${id}/addons/reorder`, { orderedAddonIds })
    }
  },

  // Get aggregated group sync status (includes per-user statuses)
  getSyncStatus: async (id: string): Promise<{ groupStatus: string; userStatuses: Array<{ userId: string; status: string }> }> => {
    const res: AxiosResponse<any> = await api.get(`/groups/${id}/sync-status`)
    return res.data
  },

  // Search groups
  search: async (query: string, restriction?: string): Promise<Group[]> => {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    if (restriction && restriction !== 'all') params.append('restriction', restriction)
    
    const response: AxiosResponse<Group[]> = await api.get(`/groups/search?${params}`)
    return response.data
  },

  // Enable group
  enable: async (id: string): Promise<Group> => {
    const response: AxiosResponse<Group> = await api.put(`/groups/${id}/enable`)
    return response.data
  },

  // Disable group
  disable: async (id: string): Promise<Group> => {
    const response: AxiosResponse<Group> = await api.put(`/groups/${id}/disable`)
    return response.data
  },

  // Add user to group
  addUser: async (groupId: string, userId: string): Promise<void> => {
    await api.post(`/groups/${groupId}/users/${userId}`)
  },

  // Remove user from group
  removeUser: async (groupId: string, userId: string): Promise<void> => {
    await api.delete(`/groups/${groupId}/users/${userId}`)
  },

  // Add addon to group
  addAddon: async (groupId: string, addonId: string): Promise<void> => {
    await api.post(`/groups/${groupId}/addons/${addonId}`)
  },

  // Remove addon from group
  removeAddon: async (groupId: string, addonId: string): Promise<void> => {
    await api.delete(`/groups/${groupId}/addons/${addonId}`)
  },

  // Sync group
  sync: async (id: string, excludedManifestUrls: string[] = [], syncMode: 'normal' | 'advanced' = 'normal', unsafeMode?: boolean): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      `/groups/${id}/sync`, 
      { excludedManifestUrls, unsafe: unsafeMode },
      { headers: { 'x-sync-mode': syncMode } }
    )
    return response.data
  },

  // Reload group addons
  reloadGroupAddons: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/groups/${id}/reload-addons`)
    return response.data
  },

  // Sync all groups
  syncAll: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/groups/sync-all')
    return response.data
  },

  // Get group addons directly
  getGroupAddons: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/groups/${id}/addons`)
    return response.data
  },

  // Clone group
  clone: async (id: string): Promise<Group> => {
    const response: AxiosResponse<{ group: Group }> = await api.post('/groups/clone', { originalGroupId: id })
    return response.data.group
  },

  // Update activity visibility
  updateActivityVisibility: async (id: string, activityVisibility: 'public' | 'private'): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(`/groups/${id}/activity-visibility`, { activityVisibility })
    return response.data
  },

}

// Addons API
export const addonsAPI = {
  // Get all addons
  getAll: async (): Promise<Addon[]> => {
    const response: AxiosResponse<any> = await api.get('/addons')
    // Be resilient to different response wrappers
    const data = response.data
    if (Array.isArray(data)) return data as Addon[]
    if (data && Array.isArray(data.addons)) return data.addons as Addon[]
    if (data && data.data && Array.isArray(data.data)) return data.data as Addon[]
    return []
  },

  // Get addon by ID
  getById: async (id: string): Promise<Addon> => {
    const response: AxiosResponse<Addon> = await api.get(`/addons/${id}`)
    return response.data
  },

  // Create new addon
  create: async (addonData: CreateAddonData): Promise<Addon> => {
    const response: AxiosResponse<Addon> = await api.post('/addons', addonData)
    return response.data
  },

  // Update addon
  update: async (id: string, addonData: UpdateAddonData): Promise<Addon> => {
    const response: AxiosResponse<Addon> = await api.put(`/addons/${id}`, addonData)
    return response.data
  },

  // Enable addon
  enable: async (id: string): Promise<Addon> => {
    const response: AxiosResponse<Addon> = await api.put(`/addons/${id}/enable`)
    return response.data
  },

  // Disable addon (soft)
  disable: async (id: string): Promise<Addon> => {
    const response: AxiosResponse<Addon> = await api.put(`/addons/${id}/disable`)
    return response.data
  },

  // Delete addon (hard)
  delete: async (id: string): Promise<void> => {
    await api.delete(`/addons/${id}`)
  },

  // Reload addon manifest
  reload: async (id: string): Promise<Addon> => {
    const response: AxiosResponse<{ addon: Addon }> = await api.post(`/addons/${id}/reload`)
    return response.data.addon
  },

  // Clone addon
  clone: async (id: string): Promise<Addon> => {
    const response: AxiosResponse<{ addon: Addon }> = await api.post(`/addons/${id}/clone`)
    return response.data.addon
  },

  // Search addons
  search: async (query: string, tag?: string): Promise<Addon[]> => {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    if (tag && tag !== 'all') params.append('tag', tag)
    
    const response: AxiosResponse<Addon[]> = await api.get(`/addons/search?${params}`)
    return response.data
  },

  // Reload all addons
  reloadAll: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/addons/reload-all')
    return response.data
  },
}

// Stremio API
export const stremioAPI = {
  // Connect to Stremio
  connect: async (userData: { email: string; password: string; username?: string; groupName?: string }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/stremio/connect', userData)
    return response.data
  },

  // Validate Stremio credentials
  validate: async (credentials: { email: string; password: string }): Promise<{ valid: boolean; error?: string }> => {
    const response: AxiosResponse<{ valid: boolean; error?: string }> = await api.post('/stremio/validate', credentials)
    return response.data
  },
}

// Public Auth API (for AUTH_ENABLED=true)
export const publicAuthAPI = {
  register: async (payload: { uuid: string; password: string }): Promise<{ message: string; account: any }> => {
    const res: AxiosResponse<{ message: string; account: any }> = await api.post('/public-auth/register', payload)
    return res.data
  },
  loginWithStremio: async (payload: { authKey: string }): Promise<{ message: string; account: any }> => {
    const res: AxiosResponse<{ message: string; account: any }> = await api.post('/public-auth/stremio-login', payload)
    return res.data
  },
  login: async (payload: { uuid: string; password: string }): Promise<{ message: string; account: any }> => {
    const res: AxiosResponse<{ message: string; account: any }> = await api.post('/public-auth/login', payload)
    return res.data
  },
  privateLogin: async (payload: { username: string; password: string }): Promise<{ message: string; account: any }> => {
    const res: AxiosResponse<{ message: string; account: any }> = await api.post('/public-auth/private-login', payload)
    return res.data
  },
  me: async (): Promise<any> => {
    const res: AxiosResponse<any> = await api.get('/public-auth/me')
    return res.data
  },
  generateUuid: async (): Promise<{ success: boolean; uuid: string; message?: string }> => {
    const res: AxiosResponse<{ success: boolean; uuid: string; message?: string }> = await api.get('/public-auth/generate-uuid')
    return res.data
  },
  logout: async (): Promise<void> => {
    await api.post('/public-auth/logout')
  },
  unlinkStremio: async (): Promise<{ message: string }> => {
    const res: AxiosResponse<{ message: string }> = await api.post('/public-auth/unlink-stremio')
    return res.data
  }
}

// Invitations API
export const invitationsAPI = {
  // Get all invitations for the account
  getAll: async (): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get('/invitations')
    return response.data
  },

  // Get a single invitation by ID
  getById: async (id: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/invitations/${id}`)
    return response.data
  },

  // Create a new invitation
  create: async (data: { maxUses?: number; expiresAt?: string; groupName?: string; syncOnJoin?: boolean; membershipDurationDays?: number | null }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/invitations', data)
    return response.data
  },

  // Delete an invitation
  delete: async (id: string): Promise<void> => {
    await api.delete(`/invitations/${id}`)
  },

  // Update an invitation
  update: async (id: string, data: { groupName?: string | null; syncOnJoin?: boolean; expiresAt?: string | null; membershipDurationDays?: number | null; createdAt?: string }): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(`/invitations/${id}`, data)
    return response.data
  },

  // Toggle invitation status (enable/disable)
  toggleStatus: async (id: string, isActive: boolean): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(`/invitations/${id}/toggle-status`, { isActive })
    return response.data
  },

  // Get requests for an invitation
  getRequests: async (invitationId: string): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get(`/invitations/${invitationId}/requests`)
    return response.data
  },

  // Accept an invite request
  acceptRequest: async (requestId: string, groupName?: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/invitations/requests/${requestId}/accept`, { groupName })
    return response.data
  },

  // Reject an invite request
  rejectRequest: async (requestId: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/invitations/requests/${requestId}/reject`)
    return response.data
  },
  undoRejection: async (requestId: string, groupName?: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/invitations/requests/${requestId}/undo-rejection`, { groupName })
    return response.data
  },
  clearOAuth: async (requestId: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/invitations/requests/${requestId}/clear-oauth`)
    return response.data
  },

  // Delete an invitation request
  deleteRequest: async (requestId: string): Promise<void> => {
    await api.delete(`/invitations/requests/${requestId}`)
  },

  // Public: Check if invitation is active
  checkInvitation: async (inviteCode: string): Promise<any> => {
    const response = await fetch(`/invite/${inviteCode}/check`, {
      method: 'GET',
      credentials: 'include'
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      const err: any = new Error(error.error || `HTTP ${response.status}`)
      err.response = { status: response.status, data: error }
      throw err
    }
    return response.json()
  },

  // Public: Submit an invite request
  submitRequest: async (inviteCode: string, email: string, username: string): Promise<any> => {
    const response = await fetch(`/invite/${inviteCode}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, username })
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      const err: any = new Error(error.error || `HTTP ${response.status}`)
      err.response = { status: response.status, data: error }
      throw err
    }
    return response.json()
  },

  // Public: Check request status
  checkStatus: async (inviteCode: string, email: string, username: string): Promise<any> => {
    const params = new URLSearchParams({ email, username })
    const response = await fetch(`/invite/${inviteCode}/status?${params}`, {
      method: 'GET',
      credentials: 'include'
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      const err: any = new Error(error.error || `HTTP ${response.status}`)
      err.response = { status: response.status, data: error }
      throw err
    }
    return response.json()
  },

  // Public: Get Stremio user info from authKey
  getUserInfo: async (inviteCode: string, authKey: string, username?: string, email?: string): Promise<any> => {
    const response = await fetch(`/invite/${inviteCode}/user-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ authKey, username, email })
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      const err: any = new Error(error.error || `HTTP ${response.status}`)
      err.response = { status: response.status, data: error }
      throw err
    }
    return response.json()
  },

  // Public: Generate OAuth link for accepted request
  generateOAuth: async (inviteCode?: string, email?: string, username?: string): Promise<any> => {
    // If no inviteCode provided, use the simple delete endpoint
    if (!inviteCode) {
      const response = await fetch(`/invite/generate-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })
      
      const contentType = response.headers.get('content-type')
      const isJson = contentType && contentType.includes('application/json')
      
      if (!response.ok) {
        let error: any
        if (isJson) {
          try {
            error = await response.json()
          } catch {
            error = { error: `HTTP ${response.status}` }
          }
        } else {
          const text = await response.text()
          error = { error: text || `HTTP ${response.status}` }
        }
        const err: any = new Error(error.error || error.details || `HTTP ${response.status}`)
        err.response = { status: response.status, data: error }
        throw err
      }
      
      if (!isJson) {
        const text = await response.text()
        throw new Error(`Expected JSON response but got: ${text.substring(0, 100)}`)
      }
      
      try {
        return await response.json()
      } catch (parseError) {
        const text = await response.text()
        throw new Error(`Failed to parse JSON response: ${text.substring(0, 100)}`)
      }
    }
    
    // Otherwise use the invite-specific endpoint
    const response = await fetch(`/invite/${inviteCode}/generate-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, username })
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      const err: any = new Error(error.error || `HTTP ${response.status}`)
      err.response = { status: response.status, data: error }
      throw err
    }
    return response.json()
  },

  // Public: Complete OAuth and create user
  complete: async (inviteCode: string, email: string, username: string, authKey: string, groupName?: string): Promise<any> => {
    const response = await fetch(`/invite/${inviteCode}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, username, authKey, groupName })
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      const err: any = new Error(error.error || `HTTP ${response.status}`)
      err.response = { status: response.status, data: error }
      throw err
    }
    return response.json()
  },

  // Public: Delete user via OAuth
  deleteUser: async (authKey: string): Promise<any> => {
    const response = await fetch(`/invite/delete-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ authKey })
    })
    
    const contentType = response.headers.get('content-type')
    const isJson = contentType && contentType.includes('application/json')
    
    if (!response.ok) {
      let error: any
      if (isJson) {
        try {
          error = await response.json()
        } catch {
          error = { error: `HTTP ${response.status}` }
        }
      } else {
        const text = await response.text()
        error = { error: text || `HTTP ${response.status}` }
      }
      const err: any = new Error(error.error || error.details || `HTTP ${response.status}`)
      err.response = { status: response.status, data: error }
      throw err
    }
    
    if (!isJson) {
      const text = await response.text()
      throw new Error(`Expected JSON response but got: ${text.substring(0, 100)}`)
    }
    
    try {
      return await response.json()
    } catch (parseError) {
      const text = await response.text()
      throw new Error(`Failed to parse JSON response: ${text.substring(0, 100)}`)
    }
  },
}

// Public Library API (no auth required)
export const publicLibraryAPI = {
  // Generate OAuth link
  generateOAuth: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/public-library/generate-oauth`)
    return response.data
  },
  
  // Poll for OAuth completion
  pollOAuth: async (code: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/public-library/poll-oauth`, { code })
    return response.data
  },
  
  // Authenticate with OAuth and get/create user
  authenticate: async (authKey: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/public-library/authenticate`, { authKey })
    return response.data
  },

  // Validate user session (check if user exists, is active, and is in a group)
  validate: async (authKey?: string, userId?: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/public-library/validate`, { authKey, userId })
    return response.data
  },

  // Get current user's info (including activityVisibility)
  getUserInfo: async (userId?: string, authKey?: string): Promise<any> => {
    const params = new URLSearchParams()
    if (userId) params.append('userId', userId)
    if (authKey) params.append('authKey', authKey)
    const response: AxiosResponse<any> = await api.get(`/public-library/user-info?${params.toString()}`)
    return response.data
  },

  // Update current user's activity visibility
  updateActivityVisibility: async (userId: string, authKey: string, activityVisibility: 'public' | 'private'): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(`/public-library/activity-visibility`, {
      userId,
      authKey,
      activityVisibility
    })
    return response.data
  },
  
  // Get user's library
  getLibrary: async (userId: string, requestingUserId?: string): Promise<any> => {
    const params = new URLSearchParams({ userId })
    if (requestingUserId) {
      params.append('requestingUserId', requestingUserId)
    }
    const response: AxiosResponse<any> = await api.get(`/public-library/library?${params.toString()}`)
    return response.data
  },
  
  // Add addon and mark as protected
  addAddon: async (userId: string, addonUrl: string, manifestData?: any): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/public-library/add-addon`, { userId, addonUrl, manifestData })
    return response.data
  },

  // Get user's addons (group addons and current Stremio addons)
  getAddons: async (userId: string, authKey?: string): Promise<any> => {
    const params = new URLSearchParams()
    params.append('userId', userId)
    if (authKey) params.append('authKey', authKey)
    const response: AxiosResponse<any> = await api.get(`/public-library/addons?${params.toString()}`)
    return response.data
  },

  // Exclude addon from group
  excludeAddon: async (userId: string, addonId: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/public-library/exclude-addon', { userId, addonId })
    return response.data
  },

  // Include addon back in group (remove exclusion)
  includeAddon: async (userId: string, addonId: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/public-library/include-addon', { userId, addonId })
    return response.data
  },

  // Delete library item
  deleteLibraryItem: async (userId: string, itemId: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.delete(`/public-library/library/${encodeURIComponent(itemId)}?userId=${userId}`)
    return response.data
  },

  // Toggle protect status for a single addon (by name)
  toggleProtectAddon: async (userId: string, name: string, unsafe: boolean = false): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/public-library/protect-addon${unsafe ? '?unsafe=true' : ''}`, { userId, name })
    return response.data
  },

  // Remove addon from Stremio
  removeStremioAddon: async (userId: string, addonName: string, unsafe: boolean = false): Promise<any> => {
    const response: AxiosResponse<any> = await api.delete(`/public-library/stremio-addons/${encodeURIComponent(addonName)}?userId=${userId}${unsafe ? '&unsafe=true' : ''}`)
    return response.data
  },
}

// Export the axios instance for direct use if needed
export default api
