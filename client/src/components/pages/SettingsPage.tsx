'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { RotateCcw, Sun, Moon, Sparkles, Trash2, RefreshCcw, SunMoon, Repeat } from 'lucide-react'
import AccountMenuButton from '@/components/auth/AccountMenuButton'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import api from '@/services/api'

export default function SettingsPage() {
  const { isDark, isModern, isModernDark, theme, setTheme, hideSensitive, toggleHideSensitive } = useTheme()
  const appVersion = (process.env.NEXT_PUBLIC_APP_VERSION as string) || 'dev'
  const [syncMode, setSyncMode] = React.useState<'normal' | 'advanced'>('normal')
  const [deleteMode, setDeleteMode] = React.useState<'safe' | 'unsafe'>('safe')
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importText, setImportText] = React.useState<string>('')
  const [showAddonImport, setShowAddonImport] = React.useState<boolean>(false)
  const [configImporting, setConfigImporting] = React.useState<boolean>(false)
  const [showConfigImport, setShowConfigImport] = React.useState<boolean>(false)
  const [configText, setConfigText] = React.useState<string>('')
  const [backupDays, setBackupDays] = React.useState<number>(0)
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

  // Load backup frequency (only in private mode)
  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_ENABLED !== 'true') {
      api.get('/settings/backup-frequency')
        .then(r => setBackupDays(Number(r.data?.days || 0)))
        .catch(() => {})
    }
  }, [])


  const onSyncModeChange = (mode: 'normal' | 'advanced') => {
    setSyncMode(mode)
    api.put('/settings/account-sync', { mode })
      .then(() => window.dispatchEvent(new CustomEvent('sfm:settings:changed')))
      .catch(() => {})
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

  const resetConfig = async () => {
    openConfirm({
      title: 'Reset Configuration',
      description: 'Reset configuration (users, groups, addons)? This cannot be undone.',
      isDanger: true,
      onConfirm: async () => {
        try {
          const res = await api.post('/public-auth/reset')
          if (res.status !== 200) throw new Error('Reset failed')
          toast.success('Configuration reset')
        } catch (e: any) {
          const msg = e?.response?.data?.error || e?.message || 'Reset failed'
          toast.error(msg)
        }
      }
    })
  }

  const deleteAccount = async () => {
    openConfirm({
      title: 'Delete Account',
      description: 'Delete your Syncio account and all data? This cannot be undone.',
      isDanger: true,
      onConfirm: async () => {
        try {
          const res = await api.delete('/public-auth/account')
          if (res.status !== 200) throw new Error('Delete failed')
          toast.success('Account deleted')
        } catch (e: any) {
          const msg = e?.response?.data?.error || e?.message || 'Delete failed'
          toast.error(msg)
        } finally {
          // token is cookie-based now; just notify UI to reset
          try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: false } })) } catch {}
          window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: false } }))
        }
      }
    })
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

  const clearAllUserAddons = async () => {
    openConfirm({
      title: 'Clear All User Addons',
      description: 'Clear addons from ALL users? This will remove all addons from all users but keep the users and addons themselves.',
      isDanger: true,
      onConfirm: async () => {
        try {
          // First get all users
          const usersRes = await api.get('/users')
          const users = usersRes.data || []
          
          if (users.length === 0) {
            toast.success('No users found to clear addons from')
            return
          }

          // Clear addons for each user using the same endpoint as individual clear
          let successCount = 0
          let errorCount = 0
          
          for (const user of users) {
            try {
              await api.post(`/users/${user.id}/stremio-addons/clear`)
              successCount++
            } catch (error) {
              console.error(`Failed to clear addons for user ${user.id}:`, error)
              errorCount++
            }
          }

          if (errorCount === 0) {
            toast.success(`All user addons cleared successfully (${successCount} users)`)
          } else {
            toast.success(`User addons cleared for ${successCount} users, ${errorCount} failed`)
          }
          
          // Stay on settings page; UI will naturally update on next navigation
        } catch (e: any) {
          const msg = e?.response?.data?.error || e?.message || 'Clear failed'
          toast.error(msg)
        }
      }
    })
  }

  return (
    <div ref={containerRef} className="p-4 sm:p-6" style={{ scrollbarGutter: 'stable' }}>
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
          <div>
            <h1 className={`hidden sm:block text-xl sm:text-2xl font-bold ${
              isModern 
                ? 'text-purple-800' 
                : isModernDark
                ? 'text-purple-100'
                : isDark ? 'text-white' : 'text-gray-900'
            }`}>Settings</h1>
            <p className={`text-sm sm:text-base ${
              isModern 
                ? 'text-purple-600' 
                : isModernDark
                ? 'text-purple-300'
                : isDark ? 'text-gray-400' : 'text-gray-600'
            }`}>Configure your Syncio preferences</p>
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

      <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Privacy</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Control visibility of sensitive fields in the user details view.
        </p>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Hide sensitive information</div>
            <div className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-sm`}>Mask username, email, webhook URL, and API key.</div>
          </div>
          <button
            onClick={toggleHideSensitive}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              hideSensitive
                ? (theme === 'mono' ? 'bg-white/30 border border-white/20' : (isDark ? 'bg-gray-600' : 'bg-gray-800'))
                : (theme === 'mono' ? 'bg-white/15 border border-white/20' : (isDark ? 'bg-gray-700' : 'bg-gray-300'))
            }`}
            aria-pressed={hideSensitive}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${hideSensitive ? 'translate-x-5' : 'translate-x-1'}`}
            />
          </button>
        </div>
      </div>

      {/* Sync Mode Setting */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Sync Behavior</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Control how addon synchronization works when syncing users or groups.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex items-center">
            <input
              type="radio"
              id="sync-normal"
              name="sync-mode"
              value="normal"
              checked={syncMode === 'normal'}
              onChange={() => onSyncModeChange('normal')}
              className="mr-3"
            />
            <label htmlFor="sync-normal" className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              <div className="font-medium">Normal Sync</div>
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Push existing group addons to users
              </div>
            </label>
          </div>
          <div className="flex items-center">
            <input
              type="radio"
              id="sync-advanced"
              name="sync-mode"
              value="advanced"
              checked={syncMode === 'advanced'}
              onChange={() => onSyncModeChange('advanced')}
              className="mr-3"
            />
            <label htmlFor="sync-advanced" className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              <div className="font-medium">Advanced Sync</div>
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Reload all group addons first, then sync the updated addons to users
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Delete Mode Setting */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Delete Protection</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Choose how delete protection behaves.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex items-center">
            <input
              type="radio"
              id="delete-safe"
              name="delete-mode"
              value="safe"
              checked={deleteMode === 'safe'}
              onChange={() => onDeleteModeChange('safe')}
              className="mr-3"
            />
            <label htmlFor="delete-safe" className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              <div className="font-medium">Safe mode</div>
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Can’t delete or unprotect Stremio default addons</div>
            </label>
          </div>
          <div className="flex items-center">
            <input
              type="radio"
              id="delete-unsafe"
              name="delete-mode"
              value="unsafe"
              checked={deleteMode === 'unsafe'}
              onChange={() => onDeleteModeChange('unsafe')}
              className="mr-3"
            />
            <label htmlFor="delete-unsafe" className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              <div className="font-medium">Unsafe mode</div>
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Can delete and unprotect all addons</div>
            </label>
          </div>
        </div>
      </div>

      {/* Theme Setting */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Appearance</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Choose your preferred visual theme for the application.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex items-center">
            <input
              type="radio"
              id="theme-light"
              name="theme"
              value="light"
              checked={theme === 'light'}
              onChange={() => setTheme('light')}
              className="mr-3"
            />
            <label htmlFor="theme-light" className={`flex items-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <Sun className="w-5 h-5 mr-3 text-yellow-500" />
              <div>
                <div className="font-medium">Light</div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Clean and bright interface
                </div>
              </div>
            </label>
          </div>
          <div className="flex items-center">
            <input
              type="radio"
              id="theme-dark"
              name="theme"
              value="dark"
              checked={theme === 'dark'}
              onChange={() => setTheme('dark')}
              className="mr-3"
            />
            <label htmlFor="theme-dark" className={`flex items-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <Moon className="w-5 h-5 mr-3 text-blue-400" />
              <div>
                <div className="font-medium">Dark</div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Easy on the eyes in low light
                </div>
              </div>
            </label>
          </div>
          {/* Modern themes disabled - keeping code for future use */}
          {/* 
          <div className="flex items-center">
            <input
              type="radio"
              id="theme-modern"
              name="theme"
              value="modern"
              checked={theme === 'modern'}
              onChange={() => setTheme('modern')}
              className="mr-3"
            />
            <label htmlFor="theme-modern" className={`flex items-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <Sparkles className="w-5 h-5 mr-3 text-purple-500" />
              <div>
                <div className="font-medium">Modern Mode</div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Beautiful gradients and modern styling
                </div>
              </div>
            </label>
          </div>
          <div className="flex items-center">
            <input
              type="radio"
              id="theme-modern-dark"
              name="theme"
              value="modern-dark"
              checked={theme === 'modern-dark'}
              onChange={() => setTheme('modern-dark')}
              className="mr-3"
            />
            <label htmlFor="theme-modern-dark" className={`flex items-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <Sparkles className="w-5 h-5 mr-3 text-purple-400" />
              <div>
                <div className="font-medium">Modern Dark Mode</div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Dark gradients with modern styling
                </div>
              </div>
            </label>
          </div>
          */}
          <div className="flex items-center">
            <input
              type="radio"
              id="theme-mono"
              name="theme"
              value="mono"
              checked={(theme as any) === 'mono'}
              onChange={() => setTheme('mono' as any)}
              className="mr-3"
            />
            <label htmlFor="theme-mono" className={`flex items-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <SunMoon className="w-5 h-5 mr-3 text-black" />
              <div>
                <div className="font-medium">Black</div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  For the minimalism enjoyers
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Automatic Backups - only available in private mode */}
      {process.env.NEXT_PUBLIC_AUTH_ENABLED !== 'true' && (
        <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Automatic Backups</h2>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Save configuration snapshots to the server-side "backup" folder on a schedule.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <select
              value={backupDays}
              onChange={(e) => {
                const days = Number(e.target.value)
                setBackupDays(days)
                api.put('/settings/backup-frequency', { days })
                  .then(() => toast.success('Backup schedule updated'))
                  .catch((err) => toast.error(err?.response?.data?.message || 'Failed to update backup schedule'))
              }}
              className={`${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded px-3 py-2`}
            >
              <option value={0}>Disabled</option>
              <option value={1}>Every day</option>
              <option value={7}>Every week</option>
              <option value={15}>Every 15 days</option>
              <option value={30}>Every month</option>
            </select>
            <button
              onClick={async () => {
                try {
                  await api.post('/settings/backup-now')
                  toast.success('Backup started')
                } catch (e: any) {
                  toast.error(e?.response?.data?.message || 'Failed to start backup')
                }
              }}
              className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} px-3 py-2 rounded`}
            >Run now</button>
          </div>
          <div className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            Files are saved under server folder: data/backup/
          </div>
        </div>
      )}

      {/* Addon Import/Export - moved to Tasks page */}
      {/* Configuration Import/Export - moved to Tasks page */}

      {/* Maintenance moved to Tasks page */}

      {/* Discord Webhook */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Discord Webhook</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Receive notifications when automatic syncs or API-triggered syncs complete.
        </p>
        <div className="mt-4">
          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Webhook URL
          </label>
          <div className="relative">
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
                    .catch(() => toast.error('Failed to update webhook URL'))
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
              className={`w-full border rounded px-3 py-2 ${
                isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
              } ${hideSensitive && !revealedFields.has('webhook') ? 'blur-sm' : ''}`}
            />
          </div>
        </div>
      </div>

      {/* API Access */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>API Access</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Generate an API key to access your account via external API endpoints.
        </p>
        <div className="mt-4 flex gap-2 items-center">
          <div className="flex-1">
            <input
              type={hideSensitive && !revealedFields.has('apikey') ? "password" : "text"}
              value={hideSensitive && !revealedFields.has('apikey')
                ? (currentApiKey ? '••••••••••••••••••••••••••••••••' : (apiKeyStatus.hasKey ? 'Loading...' : 'Generating...'))
                : (currentApiKey || (apiKeyStatus.hasKey ? 'Loading...' : 'Generating...'))
              }
              readOnly
              onClick={() => {
                if (hideSensitive && !revealedFields.has('apikey')) {
                  setRevealedFields(prev => new Set(prev).add('apikey'))
                } else if (!hideSensitive && currentApiKey) {
                  navigator.clipboard.writeText(currentApiKey)
                  toast.success('API key copied to clipboard')
                } else if (hideSensitive && revealedFields.has('apikey') && currentApiKey) {
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
              className={`w-full border rounded px-3 py-2 cursor-pointer ${
                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
              } ${hideSensitive && !revealedFields.has('apikey') ? 'blur-sm' : ''}`}
              title={hideSensitive && !revealedFields.has('apikey')
                ? 'Click to reveal API key'
                : (currentApiKey ? 'Click to copy API key' : 'API key only shown once after generation. Click rotate to generate a new one.')
              }
            />
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
            className={`flex items-center justify-center w-10 h-10 rounded ${
              isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
            }`}
            title="Rotate API key (revoke old and generate new)"
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>
        <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
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
            className={`px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded cursor-pointer hover:opacity-80 transition-opacity ${
              hideSensitive && !revealedFields.has('apikey') ? 'blur-sm' : ''
            }`}
            title={currentApiKey ? 'Click to copy "Bearer {key}"' : 'API key not available'}
          >
            Bearer {hideSensitive && !revealedFields.has('apikey') ? '••••••••••••••••••••••••••••••••' : (currentApiKey || '••••••••••••••••••••••••••••••••')}
          </code>
        </p>
      </div>

      {/* Account Management */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Account Management</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Delete all items of a specific type or perform bulk operations. These operations cannot be undone.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button 
            onClick={clearAllUserAddons} 
            className="accent-bg accent-text hover:opacity-90 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCcw className="w-5 h-5 mr-2" /> Clear User Addons
          </button>
          <button 
            onClick={resetConfig} 
            className="accent-bg accent-text hover:opacity-90 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCcw className="w-5 h-5 mr-2" /> Reset Configuration
          </button>
          {AUTH_ENABLED && (
            <button 
              onClick={deleteAccount} 
              className="accent-bg accent-text hover:opacity-90 flex items-center px-4 py-2 rounded-lg transition-colors"
            >
              <Trash2 className="w-5 h-5 mr-2" /> Delete Account
            </button>
          )}
        </div>
        <div className={`text-xs mt-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          ⚠️ These operations are permanent and cannot be undone. Consider exporting your data first.
        </div>
      </div>

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


