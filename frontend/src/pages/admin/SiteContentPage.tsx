import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Info, RotateCcw, Save } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../components/ui/utils';
import { PageHeader } from '../../components/app/PageHeader';
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
  const [searchParams, setSearchParams] = useSearchParams();
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

  const group = groups.find((item) => item.key === searchParams.get('bloc')) ?? groups[0];
  const selectGroup = (key: string) => {
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set('bloc', key); return next; }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Texte site"
        description="Alege un bloc din stânga: fiecare corespunde unei secțiuni reale de pe site. Previzualizarea se actualizează în timp ce scrii, iar modificările apar pe site imediat după salvare."
      />

      {(message || error) && (
        <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="h-96 animate-pulse rounded-2xl bg-white/60" />
          <div className="h-96 animate-pulse rounded-2xl bg-white/60" />
        </div>
      ) : group ? (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <nav aria-label="Blocuri de text" className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm lg:sticky lg:top-20 lg:flex-col lg:overflow-visible">
            {groups.map((item) => {
              const active = item.key === group.key;
              const dirty = groupIsDirty(item);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectGroup(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors lg:w-full', active ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950')}>
                  <span className="min-w-0 flex-1 whitespace-nowrap lg:truncate">{item.label}</span>
                  {dirty
                    ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" title="Modificări nesalvate" />
                    : <span className="hidden shrink-0 text-xs font-medium text-slate-400 lg:inline">{item.fields.length}</span>}
                </button>
              );
            })}
          </nav>

          <GroupEditor
            key={group.key}
            group={group}
            draft={draft}
            savedValues={savedValues}
            isDirty={groupIsDirty(group)}
            dirtyElsewhere={dirtyCount - (groupIsDirty(group) ? 1 : 0)}
            isSaving={savingGroup === group.key}
            onChange={update}
            onSave={() => saveGroup(group)}
            onReset={() => resetGroup(group)}
          />
        </div>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Nu există blocuri de text.</p>
      )}
    </div>
  );
}

function GroupEditor({ group, draft, savedValues, isDirty, dirtyElsewhere, isSaving, onChange, onSave, onReset }: {
  group: ContentGroup;
  draft: Record<string, string>;
  savedValues: Record<string, string>;
  isDirty: boolean;
  dirtyElsewhere: number;
  isSaving: boolean;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const Preview = CONTENT_PREVIEWS[group.preview];

  return (
    <section className={cn('min-w-0 rounded-2xl bg-white shadow-sm', isDirty ? 'ring-2 ring-amber-300' : 'ring-1 ring-slate-200')}>
      <header className="flex flex-wrap items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">{group.label}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{group.description}</p>
        </div>
        {isDirty && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">nesalvat</span>}
      </header>

      <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Blocurile cu texte lungi rămân pe o coloană, ca fiecare întrebare să stea deasupra răspunsului ei. */}
        <div className={cn('grid content-start gap-4', !group.fields.some((field) => field.type === 'textarea') && 'md:grid-cols-2')}>
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
                  <span className={`text-[11px] tabular-nums ${value.length > field.max ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{value.length}/{field.max}</span>
                </div>
                {field.type === 'textarea' ? (
                  <Textarea id={field.key} rows={3} maxLength={field.max} value={value} onChange={(event) => onChange(field.key, event.target.value)} className="rounded-xl bg-white" />
                ) : (
                  <Input id={field.key} maxLength={field.max} value={value} onChange={(event) => onChange(field.key, event.target.value)} className="h-11 rounded-xl bg-white" />
                )}
                {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
                {isCustom && (
                  <button type="button" onClick={() => onChange(field.key, field.default)} className="text-xs font-medium text-primary hover:underline">
                    Revino la textul implicit
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Eye className="h-3.5 w-3.5" /> Cum arată pe site
          </div>
          <div className="overflow-hidden rounded-2xl bg-slate-50 p-3">
            {Preview ? <Preview values={draft as PreviewValues} /> : <p className="p-4 text-sm text-slate-400">Nu există previzualizare pentru acest bloc.</p>}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">Previzualizare simplificată: arată așezarea și ierarhia textelor, nu pagina întreagă.</p>
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
        <Button onClick={onSave} disabled={isSaving || !isDirty} className="h-11 rounded-xl px-6">
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Se salvează...' : 'Salvează blocul'}
        </Button>
        <Button variant="outline" onClick={onReset} disabled={isSaving} className="h-11 rounded-xl px-5">
          <RotateCcw className="mr-2 h-4 w-4" /> Resetează blocul
        </Button>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
          <Info className="h-4 w-4 shrink-0" />
          {dirtyElsewhere > 0
            ? `Mai ai modificări nesalvate în ${dirtyElsewhere} ${dirtyElsewhere === 1 ? 'alt bloc' : 'alte blocuri'} (punct portocaliu în listă).`
            : 'Un text lăsat gol revine la cel implicit. Fiecare bloc se salvează separat.'}
        </span>
      </footer>
    </section>
  );
}
