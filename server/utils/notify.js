const https = require('https')

async function postDiscord(webhookUrl, content, options = {}) {
  try {
    if (!webhookUrl) return
    const url = new URL(webhookUrl)
    
    // If embeds are provided, use embeds format, otherwise use content
    let payload
    if (options.embeds && Array.isArray(options.embeds)) {
      payload = { embeds: options.embeds }
    } else {
      payload = { content }
    }
    
    // Legacy avatar_url support (for backward compatibility)
    if (options.avatar_url) {
      payload.avatar_url = options.avatar_url
    }
    
    const body = JSON.stringify(payload)
    const httpOptions = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }
    await new Promise((resolve, reject) => {
      const req = https.request(httpOptions, (res) => {
        res.on('data', () => {})
        res.on('end', resolve)
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  } catch {}
}

module.exports = { postDiscord }


