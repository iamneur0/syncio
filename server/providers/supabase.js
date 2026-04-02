/**
 * Low-level Supabase PostgREST HTTP client.
 * All Nuvio API calls go through these functions.
 */

const SUPABASE_URL = process.env.NUVIO_SUPABASE_URL || 'https://dpyhjjcoabcglfmgecug.supabase.co'
const SUPABASE_ANON_KEY = process.env.NUVIO_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRweWhqamNvYWJjZ2xmbWdlY3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODYyNDcsImV4cCI6MjA4NjM2MjI0N30.U-3QSNDdpsnvRk_7ZL419AFTOtggHJJcmkodxeXjbkg'

function headers(accessToken) {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'authorization': `Bearer ${accessToken}`,
    'content-type': 'application/json',
    'prefer': 'return=representation'
  }
}

async function supabaseGet(table, params, accessToken) {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`
  const res = await fetch(url, { headers: headers(accessToken) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase GET ${table} failed (${res.status}): ${body}`)
  }
  return await res.json()
}

async function supabasePost(table, rows, accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(accessToken),
    body: JSON.stringify(rows)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase POST ${table} failed (${res.status}): ${body}`)
  }
  return await res.json()
}

async function supabaseDelete(table, params, accessToken) {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: headers(accessToken)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase DELETE ${table} failed (${res.status}): ${body}`)
  }
}

async function supabasePatch(table, params, body, accessToken) {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(accessToken),
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Supabase PATCH ${table} failed (${res.status}): ${errBody}`)
  }
  return await res.json()
}

async function supabaseRpc(fn, body, accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(accessToken),
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Supabase RPC ${fn} failed (${res.status}): ${errBody}`)
  }
  return await res.json()
}

module.exports = { supabaseGet, supabasePost, supabaseDelete, supabasePatch, supabaseRpc, SUPABASE_URL, SUPABASE_ANON_KEY }
