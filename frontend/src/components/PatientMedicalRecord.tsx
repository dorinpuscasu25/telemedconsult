import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChatView } from '../pages/shared/ChatView';
import { ConsultationDocuments } from './ConsultationDocuments';
import { Check, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { dateOnly } from '../lib/format';
import { MEDICAL_SECTIONS, patientAge, todayDate, type MedicalField, type MedicalRecord, type RecordEntry } from '../lib/medical-record';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ObjectiveDataForm, toObjectivePayload } from './ObjectiveDataForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useDialogs } from './app/DialogProvider';

export interface MedicalProfile {
  pseudonymized?: boolean; patient_code?: string | null;
  id: number; first_name?: string | null; last_name?: string | null; birth_date?: string | null;
  gender?: string | null; country?: string | null;
  region_id?: number | null; locality_id?: number | null; address?: string | null;
  residential_environment?: string | null; address_details?: Record<string, string | null> | null;
  emergency_contact?: string | null; medical_summary?: string | null;
  life_history?: Array<{ category: string; note: string }>;
}
type Region = { id: number; name: string; localities: Array<{ id: number; name: string }> };
type RecordDocument = { id: number; title: string; type: string; performed_at?: string | null; created_at: string; url?: string | null; mime_type?: string | null; notes?: string | null; consultation_request_id?: number | null };
type ConsultationHistory = {
  specialty?: string | null; current_illness_history?: string | null;
  id: number; consultation_id?: number | null; date: string; doctor?: string | null; status: string; symptoms?: string | null;
  objective_exam?: string | null; higo_reviewed?: boolean; prescription_notes?: string | null;
  investigation_recommendations?: string | null;
  diagnosis?: string | null; recommendations?: string | null; treatment_plan?: string | null; conversation_id?: number | null;
  objective_data: Array<{ id: number; source: string; completed_at: string; values: Array<{ label: string; unit?: string | null; value: unknown }> }>;
  exam_media: Array<{ id: number; kind: string; exam_type: string; url: string }>;
};
type RecordResponse = { medical_record: MedicalRecord; documents: RecordDocument[]; consultations: ConsultationHistory[] };
const extraSections = [
  ['personal', 'Date personale'], ['analysis', 'Analize de laborator'], ['imaging', 'Investigații imagistice'], ['functional', 'Investigații funcționale'], ['investigation', 'Alte investigații'],
  ['consultations', 'Consultații'], ['chat', 'Chat-uri'], ['objective', 'Date obiective clinice']
];
const STATUS_LABELS: Record<string, string> = { new: 'În așteptarea medicului', accepted: 'Acceptată', rescheduled: 'Reprogramată', completed: 'Finalizată', cancelled: 'Anulată', rejected: 'Respinsă', expired: 'Expirată', no_operator_available: 'Fără operator disponibil' };
const PHOTO_LABELS: Record<string, string> = { nasal_left: 'Mucoasă nazală stângă', nasal_right: 'Mucoasă nazală dreaptă', eye_left: 'Conjunctivă ochi stâng', eye_right: 'Conjunctivă ochi drept' };
const EXAM_LABELS: Record<string, string> = { SKIN_EXAM: 'Dermatoscopie', THROAT_EXAM: 'Orofaringoscopie', RIGHT_EAR_EXAM: 'Otoscopie dreapta', LEFT_EAR_EXAM: 'Otoscopie stânga', HEART_AUSCULTATION_EXAM: 'Auscultația inimii', LUNGS_AUSCULTATION_EXAM: 'Auscultația plămânilor', ABDOMINAL_AUSCULTATION_EXAM: 'Auscultație abdominală', COUGH_EXAM: 'Sunetul tusei' };

