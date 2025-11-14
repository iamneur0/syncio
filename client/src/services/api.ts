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
    const response: AxiosResponse<any> = await api.post('/stremio/connect', payload)
    return response.data?.user || response.data
  },

  verifyAuthKey: async (payload: { authKey: string; username?: string; email?: string }): Promise<StremioAuthVerification> => {
    const response: AxiosResponse<StremioAuthVerification> = await api.post('/stremio/connect-authkey', payload)
    return response.data
  },

  // Update user
  update: async (id: string, userData: { username?: string; email?: string; password?: string; groupName?: string; groupId?: string }): Promise<User> => {
    const response: AxiosResponse<User> = await api.put(`/users/${id}`, userData)
    // Handle axios response wrapper
    if (response.data && typeof response.data === 'object' && (response.data as any).data) {
      return (response.data as any).data
    }
    return response.data
  },

  // Delete user
  delete: async (id: string): Promise<void> => {
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

  // Create a new invitation
  create: async (data: { maxUses?: number; expiresAt?: string; groupName?: string }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/invitations', data)
    return response.data
  },

  // Delete an invitation
  delete: async (id: string): Promise<void> => {
    await api.delete(`/invitations/${id}`)
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

  // Public: Check if invitation is active
  checkInvitation: async (inviteCode: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/invitations/public/${inviteCode}/check`)
    return response.data
  },

  // Public: Submit an invite request
  submitRequest: async (inviteCode: string, email: string, username: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/invitations/public/${inviteCode}/request`, { email, username })
    return response.data
  },

  // Public: Check request status
  checkStatus: async (inviteCode: string, email: string, username: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/invitations/public/${inviteCode}/status`, {
      params: { email, username }
    })
    return response.data
  },

  // Public: Generate OAuth link for accepted request
  generateOAuth: async (inviteCode: string, email: string, username: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/invitations/public/${inviteCode}/generate-oauth`, {
      email,
      username
    })
    return response.data
  },

  // Public: Complete OAuth and create user
  complete: async (inviteCode: string, email: string, username: string, authKey: string, groupName?: string): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/invitations/public/${inviteCode}/complete`, {
      email,
      username,
      authKey,
      groupName
    })
    return response.data
  },
}

// Export the axios instance for direct use if needed
export default api
