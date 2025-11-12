'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { ScrollText, Tag, ChevronDown, ChevronUp, Sparkles, Bug, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import AccountMenuButton from '@/components/auth/AccountMenuButton'

interface Release {
  version: string
  date: string
  features: string[]
  bugFixes: string[]
  miscChores?: string[]
}

// Export latest version for use in other components
export const LATEST_VERSION = '0.1.5'

const releases: Release[] = [
  {
    version: LATEST_VERSION,
    date: '2025-10-26',
    features: [
      'reset addon/resources/catalogs',
      'search catalog selection',
      'search catalogs view, separated from other catalogs'
    ],
    bugFixes: [
      'advanced mode now reloads group addons before sync',
      'exclude logic now based on stremioAddonId instead of addon id',
      'handling of exclusions improved and better addon listing',
      'originalManifest not being fetched properly',
      'reload addons logic totally reworked, handling all cases',
      'reload group addons handling future conditioning',
      'reload not applying new catalogs/resources',
      'reload now covering detecting new catalogs/resources',
      'resources now added in addon\'s details on addon import from users',
      'transportName set to empty because munif angy',
      'ui + import/export fixes for release',
      'user and group addon reload'
    ]
  },
  {
    version: '0.1.4',
    date: '2025-10-21',
    features: [],
    bugFixes: [
      'add addon in a group with same manifesturl but differnet manifest',
      'addon clone missing fields',
      'addon info now reflecting db instead of manifest',
      'changed order of tabs',
      'debug unavailable in public for security',
      'dragging listItems and items name',
      'regression for exclude logic',
      'regression on excluded addons',
      'reload inconsistency with filters, refactored with addonUpdate',
      'reload now adds new resources/catalogs',
      'reworked addon group add',
      'sync badge update on addon add',
      'unsafe mode now properly handling default addons as normal addons',
      'user addon import associates existing addons, check now manifest content'
    ]
  },
  {
    version: '0.1.3',
    date: '2025-10-19',
    features: [],
    bugFixes: [
      'error preventing build'
    ]
  },
  {
    version: '0.1.2',
    date: '2025-10-19',
    features: [
      'reconnect user when logins expire'
    ],
    bugFixes: []
  },
  {
    version: '0.1.1',
    date: '2025-10-19',
    features: [
      'kiss sync and sync check process',
      'made cards responsive and now adapting to window size',
      'manifest view from user page'
    ],
    bugFixes: [
      'desired addons better compute',
      'group addon add at the bottom instead of the top',
      'removed debugging logs in prod',
      'UI and responsiveness'
    ]
  },
  {
    version: '0.1.0',
    date: '2025-10-16',
    features: [
      'added more account management options, category full deletion',
      'addon selection and UI buttons reworked',
      'backend rework',
      'backend rewrite with sync optimisations',
      'disable automatic backup feature in public mode',
      'finished UI + fixed group toggle',
      'improved UI',
      'improved UI',
      'repair feature + diverse QoL',
      'selection to user and group tabs',
      'UI fully reworked with better sync process',
      'UI Refactor'
    ],
    bugFixes: [
      'added Modal unification with createPortal',
      'user imports, no more empty groups created, better messaging'
    ]
  },
  {
    version: '0.0.18',
    date: '2025-10-08',
    features: [],
    bugFixes: [
      'dynamically create schema.prisma based on INSTANCE type'
    ]
  },
  {
    version: '0.0.17',
    date: '2025-10-08',
    features: [],
    bugFixes: [
      'resolve Docker build and backend runtime issues'
    ]
  },
  {
    version: '0.0.16',
    date: '2025-10-08',
    features: [
      'added addon resource selection',
      'addon manifest fetching reworked to match resource filtering',
      'display addon ressources',
      'improved addon import',
      'improved config import',
      'improved security for protectedAddons and excludedAddons and sync logic',
      'reloading now resource filter based',
      'removed unused resources from exports',
      'scheduled backups'
    ],
    bugFixes: [
      'account addon conflict impacting sync',
      'added missing fields on user addon import',
      'Addon modal UX fixed, edit now needs confirmation',
      'addonsPage fixes',
      'aligned UI components across themes',
      'group addon visual duplication',
      'now syncing manifest from db instead of live fetching',
      're-designed addon modal',
      'removed excluded tag, redundant with icon',
      'replaced private compose',
      'udpated db models for ressources',
      'updated compose files'
    ]
  }
]

