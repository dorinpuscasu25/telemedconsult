import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../lib/api';
import { SITE_CONTENT_DEFAULTS, type SiteContentKey } from '../lib/site-content-defaults';

type SiteContentMap = Partial<Record<SiteContentKey, string>>;

type SiteContentContextValue = {
  /** Textul pentru o cheie, cu revenire automată la valoarea implicită. */
  text: (key: SiteContentKey) => string;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const SiteContentContext = createContext<SiteContentContextValue | null>(null);

/**
 * Textele editabile ale site-ului.
 *
 * Valorile implicite sunt împachetate în bundle, deci pagina se randează corect
 * chiar dacă API-ul nu răspunde — nu există stare de „text gol”. Valorile
 * salvate de admin se suprapun peste ele după primul răspuns.
 */
export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<SiteContentMap>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await apiRequest<{ data: SiteContentMap }>('/catalog/site-content', { auth: false });
      setOverrides(response.data ?? {});
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const value = useMemo<SiteContentContextValue>(() => ({
    text: (key) => {
      const override = overrides[key];
      return override !== undefined && override !== '' ? override : SITE_CONTENT_DEFAULTS[key];
    },
    isLoading,
    refresh
  }), [overrides, isLoading, refresh]);

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent() {
  const context = useContext(SiteContentContext);
  if (!context) throw new Error('useSiteContent trebuie folosit în SiteContentProvider.');
  return context;
}
