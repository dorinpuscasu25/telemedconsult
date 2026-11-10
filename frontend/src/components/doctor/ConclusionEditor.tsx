import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, MessageSquare, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { cn } from '../ui/utils';
import { apiBlob, apiRequest } from '../../lib/api';
import { hm, mdl, serviceMeta, type RequestService } from '../../lib/doctor';
import { sectionState, sectionSummary } from '../patient/record/sectionMeta';
import type { MedicalRecord } from '../../lib/medical-record';
import type { PatientProfileSummary } from '../PatientChart';

export interface ConclusionRequest {
  id: string;
  consultation_kind?: string | null;
  symptoms?: string | null;
  current_illness_history?: string | null;
  service?: RequestService;
  amount?: number;
  patient?: { name: string } | null;
  patient_profile?: PatientProfileSummary | null;
}

interface Draft {
  anam: string;
  exam: string;
  diag: string;
  plan: string;
  rec: string;
  inv: string;
  meds: Array<{ n: string; d: string }>;
  higo: boolean;
}

const STEPS = ['Anamneză', 'Examen obiectiv', 'Concluzie', 'Rețetă'] as const;
const DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const blank = (request: ConclusionRequest): Draft => ({
  anam: request.current_illness_history || request.symptoms || '',
  exam: '', diag: '', plan: '', rec: '', inv: '', meds: [{ n: '', d: '' }], higo: false
});

/**
 * Ciorna concluziei e una singură pe cerere: se încarcă de pe server și se
 * salvează singură la fiecare modificare, din Consultații sau din apel.
 */
export function useConclusionDraft(request: ConclusionRequest | null, enabled: boolean) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<Draft | null>(null);
  const requestId = request?.id;

  useEffect(() => {
    if (!enabled || !request) return;
    let cancelled = false;
    setDraft(null);
    apiRequest<{ draft: Partial<Draft>; saved_at: string | null }>(`/requests/${request.id}/conclusion-draft`)
      .then((response) => {
        if (cancelled) return;
        const saved = response.draft ?? {};
        setDraft({ ...blank(request), ...saved, meds: Array.isArray(saved.meds) && saved.meds.length ? saved.meds : [{ n: '', d: '' }] });
        setSavedAt(response.saved_at);
      })
      .catch(() => { if (!cancelled) setDraft(blank(request)); });
    return () => { cancelled = true; };
  }, [enabled, requestId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (!value || !requestId) return;
    pending.current = null;
    try {
      const response = await apiRequest<{ saved_at: string }>(`/requests/${requestId}/conclusion-draft`, { method: 'PUT', body: JSON.stringify({ draft: value }) });
      setSavedAt(response.saved_at);
    } catch { /* se reîncearcă la următoarea modificare */ }
  }, [requestId]);

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      pending.current = next;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 800);
      return next;
    });
  }, [flush]);

  useEffect(() => () => { void flush(); }, [flush]);

  return { draft, update, savedAt, flush };
}

const filledSteps = (draft: Draft | null, hasFile: boolean) => [
  Boolean(draft?.anam.trim()), Boolean(draft?.exam.trim()), Boolean(draft?.diag.trim()), hasFile || Boolean(draft?.meds.some((med) => med.n.trim()))
];

function formData(draft: Draft, file: File | null) {
  const body = new FormData();
  const meds = draft.meds.filter((med) => med.n.trim()).map((med) => (med.d.trim() ? `${med.n.trim()} — ${med.d.trim()}` : med.n.trim())).join('\n');
  body.append('current_illness_history', draft.anam);
  body.append('objective_exam', draft.exam);
  body.append('diagnosis', draft.diag);
  body.append('treatment_plan', draft.plan);
  body.append('recommendations', draft.rec);
  body.append('investigation_recommendations', draft.inv);
  body.append('prescription_notes', meds);
  body.append('higo_reviewed', draft.higo ? '1' : '0');
  if (file) body.append('prescription', file);
  return body;
}

