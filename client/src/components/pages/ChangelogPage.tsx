'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { ScrollText, Tag, ChevronDown, ChevronUp, Sparkles, Bug, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import AccountMenuButton from '@/components/auth/AccountMenuButton'
import { useGithubReleases } from '@/hooks/useGithubReleases'
import type { Release } from '@/hooks/useGithubReleases'

export default function ChangelogPage() {
  const appVersion = (process.env.NEXT_PUBLIC_APP_VERSION as string) || 'dev'
  const { data: releasesData = [], isLoading, isError, error, refetch, isFetching } = useGithubReleases()
  const releases: Release[] = releasesData
  const [expandedVersions, setExpandedVersions] = React.useState<Set<string>>(new Set())
  const [copied, setCopied] = React.useState(false)
  const { theme } = useTheme()
  const accentStyles = React.useMemo(() => getEntityColorStyles(theme, 1), [theme])

  React.useEffect(() => {
    if (releases.length > 0) {
      setExpandedVersions((prev) => {
        if (prev.size === 0) {
          return new Set([releases[0].version])
        }
        return prev
      })
    }
  }, [releases])

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
  const errorMessage = error instanceof Error ? error.message : 'Failed to load releases from GitHub.'
  const isInitialLoading = isLoading && releases.length === 0

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

        {isInitialLoading && (
          <div className="space-y-4">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className={`${cardBgColor} rounded-lg border ${borderColor} overflow-hidden`}>
                <div className="px-6 py-4 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="h-6 w-48 bg-gray-400/20 rounded" />
                    <div className="h-5 w-5 bg-gray-400/10 rounded-full" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-4 w-full bg-gray-400/10 rounded" />
                    <div className="h-4 w-3/4 bg-gray-400/10 rounded" />
                    <div className="h-4 w-2/3 bg-gray-400/10 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className={`mb-4 p-4 rounded-lg border ${borderColor} bg-opacity-60`}>
            <p className={`text-sm ${mutedTextColor}`}>
              Could not load release notes from GitHub. {errorMessage}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-3 surface-interactive px-3 py-1.5 rounded text-sm"
              disabled={isFetching}
            >
              {isFetching ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        {!isInitialLoading && !isError && releases.length === 0 && (
          <div className={`p-6 rounded-lg border ${borderColor}`}>
            <p className={`text-sm ${mutedTextColor}`}>
              No releases found on GitHub. Once releases are published, they will appear here automatically.
            </p>
          </div>
        )}

        {!isInitialLoading && releases.length > 0 && (
        <div className="space-y-4">
          {releases.map((release, index) => {
            const isExpanded = expandedVersions.has(release.version)
            const isCurrentVersion = release.version === appVersion
            const isLatest = index === 0
            return (
              <div
                key={release.tagName || release.version}
                className={`${cardBgColor} rounded-lg border ${borderColor} overflow-hidden transition-all card-selectable ${isCurrentVersion ? 'card-selected' : ''}`}
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
                        href={release.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xl font-semibold hover:opacity-80 transition-opacity"
                      >
                        v{release.version}
                      </a>
                      <div className="flex items-center gap-2">
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
                        {isCurrentVersion && (
                          <span
                            className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium"
                            style={{
                              background: accentStyles.accentHex,
                              color: accentStyles.textColor,
                            }}
                          >
                            <Check className="w-3 h-3" />
                            <span>Current</span>
                          </span>
                        )}
                      </div>
                      {release.isPreRelease && (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-600">
                          Pre-release
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

                    {release.otherSections.map((section) => (
                      section.items.length > 0 ? (
                        <div key={`${release.version}-${section.title}`}>
                          <h3 className={`text-base font-semibold mb-3 flex items-center gap-2 ${textColor}`}>
                            <ScrollText className="w-4 h-4" />
                            <span>{capitalizeFirst(section.title)}</span>
                          </h3>
                          <ul className="space-y-2 pl-0">
                            {section.items.map((item, idx) => (
                              <li key={idx} className={`text-sm ${mutedTextColor} list-disc list-inside`}>
                                {capitalizeFirst(item)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null
                    ))}

                  </div>
                )}
              </div>
            )
          })}
        </div>
        )}

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

