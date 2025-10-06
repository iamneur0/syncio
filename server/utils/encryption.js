const crypto = require('crypto')

// In-memory session DEK store keyed by accountId
const accountDekStore = new Map()
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

function getServerKey() {
  const key = process.env.ENCRYPTION_KEY || ''
  if (!key) throw new Error('ENCRYPTION_KEY is required')
  // Normalize to 32 bytes key using SHA-256
  return crypto.createHash('sha256').update(key, 'utf8').digest()
}

function aesGcmEncrypt(rawKey, plaintext) {
  const key = Buffer.isBuffer(rawKey) ? rawKey : Buffer.from(rawKey)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.from(iv).toString('base64') + ':' + ciphertext.toString('base64') + ':' + tag.toString('base64')
}

function aesGcmDecrypt(rawKey, payload) {
  const key = Buffer.isBuffer(rawKey) ? rawKey : Buffer.from(rawKey)
  const parts = String(payload).split(':')
  if (parts.length !== 3) {
    // Backward compatibility: return as-is if not our format
    return String(payload)
  }
  const [ivB64, ctB64, tagB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const ciphertext = Buffer.from(ctB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}

module.exports = { getServerKey, aesGcmEncrypt, aesGcmDecrypt }

// -------------------- Envelope/Public helpers --------------------
function scryptKey(password, salt, keyLen = 32) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), String(salt), keyLen, { N: 1 << 14, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err)
      resolve(Buffer.from(derivedKey))
    })
  })
}

function hkdfSha256(ikm, salt, info = 'syncio-hkdf', length = 32) {
  const prk = crypto.createHmac('sha256', Buffer.from(salt)).update(Buffer.from(ikm)).digest()
  let t = Buffer.alloc(0)
  let okm = Buffer.alloc(0)
  let i = 0
  while (okm.length < length) {
    i += 1
    t = crypto.createHmac('sha256', prk).update(Buffer.concat([t, Buffer.from(info), Buffer.from([i])])).digest()
    okm = Buffer.concat([okm, t])
  }
  return okm.slice(0, length)
}

function deriveDek(serverKeyBuf, userKeyBuf) {
  // Combine server and user keys via HKDF to a 32-byte DEK
  return hkdfSha256(userKeyBuf, serverKeyBuf, 'syncio-dek', 32)
}

function setAccountDek(accountId, dek, ttlMs = DEFAULT_TTL_MS) {
  if (!accountId || !dek) return
  accountDekStore.set(String(accountId), { dek: Buffer.from(dek), expiresAt: Date.now() + ttlMs })
}

function getAccountDek(accountId) {
  if (!accountId) return null
  const entry = accountDekStore.get(String(accountId))
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    accountDekStore.delete(String(accountId))
    return null
  }
  return entry.dek
}

function clearAccountDek(accountId) {
  if (!accountId) return
  accountDekStore.delete(String(accountId))
}

module.exports.scryptKey = scryptKey
module.exports.hkdfSha256 = hkdfSha256
module.exports.deriveDek = deriveDek
module.exports.setAccountDek = setAccountDek
module.exports.getAccountDek = getAccountDek
module.exports.clearAccountDek = clearAccountDek

// AES-256-GCM helpers with explicit iv/tag packaging
// Stored format (base64): iv|ct|tag

function getServerKey() {
  const raw = process.env.ENCRYPTION_KEY || ''
  // Accept base64 or utf8; prefer base64 when it looks like it
  try {
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 44) {
      const b = Buffer.from(raw, 'base64')
      if (b.length >= 32) return b.subarray(0, 32)
    }
  } catch {}
  return Buffer.from((raw || 'syncio-default-key-32chars-please-change!!').padEnd(32, '0').slice(0, 32), 'utf8')
}

function aesGcmEncrypt(key, plaintext, aad) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  if (aad) cipher.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(String(aad)))
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  // Use a more reliable separator format: iv:ct:tag
  return `${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`
}

function aesGcmDecrypt(key, payload, aad) {
  // Handle both old format (base64 with pipes) and new format (colon-separated)
  if (payload.includes(':')) {
    // New format: iv:ct:tag
    const parts = payload.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format')
    }
    const iv = Buffer.from(parts[0], 'base64')
    const ct = Buffer.from(parts[1], 'base64')
    const tag = Buffer.from(parts[2], 'base64')
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    if (aad) decipher.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(String(aad)))
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString('utf8')
  } else {
    // Old format: base64 with pipes (for backward compatibility)
    const buf = Buffer.from(payload, 'base64')
    const firstSplit = splitOnce(buf, Buffer.from('|'))
    const iv = firstSplit[0]
    const secondSplit = splitOnce(firstSplit[1], Buffer.from('|'))
    const ct = secondSplit[0]
    const tag = secondSplit[1]
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    if (aad) decipher.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(String(aad)))
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString('utf8')
  }
}

function splitOnce(buf, delim) {
  const idx = buf.indexOf(delim)
  if (idx === -1) return [buf, Buffer.alloc(0)]
  return [buf.subarray(0, idx), buf.subarray(idx + delim.length)]
}

module.exports = {
  getServerKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
  scryptKey,
  hkdfSha256,
  deriveDek,
  setAccountDek,
  getAccountDek,
  clearAccountDek
}


