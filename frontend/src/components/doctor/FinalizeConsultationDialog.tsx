import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Eye, FileText, MessageSquare, Paperclip, PenLine, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { DoctorSignature } from '../DoctorSignature';
import { PatientChart, type ExamMediaItem, type InvestigationSummary, type ObjectiveDataEntry, type PatientProfileSummary } from '../PatientChart';
import { apiBlob, apiRequest } from '../../lib/api';
import { cn } from '../ui/utils';

export interface FinalizableRequest {
  id: string;
  consultation_kind?: string | null;
  current_illness_history?: string | null;
  symptoms?: string | null;
  triage_notes?: string | null;
  patient?: { name: string } | null;
  patient_profile?: PatientProfileSummary | null;
  objective_data?: ObjectiveDataEntry[];
  exam_media?: ExamMediaItem[];
  investigations?: InvestigationSummary[];
  anamnesis_completed_at?: string | null;
  objective_data_completed_at?: string | null;
}

const EMPTY_EXAM = {
  current_illness_history: '',
  objective_exam: '',
  higo_reviewed: false,
  diagnosis: '',
  treatment_plan: '',
  recommendations: '',
  investigation_recommendations: '',
  prescription_notes: ''
};

type LeftPane = 'consultation' | 'chart' | 'preview';

/**
 * Concluzia medicului: fișa pacientului în stânga, formularul în dreapta,
 * PDF-ul previzualizat în aceeași fereastră. Înainte, fișa completă se deschidea
 * într-un dialog separat care închidea formularul, iar previzualizarea era un link.
 */
