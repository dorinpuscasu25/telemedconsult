import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiRequest } from '../lib/api';

export type FeatureKey =
  | 'payments'
  | 'with_exam_consultations'
  | 'video_consultations'
  | 'higo_devices'
  | 'doctors'
  | 'operators'
  | 'patient_cards'
  | 'telegram_notifications'
  | 'affiliate_program';

type FeatureMap = Record<FeatureKey, boolean>;

const defaultFeatures: FeatureMap = {
  payments: true,
  with_exam_consultations: true,
  video_consultations: true,
  higo_devices: true,
  doctors: true,
  operators: true,
  patient_cards: true,
  telegram_notifications: true,
  affiliate_program: true
};

type FeatureFlagsContextValue = {
  features: FeatureMap;
  isLoading: boolean;
  isEnabled: (key: FeatureKey) => boolean;
  refresh: () => Promise<void>;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<FeatureMap>(defaultFeatures);
  const [isLoading, setIsLoading] = useState(true);

  const latestRefresh = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++latestRefresh.current;
    try {
      const response = await apiRequest<{ data: Partial<FeatureMap> }>('/catalog/features', { auth: false });
      if (generation === latestRefresh.current) setFeatures((current) => ({ ...current, ...response.data }));
    } finally {
      if (generation === latestRefresh.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const reload = () => { if (document.visibilityState === 'visible') void refresh().catch(() => undefined); };
    reload();
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => { window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload); };
  }, [refresh]);

  const value = useMemo<FeatureFlagsContextValue>(() => ({
    features,
    isLoading,
    isEnabled: (key) => features[key] !== false,
    refresh
  }), [features, isLoading, refresh]);

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context) throw new Error('useFeatureFlags trebuie folosit în FeatureFlagsProvider.');
  return context;
}
