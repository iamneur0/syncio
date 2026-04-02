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

module.exports = { validateNuvioCredentials, refreshNuvioToken, isTokenExpired }
