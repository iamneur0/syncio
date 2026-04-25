'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header, Breadcrumbs } from '@/components/layout/Header';
import { Card, Button, Badge } from '@/components/ui';
import { PageSection } from '@/components/layout/PageContainer';
import { toast } from '@/components/ui/Toast';
import {
  TagIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  BugAntIcon,
  DocumentTextIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

// Types
interface ReleaseSection {
  title: string;
  items: string[];
}

interface Release {
  version: string;
  tagName: string;
  date: string;
  features: string[];
  bugFixes: string[];
  miscChores: string[];
  otherSections: ReleaseSection[];
  rawBody: string;
  htmlUrl: string;
  isPreRelease: boolean;
}

interface GithubReleaseResponse {
  tag_name: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  body: string | null;
  published_at: string | null;
  created_at: string | null;
  html_url: string;
}

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/iamneur0/syncio/releases?per_page=20';
const GITHUB_ACCEPT_HEADER = 'application/vnd.github+json';
const USER_AGENT = 'syncio-app';

// Helper functions
const bulletRegex = /^[*-]\s+/;

const cleanEntry = (value: string): string => {
  if (!value) return '';
  let cleaned = value.trim();

  cleaned = cleaned.replace(bulletRegex, '');

  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string) => {
    if (/^[0-9a-f]{7,}$/i.test(label) || /^#[0-9]+$/i.test(label)) {
      return '';
    }
    return label;
  });

  cleaned = cleaned.replace(/\(([^)]+)\)/g, (match, inner: string) => {
    const trimmed = inner.trim();
    if (
      /^#[0-9]+$/i.test(trimmed) ||
      /^[0-9a-f]{7,}$/i.test(trimmed) ||
      /^https?:\/\//i.test(trimmed)
    ) {
      return '';
    }
    return match;
  });

  cleaned = cleaned.replace(/\b[0-9a-f]{7,}\b/gi, '');
  cleaned = cleaned.replace(/\(\s*\)/g, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  if (cleaned.endsWith(':')) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  return cleaned;
};

const splitAndClean = (block: string): string[] => {
  return block
    .split(/\r?\n+/)
    .map((line) => cleanEntry(line))
    .filter((line) => line.length > 0);
};

const parseSectionItems = (block: string): string[] => {
  if (!block) return [];

  const bulletMatches = Array.from(block.matchAll(/^[\s>*-]*[-*+]\s+(.*)$/gm))
    .map((match) => cleanEntry(match[1] ?? ''))
    .filter((item) => item.length > 0);

  if (bulletMatches.length > 0) {
    return bulletMatches;
  }

  return splitAndClean(block);
};

const parseReleaseBody = (body: string | null | undefined) => {
  const normalized = (body || '').replace(/\r\n/g, '\n').trim();

  const result = {
    features: [] as string[],
    bugFixes: [] as string[],
    miscChores: [] as string[],
    otherSections: [] as ReleaseSection[],
    rawBody: normalized,
  };

  if (!normalized) {
    return result;
  }

  const headingRegex = /^###\s+(.+?)\s*$/gim;
  const matches = Array.from(normalized.matchAll(headingRegex));

  matches.forEach((match, index) => {
    const headingRaw = match[1] || '';
    const heading = headingRaw.trim().toLowerCase();
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    const content = normalized.slice(start, end).trim();
    const items = parseSectionItems(content);

    if (!items.length && !content) {
      return;
    }

    switch (heading) {
      case 'features':
        result.features.push(...(items.length ? items : splitAndClean(content)));
        break;
      case 'bug fixes':
      case 'bugfixes':
      case 'bug-fixes':
        result.bugFixes.push(...(items.length ? items : splitAndClean(content)));
        break;
      case 'miscellaneous chores':
      case 'misc chores':
      case 'chores':
        result.miscChores.push(...(items.length ? items : splitAndClean(content)));
        break;
      default: {
        const sectionItems = items.length ? items : splitAndClean(content);
        if (sectionItems.length) {
          result.otherSections.push({
            title: headingRaw ? headingRaw.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Notes',
            items: sectionItems,
          });
        }
        break;
      }
    }
  });

  if (
    result.features.length === 0 &&
    result.bugFixes.length === 0 &&
    result.miscChores.length === 0 &&
    result.otherSections.length === 0
  ) {
    const fallbackItems = parseSectionItems(normalized);
    if (fallbackItems.length) {
      result.otherSections.push({
        title: 'Notes',
        items: fallbackItems,
      });
    }
  }

  return result;
};