export function PatientMedicalRecord({ profile, regions, onSaved, onDirtyChange, initialSection, requestedConsultationId }: {
  initialSection?: string | null; requestedConsultationId?: string | null;
  profile: MedicalProfile; regions: Region[]; onSaved: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const dialogs = useDialogs();
  const [openedConsultation, setOpenedConsultation] = useState<ConsultationHistory | null>(null);
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [pseudonymized, setPseudonymized] = useState(profile.pseudonymized ?? false);
  const [record, setRecord] = useState<MedicalRecord>({});
  const [documents, setDocuments] = useState<RecordDocument[]>([]);
  const [consultations, setConsultations] = useState<ConsultationHistory[]>([]);
  const [active, setActive] = useState(() => recordSection(initialSection));
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [personal, setPersonal] = useState(() => personalValues(profile));
  const [address, setAddress] = useState(profile.address_details ?? {});
  const [documentForm, setDocumentForm] = useState({ title: '', notes: '', performed_at: '', type: 'investigation' });
  const [selectedRequest, setSelectedRequest] = useState('');
  const [objectiveValues, setObjectiveValues] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const linkedSection = useRef(initialSection);

  const load = useCallback(async () => {
    const next = await apiRequest<RecordResponse>(`/patient/profiles/${profile.id}/medical-record`);
    setLoaded(true);
    setRecord(next.medical_record ?? {});
    setDocuments(next.documents ?? []);
    setConsultations(next.consultations ?? []);
    setSelectedRequest((current) => current || String(next.consultations.find((item) => item.status === 'accepted')?.id ?? next.consultations[0]?.id ?? ''));
  }, [profile.id]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<RecordResponse>(`/patient/profiles/${profile.id}/medical-record`).then((next) => {
      if (cancelled) return;
      setLoaded(true); setRecord(next.medical_record ?? {}); setDocuments(next.documents ?? []); setConsultations(next.consultations ?? []);
      setSelectedRequest(String(next.consultations.find((item) => item.status === 'accepted')?.id ?? next.consultations[0]?.id ?? ''));
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Nu am putut încărca fișa.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile.id]);

  useEffect(() => {
    if (linkedSection.current === initialSection) return;
    linkedSection.current = initialSection;
    if (!dirty) setActive(recordSection(initialSection));
  }, [initialSection, dirty]);

  useEffect(() => {
    if (loading || active !== 'consultations' || !requestedConsultationId) return;
    document.getElementById(`patient-consultation-${profile.id}-${requestedConsultationId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active, loading, profile.id, requestedConsultationId]);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const changeTab = async (next: string) => {
    if (next === active || saving) return;
    if (dirty && !(await dialogs.confirm({ title: 'Renunți la modificări?', description: 'Ai modificări nesalvate în această secțiune. Dacă schimbi secțiunea, se pierd.', confirmLabel: 'Renunță la modificări', cancelLabel: 'Rămân aici', tone: 'danger' }))) return;
    if (dirty) {
      try { await load(); } catch { setError('Nu am putut reîncărca fișa. Încearcă din nou.'); return; }
      setPersonal(personalValues(profile)); setAddress(profile.address_details ?? {});
    }
    setDirty(false); setActive(next); setError(''); setMessage('');
    setDocumentForm({ title: next === 'objective' ? PHOTO_LABELS.nasal_left : '', notes: '', performed_at: '', type: next === 'objective' ? 'nasal_left' : next });
    if (fileInput.current) fileInput.current.value = '';
  };
  const section = MEDICAL_SECTIONS.find((item) => item.key === active);
  const vaccination = record.vaccinations as { refusal?: string | null; items?: RecordEntry[] } | undefined;
  const entries = active === 'vaccinations' ? vaccination?.items ?? [] : Array.isArray(record[active]) ? record[active] as RecordEntry[] : [];
  const values = (!Array.isArray(record[active]) ? record[active] : {}) as RecordEntry ?? {};
  const changeEntry = (index: number, key: string, value: string) => {
    const next = entries.map((entry, i) => i === index ? { ...entry, [key]: value } : entry);
    setRecord({ ...record, [active]: active === 'vaccinations' ? { ...vaccination, items: next } : next }); setDirty(true);
  };
  const setEntries = (next: RecordEntry[]) => { setRecord({ ...record, [active]: active === 'vaccinations' ? { ...vaccination, items: next } : next }); setDirty(true); };
  const saveSection = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      if (active === 'personal') {
        await apiRequest(`/patient/profiles/${profile.id}`, { method: 'PUT', body: JSON.stringify({ ...personal,
          pseudonymized, birth_date: personal.birth_date || null, gender: personal.gender || null,
          region_id: personal.region_id ? Number(personal.region_id) : null,
          locality_id: personal.locality_id ? Number(personal.locality_id) : null, address_details: address }) });
      } else {
        const data = active === 'vaccinations' ? { ...vaccination, items: entries } : record[active] ?? {};
        await apiRequest(`/patient/profiles/${profile.id}/medical-record`, { method: 'PATCH', body: JSON.stringify({ section: active, data }) });
      }
      setDirty(false); setMessage('Secțiunea a fost salvată.'); onSaved();
    } catch (err) { setError(errorText(err)); } finally { setSaving(false); }
  };
  const upload = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    const form = new FormData();
    Object.entries(documentForm).forEach(([key, value]) => form.append(key, value));
    const file = fileInput.current?.files?.[0];
    if (file) form.append('file', file);
    if (active === 'objective') form.append('consultation_request_id', selectedRequest);
    try {
      await apiRequest(`/patient/profiles/${profile.id}/investigations`, { method: 'POST', body: form });
      await load(); setDocumentForm({ ...documentForm, title: '', notes: '', performed_at: '' });
      if (fileInput.current) fileInput.current.value = '';
      setMessage('Fișierul a fost adăugat.'); onSaved();
    } catch (err) { setError(errorText(err)); } finally { setSaving(false); }
  };
  const removeDocument = async (item: RecordDocument) => {
    if (!(await dialogs.confirm({ title: `Ștergi „${item.title}”?`, description: 'Fișierul se șterge definitiv din fișa pacientului.', confirmLabel: 'Șterge', tone: 'danger' }))) return;
    setSaving(true); setError('');
    try { await apiRequest(`/patient/profiles/${profile.id}/investigations/${item.id}`, { method: 'DELETE' }); await load(); onSaved(); }
    catch (err) { setError(errorText(err)); } finally { setSaving(false); }
  };
  const saveMeasurements = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await apiRequest(`/requests/${selectedRequest}/objective-data`, { method: 'POST', body: JSON.stringify({ payload: toObjectivePayload(objectiveValues) }) });
      setObjectiveValues({}); await load(); setMessage('Măsurătorile au fost salvate ca date declarate de pacient.');
    } catch (err) { setError(errorText(err)); } finally { setSaving(false); }
  };
  const currentRequest = consultations.find((item) => String(item.id) === selectedRequest);
  const editableRequest = currentRequest && ['new', 'accepted'].includes(currentRequest.status);
  const shownDocuments = documents.filter((item) => active === 'objective' ? item.consultation_request_id === currentRequest?.id && Boolean(PHOTO_LABELS[item.type]) : item.type === active);
  const history = consultations.filter((item) => (!specialtyFilter || item.specialty === specialtyFilter) && (!doctorFilter || item.doctor === doctorFilter) && (!dateFilter || item.date.slice(0, 10) === dateFilter)).sort((a, b) => b.date.localeCompare(a.date));
  const historyGroups = history.reduce<Record<string, ConsultationHistory[]>>((groups, item) => {
    const specialty = item.specialty || 'Specialitate neprecizată';
    (groups[specialty] ??= []).push(item);
    return groups;
  }, {});
  const nav = [extraSections[0], ...MEDICAL_SECTIONS.map((item) => [item.key, item.title]), ...extraSections.slice(1)];

  return <div data-validation-scope className="space-y-5">
    <div className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">Completează treptat informațiile cunoscute. Salvează fiecare secțiune separat. Datele vor fi vizibile medicului care se ocupă de consultație.</div>
    <label className="block space-y-2"><span className="text-sm font-medium">Compartimentul fișei</span>
      <select aria-label="Compartimentul fișei" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3" value={active} disabled={saving || loading} onChange={(event) => void changeTab(event.target.value)}>
        {nav.map(([key, title], index) => <option key={key} value={key}>{index + 1}. {title}</option>)}
      </select>
    </label>
    <div className="flex flex-wrap gap-2">{[['personal', 'Date personale'], ['drug_allergies', 'Alergii'], ['analysis', 'Analize'], ['consultations', 'Consultații']].map(([key, label]) =>
      <button key={key} type="button" disabled={loading || saving} onClick={() => void changeTab(key)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${active === key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"><Check className="h-4 w-4 shrink-0" />{message}</p>}
    {loading ? <p className="py-8 text-slate-500">Se încarcă fișa medicală...</p> : !loaded ? <Button variant="outline" onClick={() => { setLoading(true); load().then(() => setError('')).catch((err) => setError(errorText(err))).finally(() => setLoading(false)); }}>Reîncearcă încărcarea fișei</Button> : <>
      {(active === 'personal' || section) && <form onSubmit={saveSection} className="space-y-5">
        <fieldset disabled={saving} className="space-y-5">
          <div><h3 className="text-lg font-semibold">{section?.title ?? 'Date personale'}</h3><p className="mt-1 text-sm text-slate-500">{section?.description ?? 'Datele pacientului pentru care este păstrată această fișă.'}</p></div>
          {active === 'personal' ? <>
            <div className="grid gap-4 sm:grid-cols-2">
              {([{ key: 'last_name', label: 'Nume', required: true }, { key: 'first_name', label: 'Prenume', required: true }, { key: 'birth_date', label: 'Data nașterii', type: 'date' }, { key: 'country', label: 'Țara', required: true }] as MedicalField[]).map((field) => <MedicalInput key={field.key} field={field} value={personal[field.key] ?? ''} onChange={(value) => { setPersonal({ ...personal, [field.key]: value }); setDirty(true); }} />)}
              <div className="flex items-end rounded-xl bg-slate-50 p-3 text-sm font-semibold">Vârsta: {patientAge(personal.birth_date)}</div>
              <Choice label="Sex" value={personal.gender} options={[[ 'M', 'Masculin' ], [ 'F', 'Feminin' ]]} onChange={(value) => { setPersonal({ ...personal, gender: value }); setDirty(true); }} />
              <Choice label="Mediul de trai" value={personal.residential_environment} options={[[ 'rural', 'Rural' ], [ 'urban', 'Urban' ]]} onChange={(value) => { setPersonal({ ...personal, residential_environment: value }); setDirty(true); }} />
              <MedicalInput field={{ key: 'region_id', label: 'Raion / municipiu', type: 'select', options: regions.map((region) => [String(region.id), region.name]) }} value={personal.region_id} onChange={(value) => { setPersonal({ ...personal, region_id: value, locality_id: '' }); setDirty(true); }} />
              <MedicalInput field={{ key: 'locality_id', label: 'Localitatea', type: 'select', options: (regions.find((region) => String(region.id) === personal.region_id)?.localities ?? []).map((item) => [String(item.id), item.name]) }} value={personal.locality_id} onChange={(value) => { setPersonal({ ...personal, locality_id: value }); setDirty(true); }} />
              <MedicalInput field={{ key: 'address', label: 'Strada și numărul casei' }} value={personal.address} onChange={(value) => { setPersonal({ ...personal, address: value }); setDirty(true); }} />
              {Object.entries({ building: 'Bloc', entrance: 'Scară', apartment: 'Apartament', floor: 'Etaj' }).map(([key, label]) => <MedicalInput key={key} field={{ key, label }} value={address[key] ?? ''} onChange={(value) => { setAddress({ ...address, [key]: value }); setDirty(true); }} />)}
              <MedicalInput field={{ key: 'emergency_contact', label: 'Contact de urgență' }} value={personal.emergency_contact} onChange={(value) => { setPersonal({ ...personal, emergency_contact: value }); setDirty(true); }} />
            </div>
            <MedicalInput field={{ key: 'medical_summary', label: 'Istoricul vieții', type: 'textarea', placeholder: 'Rezumatul istoricului personal: naștere și dezvoltare, boli anterioare, accidente, operații și antecedente familiale. Completează detaliile în compartimentele separate ale fișei.' }} value={personal.medical_summary} onChange={(value) => { setPersonal({ ...personal, medical_summary: value }); setDirty(true); }} />
            <div className="rounded-xl bg-blue-50 p-3 text-sm"><p className="font-semibold">Cod pacient: {profile.patient_code || '—'}</p><label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={pseudonymized} onChange={(event) => { setPseudonymized(event.target.checked); setDirty(true); }} />Folosește numele prescurtat în chat, liste și documente</label><p className="mt-1 text-xs text-slate-500">Numele va apărea ca {personal.first_name || 'Pacient'} {personal.last_name ? personal.last_name.charAt(0) + '.' : ''} dacă activezi această opțiune. Numele complet rămâne în profilul pacientului.</p></div>
            {(profile.life_history ?? []).length > 0 && <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">Înregistrări din fișa anterioară</summary>{profile.life_history?.map((entry, i) => <p key={i} className="mt-2 text-sm"><strong>{entry.category}:</strong> {entry.note}</p>)}</details>}
          </> : section?.repeated ? <>
            {active === 'vaccinations' && <Choice label="Opțiunea privind vaccinarea" value={vaccination?.refusal ?? 'unknown'} options={[[ 'unknown', 'Nu am precizat' ], [ 'none', 'Fără refuz declarat' ], [ 'temporary', 'Refuz temporar' ], [ 'categorical', 'Refuz categoric' ]]} onChange={(value) => { setRecord({ ...record, vaccinations: { ...vaccination, refusal: value, items: entries } }); setDirty(true); }} />}
            {entries.length === 0 && <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">Nu sunt înregistrări în această secțiune. Folosește „Adaugă” pentru prima înregistrare.</p>}
            {active === 'vaccinations' && entries.length > 0 && <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[720px] text-left text-sm"><caption className="p-3 text-left font-semibold">Tabelul vaccinărilor din carnet</caption><thead className="bg-slate-50"><tr>{section.fields.map((field) => <th key={field.key} className="p-3">{field.label}</th>)}<th className="p-3">Acțiuni</th></tr></thead><tbody>{entries.map((entry, index) => <tr key={index} className="border-t align-top">{section.fields.map((field) => <td key={field.key} className="min-w-36 p-2"><MedicalInput hideLabel field={field} value={entry[field.key] ?? ''} onChange={(value) => changeEntry(index, field.key, value)} /></td>)}<td className="p-2"><Button type="button" variant="ghost" size="icon" aria-label={`Elimină vaccinul ${index + 1}`} onClick={async () => { if (await dialogs.confirm({ title: 'Elimini această vaccinare?', description: 'Modificarea se aplică după ce salvezi fișa.', confirmLabel: 'Elimină', tone: 'danger' })) setEntries(entries.filter((_, i) => i !== index)); }}><Trash2 className="h-4 w-4 text-red-600" /></Button></td></tr>)}</tbody></table></div>}
            {active !== 'vaccinations' && entries.map((entry, index) => <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold">{index + 1}. {entry.name || 'Înregistrare nouă'}</p>
                <Button type="button" variant="ghost" size="icon" aria-label="Elimină înregistrarea" onClick={async () => { if (await dialogs.confirm({ title: 'Elimini această înregistrare?', description: 'Modificarea se aplică după ce salvezi fișa.', confirmLabel: 'Elimină', tone: 'danger' })) setEntries(entries.filter((_, i) => i !== index)); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">{section.fields.map((field) => <MedicalInput key={field.key} field={field} value={entry[field.key] ?? ''} onChange={(value) => changeEntry(index, field.key, value)} />)}</div>
            </div>)}
            <Button type="button" variant="outline" onClick={() => setEntries([...entries, {}])}><Plus className="mr-2 h-4 w-4" />Adaugă înregistrare</Button>
          </> : <div className="grid gap-4 sm:grid-cols-2">{section?.fields.map((field) => <MedicalInput key={field.key} field={field} value={values[field.key] ?? ''} onChange={(value) => { setRecord({ ...record, [active]: { ...values, [field.key]: value } }); setDirty(true); }} />)}</div>}
          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border bg-white/95 p-3 shadow-sm"><Button disabled={!dirty || saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Se salvează...' : 'Salvează secțiunea'}</Button><span className="text-xs text-slate-500">{dirty ? 'Ai modificări nesalvate' : 'Fără modificări nesalvate'}</span></div>
        </fieldset>
      </form>}
      {(['analysis', 'imaging', 'functional', 'investigation', 'objective'].includes(active)) && <>
        {active === 'objective' && <><h3 className="font-semibold">Date obiective clinice</h3><p className="text-sm text-slate-500">Măsurători, fotografii și înregistrări HIGO asociate fiecărei consultații.</p>
          <MedicalInput field={{ key: 'consultation', label: 'Consultația', type: 'select', options: consultations.map((item) => [String(item.id), `${dateOnly(item.date)} — ${item.doctor ?? 'Medic neatribuit'} (${STATUS_LABELS[item.status] ?? item.status})`]) }} value={selectedRequest} onChange={(value) => { setSelectedRequest(value); setObjectiveValues({}); }} />
          {currentRequest?.objective_data.map((entry) => <div key={entry.id} className="rounded-xl border p-4"><p className="mb-3 text-xs font-semibold text-slate-500">{entry.source === 'patient' ? 'Declarat de pacient' : entry.source === 'higo' ? 'Aparat HIGO' : 'Operator / date importate'} · {dateOnly(entry.completed_at)}</p>
            <dl className="grid gap-3 sm:grid-cols-2">{entry.values.map((value, i) => <div key={i}><dt className="text-xs text-slate-500">{value.label}</dt><dd className="text-sm font-medium">{String(value.value)} {value.unit}</dd></div>)}</dl></div>)}
          {currentRequest?.exam_media.map((media) => <div key={media.id} className="space-y-2 rounded-xl border p-3"><p className="text-sm font-semibold">{EXAM_LABELS[media.exam_type] ?? 'Examinare HIGO'}</p>{media.kind === 'audio' ? <audio controls src={media.url} className="w-full" /> : media.kind === 'video' ? <video controls src={media.url} className="max-h-64 w-full" /> : <a href={media.url} target="_blank" rel="noreferrer"><img src={media.url} alt="Examinare HIGO" className="max-h-64 rounded-lg" /></a>}</div>)}
          {editableRequest && <form onSubmit={saveMeasurements} className="space-y-4 rounded-xl border bg-slate-50 p-4"><fieldset disabled={saving} className="space-y-4"><h4 className="font-semibold">Adaugă măsurători</h4><p className="text-sm text-slate-500">Completează valorile citite de pe aparate, de preferat împreună cu operatorul.</p><ObjectiveDataForm value={objectiveValues} onChange={setObjectiveValues} /><Button disabled={saving || Object.keys(toObjectivePayload(objectiveValues)).length === 0}><Save className="mr-2 h-4 w-4" />Salvează măsurătorile</Button></fieldset></form>}
          {!consultations.length && <p className="text-sm text-slate-500">Datele obiective vor apărea după ce soliciți o consultație.</p>}
        </>}
        {(active !== 'objective' || editableRequest) && <form onSubmit={upload} className="space-y-4 rounded-xl border border-dashed border-slate-300 p-4"><fieldset disabled={saving} className="space-y-4"><h3 className="font-semibold">{active === 'analysis' ? 'Adaugă analiză' : active === 'objective' ? 'Adaugă fotografie clinică' : 'Adaugă investigație'}</h3>
          {active === 'objective' && <MedicalInput field={{ key: 'type', label: 'Ce fotografie adaugi?', type: 'select', required: true, options: Object.entries(PHOTO_LABELS) }} value={documentForm.type} onChange={(value) => setDocumentForm({ ...documentForm, type: value, title: PHOTO_LABELS[value] ?? '' })} />}
          <div className="grid gap-4 sm:grid-cols-2"><MedicalInput field={{ key: 'title', label: 'Denumire', required: true, placeholder: active === 'analysis' ? 'De exemplu: hemoleucogramă, biochimie' : 'De exemplu: ECG, radiografie, USG, RMN' }} value={documentForm.title} onChange={(value) => setDocumentForm({ ...documentForm, title: value })} />
          <MedicalInput field={{ key: 'performed_at', label: 'Data efectuării', type: 'date', required: true }} value={documentForm.performed_at} onChange={(value) => setDocumentForm({ ...documentForm, performed_at: value })} /></div>
          <MedicalInput field={{ key: 'notes', label: 'Observații (opțional)', type: 'textarea' }} value={documentForm.notes} onChange={(value) => setDocumentForm({ ...documentForm, notes: value })} />

          <label className="block space-y-2"><span className="text-sm font-medium">Fotografie sau document</span><Input ref={fileInput} type="file" required accept={active === 'objective' ? 'image/jpeg,image/png,image/webp' : '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx'} /><span className="block text-xs text-slate-500">{active === 'objective' ? 'JPG, PNG sau WebP' : 'JPG, PNG, WebP, PDF sau Word'} · maximum 20 MB</span></label>
          <Button disabled={saving}><FileUp className="mr-2 h-4 w-4" />{saving ? 'Se încarcă...' : 'Adaugă fișier'}</Button>
        </fieldset></form>}
        <div className="space-y-3"><p className="text-sm font-semibold">{active === 'analysis' ? 'Analize de laborator' : active === 'imaging' ? 'Investigații imagistice' : active === 'functional' ? 'Investigații funcționale' : active === 'objective' ? 'Fotografii clinice' : 'Alte investigații'} · cele mai recente întâi</p>
          {shownDocuments.length === 0 && <p className="text-sm text-slate-500">Nu sunt fișiere în această secțiune.</p>}
          {shownDocuments.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border bg-slate-50 p-4"><div className="min-w-0"><p className="font-semibold">{item.title}</p><p className="text-xs text-blue-700">{item.type === 'imaging' ? 'Investigație imagistică' : item.type === 'functional' ? 'Investigație funcțională' : item.type === 'analysis' ? 'Analiză de laborator' : 'Investigație'}</p><p className="mt-1 text-xs text-slate-500">{item.performed_at ? `Efectuată: ${dateOnly(item.performed_at)}` : 'Data efectuării nu era precizată în fișa anterioară'}</p>{item.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{item.notes}</p>}{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-blue-700">Deschide fișierul</a>}</div><Button type="button" variant="ghost" size="icon" aria-label={`Șterge ${item.title}`} disabled={saving} onClick={() => void removeDocument(item)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div>)}
        </div>
      </>}
      {active === 'chat' && <ChatView patientProfileId={profile.id} emptyTitle="Nu ai conversații pentru acest pacient" />}
      {active === 'consultations' && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Istoricul consultațiilor</h3><Button asChild><Link to={`/patient/doctors?patient_profile=${profile.id}`}><Plus className="mr-2 h-4 w-4" />Consultație nouă</Link></Button></div>
        {!consultations.length && <p className="text-sm text-slate-500">Nu ai consultații pentru acest pacient.</p>}
        <div className="flex flex-wrap gap-2"><select aria-label="Specialitate" className="rounded-xl border p-2 text-sm" value={specialtyFilter} onChange={(event) => setSpecialtyFilter(event.target.value)}><option value="">Toate specialitățile</option>{[...new Set(consultations.map((item) => item.specialty).filter(Boolean))].map((value) => <option key={value} value={value || ''}>{value}</option>)}</select><select aria-label="Medic" className="rounded-xl border p-2 text-sm" value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)}><option value="">Toți medicii</option>{[...new Set(consultations.map((item) => item.doctor).filter(Boolean))].map((value) => <option key={value} value={value || ''}>{value}</option>)}</select><input aria-label="Data consultației" type="date" className="rounded-xl border p-2 text-sm" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></div><Button asChild variant="outline"><Link to={`/patient/chat?patient_profile=${profile.id}`}>Chat-uri cu medicii pentru acest pacient</Link></Button>
        {Object.entries(historyGroups).map(([specialty, items]) => <section key={specialty} className="space-y-3"><h4 className="rounded-xl bg-blue-50 px-4 py-3 font-semibold text-blue-900">{specialty} <span className="text-sm font-normal">({items.length}) · cele mai recente întâi</span></h4>{items.map((item) => <article key={item.id} id={`patient-consultation-${profile.id}-${item.id}`} className={`space-y-3 rounded-xl border p-4 ${String(item.id) === requestedConsultationId ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-200' : ''}`}><div className="flex flex-wrap justify-between gap-2"><div><button type="button" onClick={() => setOpenedConsultation(item)} className="text-left font-semibold text-blue-700 hover:underline">Consultație #{item.consultation_id ?? item.id} · {item.doctor ?? 'Medic neatribuit'}</button><p className="text-xs text-slate-500">{dateOnly(item.date)}</p></div><span className="text-xs font-medium text-blue-700">{STATUS_LABELS[item.status] ?? item.status}</span></div><details><summary className="cursor-pointer text-sm font-medium">Acuze / simptome</summary><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{item.symptoms || 'Fără detalii.'}</p></details>
          {item.current_illness_history && <p className="whitespace-pre-wrap text-sm"><strong>Istoricul bolii actuale: </strong>{item.current_illness_history}</p>}
          <Button variant="outline" onClick={() => setOpenedConsultation(item)}>Deschide consultația medicală</Button>
          {item.status === 'completed' && <ConsultationDocuments requestId={item.id} />}
          {item.diagnosis && <p className="whitespace-pre-wrap text-sm"><strong>Diagnosticul medicului: </strong>{item.diagnosis}</p>}
          {item.recommendations && <p className="whitespace-pre-wrap text-sm"><strong>Recomandări: </strong>{item.recommendations}</p>}
          {item.investigation_recommendations && <p className="whitespace-pre-wrap text-sm"><strong>Investigații recomandate: </strong>{item.investigation_recommendations}</p>}
          {item.treatment_plan && <p className="whitespace-pre-wrap text-sm"><strong>Plan de tratament: </strong>{item.treatment_plan}</p>}
          <div className="flex flex-wrap gap-2">{item.conversation_id && <Button asChild variant="outline"><Link to={`/patient/chat?conversation=${item.conversation_id}`}>Chat pentru clarificări</Link></Button>}{['new', 'accepted', 'rescheduled'].includes(item.status) && <Button asChild variant="outline"><Link to={`/consultations/${item.id}/video`}>Treci la videocall</Link></Button>}</div>
        </article>)}</section>)}
      </div>}
      <Dialog open={!!openedConsultation} onOpenChange={(open) => { if (!open) setOpenedConsultation(null); }}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Consultație medicală #{openedConsultation?.consultation_id ?? openedConsultation?.id}</DialogTitle></DialogHeader>{openedConsultation && <div className="space-y-5">
        <div className="rounded-xl bg-blue-50 p-4 text-sm"><p><strong>Pacient:</strong> {profile.pseudonymized ? `${profile.first_name || ''} ${(profile.last_name || '').slice(0, 1)}.` : `${profile.first_name || ''} ${profile.last_name || ''}`} · {profile.patient_code}</p><p><strong>Medic:</strong> {openedConsultation.doctor || 'În curs de atribuire'} · {openedConsultation.specialty}</p><p>{dateOnly(openedConsultation.date)} · {STATUS_LABELS[openedConsultation.status] || openedConsultation.status}</p></div>
        {openedConsultation.status === 'completed' && <ConsultationDocuments requestId={openedConsultation.id} />}
        {([
          ['Istoricul bolii actuale', openedConsultation.current_illness_history],
          ['Acuzele pacientului (plângerile / simptomele)', openedConsultation.symptoms],
          ['Examen obiectiv / observațiile medicului', openedConsultation.objective_exam],
          ['Diagnosticul medicului', openedConsultation.diagnosis],
          ['Tratament indicat', openedConsultation.treatment_plan],
          ['Recomandările medicului', openedConsultation.recommendations],
          ['Investigații recomandate', openedConsultation.investigation_recommendations],
          ['Prescripții', openedConsultation.prescription_notes],
        ] as const).map(([label, value]) => <section key={label}><h4 className="font-semibold text-slate-900">{label}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{value || 'Necompletat'}</p></section>)}
        {openedConsultation.higo_reviewed && <p className="rounded-xl bg-slate-50 p-3 text-sm">Medicul a luat cunoștință de datele examinării cu dispozitivul HIGO. Materialele foto/video se păstrează în fișa digitală a pacientului.</p>}
        {openedConsultation.status !== 'completed' && <p className="rounded-xl bg-amber-50 p-3 text-sm">Consultația nu este finalizată. Diagnosticul și recomandările oficiale vor fi publicate de medic aici, în format PDF.</p>}
        {openedConsultation.conversation_id && <Button asChild variant="outline"><Link to={`/patient/chat?conversation=${openedConsultation.conversation_id}`}>Chat pentru clarificări</Link></Button>}
      </div>}</DialogContent></Dialog>
    </>}
  </div>;
}