export default function ChangelogPage() {
  const appVersion = (process.env.NEXT_PUBLIC_APP_VERSION as string) || 'dev'
  const [expandedVersions, setExpandedVersions] = React.useState<Set<string>>(new Set([releases[0].version]))
  const [copied, setCopied] = React.useState(false)
  const { theme } = useTheme()
  const accentStyles = React.useMemo(() => getEntityColorStyles(theme, 1), [theme])

  const capitalizeFirst = (text: string): string => {
    if (!text) return text
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  const copyUpdateCommand = () => {
    const command = 'docker compose pull syncio && docker compose up -d syncio'
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      toast.success('Update command copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      toast.error('Failed to copy to clipboard')
    })
  }

  const toggleVersion = (version: string) => {
    setExpandedVersions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(version)) {
        newSet.delete(version)
      } else {
        newSet.add(version)
      }
      return newSet
    })
  }

  const cardBgColor = 'card'
  const textColor = ''
  const mutedTextColor = 'color-text-secondary'
  const borderColor = 'color-border'
  const secondaryBgColor = 'card'

  return (
    <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
            <div>
              <h1 className={`hidden sm:block text-xl sm:text-2xl font-bold ${textColor}`}>
                What's New
              </h1>
              <p className={`text-sm sm:text-base ${mutedTextColor}`}>
                All notable changes to this project will be documented here.
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

        <div className="space-y-4">
          {releases.map((release, index) => {
            const isExpanded = expandedVersions.has(release.version)
            const isCurrentVersion = release.version === appVersion
            const isLatest = index === 0
            return (
              <div
                key={release.version}
                className={`${cardBgColor} rounded-lg border ${isCurrentVersion ? 'selection-ring' : borderColor} overflow-hidden transition-all`}
              >
                <button
                  onClick={() => toggleVersion(release.version)}
                  className={`w-full px-6 py-4 flex items-center justify-between ${textColor} hover:opacity-80 transition-opacity`}
                >
                  <div className="flex items-center gap-4">
                    <Tag className={`w-5 h-5 ${textColor}`} />
                  <div className="flex items-baseline gap-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://github.com/iamneur0/syncio/releases/tag/v${release.version}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xl font-semibold hover:opacity-80 transition-opacity"
                      >
                        v{release.version}
                      </a>
                      {isLatest && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            copyUpdateCommand()
                          }}
                          role="button"
                          className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium hover:opacity-80 transition-opacity min-w-[74px] justify-center cursor-pointer select-none"
                          style={{
                            background: accentStyles.accentHex,
                            color: accentStyles.textColor,
                          }}
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copied ? 'Copied!' : 'Latest'}</span>
                        </span>
                      )}
                      {isCurrentVersion && !isLatest && (
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                          style={{
                            background: accentStyles.accentHex,
                            color: accentStyles.textColor,
                          }}
                        >
                          Current
                        </span>
                      )}
                    </div>
                    <span className={`text-sm font-normal ${mutedTextColor}`}>
                      {new Date(release.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>

                {isExpanded && (
                  <div className={`px-6 pt-6 pb-6 border-t ${borderColor} space-y-6`}>
                    {release.features.length > 0 && (
                      <div>
                        <h3 className={`text-base font-semibold mb-3 flex items-center gap-2 ${textColor}`}>
                          <Sparkles className="w-4 h-4" />
                          <span>Features</span>
                        </h3>
                        <ul className="space-y-2 pl-0">
                          {release.features.map((feature, idx) => (
                            <li key={idx} className={`text-sm ${mutedTextColor} list-disc list-inside`}>
                              {capitalizeFirst(feature)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {release.bugFixes.length > 0 && (
                      <div>
                        <h3 className={`text-base font-semibold mb-3 flex items-center gap-2 ${textColor}`}>
                          <Bug className="w-4 h-4" />
                          <span>Bug Fixes</span>
                        </h3>
                        <ul className="space-y-2 pl-0">
                          {release.bugFixes.map((fix, idx) => (
                            <li key={idx} className={`text-sm ${mutedTextColor} list-disc list-inside`}>
                              {capitalizeFirst(fix)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {release.miscChores && release.miscChores.length > 0 && (
                      <div>
                        <h3 className={`text-base font-semibold mb-3 ${mutedTextColor}`}>
                          🔧 Miscellaneous Chores
                        </h3>
                        <ul className="space-y-2 pl-0">
                          {release.miscChores.map((chore, idx) => (
                            <li key={idx} className={`text-sm ${mutedTextColor} list-disc list-inside`}>
                              {chore}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className={`mt-12 p-6 rounded-lg ${secondaryBgColor} border ${borderColor}`}>
          <p className={`text-sm text-center ${mutedTextColor}`}>
            View all releases on{' '}
            <a
              href="https://github.com/iamneur0/syncio/releases"
              target="_blank"
              rel="noopener noreferrer"
              className={`underline hover:opacity-80 font-semibold ${mutedTextColor}`}
            >
              GitHub
            </a>
          </p>
        </div>
    </div>
  )
}