function freeChatUntil(days = 3) {
  const date = new Date(Date.now() + days * 86400000);
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

const inputClass = 'w-full rounded-[10px] border border-slate-200 px-3 text-sm text-slate-950 outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15';

function StepFields({ step, draft, update, request, file, setFile }: {
  step: number; draft: Draft; update: (patch: Partial<Draft>) => void; request: ConclusionRequest; file: File | null; setFile: (file: File | null) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const allergies = request.patient_profile?.medical_record ? sectionState(request.patient_profile.medical_record as MedicalRecord, 'drug_allergies') === 'done' : false;
  if (step === 0) {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-[13px] font-medium text-slate-700">Istoricul bolii actuale<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">din cerere</span></span>
        <textarea rows={7} value={draft.anam} onChange={(event) => update({ anam: event.target.value })} className={cn(inputClass, 'resize-y py-3 leading-[1.55]')} />
      </label>
    );
  }
  if (step === 1) {
    return (
      <>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-slate-700">Observațiile tale</span>
          <textarea rows={7} value={draft.exam} onChange={(event) => update({ exam: event.target.value })} placeholder="Ex: Faringe hiperemiat, amigdale mărite fără depozite. Respirație liberă." className={cn(inputClass, 'resize-y py-3 leading-[1.55]')} />
        </label>
        {request.consultation_kind === 'with_exam' && (
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={draft.higo} onChange={(event) => update({ higo: event.target.checked })} />
            Confirm că am examinat datele din aparat și investigațiile din serviciu
          </label>
        )}
      </>
    );
  }
  if (step === 2) {
    return (
      <>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-slate-700">Diagnostic <span className="text-red-600">*</span></span>
          <input value={draft.diag} onChange={(event) => update({ diag: event.target.value })} placeholder="Ex: Faringită acută (J02.9)" className={cn(inputClass, 'h-11 text-[15px]', !draft.diag.trim() && 'border-amber-300')} />
        </label>
        <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-700">Planul de tratament</span><textarea rows={3} value={draft.plan} onChange={(event) => update({ plan: event.target.value })} className={cn(inputClass, 'resize-y py-3 leading-[1.55]')} /></label>
        <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-700">Recomandări</span><textarea rows={3} value={draft.rec} onChange={(event) => update({ rec: event.target.value })} placeholder="Lichide calde, odihnă…" className={cn(inputClass, 'resize-y py-3 leading-[1.55]')} /></label>
        <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-700">Investigații recomandate</span><input value={draft.inv} onChange={(event) => update({ inv: event.target.value })} placeholder="Ex: Hemoleucogramă, exsudat faringian" className={cn(inputClass, 'h-10')} /></label>
      </>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-slate-700">Medicamente</span>
        {draft.meds.map((med, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_36px] gap-2">
            <input value={med.n} placeholder="Medicament" onChange={(event) => update({ meds: draft.meds.map((item, i) => (i === index ? { ...item, n: event.target.value } : item)) })} className={cn(inputClass, 'h-10 min-w-0')} />
            <input value={med.d} placeholder="Dozaj și durată" onChange={(event) => update({ meds: draft.meds.map((item, i) => (i === index ? { ...item, d: event.target.value } : item)) })} className={cn(inputClass, 'h-10 min-w-0')} />
            <button type="button" aria-label="Șterge medicamentul" onClick={() => update({ meds: draft.meds.length > 1 ? draft.meds.filter((_, i) => i !== index) : [{ n: '', d: '' }] })} className="grid h-10 w-9 place-items-center text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => update({ meds: [...draft.meds, { n: '', d: '' }] })} className="h-9 self-start rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium hover:bg-slate-50">+ Adaugă medicament</button>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-slate-700">Rețetă scanată <span className="font-normal text-slate-400">· opțional</span></span>
        <input ref={fileInput} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png" onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          if (next && (!['application/pdf', 'image/jpeg', 'image/png'].includes(next.type) || next.size > 10 * 1024 * 1024)) { event.target.value = ''; return; }
          setFile(next);
        }} />
        <button type="button" onClick={() => { if (file) { setFile(null); if (fileInput.current) fileInput.current.value = ''; } else fileInput.current?.click(); }}
          className="h-[84px] rounded-xl border-[1.5px] border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600 hover:border-blue-300">
          {file ? `✓ ${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB · atinge ca s-o scoți` : 'Trage aici sau alege fișierul · PDF, JPG, PNG, max. 10 MB'}
        </button>
      </div>
      {allergies && <span className="text-[13px] text-slate-500">Pacientul are alergii în fișă: {sectionSummary(request.patient_profile?.medical_record as MedicalRecord, 'drug_allergies')}. Verifică rețeta înainte de publicare.</span>}
    </>
  );
}

function StepTabs({ step, setStep, filled, compact = false }: { step: number; setStep: (step: number) => void; filled: boolean[]; compact?: boolean }) {
  return (
    <div className="grid shrink-0 grid-cols-4 border-b border-slate-200">
      {STEPS.map((label, index) => {
        const current = step === index;
        return (
          <button key={label} type="button" onClick={() => setStep(index)}
            className={cn('flex items-center justify-center gap-2 bg-white', compact ? 'h-11 text-[13px]' : 'h-[52px] text-sm', current ? 'font-semibold text-slate-950 shadow-[inset_0_-2px_0_#2563EB]' : 'font-medium text-slate-600')}>
            <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold', filled[index] ? 'bg-green-100 text-green-800' : current ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500')}>
              {filled[index] ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
            </span>
            <span className={cn(compact && 'max-sm:hidden')}>{compact && index === 1 ? 'Examen' : label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PublishConfirm({ request, onBack, onPublish, busy, error }: { request: ConclusionRequest; onBack: () => void; onPublish: () => void; busy: boolean; error: string }) {
  const first = (request.patient_profile?.name || request.patient?.name || 'Pacientul').split(' ')[0];
  const effects = [
    `${first} primește PDF-ul și o cerere de evaluare.`,
    `${mdl(request.service?.price ?? request.amount)} trec în balanța ta.`,
    'Apelul video se închide, dacă e deschis.',
    `Chatul rămâne gratuit 3 zile, până ${freeChatUntil()}.`
  ];
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/35 p-4">
      <div className="flex w-[460px] max-w-full flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,.25)]">
        <span className="text-lg font-semibold text-slate-950">Publici concluzia?</span>
        <div className="flex flex-col gap-2.5">
          {effects.map((effect) => <div key={effect} className="flex items-start gap-2.5 text-sm leading-[1.45] text-slate-950"><Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />{effect}</div>)}
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onBack} disabled={busy} className="h-[42px] rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-50">Înapoi</button>
          <button type="button" onClick={onPublish} disabled={busy} className="h-[42px] rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Se publică…' : 'Publică'}</button>
        </div>
      </div>
    </div>
  );
}

function usePublish(request: ConclusionRequest | null, draft: Draft | null, file: File | null, flush: () => Promise<void>, onPublished: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const publish = async () => {
    if (!request || !draft) return;
    setBusy(true);
    setError('');
    try {
      await flush();
      await apiRequest(`/requests/${request.id}/complete`, { method: 'POST', body: formData(draft, file) });
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut publica concluzia.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, publish };
}

/** P1a · „Concluzie”: contextul pacientului în stânga, pașii în dreapta. */
export function ConclusionDialog({ request, open, onOpenChange, onPublished }: {
  request: ConclusionRequest | null; open: boolean; onOpenChange: (open: boolean) => void; onPublished: () => void;
}) {
  const { draft, update, savedAt, flush } = useConclusionDraft(request, open);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const { busy, error, setError, publish } = usePublish(request, draft, file, flush, () => { setConfirming(false); onOpenChange(false); onPublished(); });

  useEffect(() => { if (open) { setStep(0); setFile(null); setConfirming(false); setError(''); } }, [open, request?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  if (!request) return null;
  const filled = filledSteps(draft, Boolean(file));
  const canPublish = filled[2];
  const name = request.patient_profile?.name || request.patient?.name || 'Pacient';
  const profile = request.patient_profile;
  const record = (profile?.medical_record ?? {}) as MedicalRecord;
  const gender = profile?.gender === 'female' ? 'F' : profile?.gender === 'male' ? 'M' : null;
  const lifestyle = (record.lifestyle ?? {}) as Record<string, string | null>;

  const preview = async () => {
    if (!draft) return;
    try {
      const blob = await apiBlob(`/requests/${request.id}/documents/preview`, { method: 'POST', body: JSON.stringify({
        current_illness_history: draft.anam, objective_exam: draft.exam, diagnosis: draft.diag, treatment_plan: draft.plan, recommendations: draft.rec,
        investigation_recommendations: draft.inv, prescription_notes: draft.meds.filter((med) => med.n.trim()).map((med) => `${med.n} — ${med.d}`).join('\n'), has_prescription: Boolean(file)
      }) });
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Previzualizarea nu a reușit.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent showCloseButton={false} className="flex h-[min(800px,96dvh)] w-[calc(100%-1rem)] max-w-[1200px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[1200px]">
        <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-slate-200 pl-6 pr-5">
          <DialogTitle className="flex-1 truncate text-[17px] font-semibold">Concluzie · {name}</DialogTitle>
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><Check className="h-3.5 w-3.5 text-green-600" />{savedAt ? `Ciornă salvată · ${hm(savedAt)}` : 'Ciornă salvată automat'}</span>
          <button type="button" aria-label="Închide" onClick={() => onOpenChange(false)} className="grid h-[34px] w-[34px] place-items-center text-slate-500 hover:text-slate-700"><X className="h-[18px] w-[18px]" /></button>
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="hidden flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-slate-50 p-5 lg:flex">
            {previewUrl ? (
              <>
                <button type="button" onClick={() => setPreviewUrl('')} className="self-start text-[13px] font-medium text-blue-600">← Înapoi la fișă</button>
                <iframe title="Previzualizare PDF" src={previewUrl} className="min-h-[560px] w-full flex-1 rounded-lg border border-slate-200 bg-white" />
              </>
            ) : (
              <>
                <Context label="PACIENT"><span className="text-[15px] font-semibold text-slate-950">{[name, profile?.age !== null && profile?.age !== undefined ? `${profile.age} ani` : null, gender].filter(Boolean).join(' · ')}</span></Context>
                <Context label="SERVICIU"><span className="text-sm">{request.service ? [request.service.name, serviceMeta(request.service).split(' · ')[1], mdl(request.service.price)].filter(Boolean).join(' · ') : '—'}</span></Context>
                <Context label="ACUZE DIN CERERE"><span className="text-sm leading-normal">{request.symptoms || '—'}</span></Context>
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold tracking-[.05em] text-slate-500">DIN FIȘA MEDICALĂ</span>
                  <RecordCard label="Alergii" value={sectionSummary(record, 'drug_allergies')} alert={sectionState(record, 'drug_allergies') === 'done'} />
                  <RecordCard label="Boli cronice" value={sectionSummary(record, 'chronic_conditions')} />
                  <RecordCard label="Medicamente acum" value={lifestyle.long_term_medication || 'Necompletat'} />
                </div>
              </>
            )}
          </aside>
          <div className="flex min-h-0 flex-col">
            <StepTabs step={step} setStep={setStep} filled={filled} />
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
              {draft ? <StepFields step={step} draft={draft} update={update} request={request} file={file} setFile={setFile} /> : <p className="text-sm text-slate-500">Se încarcă ciorna…</p>}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-slate-200 px-6 py-3.5">
              <Link to={`/doctor/chat?request=${request.id}`} className="flex h-[42px] items-center gap-2 rounded-[10px] border border-slate-200 px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50"><MessageSquare className="h-4 w-4" />Întreabă pacientul</Link>
              <button type="button" onClick={() => setStep((step + 1) % 4)} className="h-[42px] rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium hover:bg-slate-50">{step < 3 ? 'Pasul următor' : 'Înapoi la început'}</button>
              <div className="flex-1 text-right text-[13px] text-amber-700">{canPublish ? '' : 'Completează diagnosticul ca să publici'}</div>
              <button type="button" onClick={() => void preview()} disabled={!canPublish} className="hidden h-[42px] rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 lg:block">Previzualizează PDF</button>
              <button type="button" onClick={() => (canPublish ? setConfirming(true) : setStep(2))} className={cn('h-[42px] rounded-[10px] px-[18px] text-sm font-semibold text-white', canPublish ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300')}>Publică concluzia</button>
            </div>
          </div>
        </div>
        {confirming && <PublishConfirm request={request} busy={busy} error={error} onBack={() => setConfirming(false)} onPublish={() => void publish()} />}
      </DialogContent>
    </Dialog>
  );
}

/** P2a · concluzia în dreapta apelului video; aceeași ciornă ca în Consultații. */
export function ConclusionPanel({ request, onPublished }: { request: ConclusionRequest; onPublished: () => void }) {
  const { draft, update, savedAt, flush } = useConclusionDraft(request, true);
  const [step, setStep] = useState(2);
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { busy, error, publish } = usePublish(request, draft, file, flush, () => { setConfirming(false); onPublished(); });
  const filled = filledSteps(draft, Boolean(file));
  const canPublish = filled[2];

  return (
    <div className="relative flex h-full w-full flex-col bg-white text-slate-950">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5">
        <span className="text-base font-semibold">Concluzie</span>
        <span className="text-xs text-slate-500">{savedAt ? `Ciornă salvată · ${hm(savedAt)}` : 'Ciorna se salvează singură'}</span>
      </div>
      <StepTabs step={step} setStep={setStep} filled={filled} compact />
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-5">
        {draft ? <StepFields step={step} draft={draft} update={update} request={request} file={file} setFile={setFile} /> : <p className="text-sm text-slate-500">Se încarcă ciorna…</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 px-5 py-3.5">
        <button type="button" onClick={() => (canPublish ? setConfirming(true) : setStep(2))} className={cn('h-[46px] rounded-[10px] text-[15px] font-semibold text-white', canPublish ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300')}>Publică și închide apelul</button>
        <span className="text-center text-xs text-slate-500">{canPublish ? 'Sau închide apelul și termină concluzia din Consultații.' : 'Completează diagnosticul ca să publici.'}</span>
      </div>
      {confirming && <PublishConfirm request={request} busy={busy} error={error} onBack={() => setConfirming(false)} onPublish={() => void publish()} />}
    </div>
  );
}

function Context({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><span className="text-[11px] font-semibold tracking-[.05em] text-slate-500">{label}</span>{children}</div>;
}

function RecordCard({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-[10px] border px-3 py-2.5', alert ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white')}>
      <span className={cn('text-xs', alert ? 'font-semibold text-red-800' : 'text-slate-500')}>{label}</span>
      <span className={cn('text-sm', alert ? 'text-red-900' : 'text-slate-950')}>{value}</span>
    </div>
  );
}
