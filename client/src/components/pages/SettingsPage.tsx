'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, RotateCcw, Sun, Moon, Sparkles, User, Users, Download, Trash2, RefreshCcw, SunMoon } from 'lucide-react'
import UserMenuButton from '@/components/auth/UserMenuButton'
import api from '@/services/api'

export default function SettingsPage() {
  const { isDark, isModern, isModernDark, theme, setTheme } = useTheme()
  const appVersion = (process.env.NEXT_PUBLIC_APP_VERSION as string) || 'dev'
  const [hideSensitive, setHideSensitive] = React.useState<boolean>(false)
  const [syncMode, setSyncMode] = React.useState<'normal' | 'advanced'>('normal')
  const [deleteMode, setDeleteMode] = React.useState<'safe' | 'unsafe'>('safe')
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importText, setImportText] = React.useState<string>('')
  const [showAddonImport, setShowAddonImport] = React.useState<boolean>(false)
  const [configImporting, setConfigImporting] = React.useState<boolean>(false)
  const [showConfigImport, setShowConfigImport] = React.useState<boolean>(false)
  const [configText, setConfigText] = React.useState<string>('')
  const [backupDays, setBackupDays] = React.useState<number>(0)
  
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'

  React.useEffect(() => {
    const saved = localStorage.getItem('sfm_hide_sensitive')
    setHideSensitive(saved === '1')
    
    const savedSyncMode = localStorage.getItem('sfm_sync_mode')
    setSyncMode(savedSyncMode === 'advanced' ? 'advanced' : 'normal')
    
    const savedDeleteMode = localStorage.getItem('sfm_delete_mode')
    setDeleteMode(savedDeleteMode === 'unsafe' ? 'unsafe' : 'safe')
  }, [])

  // Load backup frequency (only in private mode)
  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_ENABLED !== 'true') {
      api.get('/settings/backup-frequency')
        .then(r => setBackupDays(Number(r.data?.days || 0)))
        .catch(() => {})
    }
  }, [])

  const onToggle = (next: boolean) => {
    setHideSensitive(next)
    localStorage.setItem('sfm_hide_sensitive', next ? '1' : '0')
    // notify other tabs/components if needed
    window.dispatchEvent(new CustomEvent('sfm:settings:changed'))
  }

  const onSyncModeChange = (mode: 'normal' | 'advanced') => {
    setSyncMode(mode)
    localStorage.setItem('sfm_sync_mode', mode)
    // notify other tabs/components if needed
    window.dispatchEvent(new CustomEvent('sfm:settings:changed'))
  }

  const onDeleteModeChange = (mode: 'safe' | 'unsafe') => {
    setDeleteMode(mode)
    localStorage.setItem('sfm_delete_mode', mode)
    // notify other tabs/components if needed
    window.dispatchEvent(new CustomEvent('sfm:settings:changed'))
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
    if (!confirm('Reset configuration (users, groups, addons)? This cannot be undone.')) return
    try {
      const res = await api.post('/public-auth/reset')
      if (res.status !== 200) throw new Error('Reset failed')
      toast.success('Configuration reset')
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Reset failed'
      toast.error(msg)
    }
  }

  const deleteAccount = async () => {
    if (!confirm('Delete your Syncio account and all data? This cannot be undone.')) return
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

  // Bulk delete functions
  const deleteAllAddons = async () => {
    if (!confirm('Delete ALL addons? This cannot be undone.')) return
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
      
      // Refresh the page to update the UI
      window.location.reload()
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Delete failed'
      toast.error(msg)
    }
  }

  const deleteAllUsers = async () => {
    if (!confirm('Delete ALL users? This cannot be undone.')) return
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
      
      // Refresh the page to update the UI
      window.location.reload()
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Delete failed'
      toast.error(msg)
    }
  }

  const deleteAllGroups = async () => {
    if (!confirm('Delete ALL groups? This cannot be undone.')) return
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
      
      // Refresh the page to update the UI
      window.location.reload()
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Delete failed'
      toast.error(msg)
    }
  }

  const clearAllUserAddons = async () => {
    if (!confirm('Clear addons from ALL users? This will remove all addons from all users but keep the users and addons themselves.')) return
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
      
      // Refresh the page to update the UI
      window.location.reload()
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Clear failed'
      toast.error(msg)
    }
  }

  return (
    <div className="p-4 sm:p-6">
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
              <UserMenuButton />
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
            <div className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-sm`}>Mask username and email in user details.</div>
          </div>
          <button
            onClick={() => onToggle(!hideSensitive)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hideSensitive ? 'bg-stremio-purple' : (isDark ? 'bg-gray-700' : 'bg-gray-300')}`}
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

      {/* Addon Import/Export */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Addon Import/Export</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Import addons from a JSON file or paste JSON content directly. Duplicate addons will be skipped. You can also export current addons.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button
            onClick={() => setShowAddonImport(v => !v)}
            className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} flex items-center px-4 py-2 rounded-lg transition-colors`}
          >
            <Upload className="w-5 h-5 mr-2" /> Import Addons
          </button>
          <button
            onClick={exportAddons}
            className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} flex items-center px-4 py-2 rounded-lg transition-colors`}
          >
            <Download className="w-5 h-5 mr-2" /> Export Addons
          </button>
        </div>

        {showAddonImport && (
          <div
            onDrop={onDropImport}
            onDragOver={onDragOver}
            className={`mt-4 p-4 border-2 border-dashed rounded-lg ${isDark ? 'border-gray-600 bg-gray-800/60' : 'border-gray-300 bg-gray-50'}`}
          >
            <div className={`${isDark ? 'text-gray-200' : 'text-gray-800'} mb-2 font-medium`}>
              Drop a .json file here, or paste JSON below, then click Import
            </div>
            {/* Hidden file input for manual selection if desired */}
            <div className="mb-3">
              <button onClick={handleUploadClick} className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} px-3 py-1 rounded`}>
                Choose File
              </button>
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste your JSON content here..."
              rows={8}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <div className="mt-3">
              <button
                onClick={handleImport}
                disabled={!importText.trim() || importAddonsMutation.isPending}
                className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} flex items-center px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {importAddonsMutation.isPending ? (
                  <RotateCcw className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 mr-2" />
                )}
                {importAddonsMutation.isPending ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          id="import-file"
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* (Replaced by single Import UI above) */}
      </div>

      {/* Configuration Import/Export */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Configuration Import/Export</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Export full configuration or reset-and-import a configuration file/JSON.</p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button
            onClick={() => setShowConfigImport(v => !v)}
            className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} flex items-center px-4 py-2 rounded-lg transition-colors`}
          >
            <Upload className="w-5 h-5 mr-2" /> Import Configuration
          </button>
          <button onClick={exportConfig} className={`flex items-center px-4 py-2 rounded-lg transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'}`}>
            <Download className="w-5 h-5 mr-2" /> Export Configuration
          </button>
        </div>

        {showConfigImport && (
          <div
            onDrop={onDropConfig}
            onDragOver={(e) => e.preventDefault()}
            className={`mt-4 p-4 border-2 border-dashed rounded-lg ${isDark ? 'border-gray-600 bg-gray-800/60' : 'border-gray-300 bg-gray-50'}`}
          >
            <div className={`${isDark ? 'text-gray-200' : 'text-gray-800'} mb-2 font-medium`}>
              Drop a .json file here, or paste JSON below, then click Import
            </div>
            <div className="mb-3">
              <button onClick={() => (document.getElementById('import-config-file') as HTMLInputElement)?.click()} className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} px-3 py-1 rounded`}>
                Choose File
              </button>
              <input id="import-config-file" type="file" accept=".json" onChange={handleConfigFileChange} className="hidden" />
            </div>
            <textarea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              placeholder="Paste your configuration JSON here..."
              rows={8}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <div className="mt-3">
              <button
                onClick={importConfiguration}
                disabled={!configText.trim() && !(document.getElementById('import-config-file') as HTMLInputElement)?.files?.length || configImporting}
                className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} flex items-center px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {configImporting ? <RotateCcw className="w-5 h-5 mr-2 animate-spin" /> : <Upload className="w-5 h-5 mr-2" />}
                {configImporting ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Account Management */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Account Management</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Delete all items of a specific type or perform bulk operations. These operations cannot be undone.
        </p>
        <div className={`mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`}>
            <button 
              onClick={deleteAllAddons} 
              className={`flex items-center justify-center px-4 py-3 rounded-lg transition-colors ${
                (theme as any) === 'mono' 
                  ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                  : isDark 
                    ? 'bg-red-800 hover:bg-red-700 text-white' 
                    : 'bg-red-100 hover:bg-red-200 text-red-800'
              }`}
            >
              <Trash2 className="w-5 h-5 mr-2" /> Delete All Addons
            </button>
          <button 
            onClick={deleteAllUsers} 
            className={`flex items-center justify-center px-4 py-3 rounded-lg transition-colors ${
              (theme as any) === 'mono' 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : isDark 
                  ? 'bg-red-800 hover:bg-red-700 text-white' 
                  : 'bg-red-100 hover:bg-red-200 text-red-800'
            }`}
          >
            <User className="w-5 h-5 mr-2" /> Delete All Users
          </button>
          <button 
            onClick={deleteAllGroups} 
            className={`flex items-center justify-center px-4 py-3 rounded-lg transition-colors ${
              (theme as any) === 'mono' 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : isDark 
                  ? 'bg-red-800 hover:bg-red-700 text-white' 
                  : 'bg-red-100 hover:bg-red-200 text-red-800'
            }`}
          >
            <Users className="w-5 h-5 mr-2" /> Delete All Groups
          </button>
          <button 
            onClick={clearAllUserAddons} 
            className={`flex items-center justify-center px-4 py-3 rounded-lg transition-colors ${
              (theme as any) === 'mono' 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : isDark 
                  ? 'bg-red-800 hover:bg-red-700 text-white' 
                  : 'bg-red-100 hover:bg-red-200 text-red-800'
            }`}
          >
            <RefreshCcw className="w-5 h-5 mr-2" /> Clear User Addons
          </button>
          <button 
            onClick={resetConfig} 
            className={`flex items-center justify-center px-4 py-3 rounded-lg transition-colors ${
              (theme as any) === 'mono' 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : isDark 
                  ? 'bg-red-800 hover:bg-red-700 text-white' 
                  : 'bg-red-100 hover:bg-red-200 text-red-800'
            }`}
          >
            <RefreshCcw className="w-5 h-5 mr-2" /> Reset Configuration
          </button>
          {AUTH_ENABLED && (
            <button 
              onClick={deleteAccount} 
              className={`flex items-center justify-center px-4 py-3 rounded-lg transition-colors ${
                (theme as any) === 'mono' 
                  ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                  : isDark 
                    ? 'bg-red-800 hover:bg-red-700 text-white' 
                    : 'bg-red-100 hover:bg-red-200 text-red-800'
              }`}
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
      {/* Version badge */}
      <div className="fixed bottom-3 right-3 text-xs px-2 py-1 rounded-md opacity-80 select-none pointer-events-none"
        style={{
          backgroundColor: isDark ? 'rgba(31,41,55,0.8)' : 'rgba(243,244,246,0.9)',
          color: isDark ? '#d1d5db' : '#111827',
          border: isDark ? '1px solid #374151' : '1px solid #e5e7eb'
        }}
      >
        Syncio v{appVersion}
      </div>
    </div>
  )
}