const mapGithubRelease = (release: GithubReleaseResponse): Release => {
  const tagName = release.tag_name || release.name || '';
  const cleanVersion = tagName.replace(/^v/i, '') || tagName || 'unknown';
  const parsedBody = parseReleaseBody(release.body);

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
  };
};

const fetchGithubReleases = async (): Promise<Release[]> => {
  const headers: Record<string, string> = {
    Accept: GITHUB_ACCEPT_HEADER,
    'User-Agent': USER_AGENT,
  };

  if (process.env.NEXT_PUBLIC_GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.NEXT_PUBLIC_GITHUB_TOKEN}`;
  }

  const response = await fetch(GITHUB_RELEASES_URL, {
    headers,
    cache: 'no-store',
    mode: 'cors',
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `GitHub releases request failed with status ${response.status}`);
  }

  const data: GithubReleaseResponse[] = await response.json();

  return data
    .filter((release) => !release.draft)
    .map(mapGithubRelease)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export default function ChangelogPage() {
  const appVersion = (process.env.NEXT_PUBLIC_APP_VERSION as string) || 'dev';
  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    setError(null);
    try {
      const data = await fetchGithubReleases();
      setReleases(data);
      // Auto-expand the first (latest) release
      if (data.length > 0) {
        setExpandedVersions(new Set([data[0].version]));
      }
    } catch (err) {
      setIsError(true);
      setError(err as Error);
      toast.error('Failed to load releases from GitHub');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const capitalizeFirst = (text: string): string => {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const copyUpdateCommand = () => {
    const command = 'docker compose pull syncio && docker compose up -d syncio';
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      toast.success('Update command copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  };

  const toggleVersion = (version: string) => {
    setExpandedVersions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(version)) {
        newSet.delete(version);
      } else {
        newSet.add(version);
      }
      return newSet;
    });
  };

  const isInitialLoading = isLoading && releases.length === 0;
  const errorMessage = error instanceof Error ? error.message : 'Failed to load releases from GitHub.';

  return (
    <>
      <Header
        title={<Breadcrumbs items={[{ label: "What's New" }]} className="text-xl font-semibold" />}
        subtitle="All notable changes to this project will be documented here."
      />

      <div className="p-8">
        {/* Loading State */}
        {isInitialLoading && (
          <PageSection>
            <div className="space-y-4">
              {[0, 1, 2].map((idx) => (
                <Card key={idx} padding="lg" className="animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="h-6 w-48 bg-surface-hover rounded" />
                    <div className="h-5 w-5 bg-surface-hover rounded-full" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-4 w-full bg-surface-hover rounded" />
                    <div className="h-4 w-3/4 bg-surface-hover rounded" />
                    <div className="h-4 w-2/3 bg-surface-hover rounded" />
                  </div>
                </Card>
              ))}
            </div>
          </PageSection>
        )}

        {/* Error State */}
        {isError && (
          <PageSection>
            <Card padding="lg" className="text-center">
              <p className="text-muted mb-4">
                Could not load release notes from GitHub. {errorMessage}
              </p>
              <Button
                variant="secondary"
                leftIcon={<ArrowPathIcon className="w-4 h-4" />}
                onClick={fetchData}
                isLoading={isLoading}
              >
                Retry
              </Button>
            </Card>
          </PageSection>
        )}

        {/* Empty State */}
        {!isInitialLoading && !isError && releases.length === 0 && (
          <PageSection>
            <Card padding="lg" className="text-center">
              <p className="text-muted">
                No releases found on GitHub. Once releases are published, they will appear here automatically.
              </p>
            </Card>
          </PageSection>
        )}

        {/* Releases List */}
        {!isInitialLoading && releases.length > 0 && (
          <PageSection>
            <div className="space-y-4">
              {releases.map((release, index) => {
                const isExpanded = expandedVersions.has(release.version);
                const isCurrentVersion = release.version === appVersion;
                const isLatest = index === 0;

                return (
                  <Card
                    key={release.tagName || release.version}
                    padding="none"
                    className={`overflow-hidden transition-all ${
                      isCurrentVersion ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    {/* Release Header */}
                    <button
                      onClick={() => toggleVersion(release.version)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <TagIcon className="w-5 h-5 text-default" />
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <a
                              href={release.htmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xl font-semibold hover:text-primary transition-colors"
                            >
                              v{release.version}
                            </a>
                            <div className="flex items-center gap-2">
                              {isLatest && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyUpdateCommand();
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-colors min-w-[74px] justify-center cursor-pointer"
                                >
                                  {copied ? (
                                    <CheckIcon className="w-3 h-3" />
                                  ) : (
                                    <ClipboardDocumentIcon className="w-3 h-3" />
                                  )}
                                  <span>{copied ? 'Copied!' : 'Latest'}</span>
                                </button>
                              )}
                              {isCurrentVersion && (
                                <Badge variant="success" size="sm">
                                  <CheckIcon className="w-3 h-3 mr-1" />
                                  Current
                                </Badge>
                              )}
                            </div>
                            {release.isPreRelease && (
                              <Badge variant="warning" size="sm">
                                Pre-release
                              </Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted">
                            {new Date(release.date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUpIcon className="w-5 h-5 text-muted" />
                      ) : (
                        <ChevronDownIcon className="w-5 h-5 text-muted" />
                      )}
                    </button>

                    {/* Release Content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-default overflow-hidden"
                        >
                          <div className="px-6 py-6 space-y-6">
                            {/* Features */}
                            {release.features.length > 0 && (
                              <div>
                                <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-default">
                                  <SparklesIcon className="w-4 h-4 text-primary" />
                                  <span>Features</span>
                                </h3>
                                <ul className="space-y-2">
                                  {release.features.map((feature, idx) => (
                                    <li
                                      key={idx}
                                      className="text-sm text-muted pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-muted"
                                    >
                                      {capitalizeFirst(feature)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Bug Fixes */}
                            {release.bugFixes.length > 0 && (
                              <div>
                                <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-default">
                                  <BugAntIcon className="w-4 h-4 text-error" />
                                  <span>Bug Fixes</span>
                                </h3>
                                <ul className="space-y-2">
                                  {release.bugFixes.map((fix, idx) => (
                                    <li
                                      key={idx}
                                      className="text-sm text-muted pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-muted"
                                    >
                                      {capitalizeFirst(fix)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Other Sections */}
                            {release.otherSections.map((section) =>
                              section.items.length > 0 ? (
                                <div key={`${release.version}-${section.title}`}>
                                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-default">
                                    <DocumentTextIcon className="w-4 h-4 text-secondary" />
                                    <span>{capitalizeFirst(section.title)}</span>
                                  </h3>
                                  <ul className="space-y-2">
                                    {section.items.map((item, idx) => (
                                      <li
                                        key={idx}
                                        className="text-sm text-muted pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-muted"
                                      >
                                        {capitalizeFirst(item)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                );
              })}
            </div>
          </PageSection>
        )}

        {/* Footer */}
        <PageSection className="mt-12">
          <Card padding="lg" className="text-center">
            <p className="text-sm text-muted">
              View all releases on{' '}
              <a
                href="https://github.com/iamneur0/syncio/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-hover underline font-medium"
              >
                GitHub
              </a>
            </p>
          </Card>
        </PageSection>
      </div>
    </>
  );
}
