'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, Download, RotateCcw, AlertTriangle, Trash2, User, Users, RefreshCcw, RefreshCw } from 'lucide-react'
import AccountMenuButton from '@/components/auth/AccountMenuButton'
import { ConfirmDialog } from '@/components/modals'
import api from '@/services/api'

export default function TasksPage() {
  // Theme not needed here anymore, keep placeholders for text classes
  useTheme()
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
  const [syncFrequency, setSyncFrequency] = React.useState<string>('0')
  const [backupDays, setBackupDays] = React.useState<number>(0)
  const [isBackupRunning, setIsBackupRunning] = React.useState<boolean>(false)
  
  const addonsDragDepth = React.useRef<number>(0)
  const configDragDepth = React.useRef<number>(0)

  React.useEffect(() => {
    api.get('/settings/account-sync')
      .then(r => {
        const enabled = !!r.data?.enabled
        const f = r.data?.frequency
        if (!enabled) { setSyncFrequency('0'); return }
        if (typeof f === 'string' && f.trim()) { setSyncFrequency(f.trim()); return }
        if (typeof f === 'number') {
          if (f === 0) setSyncFrequency('0')
          else if (f === 1) setSyncFrequency('1m')
          else if (f >= 1440) setSyncFrequency(`${Math.round(f/1440)}d`)
          else setSyncFrequency(`${f}m`)
          return
        }
        // Default to 1d if enabled but frequency missing
        setSyncFrequency('1d')
      })
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true') {
      return
    }
    api
      .get('/settings/backup-frequency')
      .then((resp) => {
        if (typeof resp.data?.days === 'number') {
          setBackupDays(resp.data.days)
        }
      })
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
      api.post('/public-auth/config-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((resp) => {
          const addonsBlock = resp.data?.addons || resp.data?.created || resp.data?.imported || {}
          const usersBlock = resp.data?.users || {}
          const groupsBlock = resp.data?.groups || {}
          const totalAddons = (addonsBlock.created || 0) + (addonsBlock.reused || 0)
          const usersCreated = usersBlock.created || 0
          const groupsCreated = groupsBlock.created || 0
          const msgParts: string[] = []
          if (usersCreated > 0) msgParts.push(`${usersCreated} users`)
          if (groupsCreated > 0) msgParts.push(`${groupsCreated} groups`)
          if (totalAddons > 0) msgParts.push(`${totalAddons} addons`)
          toast.success(`Configuration imported${msgParts.length ? `: ${msgParts.join(', ')}` : ''}`)
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
        const resp = await api.post('/public-auth/addon-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        return resp.data
      }
      throw new Error('Invalid import data')
    },
    onSuccess: (data: any) => {
      const successful = data?.successful ?? 0
      const failed = data?.failed ?? 0
      const redundant = data?.redundant ?? 0
      toast.success(`Import complete! ${successful} successful, ${failed} failed, ${redundant} redundant`)
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
      api.post('/public-auth/config-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((resp) => {
          const addonsBlock = resp.data?.addons || resp.data?.created || resp.data?.imported || {}
          const usersBlock = resp.data?.users || {}
          const groupsBlock = resp.data?.groups || {}
          const totalAddons = (addonsBlock.created || 0) + (addonsBlock.reused || 0)
          const usersCreated = usersBlock.created || 0
          const groupsCreated = groupsBlock.created || 0
          const msgParts: string[] = []
          if (usersCreated > 0) msgParts.push(`${usersCreated} users`)
          if (groupsCreated > 0) msgParts.push(`${groupsCreated} groups`)
          if (totalAddons > 0) msgParts.push(`${totalAddons} addons`)
          toast.success(`Configuration imported${msgParts.length ? `: ${msgParts.join(', ')}` : ''}`)
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
      // Backend uses per-account DB settings for mode/safe; no headers/localStorage
      const res = await api.post('/groups/sync-all')
      const syncedGroups = res.data?.syncedGroups ?? 0
      const failedGroups = res.data?.failedGroups ?? 0
      const totalUsersSynced = res.data?.totalUsersSynced ?? 0
      const totalUsersFailed = res.data?.totalUsersFailed ?? 0
      
      if (failedGroups === 0) {
        toast.success(`Synced ${syncedGroups} groups successfully (${totalUsersSynced} users synced)`)
      } else {
        toast.success(`Synced ${syncedGroups} groups, ${failedGroups} failed (${totalUsersSynced} users synced, ${totalUsersFailed} failed)`)
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

  const textColor = 'color-text'
  const mutedTextColor = 'color-text-secondary'

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

      <div className="max-w-3xl">

      {/* Users */}
      <div className={`p-4 rounded-lg border card`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Users</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Manage users.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button 
            onClick={syncAllUsers}
            disabled={syncingUsers}
            className="surface-interactive disabled:opacity-50 flex items-center px-4 py-2 rounded-lg"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${syncingUsers ? 'animate-spin' : ''}`} /> Sync All Users
          </button>
          <button 
            onClick={deleteAllUsers} 
            className="surface-interactive flex items-center px-4 py-2 rounded-lg"
          >
            <Trash2 className="w-5 h-5 mr-2" /> Delete All Users
          </button>
        </div>
      </div>

      {/* Groups */}
      <div className={`p-4 rounded-lg border mt-6 card`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Groups</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Manage groups.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button 
            onClick={syncAllGroups}
            disabled={syncingGroups}
            className="surface-interactive disabled:opacity-50 flex items-center px-4 py-2 rounded-lg"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${syncingGroups ? 'animate-spin' : ''}`} /> Sync All Groups
          </button>
          <button 
            onClick={deleteAllGroups} 
            className="surface-interactive flex items-center px-4 py-2 rounded-lg"
          >
            <Trash2 className="w-5 h-5 mr-2" /> Delete All Groups
          </button>
        </div>
      </div>

      {/* Addons */}
      <div className={`p-4 rounded-lg border mt-6 card`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Addons</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Import, export and manage addons.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button
            onClick={handleUploadClick}
            onDragOver={onButtonDragOver}
            onDrop={onDropAddonsButton}
            onDragEnter={onButtonDragEnterAddons}
            onDragLeave={onButtonDragLeaveAddons}
            disabled={addonImporting}
            className="surface-interactive disabled:opacity-50 flex items-center px-4 py-2 rounded-lg"
          >
            <Download className="w-5 h-5 mr-2" />
            {isDraggingAddonsOver ? 'Drop Addons' : 'Import Addons'}
          </button>
          <button
            onClick={exportAddons}
            className="surface-interactive flex items-center px-4 py-2 rounded-lg"
          >
            <Upload className="w-5 h-5 mr-2" /> Export Addons
          </button>
          <button
            onClick={reloadAllAddons}
            disabled={reloadingAddons}
            className="surface-interactive disabled:opacity-50 flex items-center px-4 py-2 rounded-lg"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${reloadingAddons ? 'animate-spin' : ''}`} /> Reload All Addons
          </button>
          <button
            onClick={async () => {
              try {
                const res = await api.post('/settings/repair-addons')
                const inspected = res.data?.inspected ?? 0
                const updated = res.data?.updated ?? 0
                toast.success(`Repaired ${updated} of ${inspected} addons`)
              } catch (e: any) {
                toast.error(e?.response?.data?.message || 'Failed to repair addons')
              }
            }}
            className="surface-interactive flex items-center px-4 py-2 rounded-lg"
          >
            <RotateCcw className="w-5 h-5 mr-2" /> Repair Addons
          </button>
          <button 
            onClick={deleteAllAddons} 
            className="surface-interactive flex items-center px-4 py-2 rounded-lg"
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
      <div className={`p-4 rounded-lg border mt-6 card`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Configuration</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Import or export configuration.
        </p>
        <div className="mt-4 flex gap-4 flex-wrap">
          <button
            onClick={() => (document.getElementById('import-config-file') as HTMLInputElement)?.click()}
            onDragOver={onButtonDragOver}
            onDrop={onDropConfigButton}
            onDragEnter={onButtonDragEnterConfig}
            onDragLeave={onButtonDragLeaveConfig}
            disabled={configImporting}
            className="surface-interactive disabled:opacity-50 flex items-center px-4 py-2 rounded-lg"
          >
            <Download className="w-5 h-5 mr-2" />
            {isDraggingConfigOver ? 'Drop Configuration' : 'Import Configuration'}
          </button>
          <button onClick={exportConfig} className="surface-interactive flex items-center px-4 py-2 rounded-lg">
            <Upload className="w-5 h-5 mr-2" /> Export Configuration
          </button>
        </div>

        {/* Hidden file input for configuration import */}
        <input id="import-config-file" type="file" accept=".json" onChange={handleConfigFileChange} className="hidden" />
      </div>

      {process.env.NEXT_PUBLIC_AUTH_ENABLED !== 'true' && (
        <div className={`p-4 rounded-lg border mt-6 card`}>
          <h2 className={`text-lg font-semibold ${textColor}`}>Automatic Backups</h2>
          <p className={`text-sm mt-1 ${mutedTextColor}`}>
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
              className={`input px-3 py-2 flex-1 min-w-[180px]`}
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
                  setIsBackupRunning(true)
                  await api.post('/settings/backup-now')
                  toast.success('Backup started')
                } catch (e: any) {
                  toast.error(e?.response?.data?.message || 'Failed to start backup')
                } finally {
                  setIsBackupRunning(false)
                }
              }}
              className={`surface-interactive w-10 h-10 rounded flex items-center justify-center ${isBackupRunning ? 'opacity-75 cursor-not-allowed' : ''}`}
              disabled={isBackupRunning}
              aria-label="Run backup now"
              title="Run backup now"
            >
              <RotateCcw className={`w-5 h-5 ${isBackupRunning ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className={`text-xs mt-2 ${mutedTextColor}`}>
            Files are saved under server folder: data/backup/
          </div>
        </div>
      )}

      {/* Automatic Sync - available in all modes */}
      <div className={`p-4 rounded-lg border mt-6 card`}>
        <h2 className={`text-lg font-semibold ${textColor}`}>Automatic Sync</h2>
        <p className={`text-sm mt-1 ${mutedTextColor}`}>
          Automatically sync groups.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <select
            value={syncFrequency}
            onChange={(e) => {
              const freq = e.target.value
              setSyncFrequency(freq)
              api.put('/settings/account-sync', { enabled: freq !== '0', frequency: freq })
                .then(() => toast.success('Sync schedule updated for this account'))
                .catch((err) => toast.error(err?.response?.data?.message || 'Failed to update sync schedule'))
            }}
            className={`input px-3 py-2`}
          >
            <option value={'0'}>Disabled</option>
            <option value={'1d'}>Every day</option>
            <option value={'7d'}>Every 7 days</option>
            <option value={'15d'}>Every 15 days</option>
            <option value={'30d'}>Every 30 days</option>
          </select>
          {/* Run now button removed per request */}
        </div>
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

