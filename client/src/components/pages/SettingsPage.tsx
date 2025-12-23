'use client'

import React from 'react'
import { useTheme, Theme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Trash2, RefreshCcw, Repeat, FlaskConical } from 'lucide-react'
import AccountMenuButton from '@/components/auth/AccountMenuButton'
import { ConfirmDialog } from '@/components/modals'
import api from '@/services/api'
import { ToggleSwitch } from '@/components/ui'

type ThemePalette = {
  background: string
  surface: string
  accent: string
  accentMuted: string
  text: string
  textMuted: string
  border: string
}

type ThemeOption = {
  id: Theme
  label: string
  description: string
  group: 'default' | 'custom'
  palette: ThemePalette
}

const THEME_OPTIONS_UNSORTED: ThemeOption[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Bright and clean interface',
    group: 'default',
    palette: {
      background: '#f3f4f6',
      surface: '#ffffff',
      accent: '#3b82f6',
      accentMuted: '#dbeafe',
      text: '#0f172a',
      textMuted: '#94a3b8',
      border: '#e2e8f0',
    },
  },
  {
    id: 'dark',
    label: 'Nightfall',
    description: 'Balanced contrast for low-light focus',
    group: 'default',
    palette: {
      background: '#0f172a',
      surface: '#1e293b',
      accent: '#2563eb',
      accentMuted: '#1d4ed8',
      text: '#e2e8f0',
      textMuted: '#94a3b8',
      border: '#334155',
    },
  },
  {
    id: 'mono',
    label: 'Midnight',
    description: 'High-contrast monochrome style',
    group: 'default',
    palette: {
      background: '#000000',
      surface: '#0f0f0f',
      accent: '#fbbf24',
      accentMuted: '#f59e0b',
      text: '#f5f5f5',
      textMuted: '#9ca3af',
      border: '#1f1f1f',
    },
  },
  {
    id: 'aubergine',
    label: 'Aubergine',
    description: 'Rich purples with vibrant highlights',
    group: 'custom',
    palette: {
      background: '#1f1029',
      surface: '#2c1c3a',
      accent: '#9d4edd',
      accentMuted: '#7f3fb5',
      text: '#f8f5ff',
      textMuted: '#d8c4f0',
      border: '#4a2d63',
    },
  },
  {
    id: 'hoth',
    label: 'Hoth',
    description: 'Frosted whites with glacial accents',
    group: 'custom',
    palette: {
      background: '#f3f4f6',
      surface: '#ffffff',
      accent: '#0ea5e9',
      accentMuted: '#bae6fd',
      text: '#0f172a',
      textMuted: '#6b7280',
      border: '#e2e8f0',
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Violet twilight with neon glow',
    group: 'custom',
    palette: {
      background: '#141827',
      surface: '#1e2431',
      accent: '#a855f7',
      accentMuted: '#c4b5fd',
      text: '#f4f5ff',
      textMuted: '#d8dafe',
      border: '#2f3546',
    },
  },
  {
    id: 'choco-mint',
    label: 'Choco Mint',
    description: 'Earthy neutrals with mint highlights',
    group: 'custom',
    palette: {
      background: '#1f2620',
      surface: '#2b352c',
      accent: '#4ade80',
      accentMuted: '#bbf7d0',
      text: '#f7f7f2',
      textMuted: '#d1f7c4',
      border: '#405143',
    },
  },
  {
    id: 'ochin',
    label: 'Ochin',
    description: 'Ocean blues with soft highlights',
    group: 'custom',
    palette: {
      background: '#101f33',
      surface: '#172a46',
      accent: '#38bdf8',
      accentMuted: '#93c5fd',
      text: '#f1f5f9',
      textMuted: '#cbd5f5',
      border: '#29446b',
    },
  },
  {
    id: 'work-hard',
    label: 'Cafe',
    description: 'Warm coffee tones for focus',
    group: 'custom',
    palette: {
      background: '#2d2213',
      surface: '#3a2d1a',
      accent: '#facc15',
      accentMuted: '#fbbf24',
      text: '#fdf5e6',
      textMuted: '#f5d099',
      border: '#54422a',
    },
  },
]

const THEME_OPTIONS: ThemeOption[] = [...THEME_OPTIONS_UNSORTED].sort((a, b) =>
  a.label.localeCompare(b.label)
)

