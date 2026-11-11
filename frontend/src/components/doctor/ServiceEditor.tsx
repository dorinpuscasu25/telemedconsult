import { useEffect, useState } from 'react';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { cn } from '../ui/utils';
import { apiRequest } from '../../lib/api';
import { investigationsText, mdl, serviceMeta, type DoctorServiceItem, type ServiceInvestigation, type ServiceType } from '../../lib/doctor';
import { ServiceIcon } from './ServiceIcon';

export interface CatalogInvestigation { id: number; name: string; code?: string | null; default_price: number }

type Requirement = 'no' | 'required' | 'optional';
interface Draft { id?: string; name: string; type: ServiceType; price: number; duration: number; is_active: boolean; investigations: Record<number, Requirement> }

const TYPES: Array<[ServiceType, string, string]> = [['video', 'Video', 'Video'], ['chat', 'Chat', 'Chat'], ['home', 'La domiciliu', 'Domiciliu']];
const DEFAULT_DURATION: Record<ServiceType, number> = { video: 30, chat: 24, home: 60 };

const toDraft = (service: DoctorServiceItem | null): Draft => service
  ? { id: service.id, name: service.name, type: service.type, price: service.price, duration: service.duration, is_active: service.is_active, investigations: Object.fromEntries(service.investigations.map((item) => [item.id, item.requirement])) }
  : { name: '', type: 'video', price: 300, duration: 30, is_active: true, investigations: {} };

/**
 * Serviciu nou sau editat: dialog pe desktop (P1a), ecran întreg pe telefon (P2c).
 * Câmpurile se schimbă după tip; investigațiile apar doar la domiciliu.
 */
