'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, Download, RotateCcw, AlertTriangle, Trash2, User, Users, RefreshCcw, RefreshCw } from 'lucide-react'
import AccountMenuButton from '@/components/auth/AccountMenuButton'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import api from '@/services/api'

export default function TasksPage() {
  const { isDark, isModern, isModernDark, theme } = useTheme()
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [configImporting, setConfigImporting] = React.useState<boolean>(false)
  const [addonImporting, setAddonImporting] = React.useState<boolean>(false)
  const [isDraggingAddonsOver, setIsDraggingAddonsOver] = React.useState<boolean>(false)
  const [isDraggingConfigOver, setIsDraggingConfigOver] = React.useState<boolean>(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirmConfig, setConfirmConfig] = React.useState<{ title: string; description: string; isDanger?: boolean; onConfirm: () => void }>({ title: '', description: '', isDanger: true, onConfirm: () => {} })
  const [syncingUsers, setSyncingUsers] = React.useState<boolean>(false)
  const [syncingGroups, setSyncingGroups] = React.useState<boolean>(false)
  const [reloadingAddons, setReloadingAddons] = React.useState<boolean>(false)
  const [syncMinutes, setSyncMinutes] = React.useState<number>(0)
  
  const addonsDragDepth = React.useRef<number>(0)
  const configDragDepth = React.useRef<number>(0)

  React.useEffect(() => {
    api.get('/settings/sync-frequency')
      .then(r => setSyncMinutes(Number(r.data?.minutes || 0)))
      .catch(() => {})
  }, [])

  const openConfirm = (cfg: { title: string; description: string; isDanger?: boolean; onConfirm: () => void }) => {
    setConfirmConfig(cfg)
    setConfirmOpen(true)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setImportFile(file)
      importAddonsMutation.mutate({ file, mode: 'file' })
    }
  }

  const handleConfigFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const formData = new FormData()
      formData.append('file', file)
      setConfigImporting(true)
      api.post('/public-auth/config-import', formData)
        .then((resp) => {
          const { addons, users, groups } = resp.data
          toast.success(`Imported ${addons} addons, ${users} users, ${groups} groups`)
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

  const importAddonsMutation = useMutation({
    mutationFn: async (data: { file?: File; mode: 'file' }) => {
      if (data.mode === 'file' && data.file) {
        const formData = new FormData()
        formData.append('file', data.file)
        setAddonImporting(true)
        return api.post('/public-auth/addon-import', formData)
      }
      throw new Error('Invalid import data')
    },
    onSuccess: (data: any) => {
      toast.success(`Import complete! ${data.successful} successful, ${data.failed} failed, ${data.redundant} redundant`)
      setAddonImporting(false)
      setImportFile(null)
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error || error?.message || 'Import failed'
      toast.error(msg)
      setAddonImporting(false)
      setImportFile(null)
    }
  })

  const handleUploadClick = () => {
    document.getElementById('import-file')?.click()
  }

  const onButtonDragEnterAddons = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addonsDragDepth.current++
    if (e.dataTransfer.files?.length || e.dataTransfer.getData('text')) {
      setIsDraggingAddonsOver(true)
    }
  }

  const onButtonDragLeaveAddons = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addonsDragDepth.current--
    if (addonsDragDepth.current <= 0) {
      setIsDraggingAddonsOver(false)
      addonsDragDepth.current = 0
    }
  }

  const onButtonDragEnterConfig = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    configDragDepth.current++
    if (e.dataTransfer.files?.length || e.dataTransfer.getData('text')) {
      setIsDraggingConfigOver(true)
    }
  }

  const onButtonDragLeaveConfig = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    configDragDepth.current--
    if (configDragDepth.current <= 0) {
      setIsDraggingConfigOver(false)
      configDragDepth.current = 0
    }
  }

  const onButtonDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const onDropAddonsButton = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      setImportFile(file)
      importAddonsMutation.mutate({ file, mode: 'file' })
    }
    addonsDragDepth.current = 0
    setIsDraggingAddonsOver(false)
  }

  const onDropConfigButton = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const formData = new FormData()
      formData.append('file', file)
      setConfigImporting(true)
      api.post('/config/import', formData)
        .then((resp) => {
          const { addons, users, groups } = resp.data
          toast.success(`Imported ${addons} addons, ${users} users, ${groups} groups`)
        })
        .catch((e) => {
          const msg = e?.response?.data?.message || e?.message || 'Import configuration failed'
          toast.error(msg)
        })
        .finally(() => setConfigImporting(false))
    } else {
      const text = e.dataTransfer.getData('text')
      if (text && text.trim()) {
        // Handle text import
      }
    }
    configDragDepth.current = 0
    setIsDraggingConfigOver(false)
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

  const reloadAllAddons = async () => {
    try {
      setReloadingAddons(true)
      const res = await api.post('/addons/reload-all')
      const reloaded = res.data?.reloaded ?? 0
      toast.success(`Reloaded ${reloaded} addons`)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to reload addons')
    } finally {
      setReloadingAddons(false)
    }
  }

  const syncAllUsers = async () => {
    try {
      setSyncingUsers(true)
      const usersRes = await api.get('/users')
      const users = usersRes.data || []
      
      let successCount = 0
      let errorCount = 0
      
      for (const user of users) {
        try {
          await api.post(`/users/${user.id}/sync`)
          successCount++
        } catch (error) {
          console.error(`Failed to sync user ${user.id}:`, error)
          errorCount++
        }
      }

      if (errorCount === 0) {
        toast.success(`Synced ${successCount} users successfully`)
      } else {
        toast.success(`Synced ${successCount} users, ${errorCount} failed`)
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to sync users')
    } finally {
      setSyncingUsers(false)
    }
  }

  const syncAllGroups = async () => {
    try {
      setSyncingGroups(true)
      const groupsRes = await api.get('/groups')
      const groups = groupsRes.data || []
      
      let successCount = 0
      let errorCount = 0
      
      for (const group of groups) {
        try {
          await api.post(`/groups/${group.id}/sync`)
          successCount++
        } catch (error) {
          console.error(`Failed to sync group ${group.id}:`, error)
          errorCount++
        }
      }

      if (errorCount === 0) {
        toast.success(`Synced ${successCount} groups successfully`)
      } else {
        toast.success(`Synced ${successCount} groups, ${errorCount} failed`)
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to sync groups')
    } finally {
      setSyncingGroups(false)
    }
  }

  const deleteAllAddons = () => {
    openConfirm({
      title: 'Delete All Addons',
      description: 'Delete ALL addons? This cannot be undone.',
      isDanger: true,
      onConfirm: async () => {
        try {
          const addonsRes = await api.get('/addons')
          const addons = addonsRes.data || []
          
          if (addons.length === 0) {
            toast.success('No addons found to delete')
            return
          }

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
            toast.success(`Deleted ${successCount} addons, ${errorCount} failed`)
          }
        } catch (e: any) {
          toast.error(e?.response?.data?.error || e?.message || 'Delete failed')
        }
      }
    })
  }

  const deleteAllUsers = () => {
    openConfirm({
      title: 'Delete All Users',
      description: 'Delete ALL users? This cannot be undone.',
      isDanger: true,
      onConfirm: async () => {
        try {
          const usersRes = await api.get('/users')
          const users = usersRes.data || []
          
          if (users.length === 0) {
            toast.success('No users found to delete')
            return
          }

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
            toast.success(`Deleted ${successCount} users, ${errorCount} failed`)
          }
        } catch (e: any) {
          toast.error(e?.response?.data?.error || e?.message || 'Delete failed')
        }
      }
    })
  }

  const deleteAllGroups = () => {
    openConfirm({
      title: 'Delete All Groups',
      description: 'Delete ALL groups? This cannot be undone.',
      isDanger: true,
      onConfirm: async () => {
        try {
          const groupsRes = await api.get('/groups')
          const groups = groupsRes.data || []
          
          if (groups.length === 0) {
            toast.success('No groups found to delete')
            return
          }

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
            toast.success(`Deleted ${successCount} groups, ${errorCount} failed`)
          }
        } catch (e: any) {
          toast.error(e?.response?.data?.error || e?.message || 'Delete failed')
        }
      }
    })
  }

  const clearAllUserAddons = () => {
    openConfirm({
      title: 'Clear All User Addons',
      description: 'Clear addons from ALL users? This will remove all addons from all users but keep the users and addons themselves.',
      isDanger: true,
      onConfirm: async () => {
        try {
          const usersRes = await api.get('/users')
          const users = usersRes.data || []
          
          if (users.length === 0) {
            toast.success('No users found to clear addons from')
            return
          }

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
            toast.success(`Cleared addons for ${successCount} users, ${errorCount} failed`)
          }
        } catch (e: any) {
          toast.error(e?.response?.data?.error || e?.message || 'Clear failed')
        }
      }
    })
  }

  const textColor = isDark ? 'text-gray-100' : 'text-gray-900'
  const mutedTextColor = isDark ? 'text-gray-400' : 'text-gray-600'

  return (
    <div className="p-4 sm:p-6" style={{ scrollbarGutter: 'stable' }}>
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
          <div>
            <h1 className={`hidden sm:block text-xl sm:text-2xl font-bold ${textColor}`}>
              Tasks
            </h1>
            <p className={`text-sm sm:text-base ${mutedTextColor}`}>
              Manage and export all your Syncio data
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop account button */}
            <div className="hidden lg:block ml-1">
              <AccountMenuButton />
            </div>
          </div>
        </div>
      </div>

      {/* Users */}
      <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Users</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Sync all users or delete all users.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button 
            onClick={syncAllUsers}
            disabled={syncingUsers}
            className="accent-bg accent-text hover:opacity-90 disabled:opacity-50 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${syncingUsers ? 'animate-spin' : ''}`} /> Sync All Users
          </button>
          <button 
            onClick={deleteAllUsers} 
            className="accent-bg accent-text hover:opacity-90 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <Trash2 className="w-5 h-5 mr-2" /> Delete All Users
          </button>
        </div>
      </div>

      {/* Groups */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Groups</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Sync all groups or delete all groups.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button 
            onClick={syncAllGroups}
            disabled={syncingGroups}
            className="accent-bg accent-text hover:opacity-90 disabled:opacity-50 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${syncingGroups ? 'animate-spin' : ''}`} /> Sync All Groups
          </button>
          <button 
            onClick={deleteAllGroups} 
            className="accent-bg accent-text hover:opacity-90 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <Trash2 className="w-5 h-5 mr-2" /> Delete All Groups
          </button>
        </div>
      </div>

      {/* Addons */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Addons</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Import, export, reload, or delete addons.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button
            onClick={handleUploadClick}
            onDragOver={onButtonDragOver}
            onDrop={onDropAddonsButton}
            onDragEnter={onButtonDragEnterAddons}
            onDragLeave={onButtonDragLeaveAddons}
            disabled={addonImporting}
            className="accent-bg accent-text hover:opacity-90 disabled:opacity-50 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5 mr-2" />
            {isDraggingAddonsOver ? 'Drop Addons' : 'Import Addons'}
          </button>
          <button
            onClick={exportAddons}
            className="accent-bg accent-text hover:opacity-90 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <Upload className="w-5 h-5 mr-2" /> Export Addons
          </button>
          <button
            onClick={reloadAllAddons}
            disabled={reloadingAddons}
            className="accent-bg accent-text hover:opacity-90 disabled:opacity-50 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${reloadingAddons ? 'animate-spin' : ''}`} /> Reload All Addons
          </button>
          <button 
            onClick={deleteAllAddons} 
            className="accent-bg accent-text hover:opacity-90 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <Trash2 className="w-5 h-5 mr-2" /> Delete All Addons
          </button>
        </div>

        {/* Hidden file input */}
        <input
          id="import-file"
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Configuration */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Configuration</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Import or export full configuration.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button
            onClick={() => (document.getElementById('import-config-file') as HTMLInputElement)?.click()}
            onDragOver={onButtonDragOver}
            onDrop={onDropConfigButton}
            onDragEnter={onButtonDragEnterConfig}
            onDragLeave={onButtonDragLeaveConfig}
            disabled={configImporting}
            className="accent-bg accent-text hover:opacity-90 disabled:opacity-50 flex items-center px-4 py-2 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5 mr-2" />
            {isDraggingConfigOver ? 'Drop Configuration' : 'Import Configuration'}
          </button>
          <button onClick={exportConfig} className="accent-bg accent-text hover:opacity-90 flex items-center px-4 py-2 rounded-lg transition-colors">
            <Upload className="w-5 h-5 mr-2" /> Export Configuration
          </button>
        </div>

        {/* Hidden file input for configuration import */}
        <input id="import-config-file" type="file" accept=".json" onChange={handleConfigFileChange} className="hidden" />
      </div>

      {/* Automatic Sync - available in all modes */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Automatic Sync</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Automatically reload all group addons on a schedule.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <select
            value={syncMinutes}
            onChange={(e) => {
              const minutes = Number(e.target.value)
              setSyncMinutes(minutes)
              api.put('/settings/sync-frequency', { minutes })
                .then(() => toast.success('Sync schedule updated'))
                .catch((err) => toast.error(err?.response?.data?.message || 'Failed to update sync schedule'))
            }}
            className={`${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded px-3 py-2`}
          >
            <option value={0}>Disabled</option>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every hour</option>
            <option value={1440}>Every day</option>
          </select>
          <button
            onClick={async () => {
              try {
                await api.post('/settings/sync-now')
                toast.success('Sync started')
              } catch (e: any) {
                toast.error(e?.response?.data?.message || 'Failed to start sync')
              }
            }}
            className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} px-3 py-2 rounded`}
          >Run now</button>
        </div>
      </div>

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