const ThemePreview: React.FC<{ option: ThemeOption }> = ({ option }) => {
  const accentPrimary = getEntityColorStyles(option.id, 0).accentHex
  const accentSecondary = getEntityColorStyles(option.id, 1).accentHex
  return (
    <div
      className="w-24 h-20 rounded-xl border overflow-hidden shadow-sm flex-shrink-0"
      style={{ background: option.palette.background, borderColor: option.palette.border }}
    >
      <div
        className="h-full w-full rounded-lg"
        style={{
          background: option.palette.surface,
          border: `1px solid ${option.palette.border}`,
          padding: '0.55rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
        }}
      >
        <div
          style={{
            height: '6px',
            borderRadius: '9999px',
            background: option.palette.accent,
            width: '60%',
          }}
        />
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            style={{
              display: 'flex',
              gap: '0.45rem',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '9999px',
                background: row === 0 ? accentPrimary : accentSecondary,
                opacity: row === 0 ? 1 : 0.75,
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: '5px',
                  borderRadius: '9999px',
                  background: option.palette.text,
                  opacity: row === 0 ? 0.85 : 0.65,
                  width: row === 0 ? '72%' : row === 1 ? '64%' : '58%',
                }}
              />
              <div
                style={{
                  height: '4px',
                  borderRadius: '9999px',
                  background: option.palette.textMuted,
                  opacity: 0.45,
                  width: row === 0 ? '48%' : row === 1 ? '42%' : '38%',
                  marginTop: '4px',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const ThemeOptionCard: React.FC<{
  option: ThemeOption
  selected: boolean
  onSelect: (theme: Theme) => void
}> = ({ option, selected, onSelect }) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.id)}
      className="relative w-full rounded-xl border transition-all text-left shadow-sm focus:outline-none"
      aria-pressed={selected}
      style={{
          borderColor: option.palette.border,
          borderWidth: '2px',
          background: option.palette.background,
          color: option.palette.text,
          minHeight: '132px',
      }}
    >
      <div className="flex items-start gap-3 p-3">
        <ThemePreview option={option} />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: option.palette.text }}>
              {option.label}
              </span>
          </div>
          <p
            className="text-sm leading-snug"
            style={{ color: option.palette.textMuted }}
          >
            {option.description}
          </p>
        </div>
      </div>
      <span
        aria-hidden="true"
        className={`selection-indicator absolute top-3 right-3 ${selected ? 'is-selected' : ''}`}
        style={{ color: option.palette.border, backgroundColor: option.palette.background }}
      />
    </button>
  )
}

