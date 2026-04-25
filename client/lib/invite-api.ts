/**
 * Public Invite API
 * 
 * These endpoints don't require authentication and are used for the public
 * invite flow where users request access to Syncio.
 */

// Types for the invite flow
export interface InvitationCheck {
  isActive: boolean;
  maxUses: number | null;
  currentUses: number;
  expiresAt: string | null;
  groupName?: string;
}

export interface InviteRequestStatus {
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  email: string;
  username: string;
  groupName?: string;
  oauthCode?: string;
  oauthLink?: string;
  oauthExpiresAt?: string;
}

export interface OAuthGenerateResponse {
  oauthCode: string;
  oauthLink: string;
  oauthExpiresAt: string;
}

export interface StremioUserInfo {
  email: string;
  username?: string;
}

// API base - uses relative paths which Next.js proxies via rewrites
const INVITE_BASE = '/invite';

/**
 * Error class for API errors with status code
 */
export class InviteApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'InviteApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Helper to make API requests
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${INVITE_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const message = data?.message || data?.error || `HTTP ${response.status}`;
      const code = data?.error || data?.code;
      throw new InviteApiError(message, response.status, code);
    }

    return data;
  } catch (error) {
    if (error instanceof InviteApiError) {
      throw error;
    }
    // Network or other errors
    const message = error instanceof Error ? error.message : 'Request failed';
    throw new InviteApiError(message, 0);
  }
}

/**
 * Public Invite API methods
 */
export const inviteApi = {
  /**
   * Check if an invitation is valid
   */
  async checkInvitation(inviteCode: string): Promise<InvitationCheck> {
    return request<InvitationCheck>(`/${inviteCode}/check`);
  },

  /**
   * Submit an access request (new flow: username + authKey from Stremio OAuth)
   */
  async submitRequest(
    inviteCode: string,
    username: string,
    authKey: string,
  ): Promise<{ message: string; email?: string;[key: string]: any }> {
    return request(`/${inviteCode}/request`, {
      method: 'POST',
      body: JSON.stringify({ username, authKey }),
    });
  },

  /**
   * Check the status of an access request
   */
  async checkStatus(
    inviteCode: string,
    email: string,
    username: string
  ): Promise<InviteRequestStatus> {
    const params = new URLSearchParams({ email, username });
    return request<InviteRequestStatus>(`/${inviteCode}/status?${params}`);
  },

  /**
   * Generate OAuth link for completing account creation
   */
  async generateOAuth(
    inviteCode: string,
    email: string,
    username: string
  ): Promise<OAuthGenerateResponse> {
    return request<OAuthGenerateResponse>(`/${inviteCode}/generate-oauth`, {
      method: 'POST',
      body: JSON.stringify({ email, username }),
    });
  },

  /**
   * Complete the invite flow with Stremio auth key
   */
  async complete(
    inviteCode: string,
    email: string,
    username: string,
    authKey: string,
    groupName?: string
  ): Promise<{ message: string; user?: any }> {
    return request(`/${inviteCode}/complete`, {
      method: 'POST',
      body: JSON.stringify({ email, username, authKey, groupName }),
    });
  },

  /**
   * Get Stremio user info from auth key
   */
  async getUserInfo(
    inviteCode: string,
    authKey: string
  ): Promise<StremioUserInfo> {
    return request<StremioUserInfo>(`/${inviteCode}/user-info`, {
      method: 'POST',
      body: JSON.stringify({ authKey }),
    });
  },

  /**
   * Generate OAuth link for user deletion (no invite code needed)
   */
  async generateDeleteOAuth(): Promise<OAuthGenerateResponse> {
    return request<OAuthGenerateResponse>('/generate-oauth', {
      method: 'POST',
    });
  },

  /**
   * Delete user account via OAuth
   */
  async deleteUser(authKey: string): Promise<{ message: string }> {
    return request('/delete-user', {
      method: 'POST',
      body: JSON.stringify({ authKey }),
    });
  },
};

/**
 * Stremio OAuth API helpers
 * 
 * These interact directly with Stremio's link API
 */
export const stremioOAuth = {
  /**
   * Create a new Stremio OAuth session
   */
  async create(): Promise<{ code: string; link: string; expiresAt: number }> {
    const host = typeof window !== 'undefined'
      ? window.location.host
      : 'syncio.app';
    const origin = typeof window !== 'undefined'
      ? window.location.origin
      : `https://${host}`;

    const response = await fetch(
      'https://link.stremio.com/api/v2/create?type=Create',
      {
        headers: {
          'X-Requested-With': host,
          Origin: origin,
        },
        referrerPolicy: 'no-referrer',
      }
    );

    if (!response.ok) {
      throw new Error(`Stremio responded with ${response.status}`);
    }

    const data = await response.json();
    const result = data?.result;

    if (!result?.success || !result?.code || !result?.link) {
      throw new Error(data?.error?.message || 'Failed to create Stremio link');
    }

    return {
      code: result.code,
      link: result.link,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
  },

  /**
   * Poll Stremio for OAuth completion
   */
  async poll(code: string): Promise<{
    success: boolean;
    authKey?: string;
    user?: { email?: string; username?: string };
    error?: string;
  }> {
    const host = typeof window !== 'undefined'
      ? window.location.host
      : 'syncio.app';
    const origin = typeof window !== 'undefined'
      ? window.location.origin
      : `https://${host}`;

    const response = await fetch(
      `https://link.stremio.com/api/v2/read?type=Read&code=${encodeURIComponent(code)}`,
      {
        headers: {
          'X-Requested-With': host,
          Origin: origin,
        },
        referrerPolicy: 'no-referrer',
      }
    );

    const data = await response.json().catch(() => ({}));

    if (data?.result?.success && data.result.authKey) {
      return {
        success: true,
        authKey: data.result.authKey,
        user: data.result.user,
      };
    }

    // Code 101 means pending/waiting
    if (data?.error?.code === 101) {
      return { success: false };
    }

    if (data?.error) {
      return {
        success: false,
        error: data.error.message || 'Stremio reported an error',
      };
    }

    return { success: false };
  },
};
