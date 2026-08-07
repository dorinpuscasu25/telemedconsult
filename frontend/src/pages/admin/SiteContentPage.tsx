import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Eye, RotateCcw, Save, Type } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';
import { useSiteContent } from '../../contexts/SiteContentContext';
import { CONTENT_PREVIEWS, type PreviewValues } from './content-previews';

type ContentField = {
  key: string;
  label: string;
  type: 'text' | 'textarea';
  hint: string | null;
  max: number;
  value: string;
  default: string;
};

type ContentGroup = {
  key: string;
  label: string;
  description: string;
  preview: string;
  fields: ContentField[];
};

export function SiteContentPage() {
  const { refresh: refreshSiteContent } = useSiteContent();
  const [groups, setGroups] = useState<ContentGroup[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const applyGroups = (next: ContentGroup[]) => {
    setGroups(next);
    setDraft(
      next.reduce<Record<string, string>>((acc, group) => {
        group.fields.forEach((field) => {
          acc[field.key] = field.value;
        });
        return acc;
      }, {})
    );
  };

  const load = () => {
    setError('');
    apiRequest<{ groups: ContentGroup[] }>('/admin/site-content')
      .then((response) => applyGroups(response.groups ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca textele.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  // Valorile salvate, pentru a ști ce bloc are modificări nesalvate.
  const savedValues = useMemo(() => {
    const map: Record<string, string> = {};
    groups.forEach((group) => group.fields.forEach((field) => { map[field.key] = field.value; }));
    return map;
  }, [groups]);

  const groupIsDirty = (group: ContentGroup) =>
    group.fields.some((field) => (draft[field.key] ?? '') !== (savedValues[field.key] ?? ''));

  const dirtyCount = groups.filter(groupIsDirty).length;

  const update = (key: string, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage('');
  };

  const saveGroup = async (group: ContentGroup) => {
    setMessage('');
    setError('');
    setSavingGroup(group.key);

    const values = group.fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.key] = draft[field.key] ?? '';
      return acc;
    }, {});

    try {
      const response = await apiRequest<{ groups: ContentGroup[] }>('/admin/site-content', {
        method: 'PUT',
        body: JSON.stringify({ values })
      });
      applyGroups(response.groups ?? []);
      await refreshSiteContent();
      setMessage(`Blocul „${group.label}” a fost salvat și este deja live pe site.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva textele.');
    } finally {
      setSavingGroup(null);
    }
  };

  const resetGroup = async (group: ContentGroup) => {
    setMessage('');
    setError('');
    setSavingGroup(group.key);

    try {
      const response = await apiRequest<{ groups: ContentGroup[] }>('/admin/site-content/reset', {
        method: 'POST',
        body: JSON.stringify({ group: group.key })
      });
      applyGroups(response.groups ?? []);
      await refreshSiteContent();
      setMessage(`Blocul „${group.label}” a revenit la textele implicite.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut reseta blocul.');
    } finally {
      setSavingGroup(null);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="mb-2 flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
          <Type className="h-7 w-7 text-primary" /> Texte site
        </h1>
        <p className="text-slate-500">
          Fiecare bloc de mai jos corespunde unei secțiuni reale de pe site. Deschide blocul, modifică textele și
          urmărește previzualizarea din dreapta — se actualizează în timp ce scrii. Modificările devin vizibile pe
          site imediat după salvare.
        </p>
      </div>

      {(message || error) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}>
          {error || message}
        </div>
      )}

      {dirtyCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ai modificări nesalvate în {dirtyCount} {dirtyCount === 1 ? 'bloc' : 'blocuri'}. Fiecare bloc se salvează
          separat, cu butonul lui.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/60" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isOpen = openGroup === group.key;
            const isDirty = groupIsDirty(group);
            const Preview = CONTENT_PREVIEWS[group.preview];
            const previewValues: PreviewValues = draft;

            return (
              <Card key={group.key} className={`border-0 shadow-sm ${isDirty ? 'ring-2 ring-amber-300' : 'ring-1 ring-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 rounded-t-xl px-6 py-5 text-left transition hover:bg-slate-50/70">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-slate-900">{group.label}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        {group.fields.length} {group.fields.length === 1 ? 'text' : 'texte'}
                      </span>
                      {isDirty && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          nesalvat
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{group.description}</p>
                  </div>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <CardContent className="border-t border-slate-100 p-6">
                    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                      {/* Câmpuri */}
                      <div className="space-y-4">
                        {group.fields.map((field) => {
                          const value = draft[field.key] ?? '';
                          const isChanged = value !== (savedValues[field.key] ?? '');
                          const isCustom = value !== field.default;

                          return (
                            <div key={field.key} className="space-y-1.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <Label htmlFor={field.key} className="text-sm font-medium text-slate-800">
                                  {field.label}
                                  {isChanged && <span className="ml-1.5 text-amber-600">•</span>}
                                </Label>
                                <span className={`text-[11px] tabular-nums ${value.length > field.max ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                                  {value.length}/{field.max}
                                </span>
                              </div>

                              {field.type === 'textarea' ? (
                                <Textarea
                                  id={field.key}
                                  rows={3}
                                  maxLength={field.max}
                                  value={value}
                                  onChange={(event) => update(field.key, event.target.value)}
                                  className="rounded-xl bg-white"
                                />
                              ) : (
                                <Input
                                  id={field.key}
                                  maxLength={field.max}
                                  value={value}
                                  onChange={(event) => update(field.key, event.target.value)}
                                  className="h-11 rounded-xl bg-white"
                                />
                              )}

                              {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}

                              {isCustom && (
                                <button
                                  type="button"
                                  onClick={() => update(field.key, field.default)}
                                  className="text-xs font-medium text-primary hover:underline">
                                  Revino la textul implicit
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Previzualizare */}
                      <div className="lg:sticky lg:top-4 lg:self-start">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <Eye className="h-3.5 w-3.5" /> Cum arată pe site
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          {Preview ? (
                            <Preview values={previewValues} />
                          ) : (
                            <p className="p-4 text-sm text-slate-400">Nu există previzualizare pentru acest bloc.</p>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-400">
                          Previzualizare simplificată: reproduce așezarea și ierarhia textelor, nu stilul exact al paginii.
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
                      <Button
                        onClick={() => saveGroup(group)}
                        disabled={savingGroup === group.key || !isDirty}
                        className="h-11 rounded-xl bg-gradient-to-r from-primary to-purple-600 px-6">
                        <Save className="mr-2 h-4 w-4" />
                        {savingGroup === group.key ? 'Se salvează...' : 'Salvează blocul'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => resetGroup(group)}
                        disabled={savingGroup === group.key}
                        className="h-11 rounded-xl px-5">
                        <RotateCcw className="mr-2 h-4 w-4" /> Resetează blocul
                      </Button>
                      {!isDirty && <span className="text-sm text-slate-400">Nimic de salvat în acest bloc.</span>}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-0 bg-slate-50 shadow-none ring-1 ring-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Cum funcționează</CardTitle>
          <CardDescription>Câteva lucruri utile de știut înainte să modifici textele.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6 text-slate-600">
          <p>• Fiecare bloc corespunde unei secțiuni vizibile de pe site. Numele blocului îți spune unde se află.</p>
          <p>• Blocurile se salvează separat, așa că poți modifica doar o secțiune fără să atingi restul.</p>
          <p>• Un text lăsat gol revine automat la valoarea implicită — site-ul nu poate rămâne fără text.</p>
          <p>• „Resetează blocul” readuce toate textele din acel bloc la varianta originală.</p>
          <p>• Articolele de pe pagina Noutăți se administrează separat, din secțiunea „Noutăți”.</p>
        </CardContent>
      </Card>
    </div>
  );
}
