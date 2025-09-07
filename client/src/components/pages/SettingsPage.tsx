'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, RotateCcw, Sun, Moon } from 'lucide-react'

export default function SettingsPage() {
  const { isDark, toggleTheme } = useTheme()
  const [hideSensitive, setHideSensitive] = React.useState<boolean>(false)
  const [syncMode, setSyncMode] = React.useState<'normal' | 'advanced'>('normal')
  const [deleteMode, setDeleteMode] = React.useState<'safe' | 'unsafe'>('safe')
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importText, setImportText] = React.useState<string>('')
  const [importMode, setImportMode] = React.useState<'file' | 'text'>('file')

  React.useEffect(() => {
    const saved = localStorage.getItem('sfm_hide_sensitive')
    setHideSensitive(saved === '1')
    
    const savedSyncMode = localStorage.getItem('sfm_sync_mode')
    setSyncMode(savedSyncMode === 'advanced' ? 'advanced' : 'normal')
    
    const savedDeleteMode = localStorage.getItem('sfm_delete_mode')
    setDeleteMode(savedDeleteMode === 'unsafe' ? 'unsafe' : 'safe')
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

  // Import addons mutation
  const importAddonsMutation = useMutation({
    mutationFn: async (data: { file?: File; text?: string; mode: 'file' | 'text' }) => {
      if (data.mode === 'file' && data.file) {
        const formData = new FormData()
        formData.append('file', data.file)
        
        const response = await fetch('/api/addons/import', {
          method: 'POST',
          body: formData
        })
        
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || 'Failed to import addons')
        }
        
        return response.json()
      } else if (data.mode === 'text' && data.text) {
        const response = await fetch('/api/addons/import-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonData: data.text })
        })
        
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || 'Failed to import addons')
        }
        
        return response.json()
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
      // Auto-import when file is selected
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
    if (importMode === 'text' && importText.trim()) {
      importAddonsMutation.mutate({ text: importText.trim(), mode: 'text' })
      setImportText('')
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className={`text-2xl font-bold mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>Settings</h1>

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
          Control the visual theme of the application.
        </p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex items-center">
              {isDark ? (
                <Moon className="w-5 h-5 mr-3 text-gray-400" />
              ) : (
                <Sun className="w-5 h-5 mr-3 text-gray-500" />
              )}
              <div>
                <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </div>
                <div className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-sm`}>
                  {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDark ? 'bg-stremio-purple' : (isDark ? 'bg-gray-700' : 'bg-gray-300')}`}
            aria-pressed={isDark}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${isDark ? 'translate-x-5' : 'translate-x-1'}`}
            />
          </button>
        </div>
      </div>

      {/* Import Addons */}
      <div className={`p-4 rounded-lg border mt-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Import Addons</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Import addons from a JSON file or paste JSON content directly. Duplicate addons will be skipped.
        </p>
        
        {/* Import Mode Toggle */}
        <div className="mt-4 flex gap-4">
          <button
            onClick={handleUploadClick}
            disabled={importAddonsMutation.isPending}
            className="flex items-center px-4 py-2 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importAddonsMutation.isPending ? (
              <RotateCcw className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Upload className="w-5 h-5 mr-2" />
            )}
            {importAddonsMutation.isPending ? 'Uploading...' : 'Upload Backup'}
          </button>
          <button
            onClick={() => setImportMode('text')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              importMode === 'text'
                ? 'bg-stremio-purple text-white'
                : isDark
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Paste JSON
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

        <div className="mt-4">
          {importMode === 'text' && (
            <div className="space-y-4">
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
              <button
                onClick={handleImport}
                disabled={!importText.trim() || importAddonsMutation.isPending}
                className="flex items-center px-4 py-2 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importAddonsMutation.isPending ? (
                  <RotateCcw className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 mr-2" />
                )}
                {importAddonsMutation.isPending ? 'Importing...' : 'Import'}
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}