export default function SettingsPage() {
  const { theme, setTheme, hideSensitive, toggleHideSensitive } = useTheme()
  const appVersion = (process.env.NEXT_PUBLIC_APP_VERSION as string) || 'dev'
  const [syncMode, setSyncMode] = React.useState<'normal' | 'advanced'>('normal')
  const [deleteMode, setDeleteMode] = React.useState<'safe' | 'unsafe'>('safe')
  const [useCustomFields, setUseCustomFields] = React.useState<boolean>(true)
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importText, setImportText] = React.useState<string>('')
  const [showAddonImport, setShowAddonImport] = React.useState<boolean>(false)
  const [configImporting, setConfigImporting] = React.useState<boolean>(false)
  const [showConfigImport, setShowConfigImport] = React.useState<boolean>(false)
  const [configText, setConfigText] = React.useState<string>('')
  const [isDraggingFiles, setIsDraggingFiles] = React.useState<boolean>(false)
  const [isDraggingAddonsOver, setIsDraggingAddonsOver] = React.useState<boolean>(false)
  const [isDraggingConfigOver, setIsDraggingConfigOver] = React.useState<boolean>(false)
  const addonsDragDepth = React.useRef<number>(0)
  const configDragDepth = React.useRef<number>(0)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [apiKeyStatus, setApiKeyStatus] = React.useState<{ hasKey: boolean }>({ hasKey: false })
  const [currentApiKey, setCurrentApiKey] = React.useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = React.useState<string>('')
  const autoGenAttemptedRef = React.useRef<boolean>(false)
  const [revealedFields, setRevealedFields] = React.useState<Set<string>>(new Set())
  
  // Account management confirmation modals
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirmConfig, setConfirmConfig] = React.useState<{ title: string; description: string; isDanger?: boolean; onConfirm: () => void }>({ title: '', description: '', isDanger: true, onConfirm: () => {} })
  
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'

  const openConfirm = (cfg: { title: string; description: string; isDanger?: boolean; onConfirm: () => void }) => {
    setConfirmConfig(cfg)
    setConfirmOpen(true)
  }

  React.useEffect(() => {
    api.get('/settings/account-sync')
      .then(r => {
        const mode = (r.data?.mode === 'advanced') ? 'advanced' : 'normal'
        const safe = (r.data?.safe !== undefined) ? !!r.data.safe : !(!!r.data?.unsafe)
        setSyncMode(mode)
        setDeleteMode(safe ? 'safe' : 'unsafe')
        // Extract webhook URL from sync config
        const whUrl = r.data?.webhookUrl || ''
        setWebhookUrl(whUrl)
        // Extract useCustomFields from sync config (with backward compatibility for useCustomNames)
        const customFields = r.data?.useCustomFields !== undefined ? !!r.data.useCustomFields : (r.data?.useCustomNames !== undefined ? !!r.data.useCustomNames : false)
        setUseCustomFields(customFields)
      })
      .catch(() => {})
      // Fetch API key - decrypt and show if exists, auto-generate if missing
    api.get('/settings/account-api')
      .then(async r => {
        const hasKey = r.data?.hasKey || false
        const apiKey = r.data?.apiKey || null
        setApiKeyStatus({ hasKey })
        if (hasKey && apiKey) {
          setCurrentApiKey(apiKey)
        }
        // Auto-generate if missing
        if (!hasKey && !autoGenAttemptedRef.current) {
          autoGenAttemptedRef.current = true
          try {
            const resp = await api.post('/settings/account-api-key')
            const newKey = resp.data?.apiKey
            if (newKey) {
              setCurrentApiKey(newKey)
              setApiKeyStatus({ hasKey: true })
              toast.success('API key auto-generated!')
              navigator.clipboard.writeText(newKey).catch(() => {})
            }
          } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Failed to auto-generate API key')
          }
        }
      })
      .catch(() => {})
  }, [])

  // Global file-drag detection to hint buttons
  React.useEffect(() => {
    let dragCounter = 0
    let resetTimer: any = null
    const isFileDrag = (e: DragEvent) => {
      const dt = e.dataTransfer
      if (!dt) return false
      // Cross-browser checks (Chrome/Firefox/Safari)
      if (dt.files && dt.files.length > 0) return true
      const types = dt.types ? Array.from(dt.types) : []
      return types.includes('Files') || types.includes('public.file-url') || types.includes('text/uri-list')
    }
    const scheduleReset = () => {
      if (resetTimer) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => setIsDraggingFiles(false), 150)
    }
    const onDragOverCap = (e: DragEvent) => {
      if (isFileDrag(e)) {
        e.preventDefault()
        setIsDraggingFiles(true)
        scheduleReset()
      }
    }
    const onDragEnterCap = (e: DragEvent) => {
      if (isFileDrag(e)) {
        dragCounter++
        setIsDraggingFiles(true)
      }
    }
    const onDragLeaveCap = (e: DragEvent) => {
      if (isFileDrag(e)) {
        dragCounter = Math.max(0, dragCounter - 1)
        if (dragCounter === 0) setIsDraggingFiles(false)
      }
    }
    const onDropCap = (e: DragEvent) => {
      if (isFileDrag(e)) {
        e.preventDefault()
      }
      dragCounter = 0
      setIsDraggingFiles(false)
    }
    const el = containerRef.current || document.body
    // Attach on a stable container to ensure capture works consistently
    el.addEventListener('dragover', onDragOverCap, true)
    el.addEventListener('dragenter', onDragEnterCap, true)
    el.addEventListener('dragleave', onDragLeaveCap, true)
    el.addEventListener('drop', onDropCap, true)
    return () => {
      el.removeEventListener('dragover', onDragOverCap, true)
      el.removeEventListener('dragenter', onDragEnterCap, true)
      el.removeEventListener('dragleave', onDragLeaveCap, true)
      el.removeEventListener('drop', onDropCap, true)
      if (resetTimer) clearTimeout(resetTimer)
    }
  }, [])

  const onSyncModeChange = (mode: 'normal' | 'advanced') => {
    setSyncMode(mode)
    api.put('/settings/account-sync', { mode })
      .then(() => window.dispatchEvent(new CustomEvent('sfm:settings:changed')))
      .catch(() => {})
  }

  const handleTestWebhook = async () => {
    const trimmed = (webhookUrl || '').trim()
    if (!trimmed) {
      toast.error('Set a webhook URL first')
      return
    }
    try {
      await api.post('/settings/account-sync/test-webhook', { webhookUrl: trimmed })
      toast.success('Test message sent to Discord')
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to send test message'
      toast.error(msg)
    }
  }

  const onDeleteModeChange = (mode: 'safe' | 'unsafe') => {
    setDeleteMode(mode)
    api.put('/settings/account-sync', { safe: mode === 'safe' })
      .then(() => window.dispatchEvent(new CustomEvent('sfm:settings:changed')))
      .catch(() => {})
  }

  // Import addons mutation (uses axios client to include CSRF header)
  const importAddonsMutation = useMutation({
    mutationFn: async (data: { file?: File; text?: string; mode: 'file' | 'text' }) => {
      if (data.mode === 'file' && data.file) {
        const formData = new FormData()
        formData.append('file', data.file)
        const response = await api.post('/public-auth/addon-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        return response.data
      } else if (data.mode === 'text' && data.text) {
        // send text as a temporary file to the same endpoint
        const blob = new Blob([data.text], { type: 'application/json' })
        const formData = new FormData()
        formData.append('file', new File([blob], 'addons.json', { type: 'application/json' }))
        const response = await api.post('/public-auth/addon-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        return response.data
      } else {
        throw new Error('Invalid import data')
      }
    },
    onSuccess: (data) => {
      toast.success(`Import complete! ${data.successful} successful, ${data.failed} failed, ${data.redundant} redundant`)
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to import addons')
    }
  })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setImportFile(file)
      importAddonsMutation.mutate({ file, mode: 'file' })
      setImportFile(null)
      // Reset file input
      event.target.value = ''
    }
  }

  const handleUploadClick = () => {
    const fileInput = document.getElementById('import-file') as HTMLInputElement
    if (fileInput) fileInput.click()
  }

  const handleImport = () => {
    if (importText.trim()) {
      importAddonsMutation.mutate({ text: importText.trim(), mode: 'text' })
      setImportText('')
    }
  }

  const onDropImport = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      importAddonsMutation.mutate({ file, mode: 'file' })
    } else {
      const text = e.dataTransfer.getData('text')
      if (text && text.trim()) {
        setImportText(text)
      }
    }
  }
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  // Button-level drag & drop (addons)
  const onButtonDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const onDropAddonsButton = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = (e as React.DragEvent<any>).dataTransfer?.files?.[0]
    if (file) {
      importAddonsMutation.mutate({ file, mode: 'file' })
    }
    addonsDragDepth.current = 0
    setIsDraggingAddonsOver(false)
  }

  // Button-level drag & drop (configuration)
  const onDropConfigButton = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = (e as React.DragEvent<any>).dataTransfer?.files?.[0]
    if (file) {
      const formData = new FormData()
      formData.append('file', file)
      setConfigImporting(true)
      api.post('/public-auth/config-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((resp) => {
          const addons = resp.data?.addons || resp.data?.created || resp.data?.imported || {}
          const users = resp.data?.users || {}
          const groups = resp.data?.groups || {}
          const totalAddons = (addons.created || 0) + (addons.reused || 0)
          const messageParts: string[] = []
          if (totalAddons > 0) messageParts.push(`${totalAddons} addons`)
          if (users.created > 0) messageParts.push(`${users.created} users`)
          if (groups.created > 0) messageParts.push(`${groups.created} groups`)
          toast.success(`Configuration imported${messageParts.length ? `:\n${messageParts.join('\n')}` : ''}`)
        })
        .catch((err) => {
          const msg = err?.response?.data?.message || err?.message || 'Import configuration failed'
          toast.error(msg)
        })
        .finally(() => setConfigImporting(false))
    }
    configDragDepth.current = 0
    setIsDraggingConfigOver(false)
  }
  const onButtonDragEnterAddons = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); addonsDragDepth.current += 1; setIsDraggingAddonsOver(true) }
  const onButtonDragLeaveAddons = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); addonsDragDepth.current = Math.max(0, addonsDragDepth.current - 1); if (addonsDragDepth.current === 0) setIsDraggingAddonsOver(false) }
  const onButtonDragEnterConfig = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); configDragDepth.current += 1; setIsDraggingConfigOver(true) }
  const onButtonDragLeaveConfig = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); configDragDepth.current = Math.max(0, configDragDepth.current - 1); if (configDragDepth.current === 0) setIsDraggingConfigOver(false) }

  const exportAddons = async () => {
    try {
      const res = await api.get('/public-auth/addon-export')
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '') // YYYYMMDD format
      const a = document.createElement('a'); a.href = url; a.download = `${date}-syncio-addons.json`; a.click(); URL.revokeObjectURL(url)
      toast.success('Addons exported')
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Export failed'
      toast.error(msg)
    }
  }

  const exportConfig = async () => {
    try {
      const res = await api.get('/public-auth/config-export')
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '') // YYYYMMDD format
      const a = document.createElement('a'); a.href = url; a.download = `${date}-syncio-config.json`; a.click(); URL.revokeObjectURL(url)
      toast.success('Configuration exported')
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Export failed'
      toast.error(msg)
    }
  }

  // Reset account then import full configuration (file or pasted text)
  const importConfiguration = async () => {
    try {
      setConfigImporting(true)
      const input = document.getElementById('import-config-file') as HTMLInputElement
      const file = input?.files?.[0]
      if (file) {
        const formData = new FormData()
        formData.append('file', file)
        const resp = await api.post('/public-auth/config-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        const { addons, users, groups } = resp.data
        const totalAddons = (addons.created || 0) + (addons.reused || 0)
        
        // Build message with only non-zero values
        const messageParts = []
        if (totalAddons > 0) messageParts.push(`${totalAddons} addons`)
        if (users.created > 0) messageParts.push(`${users.created} users`)
        if (groups.created > 0) messageParts.push(`${groups.created} groups`)
        
        toast.success(`Configuration imported:\n${messageParts.join('\n')}`)
      } else if (configText.trim()) {
        const resp = await api.post('/public-auth/config-import', { jsonData: configText.trim() })
        const { addons, users, groups } = resp.data
        const totalAddons = (addons.created || 0) + (addons.reused || 0)
        
        // Build message with only non-zero values
        const messageParts = []
        if (totalAddons > 0) messageParts.push(`${totalAddons} addons`)
        if (users.created > 0) messageParts.push(`${users.created} users`)
        if (groups.created > 0) messageParts.push(`${groups.created} groups`)
        
        toast.success(`Configuration imported:\n${messageParts.join('\n')}`)
      } else {
        toast.error('Select a file or paste JSON first')
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Import configuration failed'
      toast.error(msg)
    } finally {
      setConfigImporting(false)
    }
  }

  const handleConfigFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const formData = new FormData()
      formData.append('file', file)
      setConfigImporting(true)
      api.post('/public-auth/config-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((resp) => {
          const { addons, users, groups } = resp.data
          const totalAddons = (addons.created || 0) + (addons.reused || 0)
          // Build message with only non-zero values
          const messageParts = []
          if (totalAddons > 0) messageParts.push(`${totalAddons} addons`)
          if (users.created > 0) messageParts.push(`${users.created} users`)
          if (groups.created > 0) messageParts.push(`${groups.created} groups`)
          
          toast.success(`Configuration imported:\n${messageParts.join('\n')}`)
        })
        .catch((e) => {
          const msg = e?.response?.data?.message || e?.message || 'Import configuration failed'
          toast.error(msg)
        })
        .finally(() => setConfigImporting(false))
      // reset input
      event.currentTarget.value = ''
    }
  }

  const onDropConfig = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const formData = new FormData()
      formData.append('file', file)
      setConfigImporting(true)
      api.post('/public-auth/config-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((resp) => {
          const { addons, users, groups } = resp.data
          const totalAddons = (addons.created || 0) + (addons.reused || 0)
          // Build message with only non-zero values
          const messageParts = []
          if (totalAddons > 0) messageParts.push(`${totalAddons} addons`)
          if (users.created > 0) messageParts.push(`${users.created} users`)
          if (groups.created > 0) messageParts.push(`${groups.created} groups`)
          
          toast.success(`Configuration imported:\n${messageParts.join('\n')}`)
        })
        .catch((e) => {
          const msg = e?.response?.data?.message || e?.message || 'Import configuration failed'
          toast.error(msg)
        })
        .finally(() => setConfigImporting(false))
    } else {
      const text = e.dataTransfer.getData('text')
      if (text && text.trim()) setConfigText(text)
    }
  }


  // Bulk delete functions
  const deleteAllAddons = async () => {
    openConfirm({
      title: 'Delete All Addons',
      description: 'Delete ALL addons? This cannot be undone.',
      isDanger: true,
      onConfirm: async () => {
        try {
          // First get all addons
          const addonsRes = await api.get('/addons')
          const addons = addonsRes.data || []
          
          if (addons.length === 0) {
            toast.success('No addons found to delete')
            return
          }

          // Delete each addon using the existing individual delete endpoint
          let successCount = 0
          let errorCount = 0
          
          for (const addon of addons) {
            try {
              await api.delete(`/addons/${addon.id}`)
              successCount++
            } catch (error) {
              console.error(`Failed to delete addon ${addon.id}:`, error)
              errorCount++
            }
          }

          if (errorCount === 0) {
            toast.success(`All addons deleted successfully (${successCount} addons)`)
          } else {
            toast.success(`Addons deleted: ${successCount} successful, ${errorCount} failed`)
          }
          
          // Stay on settings page; UI will naturally update on next navigation
        } catch (e: any) {
          const msg = e?.response?.data?.error || e?.message || 'Delete failed'
          toast.error(msg)
        }
      }
    })
  }

  const deleteAllUsers = async () => {
    openConfirm({
      title: 'Delete All Users',
      description: 'Delete ALL users? This cannot be undone.',
      isDanger: true,
      onConfirm: async () => {
        try {
          // First get all users
          const usersRes = await api.get('/users')
          const users = usersRes.data || []
          
          if (users.length === 0) {
            toast.success('No users found to delete')
            return
          }

          // Delete each user using the existing individual delete endpoint
          let successCount = 0
          let errorCount = 0
          
          for (const user of users) {
            try {
              await api.delete(`/users/${user.id}`)
              successCount++
            } catch (error) {
              console.error(`Failed to delete user ${user.id}:`, error)
              errorCount++
            }
          }

          if (errorCount === 0) {
            toast.success(`All users deleted successfully (${successCount} users)`)
          } else {
            toast.success(`Users deleted: ${successCount} successful, ${errorCount} failed`)
          }
          
          // Stay on settings page; UI will naturally update on next navigation
        } catch (e: any) {
          const msg = e?.response?.data?.error || e?.message || 'Delete failed'
          toast.error(msg)
        }
      }
    })
  }

  const deleteAllGroups = async () => {
    openConfirm({
      title: 'Delete All Groups',
      description: 'Delete ALL groups? This cannot be undone.',
      isDanger: true,
      onConfirm: async () => {
        try {
          // First get all groups
          const groupsRes = await api.get('/groups')
          const groups = groupsRes.data || []
          
          if (groups.length === 0) {
            toast.success('No groups found to delete')
            return
          }

          // Delete each group using the existing individual delete endpoint
          let successCount = 0
          let errorCount = 0
          
          for (const group of groups) {
            try {
              await api.delete(`/groups/${group.id}`)
              successCount++
            } catch (error) {
              console.error(`Failed to delete group ${group.id}:`, error)
              errorCount++
            }
          }

          if (errorCount === 0) {
            toast.success(`All groups deleted successfully (${successCount} groups)`)
          } else {
            toast.success(`Groups deleted: ${successCount} successful, ${errorCount} failed`)
          }
          
          // Stay on settings page; UI will naturally update on next navigation
        } catch (e: any) {
          const msg = e?.response?.data?.error || e?.message || 'Delete failed'
          toast.error(msg)
        }
      }
    })
  }

  return (
    <div ref={containerRef} className="p-4 sm:p-6 relative" style={{ scrollbarGutter: 'stable' }}>
      {/* Desktop Support Buttons - Fixed on Right */}
      <div className="hidden lg:flex flex-row gap-3 fixed right-6 bottom-6 z-10">
        <a
          href="https://buymeacoffee.com/neur0"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block hover:opacity-80 transition-opacity"
          title="Buy me a coffee"
        >
          <img 
            src="/assets/bmc-small.png" 
            alt="Buy me a coffee" 
            className="h-10 w-auto"
          />
        </a>
        <a
          href="https://ko-fi.com/neur0"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block hover:opacity-80 transition-opacity"
          title="Support me on Ko-fi"
        >
          <img 
            src="/assets/kofi-small.png" 
            alt="Support me on Ko-fi" 
            className="h-10 w-auto"
          />
        </a>
      </div>

      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
          <div>
            <h1 className={`hidden sm:block text-xl sm:text-2xl font-bold`}>Settings</h1>
            <p className={`hidden lg:block text-sm sm:text-base color-text-secondary`}>Configure your Syncio preferences</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop account button */}
            <div className="hidden lg:block ml-1">
              <AccountMenuButton />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl">

      {/* Configuration */}
      <div className="p-4 rounded-lg border mt-6 card">
        <h2 className={`text-lg font-semibold`}>Configuration</h2>
        <div className="mt-4 space-y-4">
          {/* Private Mode Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className={`font-medium`}>Private Mode</div>
              <div className={`text-sm color-text-secondary`}>
                Hide sensitive information (username, email, webhook URL, and API key)
              </div>
            </div>
            <ToggleSwitch
              checked={!!hideSensitive}
              onChange={toggleHideSensitive}
              title={hideSensitive ? 'Show sensitive information' : 'Hide sensitive information'}
            />
          </div>

          {/* Custom Addon Names and Descriptions Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className={`font-medium`}>Custom Addon Names and Descriptions</div>
              <div className={`text-sm color-text-secondary`}>
                When syncing addons, use the custom name and description set in Syncio.
              </div>
            </div>
            <ToggleSwitch
              checked={useCustomFields}
              onChange={() => {
                const newValue = !useCustomFields
                setUseCustomFields(newValue)
                api.put('/settings/account-sync', { useCustomFields: newValue })
                  .then(() => toast.success('Sync settings updated'))
                  .catch((err) => toast.error(err?.response?.data?.message || 'Failed to update sync settings'))
              }}
              title={useCustomFields ? 'Disable custom addon names and descriptions' : 'Enable custom addon names and descriptions'}
            />
          </div>

          {/* Advanced Sync Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className={`font-medium`}>Advanced Sync</div>
              <div className={`text-sm color-text-secondary`}>
                Reload all group addons before syncing
              </div>
            </div>
            <ToggleSwitch
              checked={syncMode === 'advanced'}
              onChange={() => {
                const newMode = syncMode === 'advanced' ? 'normal' : 'advanced'
                onSyncModeChange(newMode)
              }}
              title={syncMode === 'advanced' ? 'Disable advanced sync' : 'Enable advanced sync'}
            />
          </div>

          {/* Unsafe Mode Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className={`font-medium`}>Unsafe Mode</div>
              <div className={`text-sm color-text-secondary`}>
                Allow deletion and unprotection of default addons
              </div>
            </div>
            <ToggleSwitch
              checked={deleteMode === 'unsafe'}
              onChange={() => {
                const newMode = deleteMode === 'unsafe' ? 'safe' : 'unsafe'
                onDeleteModeChange(newMode)
              }}
              title={deleteMode === 'unsafe' ? 'Disable unsafe mode' : 'Enable unsafe mode'}
            />
          </div>
        </div>
      </div>

      {/* Discord Webhook */}
      <div className="p-4 rounded-lg border mt-6 card">
        <h2 className={`text-lg font-semibold`}>Discord Webhook</h2>
        <p className={`text-sm mt-1 color-text-secondary`}>
          Receive notifications when automatic syncs or API-triggered syncs complete.
        </p>
        <div className="mt-4">
          <label className={`block text-sm font-medium mb-2`}>
            Webhook URL
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
        <input
              type={hideSensitive && !revealedFields.has('webhook') ? "password" : "text"}
              value={hideSensitive && !revealedFields.has('webhook') ? (webhookUrl ? '••••••••••••••••••••••••••••••••' : '') : webhookUrl}
              onChange={(e) => {
                if (!hideSensitive || revealedFields.has('webhook')) {
                  setWebhookUrl(e.target.value)
                }
              }}
              onClick={() => {
                if (hideSensitive && !revealedFields.has('webhook')) {
                  setRevealedFields(prev => new Set(prev).add('webhook'))
                }
              }}
              onBlur={() => {
                if (webhookUrl && (!hideSensitive || revealedFields.has('webhook'))) {
                  api.put('/settings/account-sync', { webhookUrl: webhookUrl.trim() || undefined })
                    .then(() => toast.success('Webhook URL updated'))
                      .catch((e: any) => toast.error(e?.response?.data?.message || 'Failed to update webhook URL'))
                }
                if (hideSensitive) {
                  setRevealedFields(prev => {
                    const next = new Set(prev)
                    next.delete('webhook')
                    return next
                  })
                }
              }}
              placeholder="https://discord.com/api/webhooks/..."
              className={`input w-full px-3 py-2 ${hideSensitive && !revealedFields.has('webhook') ? 'blur-sm' : ''}`}
            />
            </div>
            <button
              type="button"
              onClick={handleTestWebhook}
              className="w-10 h-10 rounded surface-interactive flex items-center justify-center"
              title="Send test message"
            >
              <FlaskConical className="w-4 h-4" />
            </button>
      </div>
        </div>
      </div>

      {/* API Access */}
      <div className="p-4 rounded-lg border mt-6 card">
        <h2 className={`text-lg font-semibold`}>API Access</h2>
        <p className={`text-sm mt-1 color-text-secondary`}>
          Generate an API key to access your account via external API endpoints.
        </p>
        <div className="mt-4 flex gap-2 items-center">
          <div className="flex-1">
            {(() => {
              const displayValue = hideSensitive && !revealedFields.has('apikey')
                ? (currentApiKey ? '••••••••••••••••••••••••••••••••' : (apiKeyStatus.hasKey ? 'Loading...' : 'Generating...'))
                : (currentApiKey || (apiKeyStatus.hasKey ? 'Loading...' : 'Generating...'))

              return (
                <button
                  type="button"
              onClick={() => {
                if (hideSensitive && !revealedFields.has('apikey')) {
                  setRevealedFields(prev => new Set(prev).add('apikey'))
                    } else if (currentApiKey) {
                  navigator.clipboard.writeText(currentApiKey)
                  toast.success('API key copied to clipboard')
                } else {
                  toast.error('API key not available. Click rotate to generate a new one.')
                }
              }}
              onBlur={() => {
                if (hideSensitive && revealedFields.has('apikey')) {
                  setRevealedFields(prev => {
                    const next = new Set(prev)
                    next.delete('apikey')
                    return next
                  })
                }
              }}
                  className={`input w-full px-3 py-2 text-left cursor-pointer ${hideSensitive && !revealedFields.has('apikey') ? 'blur-sm' : ''}`}
              title={hideSensitive && !revealedFields.has('apikey')
                ? 'Click to reveal API key'
                : (currentApiKey ? 'Click to copy API key' : 'API key only shown once after generation. Click rotate to generate a new one.')
              }
                >
                  <span className="inline-block w-full truncate">{displayValue}</span>
                </button>
              )
            })()}
          </div>
          <button
            onClick={async () => {
              try {
                const resp = await api.post('/settings/account-api-key')
                const newKey = resp.data?.apiKey
                if (newKey) {
                  setCurrentApiKey(newKey)
                  setApiKeyStatus({ hasKey: true })
                  toast.success('New API key generated!')
                  navigator.clipboard.writeText(newKey).catch(() => {})
                }
              } catch (e: any) {
                toast.error(e?.response?.data?.message || 'Failed to generate API key')
              }
            }}
            className={`flex items-center justify-center w-10 h-10 rounded surface-interactive`}
            title="Rotate API key (revoke old and generate new)"
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>
        <p className={`text-xs mt-2 color-text-secondary`}>
          Use this key in the Authorization header:{' '}
          <code 
            onClick={() => {
              if (currentApiKey) {
                const fullHeader = `Bearer ${currentApiKey}`
                navigator.clipboard.writeText(fullHeader)
                toast.success('Authorization header copied to clipboard')
              } else {
                toast.error('API key not available')
              }
            }}
            className={`px-1 py-0.5 color-surface rounded cursor-pointer hover:opacity-80 transition-opacity ${
              hideSensitive && !revealedFields.has('apikey') ? 'blur-sm' : ''
            }`}
            title={currentApiKey ? 'Click to copy "Bearer {key}"' : 'API key not available'}
          >
            Bearer {hideSensitive && !revealedFields.has('apikey') ? '••••••••••••••••••••••••••••••••' : (currentApiKey || '••••••••••••••••••••••••••••••••')}
          </code>
        </p>
      </div>

      {/* Theme Setting */}
      <div className="p-4 rounded-lg border mt-6 card">
        <h2 className={`text-lg font-semibold`}>Appearance</h2>
        <p className={`text-sm mt-1 color-text-secondary`}>
          Choose your preferred visual theme for the application.
        </p>
        <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {THEME_OPTIONS.map((option) => (
                <ThemeOptionCard
                  key={option.id}
                  option={option}
                  selected={theme === option.id}
                  onSelect={setTheme}
                />
              ))}
          </div>
        </div>
      </div>

      {/* Support - Mobile Only */}
      <div className="lg:hidden p-4 rounded-lg border mt-6 card">
        <h2 className={`text-lg font-semibold`}>Support</h2>
        <p className={`text-sm mt-1 color-text-secondary`}>
          If you find Syncio useful, consider supporting the project.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <a
            href="https://buymeacoffee.com/neur0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-80 transition-opacity"
            title="Buy me a coffee"
          >
            <img 
              src="/assets/bmc.png" 
              alt="Buy me a coffee" 
              className="h-10 w-auto"
            />
          </a>
          <a
            href="https://ko-fi.com/neur0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-80 transition-opacity"
            title="Support me on Ko-fi"
          >
            <img 
              src="/assets/kofi.png" 
              alt="Support me on Ko-fi" 
              className="h-10 w-auto"
            />
          </a>
        </div>
      </div>

      {/* Addon Import/Export - moved to Tasks page */}
      {/* Configuration Import/Export - moved to Tasks page */}

      {/* Maintenance moved to Tasks page */}

      </div>
      
      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        isDanger={confirmConfig.isDanger}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); confirmConfig.onConfirm?.() }}
      />
      
    </div>
  )
}