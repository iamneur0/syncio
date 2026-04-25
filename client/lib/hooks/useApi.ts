'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

interface UseApiOptions {
  /** Whether to fetch data immediately on mount */
  immediate?: boolean;
}

interface UseApiReturn<T> extends UseApiState<T> {
  /** Refetch the data */
  refetch: () => Promise<void>;
  /** Manually set the data (for optimistic updates) */
  setData: (data: T | null | ((prev: T | null) => T | null)) => void;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Custom hook for API data fetching with loading, error, and refetch support
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  options: UseApiOptions = {}
): UseApiReturn<T> {
  const { immediate = true } = options;
  
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    isLoading: immediate,
    error: null,
  });

  // Keep track of the latest fetcher
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Track if component is mounted
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const data = await fetcherRef.current();
      if (mountedRef.current) {
        setState({ data, isLoading: false, error: null });
      }
    } catch (err) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'An error occurred',
        }));
      }
    }
  }, []);

  const setData = useCallback((updater: T | null | ((prev: T | null) => T | null)) => {
    setState(prev => ({
      ...prev,
      data: typeof updater === 'function' 
        ? (updater as (prev: T | null) => T | null)(prev.data)
        : updater,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    if (immediate) {
      fetchData();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [immediate, fetchData]);

  return {
    ...state,
    refetch: fetchData,
    setData,
    clearError,
  };
}

/**
 * Hook for multiple related API calls (e.g., fetching groups and users together)
 */
export function useApiMultiple<T extends Record<string, unknown>>(
  fetchers: { [K in keyof T]: () => Promise<T[K]> },
  options: UseApiOptions = {}
): {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { immediate = true } = options;
  
  const [state, setState] = useState<{
    data: T | null;
    isLoading: boolean;
    error: string | null;
  }>({
    data: null,
    isLoading: immediate,
    error: null,
  });

  const fetchersRef = useRef(fetchers);
  fetchersRef.current = fetchers;
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const keys = Object.keys(fetchersRef.current) as (keyof T)[];
      const promises = keys.map(key => fetchersRef.current[key]());
      const results = await Promise.all(promises);
      
      const data = keys.reduce((acc, key, index) => {
        acc[key] = results[index];
        return acc;
      }, {} as T);

      if (mountedRef.current) {
        setState({ data, isLoading: false, error: null });
      }
    } catch (err) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'An error occurred',
        }));
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    if (immediate) {
      fetchAll();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [immediate, fetchAll]);

  return {
    ...state,
    refetch: fetchAll,
  };
}
