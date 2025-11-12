import { useQuery } from '@tanstack/react-query'

export interface ReleaseSection {
  title: string
  items: string[]
}

export interface Release {
  version: string
  tagName: string
  date: string
  features: string[]
  bugFixes: string[]
  miscChores: string[]
  otherSections: ReleaseSection[]
  rawBody: string
  htmlUrl: string
  isPreRelease: boolean
}

interface GithubReleaseResponse {
  tag_name: string
  name: string
  draft: boolean
  prerelease: boolean
  body: string | null
  published_at: string | null
  created_at: string | null
  html_url: string
}

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/iamneur0/syncio/releases?per_page=20'
const GITHUB_ACCEPT_HEADER = 'application/vnd.github+json'
const USER_AGENT = 'syncio-app'

const bulletRegex = /^[*-]\s+/

const cleanEntry = (value: string): string => {
  if (!value) return ''
  let cleaned = value.trim()

  cleaned = cleaned.replace(bulletRegex, '')

  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string) => {
    if (/^[0-9a-f]{7,}$/i.test(label) || /^#[0-9]+$/i.test(label)) {
      return ''
    }
    return label
  })

  cleaned = cleaned.replace(/\(([^)]+)\)/g, (match, inner: string) => {
    const trimmed = inner.trim()
    if (
      /^#[0-9]+$/i.test(trimmed) ||
      /^[0-9a-f]{7,}$/i.test(trimmed) ||
      /^https?:\/\//i.test(trimmed)
    ) {
      return ''
    }
    return match
  })

  cleaned = cleaned.replace(/\b[0-9a-f]{7,}\b/gi, '')
  cleaned = cleaned.replace(/\(\s*\)/g, '')
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()

  if (cleaned.endsWith(':')) {
    cleaned = cleaned.slice(0, -1).trim()
  }

  return cleaned
}

const splitAndClean = (block: string): string[] => {
  return block
    .split(/\r?\n+/)
    .map((line) => cleanEntry(line))
    .filter((line) => line.length > 0)
}

const parseSectionItems = (block: string): string[] => {
  if (!block) return []

  const bulletMatches = Array.from(block.matchAll(/^[\s>*-]*[-*+]\s+(.*)$/gm))
    .map((match) => cleanEntry(match[1] ?? ''))
    .filter((item) => item.length > 0)

  if (bulletMatches.length > 0) {
    return bulletMatches
  }

  return splitAndClean(block)
}

const parseReleaseBody = (body: string | null | undefined) => {
  const normalized = (body || '').replace(/\r\n/g, '\n').trim()

  const result = {
    features: [] as string[],
    bugFixes: [] as string[],
    miscChores: [] as string[],
    otherSections: [] as ReleaseSection[],
    rawBody: normalized,
  }

  if (!normalized) {
    return result
  }

  const headingRegex = /^###\s+(.+?)\s*$/gim
  const matches = Array.from(normalized.matchAll(headingRegex))

  matches.forEach((match, index) => {
    const headingRaw = match[1] || ''
    const heading = headingRaw.trim().toLowerCase()
    const start = match.index + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length
    const content = normalized.slice(start, end).trim()
    const items = parseSectionItems(content)

    if (!items.length && !content) {
      return
    }

    switch (heading) {
      case 'features':
        result.features.push(...(items.length ? items : splitAndClean(content)))
        break
      case 'bug fixes':
      case 'bugfixes':
      case 'bug-fixes':
        result.bugFixes.push(...(items.length ? items : splitAndClean(content)))
        break
      case 'miscellaneous chores':
      case 'misc chores':
      case 'chores':
        result.miscChores.push(...(items.length ? items : splitAndClean(content)))
        break
      default: {
        const sectionItems = items.length ? items : splitAndClean(content)
        if (sectionItems.length) {
          result.otherSections.push({
            title: headingRaw ? headingRaw.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Notes',
            items: sectionItems,
          })
        }
        break
      }
    }
  })

  if (
    result.features.length === 0 &&
    result.bugFixes.length === 0 &&
    result.miscChores.length === 0 &&
    result.otherSections.length === 0
  ) {
    const fallbackItems = parseSectionItems(normalized)
    if (fallbackItems.length) {
      result.otherSections.push({
        title: 'Notes',
        items: fallbackItems,
      })
    }
  }

  return result
}

const mapGithubRelease = (release: GithubReleaseResponse): Release => {
  const tagName = release.tag_name || release.name || ''
  const cleanVersion = tagName.replace(/^v/i, '') || tagName || 'unknown'
  const parsedBody = parseReleaseBody(release.body)

  return {
    version: cleanVersion,
    tagName: tagName || cleanVersion,
    date: release.published_at || release.created_at || new Date().toISOString(),
    features: parsedBody.features,
    bugFixes: parsedBody.bugFixes,
    miscChores: parsedBody.miscChores,
    otherSections: parsedBody.otherSections,
    rawBody: parsedBody.rawBody,
    htmlUrl: release.html_url,
    isPreRelease: Boolean(release.prerelease),
  }
}

const fetchGithubReleases = async (): Promise<Release[]> => {
  const headers: Record<string, string> = {
    Accept: GITHUB_ACCEPT_HEADER,
    'User-Agent': USER_AGENT,
  }

  if (process.env.NEXT_PUBLIC_GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.NEXT_PUBLIC_GITHUB_TOKEN}`
  }

  const response = await fetch(GITHUB_RELEASES_URL, {
    headers,
    cache: 'no-store',
    mode: 'cors',
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `GitHub releases request failed with status ${response.status}`)
  }

  const data: GithubReleaseResponse[] = await response.json()

  return data
    .filter((release) => !release.draft)
    .map(mapGithubRelease)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export const useGithubReleases = () =>
  useQuery({
    queryKey: ['github-releases'],
    queryFn: fetchGithubReleases,
    staleTime: 1000 * 60 * 10, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 1,
  })

