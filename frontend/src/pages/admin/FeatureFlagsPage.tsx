import { useEffect, useState } from 'react';
import { ToggleLeft, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { apiRequest } from '../../lib/api';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

export function FeatureFlagsPage() {
  const { refresh: refreshPublicFeatures } = useFeatureFlags();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    apiRequest<{ data: FeatureFlag[] }>('/admin/feature-flags')
      .then((response) => {
        setFlags(response.data ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca funcționalitățile.'));
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (key: string, enabled: boolean) => {
    const previous = flags.find((flag) => flag.key === key);
    setFlags((current) => current.map((flag) => (flag.key === key ? { ...flag, enabled } : flag)));
    setSavingKey(key);
    setMessage('');
    setError('');

    try {
      const response = await apiRequest<{ data: FeatureFlag[] }>('/admin/feature-flags', {
        method: 'PUT',
        body: JSON.stringify({ flags: [{ key, enabled }] })
      });
      setFlags(response.data ?? []);
      refreshPublicFeatures().catch(() => undefined);
      setMessage(`${previous?.label ?? 'Funcționalitatea'} este acum ${enabled ? 'activă' : 'inactivă'}.`);
    } catch (err) {
      if (previous) {
        setFlags((current) => current.map((flag) => flag.key === key ? previous : flag));
      }
      setError(err instanceof Error ? err.message : 'Nu am putut salva funcționalitățile.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Funcționalități</h1>
          <p className="max-w-3xl text-slate-500">
            Activează sau dezactivează module întregi ale platformei. Modulele dezactivate blochează acțiunile aferente
            și sunt ascunse automat din interfață. Fiecare modificare se salvează imediat.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Reîncarcă
        </Button>
      </div>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="flex items-center"><ToggleLeft className="mr-2 h-5 w-5 text-primary" /> Module</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {flags.map((flag) => (
            <div key={flag.key} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white/70 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{flag.label}</p>
                <p className="text-sm text-slate-500">{flag.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-xs font-medium ${flag.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {flag.enabled ? 'Activ' : 'Inactiv'}
                </span>
                <Switch
                  checked={flag.enabled}
                  disabled={savingKey !== null}
                  aria-label={`${flag.enabled ? 'Dezactivează' : 'Activează'} ${flag.label}`}
                  onCheckedChange={(value) => toggle(flag.key, value)}
                />
              </div>
            </div>
          ))}
          {flags.length === 0 && !error && (
            <p className="py-6 text-center text-sm text-slate-400">Se încarcă...</p>
          )}
        </CardContent>
      </Card>

      {(message || savingKey) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {savingKey ? 'Se salvează modificarea...' : message}
        </div>
      )}
    </div>
  );
}
