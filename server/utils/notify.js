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

/**
 * Creates a Discord embed for sync notifications
 * @param {Object} options
 * @param {number} options.groupsCount - Number of groups synced
 * @param {number} options.usersCount - Total number of users across all groups
 * @param {string} options.syncMode - 'normal' or 'advanced'
 * @param {Array} options.diffs - Array of { name, diffs: { addedResources, removedResources, addedCatalogs, removedCatalogs } }
 * @param {string} [options.sourceLabel] - Optional source label (e.g., 'AIOStreams')
 * @param {string} [options.sourceLogo] - Optional source logo URL
 * @returns {Object} Discord embed object
 */
function createSyncEmbed({ groupsCount, usersCount, syncMode, diffs = [], sourceLabel, sourceLogo }) {
  const fields = []
  
  // Format diffs as one code block per addon (Resources / Catalogs)
  if (Array.isArray(diffs) && diffs.length > 0) {
    for (const item of diffs) {
      const addonName = item?.name || item?.id
      const d = item?.diffs || {}
      const sections = []
      const resLines = []
      const catLines = []
      
      if (Array.isArray(d.addedResources)) d.addedResources.forEach(r => resLines.push(`+ ${r}`))
      if (Array.isArray(d.removedResources)) d.removedResources.forEach(r => resLines.push(`- ${r}`))
      if (Array.isArray(d.addedCatalogs)) d.addedCatalogs.forEach(label => catLines.push(`+ ${label}`))
      if (Array.isArray(d.removedCatalogs)) d.removedCatalogs.forEach(label => catLines.push(`- ${label}`))
      
      if (resLines.length) {
        sections.push('Resources:')
        sections.push(...resLines)
      }
      if (catLines.length) {
        if (resLines.length) sections.push('')
        sections.push('Catalogs:')
        sections.push(...catLines)
      }
      
      if (sections.length) {
        fields.push({ name: addonName, value: '```' + sections.join('\n') + '```', inline: false })
      }
    }
  }

  const embed = {
    title: `Sync Succeeded on ${groupsCount} Groups (${usersCount} Users)`,
    color: 0x808080,
    fields: fields,
    timestamp: new Date().toISOString()
  }

  // Add author block if source/logo provided
  if (sourceLabel && sourceLabel !== 'API') {
    embed.author = {
      name: sourceLabel
    }
    if (sourceLogo) {
      embed.author.icon_url = sourceLogo
    }
  }

  return embed
}

/**
 * Sends a sync notification to Discord
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} options - Same options as createSyncEmbed
 */
async function sendSyncNotification(webhookUrl, options) {
  if (!webhookUrl) return
  
  const embed = createSyncEmbed(options)
  await postDiscord(webhookUrl, null, { 
    embeds: [embed], 
    avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png' 
  })
}

module.exports = { postDiscord, createSyncEmbed, sendSyncNotification }


