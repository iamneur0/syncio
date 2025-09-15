import axios, { AxiosResponse } from 'axios'

// API Configuration - use Next.js proxy for browser requests
const API_BASE_URL = typeof window !== 'undefined' 
  ? '/api'  // Use Next.js proxy in browser
  : 'http://localhost:4000/api'  // Direct URL for SSR

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login if needed
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token')
        // Could redirect to login here if we had auth
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
  firstName?: string
  lastName?: string
  role: 'admin' | 'parent' | 'child'
  status: 'active' | 'inactive'
  groups: string[]
  createdAt: string
  updatedAt: string
}

export interface Group {
  id: string
  name: string
  description: string
  members: number
  addons: number
  restrictions: 'none' | 'low' | 'medium' | 'high'
  colorIndex: number
  created: string
}

export interface Addon {
  id: string
  name: string
  description: string
  url: string
  version?: string
  tags: string
  iconUrl?: string
  status: 'active' | 'inactive'
  users: number
  groups: number
}

export interface CreateUserData {
  email: string
  username: string
  firstName?: string
  lastName?: string
  role: 'admin' | 'parent' | 'child'
}

export interface CreateGroupData {
  name: string
  description: string
  restrictions: 'none' | 'low' | 'medium' | 'high'
  colorIndex: number
}

export interface CreateAddonData {
  url: string
  name?: string
  description?: string
  groupIds?: string[]
}

export interface UpdateAddonData {
  name?: string
  description?: string
  url?: string
  groupIds?: string[]
}

// API Functions

// Health Check
export const healthCheck = async (): Promise<{ status: string; message: string; timestamp: string }> => {
  const response = await axios.get(`${API_BASE_URL.replace('/api', '')}/health`)
  return response.data
}

// Users API
export const usersAPI = {
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
  getSyncStatus: async (id: string, groupId?: string): Promise<any> => {
    const url = groupId ? `/users/${id}/sync-status?groupId=${encodeURIComponent(groupId)}` : `/users/${id}/sync-status`
    const response: AxiosResponse<any> = await api.get(url)
    return response.data
  },

  // Sync one user via the dedicated endpoint
  sync: async (id: string, excludedManifestUrls: string[] = [], syncMode: 'normal' | 'advanced' = 'normal'): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      `/users/${id}/sync`,
      { excludedManifestUrls },
      { headers: { 'x-sync-mode': syncMode } }
    )
    return response.data
  },

  // Create new user
  create: async (userData: CreateUserData): Promise<User> => {
    const response: AxiosResponse<User> = await api.post('/users', userData)
    return response.data
  },

  // Update user
  update: async (id: string, userData: { displayName?: string; email?: string; password?: string; groupName?: string }): Promise<User> => {
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
  search: async (query: string, role?: string): Promise<User[]> => {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    if (role && role !== 'all') params.append('role', role)
    
    const response: AxiosResponse<User[]> = await api.get(`/users/search?${params}`)
    return response.data
  },

  // Sync all enabled users
  syncAll: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/users/sync-all')
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

  // Search groups
  search: async (query: string, restriction?: string): Promise<Group[]> => {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    if (restriction && restriction !== 'all') params.append('restriction', restriction)
    
    const response: AxiosResponse<Group[]> = await api.get(`/groups/search?${params}`)
    return response.data
  },

  // Reorder addons in a group
  reorderAddons: async (groupId: string, orderedManifestUrls: string[]): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/groups/${groupId}/addons/reorder`, {
      orderedManifestUrls
    })
    return response.data
  },
}

// Addons API
export const addonsAPI = {
  // Get all addons
  getAll: async (): Promise<Addon[]> => {
    const response: AxiosResponse<Addon[]> = await api.get('/addons')
    return response.data
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

  // Search addons
  search: async (query: string, tag?: string): Promise<Addon[]> => {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    if (tag && tag !== 'all') params.append('tag', tag)
    
    const response: AxiosResponse<Addon[]> = await api.get(`/addons/search?${params}`)
    return response.data
  },
}

// Stremio API
export const stremioAPI = {
  // Connect to Stremio
  connect: async (userData: { displayName?: string; email: string; password: string; username?: string; groupName?: string }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/stremio/connect', userData)
    return response.data
  },

  // Validate Stremio credentials
  validate: async (credentials: { email: string; password: string }): Promise<{ valid: boolean; error?: string }> => {
    const response: AxiosResponse<{ valid: boolean; error?: string }> = await api.post('/stremio/validate', credentials)
    return response.data
  },
}

// Export the axios instance for direct use if needed
export default api
