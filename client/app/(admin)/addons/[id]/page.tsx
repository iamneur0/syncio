'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, Addon, Group } from '@/lib/api';
import { Header, Breadcrumbs } from '@/components/layout/Header';
import { Button, Card, Badge, ResourceBadge, Modal, ConfirmModal, Input, ToggleSwitch, VersionBadge, InlineEdit, SyncBadge } from '@/components/ui';
import { PageSection, StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { toast, showToast } from '@/components/ui/Toast';
import {
  ArrowPathIcon,
  TrashIcon,
  PuzzlePieceIcon,
  LinkIcon,
  UsersIcon,
  ClockIcon,
  CalendarIcon,
  DocumentDuplicateIcon,
  XMarkIcon,
  Bars3Icon,
  PlusIcon,
  ArrowUturnLeftIcon,
  FolderIcon,
  ShieldCheckIcon,
  HeartIcon,
  CubeIcon,
  BookOpenIcon,
  ChevronDownIcon,
  CodeBracketIcon,
} from '@heroicons/react/24/outline';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface AddonWithGroups extends Addon {
  groups?: Array<{
    id: string;
    name: string;
    users?: number;
    addonCount?: number;
  }>;
  customLogo?: string | null;
  logo?: string;
  manifest?: any;
  originalManifest?: any;
  isActive?: boolean;
  lastHealthCheck?: string;
  healthCheckError?: string;
}

// Helper function to generate unique catalog keys
const getCatalogKey = (catalog: any) => {
  if (!catalog || typeof catalog !== 'object') return 'unknown:unknown';
  const type = catalog.type || 'unknown';
  const id = catalog.id || 'unknown';
  // Use catalogHasSearch to handle both manifest (extra array) and saved (search boolean) formats
  const isSearch = catalogHasSearch(catalog);
  return isSearch ? `${type}:${id}:search` : `${type}:${id}`;
};

// Check if a catalog has search functionality
const catalogHasSearch = (catalog: any) => {
  if (!catalog || typeof catalog !== 'object') return false;
  if (Array.isArray(catalog.extra)) {
    return catalog.extra.some((e: any) => e && e.name === 'search');
  }
  return catalog.search === true;
};

// Build a unified manifest diff where catalog/resource items are highlighted as complete blocks
type DiffLine = { type: 'same' | 'add' | 'del'; text: string };
function buildManifestUnifiedDiff(orig: any, curr: any): DiffLine[] {
  const result: DiffLine[] = [];
  const catKey = (c: any) => `${c.type}:${c.id}`;
  const resName = (r: any) => (typeof r === 'string' ? r : r?.name ?? '');
  const currCatKeys = new Set((curr.catalogs || []).map(catKey));
  const origCatKeys = new Set((orig.catalogs || []).map(catKey));
  const currResNames = new Set((curr.resources || []).map(resName));
  const origResNames = new Set((orig.resources || []).map(resName));
  const push = (type: DiffLine['type'], text: string) => result.push({ type, text });

  const allCats = [
    ...(orig.catalogs || []).map((c: any) => ({ c, t: (currCatKeys.has(catKey(c)) ? 'same' : 'del') as DiffLine['type'] })),
    ...(curr.catalogs || []).filter((c: any) => !origCatKeys.has(catKey(c))).map((c: any) => ({ c, t: 'add' as DiffLine['type'] })),
  ];
  const allRes = [
    ...(orig.resources || []).map((r: any) => ({ r, t: (currResNames.has(resName(r)) ? 'same' : 'del') as DiffLine['type'] })),
    ...(curr.resources || []).filter((r: any) => !origResNames.has(resName(r))).map((r: any) => ({ r, t: 'add' as DiffLine['type'] })),
  ];

  push('same', '{');
  const allKeys = [...new Set([...Object.keys(orig), ...Object.keys(curr)])];
  allKeys.forEach((key, ki) => {
    const trail = ki < allKeys.length - 1 ? ',' : '';
    const inOrig = key in orig, inCurr = key in curr;

    if (key === 'resources') {
      push('same', `  "resources": [`);
      allRes.forEach(({ r, t }, ri) => push(t, `    ${JSON.stringify(r)}${ri < allRes.length - 1 ? ',' : ''}`));
      push('same', `  ]${trail}`);
    } else if (key === 'catalogs') {
      push('same', `  "catalogs": [`);
      allCats.forEach(({ c, t }, ci) => {
        const lines = JSON.stringify(c, null, 2).split('\n');
        lines.forEach((line, li) => push(t, `    ${line}${li === lines.length - 1 && ci < allCats.length - 1 ? ',' : ''}`));
      });
      push('same', `  ]${trail}`);
    } else if (!inOrig) {
      push('add', `  ${JSON.stringify(key)}: ${JSON.stringify(curr[key])}${trail}`);
    } else if (!inCurr) {
      push('del', `  ${JSON.stringify(key)}: ${JSON.stringify(orig[key])}${trail}`);
    } else {
      const same = JSON.stringify(orig[key]) === JSON.stringify(curr[key]);
      push(same ? 'same' : 'del', `  ${JSON.stringify(key)}: ${JSON.stringify(orig[key])}${trail}`);
      if (!same) push('add', `  ${JSON.stringify(key)}: ${JSON.stringify(curr[key])}${trail}`);
    }
  });
  push('same', '}');
  return result;
}


// Parse a catalog key back into type and id
const parseCatalogKey = (key: string) => {
  const parts = key.split(':');
  return {
    type: parts[0] || 'unknown',
    id: parts[1] || 'unknown',
    isSearch: parts[2] === 'search',
  };
};

// Manifest URL Input Component
interface ManifestUrlInputProps {
  value: string;
  onSave: (data: { manifestUrl: string }) => Promise<void>;
}

function ManifestUrlInput({ value, onSave }: ManifestUrlInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [currentSavedUrl, setCurrentSavedUrl] = useState(value);
  const [urlBeforeLastUpdate, setUrlBeforeLastUpdate] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalValue(value);
    setCurrentSavedUrl(value);
    setUrlBeforeLastUpdate(value);
  }, []);

  const validateAndFetchManifest = async (url: string): Promise<{ valid: boolean; error?: string; data?: any }> => {
    if (!url || url.trim() === '') {
      return { valid: false, error: 'URL is required' };
    }

    const urlPattern = /^@?(https?|stremio):\/\/.+\.json$/;
    if (!urlPattern.test(url.trim())) {
      return { valid: false, error: 'URL must be a valid JSON manifest URL' };
    }

    try {
      let fetchUrl = url.trim();
      if (fetchUrl.startsWith('stremio://')) {
        fetchUrl = fetchUrl.replace(/^stremio:\/\//, 'https://');
      }

      const response = await fetch(fetchUrl, { mode: 'cors', cache: 'no-cache' });
      if (!response.ok) {
        return { valid: false, error: `Failed to fetch manifest (HTTP ${response.status})` };
      }

      const data = await response.json();

      if (!data.name || typeof data.name !== 'string') {
        return { valid: false, error: 'Invalid manifest: missing or invalid "name" field' };
      }
      if (!data.version || typeof data.version !== 'string') {
        return { valid: false, error: 'Invalid manifest: missing or invalid "version" field' };
      }
      if (!data.id || typeof data.id !== 'string') {
        return { valid: false, error: 'Invalid manifest: missing or invalid "id" field' };
      }

      return { valid: true, data };
    } catch (err: any) {
      const isCorsError = err?.message?.includes('CORS') || err?.message?.includes('Failed to fetch') || err?.name === 'TypeError';
      if (isCorsError) {
        return { valid: false, error: 'Cannot validate manifest (CORS error). Server will handle it.' };
      }
      return { valid: false, error: err?.message || 'Failed to validate manifest' };
    }
  };

  const handleRevert = () => {
    setLocalValue(urlBeforeLastUpdate);
    setCurrentSavedUrl(urlBeforeLastUpdate);
    onSave({ manifestUrl: urlBeforeLastUpdate });
    toast('Reverted to previous URL', { icon: '↩️' });
  };

  const handleBlur = async () => {
    setIsFocused(false);

    if (localValue === currentSavedUrl) {
      return;
    }

    const trimmedValue = localValue.trim();
    setIsSaving(true);
    const validation = await validateAndFetchManifest(trimmedValue);

    if (!validation.valid) {
      setIsSaving(false);
      if (validation.error?.includes('CORS')) {
        try {
          await onSave({ manifestUrl: trimmedValue });
          setUrlBeforeLastUpdate(currentSavedUrl);
          setCurrentSavedUrl(trimmedValue);
          toast.success('Manifest URL updated successfully');
        } catch (err: any) {
          setLocalValue(currentSavedUrl);
          toast.error(err.message || 'Failed to update manifest URL');
        } finally {
          setIsSaving(false);
        }
        return;
      }

      toast.error(
        <div className="flex flex-col gap-2">
          <span>{validation.error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLocalValue(currentSavedUrl);
              toast('Reverted to previous URL', { icon: '↩️' });
            }}
            className="self-start text-warning hover:text-warning"
          >
            Revert to previous URL
          </Button>
        </div>,
        { duration: 5000 }
      );
      setIsSaving(false);
      return;
    }

    try {
      await onSave({ manifestUrl: trimmedValue });
      setUrlBeforeLastUpdate(currentSavedUrl);
      setCurrentSavedUrl(trimmedValue);
      toast.success('Manifest URL updated successfully');
    } catch (err: any) {
      setLocalValue(currentSavedUrl);
      toast.error(err.message || 'Failed to update manifest URL');
    } finally {
      setIsSaving(false);
    }
  };

  const canRevert = currentSavedUrl !== urlBeforeLastUpdate && urlBeforeLastUpdate !== '' && urlBeforeLastUpdate !== currentSavedUrl;

  return (
    <div
      className={`flex-1 flex items-center gap-3 p-3 rounded-xl border bg-surface-hover transition-all ${
        isFocused ? 'border-theme-secondary' : 'border-default'
      } ${isSaving ? 'opacity-70' : ''}`}
    >
      <LinkIcon className="w-5 h-5 text-muted shrink-0" />
      <input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        disabled={isSaving}
        className="flex-1 bg-transparent text-default placeholder:text-subtle disabled:cursor-not-allowed"
        style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
        placeholder="Enter manifest URL (e.g., https://example.com/manifest.json)"
      />
      {isSaving && (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin text-primary shrink-0" />
      )}
      {!isSaving && canRevert && (
        <button
          type="button"
          onClick={handleRevert}
          className="p-1.5 rounded-lg hover:bg-surface-hover text-muted hover:text-default transition-colors shrink-0"
          title={`Revert to: ${urlBeforeLastUpdate.substring(0, 40)}${urlBeforeLastUpdate.length > 40 ? '...' : ''}`}
        >
          <ArrowUturnLeftIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// Sortable Catalog Item Component
function SortableCatalogItem({ catalog, isSelected, onToggle }: { catalog: any; isSelected: boolean; onToggle: () => void }) {
  const key = getCatalogKey(catalog);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: key || '' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onToggle}
      className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 bg-surface-hover hover:bg-surface border border-default hover:border-primary ${
        isDragging ? 'shadow-2xl ring-2 ring-primary/30 scale-[1.02]' : ''
      }`}
    >

      {/* Drag handle */}
      <div 
        className="text-muted/50 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <Bars3Icon className="w-5 h-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium truncate ${isSelected ? 'text-default' : 'text-subtle group-hover:text-default'}`}>
            {catalog.name || catalog.id}
          </span>
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary-muted text-primary border border-primary/20">
            {catalog.type}
          </span>
        </div>
      </div>

      {/* Selection indicator circle */}
      <div
        className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
          isSelected 
            ? 'bg-primary border-primary' 
            : 'border-default group-hover:border-primary/50'
        }`}
      >
        {isSelected && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-2 h-2 rounded-full bg-white"
          />
        )}
      </div>
    </motion.div>
  );
}

export default function AddonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddToGroupModalOpen, setIsAddToGroupModalOpen] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Data state
  const [addon, setAddon] = useState<AddonWithGroups | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);

  // Resources / catalogs editing
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set());
  const [selectedCatalogs, setSelectedCatalogs] = useState<Set<string>>(new Set());
  const [orderedRegularCatalogs, setOrderedRegularCatalogs] = useState<any[]>([]);
  const [orderedSearchCatalogs, setOrderedSearchCatalogs] = useState<any[]>([]);
  const [manifestData, setManifestData] = useState<any>(null);
  const [originalManifestData, setOriginalManifestData] = useState<any>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [isSavingResources, setIsSavingResources] = useState(false);
  const [isSavingCatalogs, setIsSavingCatalogs] = useState(false);
  const [activeCatalogId, setActiveCatalogId] = useState<string | null>(null);
  const resourceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catalogSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state for editing
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    customLogo: '',
  });

  // Manifest diff section state
  const [isManifestExpanded, setIsManifestExpanded] = useState(false);

  // Proxy state
  const [isTogglingProxy, setIsTogglingProxy] = useState(false);
  const [isRegeneratingProxy, setIsRegeneratingProxy] = useState(false);

  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch addon data
  const fetchAddon = useCallback(async (skipLoading = false) => {
    if (!skipLoading) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const addonData = await api.getAddon(params.id as string);
      const anyAddon = addonData as any;

      const logo =
        anyAddon.customLogo ||
        (anyAddon.manifest && anyAddon.manifest.logo) ||
        anyAddon.logo ||
        anyAddon.iconUrl ||
        (anyAddon.manifest?.id && `https://stremio-addon.netlify.app/${anyAddon.manifest.id}/icon.png`) ||
        undefined;

      const groupsData = await api.getGroups();

      // Filter groups to find which ones contain this addon
      const groupsWithAddon = [];
      let userCount = 0;
      for (const group of groupsData) {
        try {
          const groupAddons = await api.getGroupAddons(group.id);
          const hasAddon = groupAddons.some((ga: any) => ga.id === params.id);
          if (hasAddon) {
            groupsWithAddon.push(group);
            // Get user count for this group
            const groupData = await api.getGroup(group.id);
            let userIds: string[] = [];
            if (groupData?.userIds) {
              try {
                if (typeof groupData.userIds === 'string') {
                  userIds = JSON.parse(groupData.userIds);
                } else if (Array.isArray(groupData.userIds)) {
                  userIds = groupData.userIds;
                }
              } catch (e) {
                console.error('Error parsing group userIds:', e);
              }
            }
            userCount += userIds.length;
          }
        } catch (e) {
          // Skip groups we can't access
        }
      }

      setAddon({
        ...addonData,
        groups: groupsWithAddon,
        logo,
      });
      setTotalUsers(userCount);
      setSelectedResources(new Set((addonData as any).resources || []));
      const savedCatalogs = (addonData as any).catalogs || [];
      const catalogKeys = savedCatalogs.map((c: any) => getCatalogKey(c)).filter(Boolean);
      setSelectedCatalogs(new Set(catalogKeys));
      setAllGroups(groupsData);
      setLogoError(false);

      if (anyAddon.originalManifest) {
        setOriginalManifestData(anyAddon.originalManifest);
      }
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  // Initial fetch
  useEffect(() => {
    if (params.id) {
      fetchAddon();
    }
  }, [params.id, fetchAddon]);

  useEffect(() => {
    if (addon) {
      document.title = `Syncio - ${addon.name || 'Addon Detail'}`;
    }
  }, [addon]);

  const handleReload = useCallback(async () => {
    setIsReloading(true);
    try {
      await api.reloadAddon(params.id as string);
      const addonData = await api.getAddon(params.id as string);
      const anyAddon = addonData as any;
      
      const logo =
        anyAddon.customLogo ||
        (anyAddon.manifest && anyAddon.manifest.logo) ||
        anyAddon.logo ||
        anyAddon.iconUrl ||
        (anyAddon.manifest?.id && `https://stremio-addon.netlify.app/${anyAddon.manifest.id}/icon.png`) ||
        undefined;
      
      setAddon(prev => prev ? { ...prev, ...addonData, logo } : null);
      setSelectedResources(new Set(anyAddon.resources || []));
      const savedCatalogs = anyAddon.catalogs || [];
      const catalogKeys = savedCatalogs.map((c: any) => getCatalogKey(c)).filter(Boolean);
      setSelectedCatalogs(new Set(catalogKeys));
      
      if (anyAddon.originalManifest) {
        setOriginalManifestData(anyAddon.originalManifest);
      }
      if (anyAddon.manifest) {
        setManifestData(anyAddon.manifest);
      }
      
      toast.success('Addon reloaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reload addon');
    } finally {
      setIsReloading(false);
    }
  }, [params.id]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await api.deleteAddon(params.id as string);
      toast.success('Addon deleted successfully');
      router.push('/addons');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete addon');
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  }, [params.id, router]);

  const handleToggleStatus = async () => {
    if (!addon) return;

    setIsTogglingStatus(true);
    try {
      const newStatus = !addon.isActive;
      await api.toggleAddonStatus(addon.id, newStatus);
      setAddon({ ...addon, isActive: newStatus });
      toast.success(newStatus ? 'Addon enabled' : 'Addon disabled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle status');
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Handle proxy toggle
  const handleToggleProxy = async () => {
    if (!addon) return;

    setIsTogglingProxy(true);
    try {
      const anyAddon = addon as any;
      if (anyAddon.proxyEnabled) {
        await api.disableProxy(addon.id);
        setAddon({ ...addon, proxyEnabled: false } as any);
        toast.success('Proxy disabled');
      } else {
        const result = await api.enableProxy(addon.id);
        setAddon({ 
          ...addon, 
          proxyEnabled: true, 
          proxyUuid: result.proxyUuid,
          proxyManifestUrl: result.proxyManifestUrl 
        } as any);
        toast.success('Proxy enabled');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle proxy');
    } finally {
      setIsTogglingProxy(false);
    }
  };

  // Handle regenerate proxy UUID
  const handleRegenerateProxyUuid = async () => {
    if (!addon) return;

    setIsRegeneratingProxy(true);
    try {
      const result = await api.regenerateProxyUuid(addon.id);
      setAddon({ 
        ...addon, 
        proxyUuid: result.proxyUuid,
        proxyManifestUrl: result.proxyManifestUrl 
      } as any);
      toast.success('Proxy URL regenerated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to regenerate proxy URL');
    } finally {
      setIsRegeneratingProxy(false);
    }
  };

  // Handle name update
  const handleNameUpdate = useCallback(async (newName: string) => {
    if (!addon) return;
    try {
      await api.updateAddon(addon.id, { name: newName });
      setAddon({ ...addon, name: newName });
      toast.success('Addon name updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update name');
    }
  }, [addon]);

  // Handle description update
  const handleDescriptionUpdate = useCallback(async (newDescription: string) => {
    if (!addon) return;
    try {
      await api.updateAddon(addon.id, { description: newDescription || undefined });
      setAddon({ ...addon, description: newDescription });
      toast.success('Addon description updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update description');
    }
  }, [addon]);

  // Load manifest data
  useEffect(() => {
    if (!addon || manifestData || loadingManifest) return;

    const loadManifest = async () => {
      setLoadingManifest(true);
      try {
        const manifestUrl = (addon as any).url || (addon as any).manifestUrl;
        if (manifestUrl) {
          let fetchUrl = manifestUrl;
          if (fetchUrl.startsWith('stremio://')) {
            fetchUrl = fetchUrl.replace(/^stremio:\/\//, 'https://');
          }
          const response = await fetch(fetchUrl);
          if (response.ok) {
            const data = await response.json();
            setManifestData(data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch manifest:', err);
      } finally {
        setLoadingManifest(false);
      }
    };

    const apiManifest = (addon as any).manifest || (addon as any).originalManifest;
    if (apiManifest) {
      setManifestData(apiManifest);
    } else if (addon.manifestUrl) {
      loadManifest();
    }
  }, [addon, manifestData, loadingManifest]);

  // Compute filtered manifest from original + current selections (used for diff)
  const currentManifest = useMemo(() => {
    if (!originalManifestData) return null;
    const base = originalManifestData;
    const resources = (base.resources || []).filter((r: any) => {
      const name = typeof r === 'string' ? r : r?.name;
      return name && selectedResources.has(name);
    });
    const catalogs = (base.catalogs || []).filter((c: any) => selectedCatalogs.has(getCatalogKey(c)));
    return { ...base, resources, catalogs };
  }, [originalManifestData, selectedResources, selectedCatalogs]);

  // Initialize ordered catalogs
  useEffect(() => {
    const catalogs = originalManifestData?.catalogs || manifestData?.catalogs || (addon as any)?.manifest?.catalogs || [];

    // Regular catalogs: those without search functionality
    const regularCatalogs = catalogs.filter((c: any) => {
      if (!c || typeof c !== 'object') return true;
      return !catalogHasSearch(c);
    });

    // Search catalogs: any catalog with search functionality (even if it has other extras)
    const searchCatalogs = catalogs.filter((c: any) => {
      if (!c || typeof c !== 'object') return false;
      return catalogHasSearch(c);
    });

    const savedCatalogs = (addon as any)?.catalogs || [];
    const savedKeys = new Set(savedCatalogs.map((c: any) => getCatalogKey(c)));

    const selectedRegular = savedCatalogs
      .filter((c: any) => {
        const key = getCatalogKey(c);
        return key && regularCatalogs.some((rc: any) => getCatalogKey(rc) === key);
      })
      .map((c: any) => {
        const fullCatalog = regularCatalogs.find((rc: any) => getCatalogKey(rc) === getCatalogKey(c));
        return fullCatalog || c;
      });

    const unselectedRegular = regularCatalogs.filter((c: any) => {
      const key = getCatalogKey(c);
      return key && !savedKeys.has(key);
    });

    const orderedRegular = [...selectedRegular, ...unselectedRegular];

    const selectedSearch = savedCatalogs
      .filter((c: any) => {
        const key = getCatalogKey(c);
        return key && searchCatalogs.some((sc: any) => getCatalogKey(sc) === key);
      })
      .map((c: any) => {
        const fullCatalog = searchCatalogs.find((sc: any) => getCatalogKey(sc) === getCatalogKey(c));
        return fullCatalog || c;
      });

    const unselectedSearch = searchCatalogs.filter((c: any) => {
      const key = getCatalogKey(c);
      return key && !savedKeys.has(key);
    });

    const orderedSearch = [...selectedSearch, ...unselectedSearch];

    setOrderedRegularCatalogs(orderedRegular);
    setOrderedSearchCatalogs(orderedSearch);
  }, [originalManifestData, manifestData, addon]);

  // Initialize selectedResources and selectedCatalogs when addon is first loaded
  useEffect(() => {
    if (addon) {
      // Initialize resources
      if ((addon as any)?.resources) {
        let savedResources = (addon as any).resources;
        
        // Auto-add "search" resource if any catalog has search functionality and wasn't already saved
        if ((addon as any)?.catalogs) {
          const savedCatalogs = (addon as any).catalogs;
          const hasSearchCatalog = savedCatalogs.some((c: any) => c?.search);
          if (hasSearchCatalog && !savedResources.includes('search')) {
            savedResources = [...savedResources, 'search'];
          }
        }
        
        setSelectedResources(new Set(savedResources));
      }
      
      // Initialize catalogs
      if ((addon as any)?.catalogs) {
        const savedCatalogs = (addon as any).catalogs;
        const catalogKeys = savedCatalogs.map((c: any) => getCatalogKey(c)).filter(Boolean);
        setSelectedCatalogs(new Set(catalogKeys));
      }
    }
  }, [addon?.id]); // Only run when addon ID changes (initial load)

  // Combine manifest resources with addon's saved resources to show all available resources
  const allResources = useMemo(() => {
    const manifestResources = manifestData?.resources || [];
    const savedResources = (addon as any)?.resources || [];
    
    // Create a set of resource names from manifest to avoid duplicates
    const manifestNames = new Set(
      manifestResources.map((r: any) => typeof r === 'string' ? r : r.name)
    );
    
    // Start with manifest resources
    const combined = [...manifestResources];
    
    // Add saved resources that aren't in the manifest (like "search")
    for (const resource of savedResources) {
      if (!manifestNames.has(resource)) {
        combined.push(resource);
      }
    }
    
    // Auto-add "search" resource if any catalog has search functionality
    const hasSearchCatalog = (manifestData?.catalogs || []).some((c: any) =>
      c?.extra?.some((e: any) => e.name === 'search')
    );
    if (hasSearchCatalog && !manifestNames.has('search') && !savedResources.includes('search')) {
      combined.push('search');
    }
    
    return combined;
  }, [manifestData, addon]);

  // Auto-save helpers (debounced)
  const autoSaveResources = useCallback((resources: Set<string>) => {
    if (!addon) return;
    if (resourceSaveTimer.current) clearTimeout(resourceSaveTimer.current);
    resourceSaveTimer.current = setTimeout(async () => {
      setIsSavingResources(true);
      try {
        await api.updateAddon(addon.id, { resources: Array.from(resources) });
      } catch (err: any) {
        toast.error(err.message || 'Failed to update resources');
      } finally {
        setIsSavingResources(false);
      }
    }, 500);
  }, [addon]);

  const autoSaveCatalogs = useCallback((
    selectedCats: Set<string>,
    regularCats: any[],
    searchCats: any[]
  ) => {
    if (!addon) return;
    if (catalogSaveTimer.current) clearTimeout(catalogSaveTimer.current);
    catalogSaveTimer.current = setTimeout(async () => {
      setIsSavingCatalogs(true);
      try {
        const finalCatalogs: { type: string; id: string; search: boolean }[] = [];
        let hasSearchCatalog = false;
        
        for (const cat of regularCats) {
          const key = getCatalogKey(cat);
          if (selectedCats.has(key)) {
            const { type, id, isSearch } = parseCatalogKey(key);
            finalCatalogs.push({ type, id, search: isSearch });
            if (isSearch) hasSearchCatalog = true;
          }
        }
        for (const cat of searchCats) {
          const key = getCatalogKey(cat);
          if (selectedCats.has(key)) {
            const { type, id, isSearch } = parseCatalogKey(key);
            finalCatalogs.push({ type, id, search: isSearch });
            if (isSearch) hasSearchCatalog = true;
          }
        }
        await api.updateAddon(addon.id, { catalogs: finalCatalogs });
        
        // Auto-add "search" resource if any search catalog is enabled
        const currentResources = (addon as any)?.resources || [];
        if (hasSearchCatalog && !currentResources.includes('search')) {
          const newResources = [...currentResources, 'search'];
          await api.updateAddon(addon.id, { resources: newResources });
          setSelectedResources(new Set(newResources));
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to update catalogs');
      } finally {
        setIsSavingCatalogs(false);
      }
    }, 500);
  }, [addon]);

  // Resource toggle handler
  const handleResourceToggle = (resource: string) => {
    const newSelectedResources = new Set(selectedResources);
    const isDeactivating = newSelectedResources.has(resource);

    if (isDeactivating) {
      newSelectedResources.delete(resource);

      // Cascade: deselect matching catalogs when their resource is disabled
      if (resource === 'search' || resource === 'catalog') {
        const newSelectedCatalogs = new Set(selectedCatalogs);
        for (const key of newSelectedCatalogs) {
          const { isSearch } = parseCatalogKey(key);
          if (resource === 'search' ? isSearch : !isSearch) {
            newSelectedCatalogs.delete(key);
          }
        }
        setSelectedCatalogs(newSelectedCatalogs);
        autoSaveCatalogs(newSelectedCatalogs, orderedRegularCatalogs, orderedSearchCatalogs);
      }
    } else {
      newSelectedResources.add(resource);
    }

    setSelectedResources(newSelectedResources);
    autoSaveResources(newSelectedResources);
  };

  // Catalog toggle handler
  const handleCatalogToggle = (catalogKey: string) => {
    const newSelected = new Set(selectedCatalogs);
    if (newSelected.has(catalogKey)) {
      newSelected.delete(catalogKey);
    } else {
      newSelected.add(catalogKey);
    }
    setSelectedCatalogs(newSelected);
    autoSaveCatalogs(newSelected, orderedRegularCatalogs, orderedSearchCatalogs);
  };

  // Check if all catalogs selected
  const allRegularSelected = orderedRegularCatalogs.length > 0 &&
    orderedRegularCatalogs.every((c: any) => selectedCatalogs.has(getCatalogKey(c)));

  const allSearchSelected = orderedSearchCatalogs.length > 0 &&
    orderedSearchCatalogs.every((c: any) => selectedCatalogs.has(getCatalogKey(c)));

  // Toggle all catalogs
  const handleToggleAllRegular = () => {
    const newSelected = new Set(selectedCatalogs);
    if (allRegularSelected) {
      orderedRegularCatalogs.forEach((c: any) => newSelected.delete(getCatalogKey(c)));
    } else {
      orderedRegularCatalogs.forEach((c: any) => newSelected.add(getCatalogKey(c)));
    }
    setSelectedCatalogs(newSelected);
    autoSaveCatalogs(newSelected, orderedRegularCatalogs, orderedSearchCatalogs);
  };

  const handleToggleAllSearch = () => {
    const newSelected = new Set(selectedCatalogs);
    if (allSearchSelected) {
      orderedSearchCatalogs.forEach((c: any) => newSelected.delete(getCatalogKey(c)));
    } else {
      orderedSearchCatalogs.forEach((c: any) => newSelected.add(getCatalogKey(c)));
    }
    setSelectedCatalogs(newSelected);
    autoSaveCatalogs(newSelected, orderedRegularCatalogs, orderedSearchCatalogs);
  };

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveCatalogId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const activeKey = active.id as string;
      const isRegular = orderedRegularCatalogs.some((c: any) => getCatalogKey(c) === activeKey);
      if (isRegular) {
        const oldIndex = orderedRegularCatalogs.findIndex((c: any) => getCatalogKey(c) === activeKey);
        const newIndex = orderedRegularCatalogs.findIndex((c: any) => getCatalogKey(c) === over.id);
        const newOrder = arrayMove(orderedRegularCatalogs, oldIndex, newIndex);
        setOrderedRegularCatalogs(newOrder);
        autoSaveCatalogs(selectedCatalogs, newOrder, orderedSearchCatalogs);
      } else {
        const oldIndex = orderedSearchCatalogs.findIndex((c: any) => getCatalogKey(c) === activeKey);
        const newIndex = orderedSearchCatalogs.findIndex((c: any) => getCatalogKey(c) === over.id);
        const newOrder = arrayMove(orderedSearchCatalogs, oldIndex, newIndex);
        setOrderedSearchCatalogs(newOrder);
        autoSaveCatalogs(selectedCatalogs, orderedRegularCatalogs, newOrder);
      }
    }
    setActiveCatalogId(null);
  };

  // Handle save from edit modal
  const handleSaveEdit = async () => {
    if (!addon) return;
    try {
      await api.updateAddon(addon.id, {
        name: editForm.name,
        description: editForm.description,
        customLogo: editForm.customLogo,
      } as any);
      
      // Compute the new logo URL using the same logic as fetchAddon
      const anyAddon = addon as any;
      const newLogoUrl =
        editForm.customLogo ||
        addon.logo ||
        anyAddon.iconUrl ||
        (addon.manifest?.logo) ||
        (addon.manifest?.id && `https://stremio-addon.netlify.app/${addon.manifest.id}/icon.png`) ||
        undefined;
      
      setAddon({
        ...addon,
        name: editForm.name,
        description: editForm.description,
        customLogo: editForm.customLogo,
        logo: newLogoUrl,
      });
      
      // Reset logo error so the new image will be attempted
      setLogoError(false);
      
      setIsEditModalOpen(false);
      toast.success('Addon updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update addon');
    }
  };

  // Handle reset to manifest defaults
  const handleResetToManifest = async () => {
    if (!addon) return;
    try {
      const manifest = originalManifestData || manifestData;
      if (!manifest) {
        toast.error('No manifest data available');
        return;
      }

      // Prepare reset values
      const resetName = manifest.name || addon.name;
      const resetDescription = manifest.description || '';
      const resetLogo = manifest.logo || '';

      // Update addon via API
      await api.updateAddon(addon.id, {
        name: resetName,
        description: resetDescription,
        customLogo: resetLogo,
      } as any);

      // Compute the logo using the same logic as fetchAddon
      const anyAddon = addon as any;
      const resetLogoUrl =
        resetLogo ||
        (manifest && manifest.logo) ||
        addon.logo ||
        anyAddon.iconUrl ||
        (manifest?.id && `https://stremio-addon.netlify.app/${manifest.id}/icon.png`) ||
        undefined;

      // Update local state
      setAddon({
        ...addon,
        name: resetName,
        description: resetDescription,
        customLogo: resetLogo,
        logo: resetLogoUrl,
      });
      
      // Reset logo error state so the new logo will be attempted
      setLogoError(false);

      // Reset resources
      const manifestResources = manifest?.resources || [];
      const resourceNames = manifestResources.map((r: any) =>
        typeof r === 'string' ? r : r.name
      ).filter(Boolean);
      const hasSearch = (manifest?.catalogs || []).some((c: any) =>
        c.extra?.some((e: any) => e.name === 'search')
      );
      if (hasSearch && !resourceNames.includes('search')) {
        resourceNames.push('search');
      }
      await api.updateAddon(addon.id, { resources: resourceNames });
      setSelectedResources(new Set(resourceNames));

      // Reset catalogs
      const catalogs = manifest?.catalogs || [];
      const regularCatalogs = catalogs.filter((c: any) => {
        if (!c || typeof c !== 'object') return true;
        return !catalogHasSearch(c);
      });
      const searchCatalogs = catalogs.filter((c: any) => {
        if (!c || typeof c !== 'object') return false;
        return catalogHasSearch(c);
      });
      
      const finalCatalogs = catalogs.map((c: any) => ({
        type: c.type,
        id: c.id,
        search: catalogHasSearch(c),
      }));
      await api.updateAddon(addon.id, { catalogs: finalCatalogs });
      
      setOrderedRegularCatalogs(regularCatalogs);
      setOrderedSearchCatalogs(searchCatalogs);
      const allKeys = catalogs.map((c: any) => getCatalogKey(c)).filter(Boolean);
      setSelectedCatalogs(new Set(allKeys));

      // Update edit form
      setEditForm({
        name: resetName,
        description: resetDescription,
        customLogo: resetLogo,
      });

      showToast.info('Reset to manifest defaults');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset addon');
    }
  };

  // Handle remove from group
  const handleRemoveFromGroup = async (groupId: string, groupName: string) => {
    if (!addon) return;
    try {
      await api.removeAddonFromGroup(groupId, addon.id);
      toast.success(`Removed from ${groupName}`);
      await fetchAddon();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove from group');
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Loading..." />
        <div className="p-8">
          <div className="flex items-center justify-center h-40 md:h-64">
            <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin text-primary" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header title="Error" />
        <div className="p-8">
          <div className="flex flex-col items-center justify-center h-40 md:h-64 gap-4">
            <p className="text-lg text-error">Failed to load addon</p>
            <p className="text-sm text-subtle">{error.message}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </div>
        </div>
      </>
    );
  }

  if (!addon) {
    return (
      <>
        <Header title="Not Found" />
        <div className="p-8">
          <div className="flex flex-col items-center justify-center h-40 md:h-64 gap-4">
            <p className="text-lg text-default">Addon not found</p>
            <Link href="/addons">
              <Button variant="secondary">Back to Addons</Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  const anyAddon = addon as any;

  return (
    <>
      <Header
        title={
          <Breadcrumbs
            items={[
              { label: 'Addons', href: '/addons' },
              { label: addon.name },
            ]}
            className="text-xl font-semibold"
          />
        }
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Active</span>
              <ToggleSwitch
                checked={addon.isActive !== false}
                onChange={handleToggleStatus}
                size="sm"
                disabled={isTogglingStatus}
              />
            </div>
            <Button
              variant="glass"
              leftIcon={<ArrowPathIcon className={`w-5 h-5 ${isReloading ? 'animate-spin' : ''}`} />}
              onClick={handleReload}
              isLoading={isReloading}
            >
              Reload Addon
            </Button>
            <Button
              variant="glass"
              leftIcon={<ArrowUturnLeftIcon className="w-5 h-5" />}
              onClick={handleResetToManifest}
            >
              Reset
            </Button>
            <Button
              variant="danger"
              leftIcon={<TrashIcon className="w-5 h-5" />}
              onClick={() => setIsDeleteModalOpen(true)}
            >
              Delete
            </Button>
          </div>
        }
      />

      <div className="p-8">
        {/* Hero Section */}
        <PageSection className="mb-8">
          <Card padding="lg">
            <div className="relative">
              <div className="flex items-start gap-6">
                {/* Addon Logo - Large and clickable */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className="relative shrink-0"
                >
                  <div
                    onClick={() => {
                      setEditForm({
                        name: addon.name,
                        description: addon.description || '',
                        customLogo: addon.customLogo || '',
                      });
                      setIsEditModalOpen(true);
                    }}
                    className="cursor-pointer hover:scale-105 transition-transform"
                  >
                    <div className="w-24 h-24 rounded-2xl flex items-center justify-center bg-surface border-2 border-default overflow-hidden shadow-lg">
                      {addon.logo && !logoError ? (
                        <img
                          src={addon.logo}
                          alt={addon.name}
                          className="w-full h-full object-contain p-2"
                          onError={() => setLogoError(true)}
                        />
                      ) : (
                        <PuzzlePieceIcon className="w-12 h-12 text-primary" />
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {/* Name with version badge */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <InlineEdit
                      value={addon.name}
                      onSave={handleNameUpdate}
                      placeholder="Enter addon name..."
                      maxLength={50}
                      className="text-2xl font-bold"
                    />
                    {addon.version && (
                      <VersionBadge version={addon.version} size="sm" />
                    )}
                    {/* Health Status */}
                    {addon.lastHealthCheck && (
                      <div 
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                          addon.isOnline 
                            ? 'bg-success/10 text-success border border-success/20' 
                            : 'bg-danger/10 text-danger border border-danger/20'
                        }`}
                        title={addon.isOnline 
                          ? `Online - Last checked: ${new Date(addon.lastHealthCheck).toLocaleString()}` 
                          : `Offline${addon.healthCheckError ? `: ${addon.healthCheckError}` : ''} - Last checked: ${new Date(addon.lastHealthCheck).toLocaleString()}`
                        }
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${addon.isOnline ? 'bg-success' : 'bg-danger'}`} />
                        {addon.isOnline ? 'Online' : 'Offline'}
                      </div>
                    )}
                  </div>
                  <div className="mb-4">
                    <InlineEdit
                      value={addon.description || undefined}
                      onSave={handleDescriptionUpdate}
                      placeholder="Enter description..."
                      maxLength={200}
                      className="text-muted"
                    />
                  </div>

                  {/* Quick stats row */}
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <UsersIcon className="w-5 h-5 text-secondary" />
                      <span className="text-default font-medium">{totalUsers}</span>
                      <span className="text-muted">user{totalUsers !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FolderIcon className="w-5 h-5 text-secondary" />
                      <span className="text-default font-medium">{addon.groups?.length || 0}</span>
                      <span className="text-muted">group{addon.groups?.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PuzzlePieceIcon className="w-5 h-5 text-secondary" />
                      <span className="text-default font-medium">{selectedResources.size}</span>
                      <span className="text-muted">resource{selectedResources.size !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-5 h-5 text-secondary" />
                      <span className="text-muted">
                        Created: {addon.createdAt ? new Date(addon.createdAt).toLocaleDateString() : 'Unknown'}
                      </span>
                    </div>
                    {/* Health Check Status */}
                    {addon.lastHealthCheck && (
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${addon.isOnline ? 'bg-success' : 'bg-danger'}`} />
                        <span className={addon.isOnline ? 'text-success' : 'text-danger'}>
                          {addon.isOnline ? 'Online' : 'Offline'}
                        </span>
                        <span className="text-muted text-sm">
                          (checked {new Date(addon.lastHealthCheck).toLocaleString()})
                        </span>
                        {addon.healthCheckError && !addon.isOnline && (
                          <span className="text-danger text-sm" title={addon.healthCheckError}>
                            - {addon.healthCheckError.length > 30 ? addon.healthCheckError.substring(0, 30) + '...' : addon.healthCheckError}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>


              </div>
            </div>
          </Card>
        </PageSection>

        {/* Manifest URL Section */}
        <PageSection delay={0.1} className="mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/20">
                  <LinkIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-default">Manifest URL</h3>
                  <p className="text-sm text-muted">The source URL for this addon</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {loadingManifest && (
                  <div className="flex items-center gap-2 text-xs text-subtle">
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    Loading manifest...
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ManifestUrlInput
                value={(addon as any).url || (addon as any).manifestUrl || ''}
                onSave={async (updateData) => {
                  await api.updateAddon(params.id as string, updateData as any);
                  const addonData = await api.getAddon(params.id as string);
                  const anyAddon = addonData as any;
                  const logo =
                    anyAddon.customLogo ||
                    (anyAddon.manifest && anyAddon.manifest.logo) ||
                    anyAddon.logo ||
                    anyAddon.iconUrl ||
                    (anyAddon.manifest?.id && `https://stremio-addon.netlify.app/${anyAddon.manifest.id}/icon.png`) ||
                    undefined;
                  setAddon(prev => prev ? { ...prev, ...addonData, logo } : null);
                  setLogoError(false);
                  if (anyAddon.manifest) {
                    setManifestData(anyAddon.manifest);
                  }
                  if (anyAddon.originalManifest) {
                    setOriginalManifestData(anyAddon.originalManifest);
                  }
                  
                  // Initialize resources, auto-add "search" if search catalogs enabled
                  let savedResources = anyAddon.resources || [];
                  const savedCatalogs = anyAddon.catalogs || [];
                  const hasSearchCatalog = savedCatalogs.some((c: any) => c?.search);
                  if (hasSearchCatalog && !savedResources.includes('search')) {
                    savedResources = [...savedResources, 'search'];
                    // Update addon with the search resource
                    await api.updateAddon(params.id as string, { resources: savedResources });
                  }
                  setSelectedResources(new Set(savedResources));
                  
                  const catalogKeys = savedCatalogs.map((c: any) => getCatalogKey(c)).filter(Boolean);
                  setSelectedCatalogs(new Set(catalogKeys));
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const url = (addon as any).url || (addon as any).manifestUrl;
                  if (url) {
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success('Copied to clipboard');
                    } catch (err) {
                      toast.error('Failed to copy to clipboard');
                    }
                  } else {
                    toast.error('No URL available to copy');
                  }
                }}
              >
                <DocumentDuplicateIcon className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        </PageSection>

        {/* Manifest Diff Section */}
        {(originalManifestData || manifestData) && (
          <PageSection delay={0.15} className="mb-8">
            <Card padding="lg">
              <button
                type="button"
                onClick={() => setIsManifestExpanded((prev: boolean) => !prev)}
                className="w-full flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/20">
                    <CodeBracketIcon className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-default">Manifest</h3>
                    <p className="text-sm text-muted">
                      {originalManifestData && currentManifest ? 'Diff between original and current' : 'Manifest JSON'}
                    </p>
                  </div>
                </div>
                <ChevronDownIcon
                  className={`w-5 h-5 text-muted transition-transform duration-200 ${isManifestExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              <AnimatePresence>
                {isManifestExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4">
                      {(() => {
                        if (originalManifestData && currentManifest) {
                          const lines = buildManifestUnifiedDiff(originalManifestData, currentManifest);
                          const hasDiff = lines.some(l => l.type !== 'same');
                          return (
                            <>
                              {!hasDiff && <p className="text-xs text-subtle italic mb-2">No differences — manifests are identical.</p>}
                              <pre className="p-4 rounded-xl bg-surface border border-default text-xs font-mono overflow-auto max-h-[32rem] leading-5">
                                {lines.map((line, i) => (
                                  <span key={i} className={`block ${
                                    line.type === 'del' ? 'bg-red-500/10 text-red-400'
                                    : line.type === 'add' ? 'bg-green-500/10 text-green-400'
                                    : 'text-subtle'
                                  }`}>
                                    {line.type === 'del' ? '- ' : line.type === 'add' ? '+ ' : '  '}
                                    {line.text}
                                  </span>
                                ))}
                              </pre>
                            </>
                          );
                        }

                        // Only one available — show plain JSON
                        const json = JSON.stringify(originalManifestData ?? manifestData, null, 2);
                        return (
                          <pre className="p-4 rounded-xl bg-surface border border-default text-xs text-subtle font-mono overflow-auto max-h-[32rem] whitespace-pre-wrap break-all">
                            {json}
                          </pre>
                        );
                      })()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </PageSection>
        )}

        {/* Resources Section */}
        <PageSection delay={0.2} className="mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-500/20">
                  <CubeIcon className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-default">Resources</h3>
                  <p className="text-sm text-muted">Choose which resources this addon exposes</p>
                </div>
              </div>
              <div className="flex items-center gap-2 h-9 flex-shrink-0">
                {isSavingResources && (
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin text-muted" />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const manifest = originalManifestData || manifestData;
                    const manifestResources = manifest?.resources || [];
                    const resourceNames = manifestResources.map((r: any) =>
                      typeof r === 'string' ? r : r.name
                    ).filter(Boolean);

                    const hasSearch = (manifest?.catalogs || []).some((c: any) =>
                      c.extra?.some((e: any) => e.name === 'search')
                    );
                    if (hasSearch && !resourceNames.includes('search')) {
                      resourceNames.push('search');
                    }

                    const newSet = new Set<string>(resourceNames);
                    setSelectedResources(newSet);
                    autoSaveResources(newSet);
                    showToast.info('Resources reset to manifest defaults');
                  }}
                  leftIcon={<ArrowUturnLeftIcon className="w-4 h-4" />}
                >
                  Reset
                </Button>
              </div>
            </div>

            {allResources.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {allResources.map((resource: any, index: number) => {
                  const name = typeof resource === 'string' ? resource : resource.name;
                  const isSelected = selectedResources.has(name);

                  return (
                    <motion.button
                      key={`${name}-${index}`}
                      onClick={() => handleResourceToggle(name)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 bg-surface-hover hover:bg-surface border border-default hover:border-primary whitespace-nowrap`}
                    >
                      {/* Content */}
                      <span className={`font-medium ${isSelected ? 'text-default' : 'text-subtle group-hover:text-default'}`}>
                        {name}
                      </span>

                      {/* Selection indicator circle */}
                      <div
                        className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                          isSelected 
                            ? 'bg-primary border-primary' 
                            : 'border-default group-hover:border-primary/50'
                        }`}
                      >
                        {isSelected && (
                          <motion.div 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-1.5 h-1.5 rounded-full bg-white"
                          />
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-subtle">No resources available</p>
            )}
          </Card>
        </PageSection>

        {/* Catalogs Section */}
        <PageSection delay={0.3} className="mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-500/20">
                  <BookOpenIcon className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-default">Catalogs</h3>
                  <p className="text-sm text-muted">Select and reorder catalogs</p>
                </div>
              </div>
              <div className="flex items-center gap-2 h-9 flex-shrink-0">
                {isSavingCatalogs && (
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin text-muted" />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const manifest = originalManifestData || manifestData;
                    const catalogs = manifest?.catalogs || [];

                    const regularCatalogs = catalogs.filter((c: any) => {
                      if (!c || typeof c !== 'object') return true;
                      return !catalogHasSearch(c);
                    });
                    const searchCatalogs = catalogs.filter((c: any) => {
                      if (!c || typeof c !== 'object') return false;
                      return catalogHasSearch(c);
                    });

                    setOrderedRegularCatalogs(regularCatalogs);
                    setOrderedSearchCatalogs(searchCatalogs);

                    const allKeys = new Set<string>(catalogs.map((c: any) => getCatalogKey(c)).filter(Boolean));
                    setSelectedCatalogs(allKeys);
                    autoSaveCatalogs(allKeys, regularCatalogs, searchCatalogs);
                    showToast.info('Catalogs reset to manifest defaults');
                  }}
                  leftIcon={<ArrowUturnLeftIcon className="w-4 h-4" />}
                >
                  Reset
                </Button>
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Regular Catalogs */}
                {orderedRegularCatalogs.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <p className="text-xs font-semibold text-default uppercase tracking-wider">
                          Catalogs
                        </p>
                      </div>
                      <button
                        onClick={handleToggleAllRegular}
                        className="text-xs font-medium text-primary hover:text-primary-hover transition-colors px-2 py-1 rounded-lg hover:bg-primary/10"
                      >
                        {allRegularSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <SortableContext
                      items={orderedRegularCatalogs.map((c: any) => getCatalogKey(c) || '')}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {orderedRegularCatalogs.map((catalog: any) => (
                          <SortableCatalogItem
                            key={getCatalogKey(catalog)}
                            catalog={catalog}
                            isSelected={selectedCatalogs.has(getCatalogKey(catalog) || '')}
                            onToggle={() => handleCatalogToggle(getCatalogKey(catalog) || '')}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                )}

                {/* Search Catalogs */}
                {orderedSearchCatalogs.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <p className="text-xs font-semibold text-default uppercase tracking-wider">
                          Search Catalogs
                        </p>
                      </div>
                      <button
                        onClick={handleToggleAllSearch}
                        className="text-xs font-medium text-primary hover:text-primary-hover transition-colors px-2 py-1 rounded-lg hover:bg-primary/10"
                      >
                        {allSearchSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <SortableContext
                      items={orderedSearchCatalogs.map((c: any) => getCatalogKey(c) || '')}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {orderedSearchCatalogs.map((catalog: any) => (
                          <SortableCatalogItem
                            key={getCatalogKey(catalog)}
                            catalog={catalog}
                            isSelected={selectedCatalogs.has(getCatalogKey(catalog) || '')}
                            onToggle={() => handleCatalogToggle(getCatalogKey(catalog) || '')}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                )}

                {orderedRegularCatalogs.length === 0 && orderedSearchCatalogs.length === 0 && (
                  <p className="text-sm text-subtle col-span-2">No catalogs available</p>
                )}
              </div>
            </DndContext>
          </Card>
        </PageSection>

        {/* Groups Section */}
        <PageSection delay={0.4} className="mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/20">
                  <UsersIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-default">Groups</h3>
                  <p className="text-sm text-muted">
                    {addon.groups?.length || 0} group{addon.groups?.length !== 1 ? 's' : ''} using this addon
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<PlusIcon className="w-4 h-4" />}
                onClick={() => setIsAddToGroupModalOpen(true)}
              >
                Add to Group
              </Button>
            </div>

            <StaggerContainer className="space-y-3">
              {addon.groups && addon.groups.length > 0 ? (
                addon.groups.map((group) => (
                  <StaggerItem key={group.id}>
                     <Link href={`/groups/${group.id}`}>
                       <motion.div
                         whileHover={{ x: 4 }}
                         className="flex items-center gap-4 p-4 rounded-xl bg-surface-hover hover:bg-surface border border-default hover:border-primary transition-all group cursor-pointer"
                       >
                         {/* Group colored avatar with first letter */}
                         <div
                           className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                           style={{ backgroundColor: (group as any).color || '#7c3aed' }}
                         >
                           {group.name?.[0] || 'G'}
                         </div>

                         <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-2">
                             <span className="font-medium text-default group-hover:text-primary transition-colors truncate">
                               {group.name}
                             </span>
                           </div>
                           <p className="text-sm text-muted">
                             {group.users || 0} users • {(group as any).addons || 0} addons
                           </p>
                         </div>

                         {/* Sync Status Badge */}
                         <SyncBadge groupId={group.id} size="sm" />

                         <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={async (e) => {
                               e.preventDefault();
                               try {
                                 await api.syncGroup(group.id);
                                 toast.success(`Synced ${group.name} successfully`);
                               } catch (err: any) {
                                 toast.error(err.message || `Failed to sync ${group.name}`);
                               }
                             }}
                           >
                             <ArrowPathIcon className="w-4 h-4" />
                           </Button>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={(e) => {
                               e.preventDefault();
                               handleRemoveFromGroup(group.id, group.name);
                             }}
                             className="text-error hover:bg-error-muted"
                           >
                             <XMarkIcon className="w-4 h-4" />
                           </Button>
                         </div>
                       </motion.div>
                     </Link>
                  </StaggerItem>
                ))
              ) : (
                <div className="text-center py-8">
                  <FolderIcon className="w-12 h-12 mx-auto mb-4 text-muted opacity-50" />
                  <p className="text-muted mb-4">Not assigned to any groups</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<PlusIcon className="w-4 h-4" />}
                    onClick={() => setIsAddToGroupModalOpen(true)}
                  >
                    Add to First Group
                  </Button>
                </div>
              )}
            </StaggerContainer>
          </Card>
        </PageSection>

        {/* Health History Section */}
        <PageSection delay={0.5} className="mb-8">
          <AddonHealthHistorySection addonId={params.id as string} />
        </PageSection>

        {/* Backup Section */}
        <AddonBackupSection addonId={params.id as string} addon={addon as any} onUpdate={fetchAddon} />

        {/* Proxy Section */}
        <PageSection delay={0.55} className="mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/20">
                  <ShieldCheckIcon className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-default">Proxy</h3>
                  <p className="text-sm text-muted">
                    Hide the original addon URL with a proxied endpoint
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">
                  {anyAddon?.proxyEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <ToggleSwitch
                  checked={anyAddon?.proxyEnabled || false}
                  onChange={handleToggleProxy}
                  disabled={isTogglingProxy}
                />
              </div>
            </div>

            {anyAddon?.proxyEnabled && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-surface border border-default">
                  <div className="flex items-center gap-3 mb-3">
                    <ShieldCheckIcon className="w-5 h-5 text-success" />
                    <span className="text-sm font-medium text-default">Proxy URL</span>
                  </div>
                  
                  {anyAddon?.proxyManifestUrl ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-surface-hover rounded-lg text-xs text-subtle break-all font-mono">
                        {anyAddon.proxyManifestUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(anyAddon.proxyManifestUrl);
                          toast.success('Copied to clipboard');
                        }}
                      >
                        <DocumentDuplicateIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-subtle">Proxy URL will be generated when enabled</p>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-hover">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">UUID:</span>
                    <code className="text-xs text-subtle font-mono">{anyAddon?.proxyUuid || 'Not generated'}</code>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRegenerateProxyUuid}
                    isLoading={isRegeneratingProxy}
                    disabled={!anyAddon?.proxyEnabled}
                  >
                    <ArrowPathIcon className="w-4 h-4 mr-1" />
                    Regenerate
                  </Button>
                </div>

                <div className="text-xs text-subtle">
                  <p className="mb-1">
                    When enabled, users access this addon through a proxy URL that hides the original addon URL.
                  </p>
                  <p>
                    The proxy provides an additional layer of security by preventing users from seeing or accessing the original manifest URL directly.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </PageSection>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Addon"
        description="Update addon details"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-default mb-1">Name</label>
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Addon name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-default mb-1">Description</label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="Addon description"
              className="w-full px-3 py-2 bg-surface border border-default rounded-lg text-default placeholder:text-subtle focus:border-theme-secondary focus:outline-none min-h-[80px]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-default mb-1">Custom Logo URL</label>
            <Input
              value={editForm.customLogo}
              onChange={(e) => setEditForm({ ...editForm, customLogo: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-subtle mt-1">
              Leave empty to use the default logo from the manifest.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Addon"
        description={`Are you sure you want to delete "${addon.name}"? This action cannot be undone.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete'}
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Add to Group Modal */}
      <Modal
        isOpen={isAddToGroupModalOpen}
        onClose={() => setIsAddToGroupModalOpen(false)}
        title="Add to Group"
        description="Select a group to add this addon to"
        size="md"
      >
        <div className="space-y-4">
          <div className="space-y-2 max-h-64 overflow-auto">
            {allGroups
              .filter(g => !addon.groups?.some(ag => ag.id === g.id))
              .map(group => (
                <motion.button
                  key={group.id}
                  whileHover={{ x: 4 }}
                  onClick={async () => {
                    try {
                      await api.addAddonToGroup(group.id, addon.id);
                      toast.success(`Added to ${group.name}`);
                      await fetchAddon();
                      setIsAddToGroupModalOpen(false);
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to add to group');
                    }
                  }}
                  className="w-full text-left p-3 rounded-xl border border-default hover:border-primary hover:bg-surface-hover transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface border border-default flex items-center justify-center">
                      <FolderIcon className="w-5 h-5 text-muted" />
                    </div>
                    <div>
                      <p className="text-default font-medium">{group.name}</p>
                      <p className="text-xs text-subtle">
                        {group.users || 0} users • {group.addons || 0} addons
                      </p>
                    </div>
                    <PlusIcon className="w-5 h-5 text-primary ml-auto" />
                  </div>
                </motion.button>
              ))}
          </div>
          {allGroups.filter(g => !addon.groups?.some(ag => ag.id === g.id)).length === 0 && (
            <div className="text-center py-8">
              <FolderIcon className="w-8 h-8 mx-auto mb-2 text-muted opacity-50" />
              <p className="text-sm text-subtle">
                No available groups. This addon is already in all groups.
              </p>
            </div>
          )}
          <div className="flex justify-end pt-4">
            <Button variant="secondary" onClick={() => setIsAddToGroupModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// Addon Backup Section Component
function BackupAddonPickerModal({ isOpen, onClose, onSelect, currentAddonId, excludeIds = [] }: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (addonId: string) => void;
  currentAddonId: string;
  excludeIds?: string[];
}) {
  const [addons, setAddons] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setSearch('');
    api.getAddons().then((data) => {
      // Exclude current addon and all addons in the backup chain
      const excluded = new Set([currentAddonId, ...excludeIds]);
      setAddons(data.filter((a: any) => !excluded.has(a.id)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen, currentAddonId, excludeIds]);

  const filtered = addons.filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.name || '').toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q);
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Backup Addon" description="Choose an existing addon to use as a fallback" size="lg">
      <div className="mb-4">
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
          style={{
            backgroundColor: 'var(--color-surface-hover)',
            borderColor: 'var(--color-surface-border)',
          }}
        >
          <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search addons..."
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text)' }}
          />
        </div>
      </div>

      <div className="max-h-[380px] overflow-y-auto -mx-1 px-1 space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <motion.div
              className="w-6 h-6 border-2 border-t-transparent rounded-full"
              style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <PuzzlePieceIcon className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-text-subtle)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {search ? 'No addons match your search' : 'No other addons available'}
            </p>
          </div>
        ) : filtered.map((addon: any) => {
          const logo = addon.customLogo || addon.logo || addon.iconUrl || (addon.manifest?.logo) || null;
          return (
            <motion.button
              key={addon.id}
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
              onClick={() => { onSelect(addon.id); onClose(); }}
              className="w-full flex items-center gap-4 p-3.5 rounded-xl text-left transition-all group"
              style={{
                background: 'transparent',
                border: '1px solid var(--color-surface-border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-hover)';
                e.currentTarget.style.borderColor = 'var(--color-text-subtle)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--color-surface-border)';
              }}
            >
              {/* Addon icon */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                style={{
                  background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-surface-border)',
                }}
              >
                {logo ? (
                  <img src={logo} alt="" className="w-full h-full object-contain p-1.5" />
                ) : (
                  <PuzzlePieceIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {addon.name || 'Unnamed Addon'}
                  </span>
                  {addon.version && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: 'var(--color-primaryMuted)', color: 'var(--color-primary)' }}
                    >
                      v{addon.version}
                    </span>
                  )}
                </div>
                {addon.description && (
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {addon.description}
                  </p>
                )}
              </div>

              {/* Status dot */}
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: addon.isOnline ? 'var(--color-success)' : 'var(--color-error)' }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                  {addon.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </Modal>
  );
}

function AddonBackupSection({ addonId, addon, onUpdate }: { addonId: string; addon: any; onUpdate: () => void }) {
  const [loading, setLoading] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [targetAddonId, setTargetAddonId] = useState<string>(addonId);
  const [activeAddonInfo, setActiveAddonInfo] = useState<{
    chain: Array<{
      id: string;
      name: string;
      isActive: boolean;
      isOnline: boolean;
      lastHealthCheck: string | null;
    }>;
    activeAddon: {
      id: string;
      name: string;
      isActive: boolean;
      isOnline: boolean;
      lastHealthCheck: string | null;
    };
    isUsingBackup: boolean;
    totalChainLength: number;
    message: string;
  } | null>(null);

  // Fetch active addon info
  useEffect(() => {
    const fetchActiveInfo = async () => {
      try {
        const info = await api.getAddonBackupActive(addonId);
        setActiveAddonInfo(info);
      } catch (error) {
        console.error('Failed to fetch active addon info:', error);
      }
    };
    fetchActiveInfo();
  }, [addonId, addon]);

  // Build the backup chain from addon data - recursively traverse the chain
  const buildChain = (startAddon: any): any[] => {
    const chain: any[] = [];
    
    // Recursive function to traverse the entire chain
    const traverse = (addon: any) => {
      if (addon?.backupAddon) {
        chain.push(addon.backupAddon);
        // Continue traversing if this backup also has a backup
        traverse(addon.backupAddon);
      }
    };
    
    traverse(startAddon);
    return chain;
  };

  const backupChain = buildChain(addon);
  const lastAddonInChain = backupChain.length > 0 ? backupChain[backupChain.length - 1] : addon;

  const handleSelectBackup = async (backupId: string) => {
    setLoading(true);
    try {
      // Add backup to the LAST addon in the chain
      await api.setAddonBackup(targetAddonId, backupId);
      toast.success('Backup addon linked successfully');
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to link backup');
    } finally {
      setLoading(false);
      setIsPickerOpen(false);
    }
  };

  const handleRemoveBackup = async () => {
    setLoading(true);
    try {
      await api.deleteAddonBackup(addonId);
      toast.success('Backup addon unlinked');
      setIsRemoveModalOpen(false);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to unlink backup');
    } finally {
      setLoading(false);
    }
  };

  const openPickerForAddon = (targetId: string) => {
    setTargetAddonId(targetId);
    setIsPickerOpen(true);
  };

  // Derive logos helper - same logic as addons list page
  const getLogo = (a: any) => {
    if (!a) return null;
    return a.customLogo ||
           (a.manifest && a.manifest.logo) ||
           a.logo ||
           a.iconUrl ||
           (a.manifest?.id && `https://stremio-addon.netlify.app/${a.manifest.id}/icon.png`) ||
           null;
  };

  return (
    <PageSection delay={0.5} className="mb-8">
      <Card padding="lg">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(245, 158, 11, 0.15)' }}
            >
              <ShieldCheckIcon className="w-5 h-5" style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Backup Addon</h3>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Assign a fallback addon for when the primary goes offline
              </p>
            </div>
          </div>
        </div>

        {/* Backup Chain - Vertical Layout */}
        <div className="space-y-3">
          {/* Primary Addon */}
          <div
            className="relative p-4 rounded-xl border overflow-hidden"
            style={{
              background: 'var(--color-surface-hover)',
              borderColor: 'var(--color-surface-border)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-primary)' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                Primary
              </span>
              {activeAddonInfo && activeAddonInfo.activeAddon.id === addon.id && (
                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--color-successMuted)', color: 'var(--color-success)' }}>
                  Currently Active
                </span>
              )}
            </div>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}
                >
                  {getLogo(addon) ? (
                    <img src={getLogo(addon)} alt="" className="w-full h-full object-contain p-1" />
                  ) : (
                    <PuzzlePieceIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                      {addon?.name || 'Current Addon'}
                    </p>
                    {addon?.version && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: 'var(--color-primaryMuted)', color: 'var(--color-primary)' }}>
                        v{addon.version}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: addon?.isOnline !== false ? 'var(--color-success)' : 'var(--color-error)' }} />
                    <span className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                      {addon?.isOnline !== false ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
          </div>

          {/* Connector - Arrow only, no lines */}
          <div className="flex items-center justify-center py-1">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{
                background: backupChain.length > 0 ? 'rgba(245, 158, 11, 0.15)' : 'var(--color-surface-hover)',
                border: `1.5px solid ${backupChain.length > 0 ? 'rgba(245, 158, 11, 0.4)' : 'var(--color-surface-border)'}`,
              }}
            >
              <svg className="w-3 h-3" style={{ color: backupChain.length > 0 ? '#f59e0b' : 'var(--color-text-subtle)' }} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>

          {/* Backup Chain - flattened structure for consistent spacing */}
          {backupChain.flatMap((backup: any, index: number) => [
            // Card
            <motion.div
              key={backup.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="relative p-4 rounded-xl border overflow-hidden group"
              style={{
                background: 'var(--color-surface-hover)',
                borderColor: 'var(--color-surface-border)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-primary)' }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                    Backup {index + 1}
                  </span>
                  {activeAddonInfo && activeAddonInfo.activeAddon.id === backup.id && (
                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--color-successMuted)', color: 'var(--color-success)' }}>
                      Currently Active
                    </span>
                  )}
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsRemoveModalOpen(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg"
                  style={{ color: 'var(--color-error)' }}
                  title="Remove backup chain"
                >
                  <XMarkIcon className="w-4 h-4" />
                </motion.button>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}
                >
                  {getLogo(backup) ? (
                    <img src={getLogo(backup)} alt="" className="w-full h-full object-contain p-1" />
                  ) : (
                    <PuzzlePieceIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/addons/${backup.id}`}
                      className="text-sm font-medium truncate hover:underline"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {backup.name || 'Unnamed Addon'}
                    </Link>
                    {backup.version && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: 'var(--color-primaryMuted)', color: 'var(--color-primary)' }}>
                        v{backup.version}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${backup.isOnline ? 'animate-pulse' : ''}`} style={{ background: backup.isOnline ? 'var(--color-success)' : 'var(--color-error)' }} />
                    <span className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                      {backup.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>,
            // Arrow after each backup
            <div key={`arrow-${backup.id}`} className="flex items-center justify-center py-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1.5px solid rgba(245, 158, 11, 0.4)',
                }}
              >
                <svg className="w-3 h-3" style={{ color: '#f59e0b' }} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          ])}

          {/* Add Backup Button - Always at the end */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => openPickerForAddon(lastAddonInChain.id)}
            disabled={loading}
            className="w-full p-4 rounded-xl border-2 border-dashed transition-all flex items-center justify-center gap-3 group"
            style={{
              borderColor: 'var(--color-surface-border)',
              background: 'transparent',
              minHeight: backupChain.length === 0 ? '96px' : '64px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.4)';
              e.currentTarget.style.background = 'rgba(245, 158, 11, 0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-surface-border)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
              style={{ background: 'var(--color-surface-hover)' }}
            >
              <PlusIcon className="w-5 h-5" style={{ color: 'var(--color-text-subtle)' }} />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {backupChain.length === 0 ? 'Add Backup' : 'Add Another Backup'}
            </span>
          </motion.button>
        </div>

        {/* Info text */}
        <p className="text-[11px] text-center pt-2" style={{ color: 'var(--color-text-subtle)' }}>
          {backupChain.length === 0 
            ? 'Add a backup addon that will be used when the primary is offline'
            : activeAddonInfo 
              ? `${activeAddonInfo.message} • Chain depth: ${activeAddonInfo.totalChainLength} addons`
              : `Chain depth: ${backupChain.length + 1} addons. If one fails, the next will be used.`}
        </p>
      </Card>

      {/* Addon Picker Modal */}
      <BackupAddonPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleSelectBackup}
        currentAddonId={addonId}
        excludeIds={backupChain.map((b: any) => b.id)}
      />

      {/* Remove Confirmation */}
      <ConfirmModal
        isOpen={isRemoveModalOpen}
        onClose={() => setIsRemoveModalOpen(false)}
        onConfirm={handleRemoveBackup}
        title="Remove Backup Chain"
        description="This will unlink the entire backup chain. The backup addons themselves won't be deleted."
        confirmText="Remove"
        variant="danger"
        isLoading={loading}
      />
    </PageSection>
  );
}

// Addon Health History Section Component
function AddonHealthHistorySection({ addonId }: { addonId: string }) {
  const [history, setHistory] = useState<Array<{
    id: string;
    isOnline: boolean;
    error: string | null;
    checkedAt: string;
    responseTimeMs: number | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAddonHealthHistory(addonId, 50);
      setHistory(data.history);
    } catch (err: any) {
      setError(err.message || 'Failed to load health history');
    } finally {
      setLoading(false);
    }
  }, [addonId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleCheckNow = async () => {
    setIsChecking(true);
    try {
      await api.runAddonHealthCheckNow();
      // Give the server a moment to complete the check then refresh
      await new Promise(resolve => setTimeout(resolve, 2500));
      await fetchHistory();
      toast.success('Health check complete');
    } catch (err: any) {
      toast.error(err.message || 'Health check failed');
    } finally {
      setIsChecking(false);
    }
  };

  if (loading) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/20">
              <HeartIcon className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-default">Health History</h3>
              <p className="text-sm text-muted">Loading...</p>
            </div>
          </div>
        </div>
        <div className="space-y-3 max-h-[340px] overflow-y-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-surface-hover border border-default animate-pulse">
              <div className="w-10 h-10 rounded-lg bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-24" />
                <div className="h-3 bg-muted rounded w-48" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Group consecutive same-status entries
  const groupedHistory: Array<{
    status: boolean;
    startTime: Date;
    endTime: Date;
    count: number;
    errors: string[];
  }> = [];

  for (const entry of history) {
    const entryTime = new Date(entry.checkedAt);
    const lastGroup = groupedHistory[groupedHistory.length - 1];

    if (lastGroup && lastGroup.status === entry.isOnline) {
      lastGroup.endTime = entryTime;
      lastGroup.count++;
      if (entry.error && !lastGroup.errors.includes(entry.error)) {
        lastGroup.errors.push(entry.error);
      }
    } else {
      groupedHistory.push({
        status: entry.isOnline,
        startTime: entryTime,
        endTime: entryTime,
        count: 1,
        errors: entry.error ? [entry.error] : [],
      });
    }
  }

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/20">
            <HeartIcon className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-default">Health History</h3>
            <p className="text-sm text-muted">
              {history.length > 0 ? `Last ${history.length} checks` : 'No checks yet'}
            </p>
          </div>
        </div>
        <Button
          variant="glass"
          size="sm"
          onClick={handleCheckNow}
          isLoading={isChecking}
          leftIcon={<ArrowPathIcon className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />}
        >
          Check Now
        </Button>
      </div>

      {(error || history.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <HeartIcon className="w-10 h-10 text-muted opacity-30 mb-3" />
          <p className="text-sm text-subtle">
            {error ? error : 'No health checks recorded yet. Click "Check Now" to run one.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[340px] overflow-y-auto">
          {groupedHistory.map((group, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-4 p-4 rounded-xl bg-surface-hover hover:bg-surface-hover/80 border border-default hover:border-primary transition-all"
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  group.status ? 'bg-success/20' : 'bg-error/20'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full ${
                    group.status ? 'bg-success' : 'bg-error'
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${group.status ? 'text-success' : 'text-error'}`}>
                    {group.status ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-xs text-muted">
                    {group.count > 1 ? `(${group.count} checks)` : ''}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {group.startTime.toLocaleString()}
                  {group.count > 1 && group.startTime.getTime() !== group.endTime.getTime() && (
                    <span> - {group.endTime.toLocaleString()}</span>
                  )}
                </div>
                {!group.status && group.errors.length > 0 && (
                  <div className="text-xs text-error mt-1 truncate" title={group.errors.join(', ')}>
                    {group.errors[0].length > 50 ? group.errors[0].substring(0, 50) + '...' : group.errors[0]}
                    {group.errors.length > 1 && ` (+${group.errors.length - 1} more)`}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}