export function FinalizeConsultationDialog({
  request,
  open,
  onOpenChange,
  onCompleted
}: {
  request: FinalizableRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const prescriptionInput = useRef<HTMLInputElement>(null);
  const [examData, setExamData] = useState(EMPTY_EXAM);
  const [prescription, setPrescription] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [pane, setPane] = useState<LeftPane>('consultation');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !request) return;
    setExamData({ ...EMPTY_EXAM, current_illness_history: request.current_illness_history || '' });
    setPrescription(null);
    setPreviewUrl('');
    setPane('consultation');
    setError('');
  }, [open, request?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const update = (key: keyof typeof EMPTY_EXAM, value: string | boolean) => setExamData((current) => ({ ...current, [key]: value }));

  const completeRequest = async () => {
    if (!request) return;
    setError('');
    setIsSaving(true);
    try {
      const body = new FormData();
      Object.entries(examData).forEach(([key, value]) => body.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value));
      if (prescription) body.append('prescription', prescription);
      await apiRequest(`/requests/${request.id}/complete`, { method: 'POST', body });
      onOpenChange(false);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut finaliza consultația.');
    } finally {
      setIsSaving(false);
    }
  };

  const preview = async () => {
    if (!request) return;
    setError('');
    setIsSaving(true);
    try {
      const blob = await apiBlob(`/requests/${request.id}/documents/preview`, { method: 'POST', body: JSON.stringify({ ...examData, has_prescription: !!prescription }) });
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
      setPane('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Previzualizarea nu a reușit.');
    } finally {
      setIsSaving(false);
    }
  };

  const onPrescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file && (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      setError('Încarcă rețeta în format PDF, JPG sau PNG, maximum 10 MB.');
      event.target.value = '';
      setPrescription(null);
      return;
    }
    setPrescription(file);
  };

  const patientName = request?.patient_profile?.name || request?.patient?.name || 'Pacient';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }}>
      <DialogContent className="flex h-[min(94dvh,960px)] max-h-none w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl sm:p-0">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 pr-16 sm:px-6">
          <div className="min-w-0">
            <DialogTitle>Concluzia consultației</DialogTitle>
            <DialogDescription className="mt-1">
              {patientName} · Consultația #{request?.id}. Verifică PDF-ul înainte de publicare — pacientul îl găsește în istoricul său.
            </DialogDescription>
          </div>
        </div>

        {request && (
          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:overflow-hidden">
            {/* Stânga: contextul clinic */}
            <section className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
              <div className="flex shrink-0 gap-1 border-b border-slate-200 bg-white px-4 py-2 sm:px-6" role="tablist" aria-label="Context clinic">
                <PaneTab active={pane === 'consultation'} onClick={() => setPane('consultation')}>Consultația</PaneTab>
                <PaneTab active={pane === 'chart'} onClick={() => setPane('chart')}>Fișa completă</PaneTab>
                {previewUrl && <PaneTab active={pane === 'preview'} onClick={() => setPane('preview')}><Eye className="h-3.5 w-3.5" />PDF</PaneTab>}
              </div>
              <div className={cn('min-h-0 flex-1 p-4 sm:p-6 lg:overflow-y-auto', pane === 'preview' && 'p-0 sm:p-0')}>
                {pane === 'preview' && previewUrl ? (
                  <iframe title="Previzualizare PDF" src={previewUrl} className="h-[70dvh] w-full border-0 lg:h-full" />
                ) : (
                  <PatientChart
                    consultationOnly={pane === 'consultation'}
                    profile={request.patient_profile}
                    illnessHistory={request.current_illness_history}
                    symptoms={request.symptoms}
                    triageNotes={request.triage_notes}
                    objectiveData={request.objective_data}
                    examMedia={request.exam_media}
                    investigations={request.investigations}
                    anamnesisCompletedAt={request.anamnesis_completed_at}
                    objectiveDataCompletedAt={request.objective_data_completed_at}
                  />
                )}
              </div>
            </section>

            {/* Dreapta: formularul */}
            <section className="min-h-0 space-y-6 p-4 sm:p-6 lg:overflow-y-auto">
              {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

              <FormSection step={1} title="Anamneză">
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                  <p className="text-xs font-semibold text-slate-500">Acuzele declarate de pacient</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{request.symptoms || '—'}</p>
                </div>
                <Field id="current_illness_history" label="Istoricul bolii actuale">
                  <Textarea id="current_illness_history" value={examData.current_illness_history} onChange={(event) => update('current_illness_history', event.target.value)} />
                </Field>
              </FormSection>

              <FormSection step={2} title="Examen obiectiv">
                <Field id="objective_exam" label="Observațiile medicului">
                  <Textarea id="objective_exam" value={examData.objective_exam} onChange={(event) => update('objective_exam', event.target.value)} />
                </Field>
                {request.consultation_kind === 'with_exam' && (
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={examData.higo_reviewed} onChange={(event) => update('higo_reviewed', event.target.checked)} />
                    Confirm că am examinat datele HIGO disponibile
                  </label>
                )}
              </FormSection>

              <FormSection step={3} title="Concluzie">
                <Field id="diagnosis" label="Diagnostic" required>
                  <Input id="diagnosis" value={examData.diagnosis} onChange={(event) => update('diagnosis', event.target.value)} placeholder="Ex: Faringită acută" required />
                </Field>
                <Field id="treatment_plan" label="Plan de tratament">
                  <Textarea id="treatment_plan" value={examData.treatment_plan} onChange={(event) => update('treatment_plan', event.target.value)} className="min-h-20" />
                </Field>
                <Field id="recommendations" label="Recomandări">
                  <Textarea id="recommendations" value={examData.recommendations} onChange={(event) => update('recommendations', event.target.value)} className="min-h-20" />
                </Field>
                <Field id="investigation_recommendations" label="Investigații recomandate">
                  <Textarea id="investigation_recommendations" maxLength={4000} value={examData.investigation_recommendations} onChange={(event) => update('investigation_recommendations', event.target.value)} placeholder="Analize și investigații recomandate pacientului" className="min-h-20" />
                </Field>
              </FormSection>

              <FormSection step={4} title="Rețetă">
                <Field id="prescription_notes" label="Medicamente și dozaj">
                  <Textarea id="prescription_notes" value={examData.prescription_notes} onChange={(event) => update('prescription_notes', event.target.value)} className="min-h-20" />
                </Field>
                <div className="space-y-2">
                  <Label htmlFor="prescription-upload">Rețetă scanată sau fotografiată</Label>
                  <input ref={prescriptionInput} id="prescription-upload" className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" onChange={onPrescriptionChange} />
                  {prescription ? (
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Paperclip className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{prescription.name}</span>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Elimină rețeta" onClick={() => { setPrescription(null); if (prescriptionInput.current) prescriptionInput.current.value = ''; }}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => prescriptionInput.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                      <Paperclip className="h-4 w-4" />Atașează rețeta (PDF, JPG sau PNG, max. 10 MB)
                    </button>
                  )}
                  {prescription && <p className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">Pacientul primește automat mesajul: „Spuneți-ne din ce rețea de farmacii ați luat medicamentul pe rețetă, pentru a transmite rețeta originală în rețeaua respectivă.”</p>}
                </div>
              </FormSection>

              <details className="group rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700"><PenLine className="h-4 w-4 text-slate-400" />Parafă și semnătură</summary>
                <div className="border-t border-slate-100 p-3 [&>div]:border-0 [&>div]:p-1">
                  <DoctorSignature onSaved={() => setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return ''; })} />
                </div>
              </details>
            </section>
          </div>
        )}

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Renunță</Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            {request && (
              <Button asChild variant="outline">
                <Link to={`/doctor/chat?request=${request.id}`}><MessageSquare className="h-4 w-4" />Întreabă pacientul</Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => void preview()} disabled={isSaving || !examData.diagnosis}>
              <Eye className="h-4 w-4" />Previzualizează PDF
            </Button>
            <Button onClick={() => void completeRequest()} disabled={isSaving || !examData.diagnosis}>
              <FileText className="h-4 w-4" />{isSaving ? 'Se publică…' : 'Publică concluzia'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaneTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors', active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
      {children}
    </button>
  );
}

function FormSection({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{step}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ id, label, required = false, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required && <span className="ml-0.5 text-red-500">*</span>}</Label>
      {children}
    </div>
  );
}
