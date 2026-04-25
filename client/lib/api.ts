// API client for connecting to Syncio backend
// Use relative path if NEXT_PUBLIC_API_URL is not set (Next.js will proxy via rewrites)
// Otherwise use the explicit URL (useful for production or different ports)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

interface FetchOptions extends RequestInit {
  token?: string;
}

// Helper to get CSRF token from cookies (for non-GET requests)
function getCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const cookies = document.cookie?.split(';') || [];
  const find = (name: string) => {
    const key = `${name}=`;
    const entry = cookies.find(c => c.trim().startsWith(key));
    return entry ? decodeURIComponent(entry.split('=')[1]) : '';
  };
  return find('__Host-sfm_csrf') || find('sfm_csrf') || null;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('syncio_token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('syncio_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('syncio_token');
    }
  }

  private getAuthHeaders(method: string = 'GET'): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }
    return headers;
  }

  private async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const token = options.token || this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add CSRF token for state-changing requests
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        cache: 'no-store',
        credentials: 'include',
        ...options,
        headers,
      });

      if (!response.ok) {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch (parseError) {
          errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
        }

        const errorMessage = errorData.message || errorData.error || `HTTP ${response.status}`;
        const apiError = new Error(errorMessage) as any;
        apiError.response = { data: errorData, status: response.status };
        // Attach the original error data for easier access
        apiError.data = errorData;

        // Global 401 Redirect handler for client-side
        if (
          response.status === 401 &&
          typeof window !== 'undefined' &&
          !window.location.pathname.startsWith('/login')
        ) {
          // Do not redirect if the failure happened during an active auth attempt/management
          const isAuthEndpoint = [
            '/auth/login',
            '/auth/stremio-login',
            '/auth/private-login',
            '/auth/unlink-stremio',
            '/auth/set-credentials'
          ].some(route => endpoint.startsWith(route));

          if (!isAuthEndpoint) {
            this.clearToken();
            const isUserRoute = window.location.pathname.startsWith('/user') || window.location.pathname.startsWith('/invite');
            window.location.href = `/login?mode=${isUserRoute ? 'user' : 'admin'}`;
          }
        }

        throw apiError;
      }

      return response.json();
    } catch (fetchError: any) {
      // Handle network errors, CORS errors, etc.
      if (fetchError.name === 'TypeError' && fetchError.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to reach the server') as any;
        networkError.response = { status: 0, data: { message: 'Network error' } };
        networkError.originalError = fetchError;
        throw networkError;
      }

      // If it's already our API error, re-throw it
      if (fetchError.response) {
        throw fetchError;
      }

      // Otherwise, wrap it
      const wrappedError = new Error(fetchError.message || 'Request failed') as any;
      wrappedError.originalError = fetchError;
      wrappedError.response = { status: 0, data: { message: fetchError.message || 'Unknown error' } };
      throw wrappedError;
    }
  }

  // Auth
  async login(username: string, password: string) {
    const data = await this.fetch<{ token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ uuid: username, password }), // Backend expects 'uuid' for public login
    });
    this.setToken(data.token);
    return data;
  }

  async stremioLogin(authKey: string) {
    const data = await this.fetch<{ token: string; account: any }>('/auth/stremio-login', {
      method: 'POST',
      body: JSON.stringify({ authKey }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async unlinkStremio(password: string) {
    return this.fetch<{ message: string; uuid: string }>('/auth/unlink-stremio', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  async unlinkUuid() {
    return this.fetch<{ message: string }>('/auth/unlink-uuid', {
      method: 'POST',
    });
  }

  async setCredentials(password: string) {
    return this.fetch<{ message: string; uuid: string }>('/auth/set-credentials', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  // Users
  async getUsers() {
    return this.fetch<User[]>('/users');
  }

  async getUser(id: string) {
    return this.fetch<User>(`/users/${id}`);
  }

  async createUser(data: CreateUserData) {
    return this.fetch<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, data: Partial<User>) {
    return this.fetch<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async toggleUserStatus(id: string, isActive: boolean) {
    return this.fetch<{ message: string; isActive: boolean }>(`/users/${id}/toggle-status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  }

  async deleteUser(id: string) {
    return this.fetch(`/users/${id}`, { method: 'DELETE' });
  }

  async syncUser(id: string) {
    return this.fetch(`/users/${id}/sync`, { method: 'POST' });
  }

  async connectUserStremio(id: string, data: { email: string; password: string; username?: string }) {
    return this.fetch(`/users/${id}/connect-stremio`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async connectUserStremioWithAuthKey(id: string, authKey: string) {
    return this.fetch(`/users/${id}/connect-stremio-authkey`, {
      method: 'POST',
      body: JSON.stringify({ authKey }),
    });
  }

  async getUserWatchTime(id: string, period: 'day' | 'week' | 'month' | 'year' = 'week') {
    return this.fetch<WatchTimeData>(`/users/${id}/watch-time?period=${period}`);
  }

  async getUserTopItems(id: string, limit = 10) {
    return this.fetch<TopItem[]>(`/users/${id}/top-items?limit=${limit}`);
  }

  async getUserStreaks(id: string) {
    return this.fetch<StreakData>(`/users/${id}/streaks`);
  }

  async getUserVelocity(id: string) {
    return this.fetch<VelocityData>(`/users/${id}/velocity`);
  }

  async getUserSyncStatus(id: string, groupId?: string) {
    const url = groupId
      ? `/users/${id}/sync-status?groupId=${groupId}`
      : `/users/${id}/sync-status`;
    return this.fetch<any>(url);
  }

  async getUserSyncPlan(id: string) {
    return this.fetch<{
      alreadySynced: boolean;
      current: { name: string; transportUrl: string; fingerprint: string }[];
      desired: { name: string; transportUrl: string; fingerprint: string }[];
      currentCount: number;
      desiredCount: number;
    }>(`/users/${id}/sync-plan`);
  }

  async getGroupSyncStatus(id: string) {
    // Groups sync status is determined by checking all users in the group
    const group = await this.getGroup(id);
    return group;
  }

  async getUserStremioAddons(id: string) {
    const response = await this.fetch<{ userId: string; count: number; addons: any[] }>(`/users/${id}/stremio-addons`);
    // Normalize the response - backend returns manifestUrl but we need transportUrl
    const normalized = (response.addons || []).map((addon: any) => ({
      ...addon,
      transportUrl: addon.transportUrl || addon.manifestUrl || addon.url || '',
      manifest: addon.manifest || {
        id: addon.id || 'unknown',
        name: addon.name || 'Unknown',
        version: addon.version || 'unknown',
        description: addon.description || '',
        logo: addon.iconUrl || addon.logo || null,
        resources: addon.resources || [],
        types: addon.types || [],
      },
    }));
    return normalized as StremioAddon[];
  }

  // Import user addons to a new group (copied from old UI)
  async importUserAddons(id: string) {
    // Fetch live addons from Stremio for this user first
    const stremioResponse = await this.fetch<{ userId: string; count: number; addons: any[] }>(`/users/${id}/stremio-addons`);
    const addons: any[] = Array.isArray(stremioResponse?.addons)
      ? stremioResponse.addons
      : [];

    // Post the collected addons to the import endpoint
    return this.fetch<{ importedCount: number; message: string }>(`/users/${id}/import-addons`, {
      method: 'POST',
      body: JSON.stringify({ addons }),
    });
  }

  async getUserGroupAddons(id: string) {
    const response = await this.fetch<{ addons: Addon[] }>(`/users/${id}/group-addons`);
    return response.addons || [];
  }

  async updateUserExcludedAddons(id: string, excludedAddons: string[]) {
    return this.fetch(`/users/${id}/excluded-addons`, {
      method: 'PUT',
      body: JSON.stringify({ excludedAddons }),
    });
  }

  async reorderUserStremioAddons(id: string, orderedAddonNames: string[]) {
    return this.fetch(`/users/${id}/stremio-addons/reorder`, {
      method: 'POST', // Changed from PUT to POST to match backend
      body: JSON.stringify({ orderedNames: orderedAddonNames }), // Changed from orderedAddonNames to orderedNames
    });
  }

  async toggleUserProtectedAddon(id: string, addonName: string) {
    return this.fetch<{ isProtected: boolean; message: string }>(`/users/${id}/protect-addon`, {
      method: 'POST',
      body: JSON.stringify({ name: addonName }), // Changed from addonName to name
    });
  }

  async removeUserStremioAddon(id: string, addonName: string) {
    return this.fetch(`/users/${id}/stremio-addons/${encodeURIComponent(addonName)}`, {
      method: 'DELETE',
    });
  }

  // Groups
  async getGroups() {
    return this.fetch<Group[]>('/groups');
  }

  async getGroup(id: string) {
    return this.fetch<Group>(`/groups/${id}`);
  }

  async createGroup(data: CreateGroupData) {
    return this.fetch<Group>('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateGroup(id: string, data: Partial<Group>) {
    return this.fetch<Group>(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async toggleGroupStatus(id: string, isActive: boolean) {
    return this.fetch<Group>(`/groups/${id}/toggle-status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  }

  async deleteGroup(id: string) {
    return this.fetch(`/groups/${id}`, { method: 'DELETE' });
  }

  async syncGroup(id: string) {
    return this.fetch(`/groups/${id}/sync`, { method: 'POST' });
  }

  async getGroupAddons(id: string) {
    // Backend returns { addons: [...] } with a slightly different shape
    const response = await this.fetch<{ addons: any[] }>(`/groups/${id}/addons`);
    const rawAddons = Array.isArray(response?.addons) ? response.addons : [];

    // Normalize to the Addon type used by the UI
    return rawAddons
      .filter((a) => {
        // Ensure we have a valid ID
        if (!a.id) {
          console.warn('Addon without ID from backend:', a);
          return false;
        }
        return true;
      })
      .map((a) => {
        const manifest = a.manifest || {};
        // Get logo from multiple sources
        const logo = a.customLogo ||
          manifest.logo ||
          (manifest.id && `https://stremio-addon.netlify.app/${manifest.id}/icon.png`) ||
          undefined;
        return {
          id: a.id, // This is guaranteed to exist after filter
          name: a.name || manifest.name || 'Unnamed Addon',
          description: a.description || manifest.description || '',
          manifestUrl: a.transportUrl || '',
          stremioAddonId: manifest.id,
          version: manifest.version,
          logo,
          resources: Array.isArray(manifest.resources)
            ? manifest.resources.map((r: any) => (typeof r === 'string' ? r : r.name)).filter(Boolean)
            : [],
          catalogs: Array.isArray(manifest.catalogs) ? manifest.catalogs : [],
          createdAt: '',
          updatedAt: '',
        } as Addon;
      });
  }

  async addAddonToGroup(groupId: string, addonId: string) {
    return this.fetch(`/groups/${groupId}/addons/${addonId}`, { method: 'POST' });
  }

  async removeAddonFromGroup(groupId: string, addonId: string) {
    return this.fetch(`/groups/${groupId}/addons/${addonId}`, { method: 'DELETE' });
  }

  async reorderGroupAddons(groupId: string, orderedAddonIds: string[]) {
    try {
      return await this.fetch(`/groups/${groupId}/addons/reorder`, {
        method: 'POST',
        body: JSON.stringify({ orderedAddonIds }),
      });
    } catch (error: any) {
      // Log error details separately to avoid serialization issues
      console.error('API reorderGroupAddons error - message:', error?.message);
      if (error?.data) {
        console.error('API reorderGroupAddons error - data:', error.data);
      }
      console.error('API reorderGroupAddons error - type:', typeof error);
      console.error('API reorderGroupAddons error - response data:', error?.response?.data);
      console.error('API reorderGroupAddons error - response status:', error?.response?.status);
      console.error('API reorderGroupAddons error - groupId:', groupId);
      console.error('API reorderGroupAddons error - orderedAddonIds:', orderedAddonIds);
      if (error?.response?.data?.details?.availableAddonIds) {
        console.error('API reorderGroupAddons error - available addon IDs from backend:', error.response.data.details.availableAddonIds);
      }
      console.error('API reorderGroupAddons error - full error:', error);
      throw error;
    }
  }

  async addUserToGroup(groupId: string, userId: string) {
    return this.fetch(`/groups/${groupId}/users/${userId}`, { method: 'POST' });
  }

  async removeUserFromGroup(groupId: string, userId: string) {
    return this.fetch(`/groups/${groupId}/users/${userId}`, { method: 'DELETE' });
  }

  // Addons
  async getAddons() {
    return this.fetch<Addon[]>('/addons');
  }

  async getAddon(id: string) {
    return this.fetch<Addon>(`/addons/${id}`);
  }

  async createAddon(data: CreateAddonData) {
    // Backend expects 'url' but we use 'manifestUrl' in the interface
    const payload: any = { ...data };
    if (payload.manifestUrl && !payload.url) {
      payload.url = payload.manifestUrl;
      delete payload.manifestUrl;
    }
    // If manifestData is provided, extract name from it if name is not provided
    // This ensures the backend always has a name field (required for duplicate check)
    if (payload.manifestData && payload.manifestData.name && !payload.name) {
      payload.name = payload.manifestData.name;
    }
    // Keep manifestData if provided (for pre-fetched manifests)
    if (payload.manifestData) {
      // manifestData is already in the payload
    }
    const result = await this.fetch<any>('/addons', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // Backend sometimes wraps addon in { addon, message }
    return (result?.addon || result) as Addon;
  }

  async updateAddon(id: string, data: Partial<Addon>) {
    // Backend expects 'url' but we use 'manifestUrl' in the interface
    const payload: any = { ...data };
    if (payload.manifestUrl && !payload.url) {
      payload.url = payload.manifestUrl;
      delete payload.manifestUrl;
    }
    return this.fetch<Addon>(`/addons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async toggleAddonStatus(id: string, isActive: boolean) {
    return this.fetch<Addon>(`/addons/${id}/toggle-status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  }

  async deleteAddon(id: string) {
    return this.fetch(`/addons/${id}`, { method: 'DELETE' });
  }

  async reloadAddon(id: string) {
    return this.fetch(`/addons/${id}/reload`, { method: 'POST' });
  }

  async getAddonHealthHistory(id: string, limit = 50) {
    return this.fetch<{
      addonId: string;
      addonName: string;
      history: Array<{
        id: string;
        isOnline: boolean;
        error: string | null;
        checkedAt: string;
        responseTimeMs: number | null;
      }>;
    }>(`/addons/${id}/health-history?limit=${limit}`);
  }

  // Backup Management
  async getAddonBackup(id: string) {
    return this.fetch<{
      addonId: string;
      addonName: string;
      usingBackup: boolean;
      backup: {
        id: string;
        manifestUrl: string;
        stremioAddonId: string | null;
        name: string | null;
        isOnline: boolean;
        lastCheck: string | null;
        checkError: string | null;
        createdAt: string;
        updatedAt: string;
      } | null;
    }>(`/addons/${id}/backup`);
  }

  async setAddonBackup(id: string, backupAddonId: string) {
    return this.fetch<{
      message: string;
      backupAddon: {
        id: string;
        name: string;
        isActive: boolean;
        isOnline: boolean;
      };
    }>(`/addons/${id}/backup`, {
      method: 'PUT',
      body: JSON.stringify({ backupAddonId }),
    });
  }

  async deleteAddonBackup(id: string) {
    return this.fetch<{ message: string }>(`/addons/${id}/backup`, {
      method: 'DELETE',
    });
  }

  async getAddonBackupActive(id: string) {
    return this.fetch<{
      chain: Array<{
        id: string;
        name: string;
        isActive: boolean;
        isOnline: boolean;
        lastHealthCheck: string | null;
      }>;
      activeAddon: {
        id: string;
        name: string;
        isActive: boolean;
        isOnline: boolean;
        lastHealthCheck: string | null;
      };
      isUsingBackup: boolean;
      totalChainLength: number;
      message: string;
    }>(`/addons/${id}/backup/active`);
  }

  // Proxy
  async enableProxy(id: string): Promise<{ id: string; name: string; proxyEnabled: boolean; proxyUuid: string; proxyManifestUrl: string }> {
    return this.fetch(`/addons/${id}/proxy/enable`, { method: 'POST' });
  }

  async disableProxy(id: string): Promise<{ id: string; name: string; proxyEnabled: boolean; proxyUuid: string }> {
    return this.fetch(`/addons/${id}/proxy/disable`, { method: 'POST' });
  }

  async regenerateProxyUuid(id: string): Promise<{ id: string; name: string; proxyEnabled: boolean; proxyUuid: string; proxyManifestUrl: string | null }> {
    return this.fetch(`/addons/${id}/proxy/regenerate`, { method: 'POST' });
  }

  async getProxyLogs(id: string, limit?: number, offset?: number): Promise<{ logs: any[], total: number, limit: number, offset: number }> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await this.fetch<{ success: boolean; data: { logs: any[], total: number, limit: number, offset: number } }>(`/addons/${id}/proxy-logs${query}`);
    return response.data;
  }

  async getAllProxyLogs(limit?: number, offset?: number, addonId?: string): Promise<{ logs: any[], total: number, limit: number, offset: number }> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    if (addonId) params.append('addonId', addonId);
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await this.fetch<{ success: boolean; data: { logs: any[], total: number, limit: number, offset: number } }>(`/addons/proxy-logs/all${query}`);
    return response.data;
  }

  // Invitations
  async getInvitations() {
    return this.fetch<Invitation[]>('/invitations');
  }

  async createInvitation(data: CreateInvitationData) {
    // Map frontend field names to backend field names
    // IMPORTANT: Use null instead of undefined so JSON.stringify includes the key
    // Backend treats null/undefined as unlimited (0)
    const payload: any = {
      name: data.name || null,
      groupName: data.groupName || null,
      // Explicitly send null for unlimited (backend treats null as 0 = unlimited)
      maxUses: data.maxUses ?? null,
      expiresAt: data.expiresAt || null,
      // Backend expects membershipDurationDays, not membershipDuration
      membershipDurationDays: data.membershipDuration ?? null,
      syncOnJoin: data.syncOnJoin ?? false,
    };
    const result = await this.fetch<any>('/invitations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return (result?.invitation || result) as Invitation;
  }

  async updateInvitation(id: string, data: Partial<CreateInvitationData>) {
    // Map frontend field names to backend field names
    // Use null instead of undefined so JSON.stringify includes the key
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name || null;
    if (data.groupName !== undefined) payload.groupName = data.groupName || null;
    // Explicitly send null for unlimited (backend treats null as 0 = unlimited)
    if (data.maxUses !== undefined) payload.maxUses = data.maxUses ?? null;
    if (data.expiresAt !== undefined) payload.expiresAt = data.expiresAt || null;
    if (data.membershipDuration !== undefined) payload.membershipDurationDays = data.membershipDuration ?? null;
    if (data.syncOnJoin !== undefined) payload.syncOnJoin = data.syncOnJoin;

    return this.fetch<Invitation>(`/invitations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async toggleInvitationStatus(id: string, isActive: boolean) {
    return this.fetch<Invitation>(`/invitations/${id}/toggle-status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  }

  async refreshInvitationOAuth(requestId: string) {
    return this.fetch<{ oauthCode: string; oauthLink: string; oauthExpiresAt: string }>(`/invitations/requests/${requestId}/refresh-oauth`, {
      method: 'POST',
    });
  }

  async deleteInvitation(id: string) {
    return this.fetch(`/invitations/${id}`, { method: 'DELETE' });
  }

  async getInvitationRequests(id: string) {
    return this.fetch<InviteRequest[]>(`/invitations/${id}/requests`);
  }

  async acceptInviteRequest(requestId: string) {
    return this.fetch(`/invitations/requests/${requestId}/accept`, { method: 'POST' });
  }

  async rejectInviteRequest(requestId: string) {
    return this.fetch(`/invitations/requests/${requestId}/reject`, { method: 'POST' });
  }

  // Account/Stats
  async getAccountStats() {
    return this.fetch<AccountStats>('/ext/account');
  }

  // Settings
  async getSyncSettings() {
    return this.fetch<SyncSettings>('/settings/account-sync');
  }

  async updateSyncSettings(data: Partial<SyncSettings>) {
    return this.fetch<SyncSettings>('/settings/account-sync', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async testWebhook(webhookUrl: string) {
    return this.fetch('/settings/account-sync/test-webhook', {
      method: 'POST',
      body: JSON.stringify({ webhookUrl }),
    });
  }

  async getApiKeyStatus() {
    return this.fetch<{ hasKey: boolean; apiKey?: string }>('/settings/account-api');
  }

  async generateApiKey() {
    return this.fetch<{ apiKey: string }>('/settings/account-api-key', {
      method: 'POST',
    });
  }

  async rotateApiKey() {
    return this.fetch<{ apiKey: string }>('/settings/account-api-key', {
      method: 'PUT',
    });
  }

  async getBackupFrequency() {
    return this.fetch<{ days: number }>('/settings/backup-frequency');
  }

  async setBackupFrequency(days: number) {
    return this.fetch('/settings/backup-frequency', {
      method: 'PUT',
      body: JSON.stringify({ days }),
    });
  }

  async runBackupNow() {
    return this.fetch('/settings/backup-now', { method: 'POST' });
  }

  async repairAddons() {
    return this.fetch<{ inspected: number; updated: number }>('/settings/repair-addons', {
      method: 'POST',
    });
  }

  // Addon Health Check
  async getAddonHealthCheckSettings() {
    return this.fetch<{ enabled: boolean; intervalMinutes: number }>('/settings/addon-health-check');
  }

  async setAddonHealthCheckInterval(intervalMinutes: number) {
    return this.fetch('/settings/addon-health-check', {
      method: 'PUT',
      body: JSON.stringify({ intervalMinutes }),
    });
  }

  async runAddonHealthCheckNow() {
    return this.fetch('/settings/addon-health-check/now', { method: 'POST' });
  }

  // Bulk Operations
  async syncAllUsers() {
    const users = await this.getUsers();
    const results = { success: 0, failed: 0 };
    for (const user of users) {
      try {
        await this.syncUser(user.id);
        results.success++;
      } catch {
        results.failed++;
      }
    }
    return results;
  }

  async syncAllGroups() {
    return this.fetch<{
      syncedGroups: number;
      failedGroups: number;
      totalUsersSynced: number;
      totalUsersFailed: number;
    }>('/groups/sync-all', { method: 'POST' });
  }

  async deleteAllUsers() {
    const users = await this.getUsers();
    const results = { success: 0, failed: 0 };
    for (const user of users) {
      try {
        await this.deleteUser(user.id);
        results.success++;
      } catch {
        results.failed++;
      }
    }
    return results;
  }

  async deleteAllGroups() {
    const groups = await this.getGroups();
    const results = { success: 0, failed: 0 };
    for (const group of groups) {
      try {
        await this.deleteGroup(group.id);
        results.success++;
      } catch {
        results.failed++;
      }
    }
    return results;
  }

  async deleteAllAddons() {
    const addons = await this.getAddons();
    const results = { success: 0, failed: 0 };
    for (const addon of addons) {
      try {
        await this.deleteAddon(addon.id);
        results.success++;
      } catch {
        results.failed++;
      }
    }
    return results;
  }

  async clearAllUserAddons() {
    const users = await this.getUsers();
    const results = { success: 0, failed: 0 };
    for (const user of users) {
      try {
        await this.fetch(`/users/${user.id}/stremio-addons/clear`, { method: 'POST' });
        results.success++;
      } catch {
        results.failed++;
      }
    }
    return results;
  }

  async reloadAllAddons() {
    return this.fetch<{ reloaded: number }>('/addons/reload-all', { method: 'POST' });
  }

  // Import/Export
  async exportAddons() {
    return this.fetch<Addon[]>('/public-auth/addon-export');
  }

  async exportConfig() {
    return this.fetch<ExportedConfig>('/public-auth/config-export');
  }

  async importAddons(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/public-auth/addon-import`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: this.getAuthHeaders('POST'),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Import failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json() as Promise<{ successful: number; failed: number; redundant: number }>;
  }

  async importConfig(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/public-auth/config-import`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: this.getAuthHeaders('POST'),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Import failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json() as Promise<ImportConfigResult>;
  }

  async resetConfig() {
    return this.fetch('/public-auth/reset', { method: 'POST' });
  }

  async backupUserLibrary(userId: string) {
    const response = await fetch(`${API_BASE}/users/${userId}/library/backup`, {
      credentials: 'include',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    const data = await response.json();
    // Download as file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${date}-library-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    return data;
  }

  // History export/import
  async exportHistory(userId?: string) {
    const queryParam = userId && userId !== 'all' ? `?userId=${userId}` : '?userId=all';
    const response = await fetch(`${API_BASE}/users/history/export${queryParam}`, {
      credentials: 'include',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    const data = await response.json();
    // Download as file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const suffix = userId && userId !== 'all' ? '-user' : '-all';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${date}-history${suffix}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return data;
  }

  async importHistory(file: File, targetUserId?: string): Promise<{
    message: string;
    results: {
      watchSessions: { imported: number; skipped: number };
      episodeWatchHistory: { imported: number; skipped: number };
      watchActivity: { imported: number; skipped: number };
      watchSnapshots: { imported: number; skipped: number };
    };
  }> {
    const text = await file.text();
    const data = JSON.parse(text);
    if (targetUserId) {
      data.targetUserId = targetUserId;
    }
    return this.fetch('/users/history/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async clearUserHistory(userId: string): Promise<{
    message: string;
    deleted: {
      watchSessions: number;
      episodeWatchHistory: number;
      watchActivity: number;
      watchSnapshots: number;
    };
  }> {
    return this.fetch(`/users/${userId}/history`, {
      method: 'DELETE',
    });
  }

  async clearUserLibrary(userId: string): Promise<{
    message: string;
    deleted: number;
  }> {
    return this.fetch(`/users/${userId}/library`, {
      method: 'DELETE',
    });
  }

  async decodeWatchedBitfield(watched: string): Promise<{
    lastVideoId: string;
    lastLength: number;
    serializedBuf: string;
    watchedEpisodes: { episode: number; watched: boolean }[];
    watchedCount: number;
  }> {
    return this.fetch('/users/decode-watched', {
      method: 'POST',
      body: JSON.stringify({ watched }),
    });
  }

  // Stremio OAuth (admin-side helpers)
  async generateStremioOAuth() {
    // Uses public-library router to create an OAuth link and code
    return this.fetch<{
      success?: boolean;
      code: string;
      link: string;
      expiresAt: string;
    }>('/public-library/generate-oauth', {
      method: 'POST',
    });
  }

  async pollStremioOAuth(code: string) {
    // Polls public-library for OAuth completion and returns an authKey when ready
    return this.fetch<{
      success: boolean;
      authKey: string | null;
      error?: string;
    }>('/public-library/poll-oauth', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async verifyStremioAuthKey(payload: { authKey: string; username?: string; email?: string }) {
    // Lightweight verification + user info fetch; does NOT create or persist a user
    return this.fetch<{
      authKey: string;
      user?: { username?: string; email?: string };
    }>('/stremio/connect-authkey', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createUserWithStremio(data: {
    authKey: string;
    username: string;
    email: string;
    groupName?: string;
    colorIndex?: number;
  }) {
    // Mirrors old UI behavior by delegating user creation to /stremio/connect-authkey
    const payload = {
      authKey: data.authKey,
      username: data.username,
      email: data.email,
      groupName: data.groupName,
      colorIndex: data.colorIndex,
      create: true,
    };

    const result = await this.fetch<any>('/stremio/connect-authkey', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // Normalize to plain User
    return (result?.user || result) as User;
  }

  // Metrics
  async getMetrics(period: string = '30d') {
    return this.fetch<MetricsData>(`/users/metrics?period=${period}`);
  }

  // Manual sync (same as scheduled 5‑minute sync, but on demand)
  async triggerSyncNow() {
    return this.fetch<{ message: string; result?: any }>('/settings/sync-now', {
      method: 'POST',
    });
  }

  // Activity
  async getActivityLibrary() {
    return this.fetch<ActivityLibraryData>('/users/activity/library');
  }
}

export const api = new ApiClient();

// Types
export interface User {
  id: string;
  username: string;
  name?: string; // Legacy field, prefer username
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string | null;
  groupIds?: string[];
  groupId?: string; // Single group ID (legacy)
  groups?: string[]; // Group names array
  excludedAddons?: string[];
  protectedAddons?: string[];
  discordWebhook?: string;
  activityVisibility?: 'public' | 'private';
  isActive?: boolean;
  status?: 'active' | 'inactive';
  addons?: number;
  stremioAddonsCount?: number;
  hasStremioConnection?: boolean;
  colorIndex?: number;
  inviteCode?: string;
}

export interface CreateUserData {
  name: string;
  email?: string;
  authKey?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  color?: string;
  userIds: string[] | string; // Can be array or JSON string
  users?: number; // Count of active users
  addons?: number; // Count of active addons
  createdAt: string;
  updatedAt: string;
  colorIndex?: number;
  isActive?: boolean;
}

export interface CreateGroupData {
  name: string;
  description?: string;
  color?: string;
}

export interface Addon {
  id: string;
  name: string;
  manifestUrl: string;
  stremioAddonId?: string;
  version?: string;
  description?: string;
  logo?: string;
  resources: string[];
  catalogs: Array<string | { type: string; id: string; search?: boolean }>;
  createdAt: string;
  updatedAt: string;
  // Health check fields
  isOnline?: boolean;
  lastHealthCheck?: string;
  healthCheckError?: string;
  // Backup fields
  backupAddonId?: string;
  hasBackup?: boolean;
  backupAddon?: {
    id: string;
    name: string;
    isActive: boolean;
    isOnline: boolean;
    lastHealthCheck?: string;
  };
  // Set by getGroupAddons when primary is offline and backup is used
  isBackup?: boolean;
  primaryAddonId?: string;
  primaryAddonName?: string;
}

export interface CreateAddonData {
  manifestUrl: string;
  name?: string;
  manifestData?: any; // Optional pre-fetched manifest data
}

export interface Invitation {
  id: string;
  // Backend currently returns inviteCode + various legacy fields; keep this flexible
  name?: string;
  code?: string; // legacy field (old UI)
  inviteCode?: string; // canonical backend field
  groupId?: string;
  groupName?: string;
  maxUses?: number | null;
  uses?: number; // legacy
  currentUses?: number;
  expiresAt?: string | null;
  membershipDuration?: number | null;
  membershipDurationDays?: number | null;
  syncOnJoin: boolean;
  createdAt: string;
  isActive?: boolean;
  requests?: InviteRequest[];
}

export interface CreateInvitationData {
  name?: string;
  groupId?: string;
  groupName?: string;
  maxUses?: number;
  expiresAt?: string;
  membershipDuration?: number;
  syncOnJoin?: boolean;
}

export interface InviteRequest {
  id: string;
  invitationId: string;
  email: string;
  username: string;
  status: 'pending' | 'accepted' | 'rejected' | 'joined';
  createdAt: string;
  respondedAt?: string;
  respondedBy?: string;
  oauthCode?: string;
  oauthLink?: string;
}

export interface WatchTimeData {
  totalWatchTimeSeconds: number;
  totalWatchTimeHours: number;
  byDate: {
    date: string;
    watchTimeSeconds: number;
    watchTimeHours: number;
    itemsCount: number;
    movies: number;
    shows: number;
  }[];
}

export interface TopItem {
  id: string;
  name: string;
  type: 'movie' | 'series';
  poster?: string;
  watchTime: number;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastWatchDate?: string;
}

export interface VelocityData {
  daily: number;
  weekly: number;
  monthly: number;
  trend: 'up' | 'down' | 'stable';
}

export interface StremioAddon {
  transportUrl: string;
  manifest: {
    id: string;
    name: string;
    version: string;
    description?: string;
    logo?: string;
    resources: string[];
    types: string[];
  };
}

export interface AccountStats {
  totalUsers: number;
  totalGroups: number;
  totalAddons: number;
  pendingInvites: number;
}

export interface SyncSettings {
  mode: 'normal' | 'advanced';
  safe: boolean;
  enabled: boolean;
  frequency: string;
  webhookUrl?: string;
  useCustomFields?: boolean;
}

export interface ExportedConfig {
  users: User[];
  groups: Group[];
  addons: Addon[];
  invitations: Invitation[];
}

export interface ImportConfigResult {
  users: { created: number; reused: number };
  groups: { created: number; reused: number };
  addons: { created: number; reused: number };
}

export interface MetricsData {
  summary: {
    totalUsers: number;
    activeUsers: number;
    totalMovies: number;
    totalShows: number;
    totalWatched: number;
    totalWatchTimeHours: number;
  };
  watchTime: {
    byDay: Array<{ date: string; hours: number }>;
    trend?: {
      percentage: number;
      direction: 'up' | 'down';
    };
  };
  watchActivity: {
    byDay: Array<{ date: string; movies: number; shows: number; total: number }>;
    byUser: Array<{
      id: string;
      username: string;
      email?: string; // Added email
      movies: number;
      shows: number;
      total: number;
      watchTimeHours: number;
      watchTimeMoviesHours: number;
      watchTimeShowsHours: number;
      streak?: number;
    }>;
  };
  nowPlaying: Array<{
    user: { id: string; username: string; email: string; colorIndex: number };
    item: { id: string; name: string; type: string; year?: number; poster?: string; season?: number; episode?: number };
    videoId?: string | null; // videoId for series items (used for session matching)
    watchedAt: string;
    watchedAtTimestamp?: number; // Stable session startTime in ms (used for duration calculation)
  }>;
  startedPlaying: Array<{
    user: { id: string; username: string; email: string; colorIndex: number };
    item: { id: string; name: string; type: string; year?: number; poster?: string; season?: number; episode?: number };
    startedAt: string;
  }>;
  recentEpisodes?: Array<{
    user: { id: string; username: string; email?: string; colorIndex: number };
    item: { id: string; name: string; type: string; poster?: string; season?: number | null; episode?: number | null };
    videoId: string;
    watchedAt: string;
  }>;
  watchSessions?: Array<{
    id: string;
    user: { id: string; username: string; email?: string; colorIndex: number };
    item: { id: string; name: string; type: string; poster?: string; season?: number | null; episode?: number | null };
    videoId?: string | null;
    startTime: string;
    endTime?: string | null;
    durationSeconds: number;
    isActive: boolean;
    isSynthetic?: boolean;
  }>;
  userJoins?: {
    byDay: Array<{ date: string; count: number }>;
    byWeek: Array<{ week: string; count: number }>;
    byMonth: Array<{ month: string; count: number }>;
  };
  period: string;
  admin?: AdminMetrics;
}

// Admin Analytics Types (Phase 1 + Phase 2)
export interface AdminMetrics {
  userLifecycle: {
    retention: {
      total: number;
      active7d: number;
      active30d: number;
      active90d: number;
      rate7d: number;
      rate30d: number;
      rate90d: number;
    };
    atRisk: AtRiskUser[];
    criticalRisk: AtRiskUser[];
  };
  topContent: {
    movies: TopContentItem[];
    series: TopContentItem[];
    trending: TopContentItem[];
  };
  engagement: {
    hourlyActivity: HourlyActivity[];
    averageSessionMinutes: number;
    totalSessions: number;
    bingeSessions: number;
    peakHour: number;
  };
  alerts: {
    critical: Alert[];
    warnings: Alert[];
    operational: OperationalAlert[];
    total: number;
    hasCritical: boolean;
  };
  // Phase 2: Addon Analytics
  addonAnalytics: {
    totalAddons: number;
    activeAddons: number;
    topAddons: AddonStat[];
    underutilized: AddonStat[];
    byResource: ResourceStat[];
  };
  // Phase 2: Server Health
  serverHealth: {
    status: 'healthy' | 'warning' | 'critical';
    checks: {
      syncQueue?: HealthCheck;
      storage?: HealthCheck;
      database?: HealthCheck;
      activity?: HealthCheck;
    };
    metrics: {
      activeSessions: number;
      serverTime: string;
    };
  };
  // Phase 3: Enhanced Metrics
  topItems: {
    movies: TopItemWithUsers[];
    series: TopItemWithUsers[];
  };
  watchVelocity: WatchVelocityItem[];
  interestingMetrics: {
    avgWatchTimePerUser: number;
    mostActiveHour: number;
    weekendWatchPercentage: number;
    completionRate: number;
    totalBingeSessions: number;
    avgSessionDuration: number;
  };
}

export interface OperationalAlert {
  type: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  count?: number;
  sizeMB?: number;
  addons?: string[];
}

export interface AddonStat {
  id: string;
  name: string;
  manifestUrl: string;
  iconUrl?: string;
  isActive: boolean;
  totalGroups: number;
  enabledGroups: number;
  userCount: number;
  usageRate: number;
  resources: string[];
  catalogs: any[];
}

export interface ResourceStat {
  name: string;
  count: number;
}

export interface HealthCheck {
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  message: string;
  totalUsers?: number;
  staleUsers?: number;
  sizeMB?: number;
  fileCount?: number;
  activeSessions?: number;
}

export interface AtRiskUser {
  id: string;
  username: string;
  email: string;
  lastActivity: string | null;
  daysInactive: number;
  totalWatchTimeHours: number;
  neverWatched?: boolean;
}

export interface TopContentItem {
  id: string;
  name: string;
  type: 'movie' | 'series';
  poster: string;
  watchCount: number;
  uniqueViewers: string[];
  completionRate: number;
  avgWatchTimeMinutes: number;
  recentVelocity: number;
}

export interface TopItemWithUsers {
  itemId: string;
  name: string;
  type: 'movie' | 'series';
  poster?: string;
  totalWatchTimeSeconds: number;
  totalWatchTimeHours: number;
  userCount: number;
  users: Array<{
    userId: string;
    username: string;
    watchTimeSeconds: number;
    watchTimeHours: number;
    episodesWatched?: number;
  }>;
}

export interface WatchVelocityItem {
  itemId: string;
  name: string;
  poster?: string;
  episodesPerDay: number;
  episodesPerWeek: number;
  estimatedEpisodes: number;
  daysActive: number;
  totalWatchTimeHours: number;
}

export interface HourlyActivity {
  hour: number;
  watchTimeMinutes: number;
  sessions: number;
}

export interface Alert {
  type: string;
  message: string;
  count: number;
  severity: 'critical' | 'warning';
  users?: string[];
}

export interface ActivityLibraryData {
  library: Array<{
    user: { id: string; username: string; email: string; colorIndex: number };
    item: {
      _id?: string;
      id?: string;
      name: string;
      type: string;
      year?: number;
      poster?: string;
      state?: {
        overallTimeWatched?: number;
        timeOffset?: number;
        lastWatched?: string;
      };
      _mtime?: string;
    };
  }>;
  count: number;
}
