/**
 * Nuvio authentication — Supabase email/password login and JWT refresh.
 * Module-level functions, not on the provider instance.
 * Used at connection time (invitations, user login), not during sync.
 */

const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./supabase')

async function validateNuvioCredentials(email, password) {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg = body?.error_description || body?.error || body?.msg || `HTTP ${res.status}`
    throw new Error(msg)
  }

  const data = await res.json()
  return {
    user: {
      id: data.user?.id,
      email: data.user?.email
    },
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token
    }
  }
}

async function refreshNuvioToken(refreshToken) {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg = body?.error_description || body?.error || `HTTP ${res.status}`
    throw new Error(`Nuvio token refresh failed: ${msg}`)
  }

  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token
  }
}

function isTokenExpired(jwt) {
  if (!jwt) return true
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return true
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
    if (!payload.exp) return true
    // Expire 60 seconds early to avoid race conditions
    return (payload.exp - 60) < (Date.now() / 1000)
  } catch {
    return true
  }
}

// --- TV Login (Device Authorization) Flow ---

const crypto = require('crypto')

function parseJwtPayload(jwt) {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(Buffer.from(parts[1], 'base64').toString())
  } catch {
    return null
  }
}

async function startNuvioTvLogin() {
  // Step 0: Create anonymous Supabase session
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ data: { tv_client: 'syncio' } })
  })
  if (!signupRes.ok) {
    const body = await signupRes.text().catch(() => '')
    throw new Error(`Nuvio anonymous signup failed (${signupRes.status}): ${body}`)
  }
  const signupData = await signupRes.json()
  const anonToken = signupData.access_token

  // Step 1: Start TV login session
  const deviceNonce = crypto.randomUUID()
  const startRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/start_tv_login_session`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'authorization': `Bearer ${anonToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      p_device_nonce: deviceNonce,
      p_redirect_base_url: 'https://nuvioapp.space/tv-login',
      p_device_name: 'Syncio'
    })
  })
  if (!startRes.ok) {
    const body = await startRes.text().catch(() => '')
    throw new Error(`Nuvio TV login start failed (${startRes.status}): ${body}`)
  }
  const startData = await startRes.json()
  const session = Array.isArray(startData) ? startData[0] : startData

  return {
    code: session.code,
    webUrl: session.web_url,
    expiresAt: session.expires_at,
    pollIntervalSeconds: session.poll_interval_seconds || 3,
    anonToken,
    deviceNonce
  }
}

async function pollNuvioTvLogin(code, deviceNonce, anonToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/poll_tv_login_session`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'authorization': `Bearer ${anonToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ p_code: code, p_device_nonce: deviceNonce })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Nuvio TV login poll failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  const result = Array.isArray(data) ? data[0] : data
  return {
    status: result.status,
    expiresAt: result.expires_at,
    pollIntervalSeconds: result.poll_interval_seconds || 3
  }
}

async function exchangeNuvioTvLogin(code, deviceNonce, anonToken) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tv-logins-exchange`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'authorization': `Bearer ${anonToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ code, device_nonce: deviceNonce })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Nuvio TV login exchange failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  const payload = parseJwtPayload(data.access_token)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    user: {
      id: payload?.sub || null,
      email: payload?.email || null
    }
  }
}

module.exports = {
  validateNuvioCredentials, refreshNuvioToken, isTokenExpired,
  startNuvioTvLogin, pollNuvioTvLogin, exchangeNuvioTvLogin, parseJwtPayload
}
