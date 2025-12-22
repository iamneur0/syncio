'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { publicLibraryAPI, usersAPI } from '@/services/api'
import { FlaskConical, Repeat } from 'lucide-react'
import { useTheme, Theme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import AccountMenuButton from '@/components/auth/AccountMenuButton'
import { ToggleSwitch } from '@/components/ui'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { useUserAuth } from '@/hooks/useUserAuth'

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

export default function UserSettingsPage() {
  const { userId, authKey } = useUserAuth()
  const { theme, setTheme } = useTheme()
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('')
  const [activityVisibility, setActivityVisibility] = useState<'public' | 'private'>('private')
  const [activityVisibilityLoaded, setActivityVisibilityLoaded] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<{ hasKey: boolean }>({ hasKey: false })
  const [currentApiKey, setCurrentApiKey] = useState<string | null>(null)
  const autoGenAttemptedRef = useRef<boolean>(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  // Load user settings on mount
  useQuery({
    queryKey: ['user-settings', userId],
    queryFn: async () => {
      if (!userId || !authKey) return null
      const userInfo = await publicLibraryAPI.getUserInfo(userId, authKey)
      const visibility = userInfo?.activityVisibility ?? 'private'
      setActivityVisibility(visibility)
      setActivityVisibilityLoaded(true)
      
      // Fetch API key
      try {
        const r = await api.get(`/public-library/user-api-key?userId=${userId}`)
        const hasKey = r.data?.hasKey || false
        const apiKey = r.data?.apiKey || null
        setApiKeyStatus({ hasKey })
        if (hasKey && apiKey) {
          setCurrentApiKey(apiKey)
        } else {
          setCurrentApiKey(null)
        }
        // Auto-generate if missing
        if (!hasKey && !autoGenAttemptedRef.current) {
          autoGenAttemptedRef.current = true
          try {
            const resp = await api.post('/public-library/user-api-key', { userId })
            const newKey = resp.data?.apiKey
            if (newKey) {
              setCurrentApiKey(newKey)
              setApiKeyStatus({ hasKey: true })
              toast.success('API key auto-generated!')
              navigator.clipboard.writeText(newKey).catch(() => {})
            } else {
              setApiKeyStatus({ hasKey: false })
            }
          } catch (e: any) {
            setApiKeyStatus({ hasKey: false })
            toast.error(e?.response?.data?.message || 'Failed to auto-generate API key')
          }
        } else if (!hasKey) {
          setApiKeyStatus({ hasKey: false })
        }
      } catch {
        setApiKeyStatus({ hasKey: false })
      }
      return userInfo
    },
    enabled: !!userId && !!authKey
  })

  const handleSaveSettings = async () => {
    if (!userId) return
    setIsSavingSettings(true)
    try {
      await usersAPI.update(userId, {
        discordWebhookUrl: discordWebhookUrl.trim() || null
      })
      toast.success('Settings saved successfully')
    } catch (error: any) {
      console.error('Failed to save settings:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save settings')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleTestWebhook = async () => {
    const trimmed = (discordWebhookUrl || '').trim()
    if (!trimmed) {
      toast.error('Set a webhook URL first')
      return
    }
    if (!userId) return
    try {
      await api.post(`/users/${userId}/test-webhook`, { webhookUrl: trimmed })
      toast.success('Test message sent to Discord')
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to send test message'
      toast.error(msg)
    }
  }

  if (!userId) {
    return null
  }

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div>
        {/* Header */}
        <div className="mb-4 lg:mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4 gap-4">
            <div>
              <h1 className="hidden lg:block text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Settings</h1>
              <p className="hidden lg:block text-base color-text-secondary">Configure your preferences</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden lg:block ml-1">
                <AccountMenuButton />
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-3xl">
          {/* Discord Webhook */}
          <div className="p-4 rounded-lg border mt-6 card">
            <h2 className="text-lg font-semibold">Discord Webhook</h2>
            <p className="text-sm mt-1 color-text-secondary">
              Receive notifications when someone shares content with you.
            </p>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">
                Webhook URL
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                    onBlur={() => {
                      if (discordWebhookUrl) {
                        handleSaveSettings()
                      }
                    }}
                    placeholder="https://discord.com/api/webhooks/..."
                    className="input w-full px-3 py-2"
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

          {/* Activity Visibility */}
          <div className="p-4 rounded-lg border mt-6 card">
            <h2 className="text-lg font-semibold">Activity Visibility</h2>
            <p className="text-sm mt-1 color-text-secondary">
              {activityVisibility === 'public' 
                ? 'Group members can see your library and watch history'
                : 'Your library and watch history are private to you'
              }
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm color-text-secondary">Make activity visible to group members</span>
              {activityVisibilityLoaded && (
                <ToggleSwitch
                  checked={activityVisibility === 'public'}
                  onChange={() => {
                    if (!userId || !authKey) return
                    const newVisibility = activityVisibility === 'public' ? 'private' : 'public'
                    setActivityVisibility(newVisibility)
                    publicLibraryAPI.updateActivityVisibility(userId, authKey, newVisibility)
                      .then(() => toast.success(`Activity visibility set to ${newVisibility}`))
                      .catch((error: any) => toast.error(error?.response?.data?.message || error?.message || 'Failed to update visibility'))
                  }}
                />
              )}
            </div>
          </div>

          {/* API Access */}
          <div className="p-4 rounded-lg border mt-6 card">
            <h2 className="text-lg font-semibold">API Access</h2>
            <p className="text-sm mt-1 color-text-secondary">
              Generate a personal API key to access your metrics via external API.
            </p>
            <div className="mt-4 flex gap-2 items-center">
              <div className="flex-1">
                {(() => {
                  let displayValue = 'No API key'
                  if (currentApiKey) {
                    displayValue = currentApiKey
                  } else if (apiKeyStatus.hasKey && !currentApiKey) {
                    displayValue = 'Loading...'
                  } else if (!apiKeyStatus.hasKey && !autoGenAttemptedRef.current) {
                    displayValue = 'Generating...'
                  }

                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (currentApiKey) {
                          navigator.clipboard.writeText(currentApiKey)
                          toast.success('API key copied to clipboard')
                        } else {
                          toast.error('API key not available. Click rotate to generate a new one.')
                        }
                      }}
                      className="input w-full px-3 py-2 text-left cursor-pointer"
                      title={currentApiKey ? 'Click to copy API key' : 'API key not available'}
                    >
                      <span className="inline-block w-full truncate">{displayValue}</span>
                    </button>
                  )
                })()}
              </div>
              <button
                onClick={async () => {
                  if (!userId) return
                  try {
                    const resp = await api.post('/public-library/user-api-key', { userId })
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
                className="flex items-center justify-center w-10 h-10 rounded surface-interactive"
                title="Rotate API key (revoke old and generate new)"
              >
                <Repeat className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs mt-2 color-text-secondary">
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
                className="px-1 py-0.5 color-surface rounded cursor-pointer hover:opacity-80 transition-opacity"
                title={currentApiKey ? 'Click to copy "Bearer {key}"' : 'API key not available'}
              >
                Bearer {currentApiKey || '••••••••••••••••••••••••••••••••'}
              </code>
            </p>
          </div>

          {/* Theme Setting */}
          <div className="p-4 rounded-lg border mt-6 card">
            <h2 className="text-lg font-semibold">Appearance</h2>
            <p className="text-sm mt-1 color-text-secondary">
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
        </div>
      </div>
    </div>
  )
}
