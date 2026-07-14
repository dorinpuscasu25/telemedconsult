import React, { useEffect, useState } from 'react';
import { ToggleLeft, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { apiRequest } from '../../lib/api';

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

export function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = () => {
    apiRequest<{ data: FeatureFlag[] }>('/admin/feature-flags')
      .then((response) => {
        setFlags(response.data ?? []);
        setDirty(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca funcționalitățile.'));
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = (key: string, enabled: boolean) => {
    setFlags((current) => current.map((flag) => (flag.key === key ? { ...flag, enabled } : flag)));
    setDirty(true);
    setMessage('');
  };

  const save = async () => {
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      await apiRequest('/admin/feature-flags', {
        method: 'PUT',
        body: JSON.stringify({ flags: flags.map((flag) => ({ key: flag.key, enabled: flag.enabled })) })
      });
      setMessage('Funcționalități salvate.');
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva funcționalitățile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Funcționalități</h1>
          <p className="max-w-3xl text-slate-500">
            Activează sau dezactivează module întregi ale platformei. Modulele dezactivate blochează acțiunile aferente
            și pot fi ascunse din interfață. Modificările au efect imediat după salvare.
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
                <Switch checked={flag.enabled} onCheckedChange={(value) => toggle(flag.key, value)} />
              </div>
            </div>
          ))}
          {flags.length === 0 && !error && (
            <p className="py-6 text-center text-sm text-slate-400">Se încarcă...</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-4">
        {message && <span className="text-sm text-green-700">{message}</span>}
        <Button disabled={isSaving || !dirty} onClick={save} className="rounded-xl bg-gradient-to-r from-primary to-purple-600 px-8">
          {isSaving ? 'Se salvează...' : 'Salvează'}
        </Button>
      </div>
    </div>
  );
}