export function MedicalInput({ field, value, onChange, hideLabel = false }: { field: MedicalField; value: string | number; onChange: (value: string) => void; hideLabel?: boolean }) {
  const id = useId();
  if (['birth_method', 'feeding'].includes(field.key) && field.options) {
    return <div className="sm:col-span-2"><Choice label={field.label} value={String(value)} options={field.options} onChange={onChange} /></div>;
  }
  const shared = { id, 'data-field': field.key, value: String(value), required: field.required, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(event.target.value) };
  return <div className={`space-y-2 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}><label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-slate-700'}>{field.label}{field.unit ? ` (${field.unit})` : ''}{field.required ? ' *' : ''}</label>
    {field.type === 'select' ? <select {...shared} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="">{field.required ? 'Alege din listă' : 'Necompletat / nu cunosc'}</option>{field.options?.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      : field.type === 'textarea' ? <Textarea {...shared} maxLength={4000} placeholder={field.placeholder} className="min-h-24 rounded-xl" />
      : <Input {...shared} type={field.type ?? 'text'} min={field.min} max={field.type === 'date' ? todayDate() : field.max} step={field.type === 'number' ? 'any' : undefined} maxLength={255} placeholder={field.placeholder} className="h-11 rounded-xl" />}
  </div>;
}
function Choice({ label, value, options, onChange }: { label: string; value?: string | null; options: Array<[string, string]>; onChange: (value: string) => void }) {
  const id = useId();
  return <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend><div className="flex flex-wrap gap-2">{options.map(([key, text]) => <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${value === key ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}><input type="radio" name={id} value={key} checked={value === key} onChange={() => onChange(key)} />{text}</label>)}</div></fieldset>;
}
function personalValues(profile: MedicalProfile): Record<string, string> {
  return Object.fromEntries(['first_name', 'last_name', 'birth_date', 'gender', 'country', 'region_id', 'locality_id', 'address', 'residential_environment', 'emergency_contact', 'medical_summary'].map((key) => [key, String(profile[key as keyof MedicalProfile] ?? '').slice(0, key === 'birth_date' ? 10 : undefined)]));
}
function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { errors?: Record<string, string[]> } }).data;
    if (data?.errors) return Object.values(data.errors).flat().join(' ');
  }
  return err instanceof Error ? err.message : 'Nu am putut salva. Încearcă din nou.';
}

function recordSection(value?: string | null): string {
  return [...extraSections.map(([key]) => key), ...MEDICAL_SECTIONS.map((section) => section.key)].includes(value ?? '') ? value ?? 'personal' : 'personal';
}