export function ServiceEditor({ service, open, catalog, onOpenChange, onSaved }: {
  service: DoctorServiceItem | null; open: boolean; catalog: CatalogInvestigation[]; onOpenChange: (open: boolean) => void; onSaved: () => void;
}) {
  const homeVisits = useFeatureFlags().isEnabled('with_exam_consultations');
  const types = TYPES.filter(([type]) => homeVisits || type !== 'home');
  const [draft, setDraft] = useState<Draft>(toDraft(service));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDraft(toDraft(service)); setError(''); } }, [open, service]);

  const isNew = !draft.id;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const preview: ServiceInvestigation[] = catalog
    .filter((item) => (draft.investigations[item.id] ?? 'no') !== 'no')
    .map((item) => ({ id: item.id, name: item.name, code: item.code, price: item.default_price, requirement: draft.investigations[item.id] as 'required' | 'optional' }));
  const previewMeta = serviceMeta(draft) + (draft.type === 'home' ? ` · ${investigationsText(preview)}` : '');

  const save = async () => {
    if (!draft.name.trim()) { setError('Scrie denumirea serviciului.'); return; }
    setBusy(true);
    setError('');
    try {
      const body = JSON.stringify({
        name: draft.name.trim(), type: draft.type, price: draft.price, duration: Math.max(1, draft.duration), is_active: draft.is_active,
        investigations: draft.type === 'home' ? Object.fromEntries(Object.entries(draft.investigations).filter(([, value]) => value !== 'no')) : null
      });
      await apiRequest(isNew ? '/doctor/services' : `/doctor/services/${draft.id}`, { method: isNew ? 'POST' : 'PUT', body });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva serviciul.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    setBusy(true);
    try {
      await apiRequest(`/doctor/services/${draft.id}`, { method: 'DELETE' });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut șterge serviciul.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'h-12 w-full min-w-0 rounded-[10px] border border-slate-200 px-3.5 text-base text-slate-950 outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15 sm:h-10 sm:px-3 sm:text-sm';
  const number = (key: 'price' | 'duration') => (event: React.ChangeEvent<HTMLInputElement>) => set({ [key]: Number(event.target.value.replace(/\D/g, '')) || 0 });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent showCloseButton={false} className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[820px] sm:p-0 sm:w-[540px] sm:max-w-[540px] sm:rounded-2xl">
        <div className="flex items-center gap-1 border-b border-slate-100 px-2 pb-2.5 pt-[max(12px,env(safe-area-inset-top))] sm:border-0 sm:px-6 sm:pb-0 sm:pt-5">
          <button type="button" aria-label="Închide" onClick={() => onOpenChange(false)} className="grid h-10 w-10 place-items-center text-slate-600 sm:order-last sm:h-8 sm:w-8 sm:text-slate-500"><X className="h-5 w-5" /></button>
          <DialogTitle className="flex-1 text-lg font-semibold">{isNew ? 'Serviciu nou' : 'Editează serviciul'}</DialogTitle>
          {!isNew && <button type="button" onClick={() => void remove()} className="h-10 px-3 text-sm font-medium text-red-600 sm:hidden">Șterge</button>}
        </div>
        <DialogDescription className="sr-only">Tip, denumire, preț și durată.</DialogDescription>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-[18px]">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-slate-700">Tip</span>
            <div className={cn('grid gap-2', types.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
              {types.map(([type, label, short]) => {
                const on = draft.type === type;
                return (
                  <button key={type} type="button" onClick={() => set({ type, duration: DEFAULT_DURATION[type] })}
                    className={cn('flex h-16 flex-col items-center justify-center gap-[5px] rounded-[10px] text-[13px] font-medium', on ? 'border-[1.5px] border-blue-600 bg-blue-50 text-blue-700' : 'border border-slate-200 bg-white text-slate-700')}>
                    <ServiceIcon type={type} className="h-5 w-5" /><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-700">Denumire</span><input value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder="Ex: Consultație video primară" className={input} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-700">Preț (MDL)</span><input value={String(draft.price)} inputMode="numeric" onChange={number('price')} className={input} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-700">{draft.type === 'chat' ? 'Răspunzi în (ore)' : 'Durată (minute)'}</span><input value={String(draft.duration)} inputMode="numeric" onChange={number('duration')} className={input} /></label>
          </div>
          {draft.type === 'home' && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5"><span className="text-[13px] font-medium text-slate-700">Investigații la domiciliu</span><span className="text-xs text-slate-500">Obligatoriile intră în preț. Opționalele le bifează pacientul.</span></div>
              <div className="flex flex-col gap-2 sm:gap-0 sm:rounded-xl sm:border sm:border-slate-200">
                {catalog.map((item, index) => (
                  <div key={item.id} className={cn('flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:rounded-none sm:border-0 sm:px-3 sm:py-2.5', index > 0 && 'sm:border-t sm:border-slate-100')}>
                    <span className="text-sm font-medium sm:font-normal">{item.name}</span>
                    <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-[3px] sm:flex">
                      {([['no', 'Nu'], ['required', 'Obligatoriu'], ['optional', 'Opțional']] as Array<[Requirement, string]>).map(([value, label]) => {
                        const on = (draft.investigations[item.id] ?? 'no') === value;
                        return <button key={value} type="button" onClick={() => set({ investigations: { ...draft.investigations, [item.id]: value } })} className={cn('h-[34px] rounded-md px-2.5 text-[13px] font-medium sm:h-7 sm:text-xs', on ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,.12)]' : 'text-slate-500')}>{label}</button>;
                      })}
                    </div>
                  </div>
                ))}
                {catalog.length === 0 && <p className="p-3 text-sm text-slate-500">Nu există investigații în catalog.</p>}
              </div>
            </div>
          )}
          <button type="button" onClick={() => set({ is_active: !draft.is_active })} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 text-left sm:hidden">
            <span className="flex flex-col gap-0.5"><span className="text-[15px] font-medium text-slate-950">Activ</span><span className="text-xs text-slate-500">Oprit nu apare în profilul public</span></span>
            <Toggle on={draft.is_active} large />
          </button>
          <div className="hidden items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3 sm:flex">
            <div className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">Pacientul vede</span><span className="text-sm font-semibold text-slate-950">{draft.name || 'Fără denumire'}</span><span className="text-xs text-slate-500">{previewMeta}</span></div>
            <span className="text-base font-bold text-slate-950">{mdl(draft.price)}</span>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-3 sm:hidden">
          <div className="flex justify-between text-[13px] text-slate-500"><span className="truncate">{previewMeta}</span><span className="font-bold text-slate-950">{mdl(draft.price)}</span></div>
          <button type="button" onClick={() => void save()} disabled={busy} className="h-12 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white">{isNew ? 'Adaugă serviciul' : 'Salvează'}</button>
        </div>
        <div className="hidden items-center gap-2.5 border-t border-slate-200 px-6 py-4 sm:flex">
          {!isNew && <button type="button" onClick={() => void remove()} disabled={busy} className="h-10 px-3 text-sm font-medium text-red-600">Șterge serviciul</button>}
          <div className="flex-1" />
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-50">Anulează</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="h-10 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Salvează</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Toggle({ on, large = false }: { on: boolean; large?: boolean }) {
  return (
    <span className={cn('flex shrink-0 items-center rounded-full p-0.5', large ? 'h-[22px] w-10' : 'h-5 w-9', on ? 'bg-blue-600' : 'bg-slate-300')}>
      <span className={cn('rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform', large ? 'h-[18px] w-[18px]' : 'h-4 w-4', on && (large ? 'translate-x-[18px]' : 'translate-x-4'))} />
    </span>
  );
}
