import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Stethoscope } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { MoreMenu } from '../../components/app/MoreMenu';
import { useDialogs } from '../../components/app/DialogProvider';
import { PatientMedicalRecord, type MedicalProfile } from '../../components/PatientMedicalRecord';
import type { CatalogRegion } from '../../components/patient/PatientBasicsFields';
import { DocumentsPanel, type RecordDocument } from '../../components/patient/record/DocumentsPanel';
import { PersonalDataForm, type PersonalProfile } from '../../components/patient/record/PersonalDataForm';
import { SectionEditor } from '../../components/patient/record/SectionEditor';
import { countDone, sectionState, sectionSummary, type SectionState } from '../../components/patient/record/sectionMeta';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { apiRequest } from '../../lib/api';
import { MEDICAL_SECTIONS, patientAge, type MedicalRecord } from '../../lib/medical-record';

type Profile = PersonalProfile & MedicalProfile & { patient_code?: string | null; can_request_consultation?: boolean };
type Tab = 'date' | 'fisa' | 'documente' | 'consultatii';

const TABS: Array<[Tab, string]> = [['date', 'Date personale'], ['fisa', 'Fișa medicală'], ['documente', 'Documente'], ['consultatii', 'Consultații']];

/** Pagina unui pacient: date personale, fișa medicală pe secțiuni, documente și consultații. */
export function PatientRecordPage() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const { isEnabled } = useFeatureFlags();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [record, setRecord] = useState<MedicalRecord>({});
  const [documents, setDocuments] = useState<RecordDocument[]>([]);
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const tab = tabParam(searchParams.get('tab'));
  const openSection = searchParams.get('section');

  const loadProfile = useCallback(async () => {
    const response = await apiRequest<{ patient_profiles: Profile[] }>('/patient/profile');
    const found = response.patient_profiles.find((item) => String(item.id) === profileId) ?? null;
    setProfile(found);
    setNotFound(!found);
  }, [profileId]);

  const loadRecord = useCallback(async () => {
    const response = await apiRequest<{ medical_record: MedicalRecord; documents: RecordDocument[] }>(`/patient/profiles/${profileId}/medical-record`);
    setRecord(response.medical_record ?? {});
    setDocuments(response.documents ?? []);
  }, [profileId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadProfile(), loadRecord()]).catch(() => setNotFound(true)).finally(() => setLoading(false));
    apiRequest<{ data: CatalogRegion[] }>('/catalog/regions', { auth: false }).then((response) => setRegions(response.data ?? [])).catch(() => setRegions([]));
  }, [loadProfile, loadRecord]);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    setSearchParams(next, { replace: true });
  };

  const name = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : '';

  useEffect(() => {
    document.title = `${name || 'Pacient'} · telemedconsult.md`;
  }, [name]);
  const done = useMemo(() => countDone(record), [record]);
  const sectionOpen = tab === 'fisa' && Boolean(openSection && MEDICAL_SECTIONS.some((section) => section.key === openSection));

  const exportProfile = async () => {
    if (!profile) return;
    const exported = await apiRequest(`/patient/profiles/${profile.id}/export`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `patient-profile-${profile.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const deleteProfile = async () => {
    if (!profile) return;
    if (!(await dialogs.confirm({ title: `Ștergi profilul ${name}?`, description: 'Profilul dispare din listă. Consultațiile deja făcute rămân în istoric.', confirmLabel: 'Șterge profilul', tone: 'danger' }))) return;
    await apiRequest(`/patient/profiles/${profile.id}`, { method: 'DELETE' });
    navigate('/patient/profile');
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-20 w-full rounded-2xl" /><Skeleton className="h-96 w-full rounded-2xl" /></div>;
  if (notFound || !profile) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center"><p className="font-semibold text-slate-900">Pacientul nu a fost găsit.</p><Button asChild variant="outline" className="mt-4"><Link to="/patient/profile">Înapoi la Pacienții mei</Link></Button></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/patient/profile" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Pacienții mei</Link>

      <header className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{initials(name)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950">{name}</h1>
          <p className="text-sm text-slate-500">{profile.birth_date ? `${patientAge(profile.birth_date)} · ` : ''}Cod pacient {formatCode(profile.patient_code)}</p>
        </div>
        {profile.can_request_consultation && isEnabled('doctors') && <Button asChild className="hidden sm:inline-flex"><Link to={`/patient/doctors?patient_profile=${profile.id}`}><Stethoscope className="h-4 w-4" />Programează</Link></Button>}
        {profile.can_request_consultation && isEnabled('doctors') && <Button asChild size="icon" className="sm:hidden" aria-label="Programează"><Link to={`/patient/doctors?patient_profile=${profile.id}`}><Stethoscope className="h-4 w-4" /></Link></Button>}
        <MoreMenu items={[{ label: 'Exportă datele', onSelect: () => void exportProfile() }, { label: 'Șterge profilul', onSelect: () => void deleteProfile(), danger: true }]} />
      </header>

      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Secțiunile pacientului">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setParam({ tab: key === 'date' ? null : key, section: null })} aria-current={tab === key ? 'page' : undefined}
            className={cn('shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition', tab === key ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-900')}>
            {label}{key === 'fisa' ? ` ${done}/${MEDICAL_SECTIONS.length}` : ''}
          </button>
        ))}
      </nav>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {tab === 'date' && <PersonalDataForm key={profile.id} profile={profile} regions={regions} onSaved={() => void loadProfile()} />}

        {tab === 'fisa' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Medicul vede această fișă la fiecare consultație.</p>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{done} din {MEDICAL_SECTIONS.length}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(done / MEDICAL_SECTIONS.length) * 100}%` }} /></div>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {MEDICAL_SECTIONS.map((section) => {
                const state = sectionState(record, section.key);
                return (
                  <li key={section.key}>
                    <button type="button" onClick={() => setParam({ section: section.key })} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                      <StateMark state={state} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-900">{section.title}</span>
                        <span className={cn('block truncate text-sm', state === 'empty' ? 'text-slate-400' : 'text-slate-500')}>{sectionSummary(record, section.key)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tab === 'documente' && <DocumentsPanel profileId={profile.id} documents={documents} onChanged={() => void loadRecord()} />}

        {tab === 'consultatii' && (
          <PatientMedicalRecord profile={profile} regions={regions} only="consultations" requestedConsultationId={searchParams.get('request')} onSaved={() => void loadRecord()} onDirtyChange={() => undefined} />
        )}
      </section>

      <Sheet open={sectionOpen} onOpenChange={(open) => { if (!open) setParam({ section: null }); }}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl">
          <SheetTitle className="sr-only">{MEDICAL_SECTIONS.find((section) => section.key === openSection)?.title ?? 'Secțiune'}</SheetTitle>
          <SheetDescription className="sr-only">Se salvează automat.</SheetDescription>
          {sectionOpen && openSection && (
            <SectionEditor key={openSection} profileId={profile.id} sectionKey={openSection} record={record} patientName={name} birthDate={profile.birth_date} onRecordChange={setRecord}
              footer={<Button className="w-full" onClick={() => setParam({ section: null })}>Gata</Button>} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StateMark({ state }: { state: SectionState }) {
  if (state === 'done') return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white" aria-label="Completată"><Check className="h-4 w-4" /></span>;
  if (state === 'nothing') return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600" aria-label="Nimic de raportat"><Check className="h-4 w-4" /></span>;
  return <span className="h-7 w-7 shrink-0 rounded-full border-2 border-dashed border-slate-300" aria-label="Necompletată" />;
}

function tabParam(value: string | null): Tab {
  return value === 'fisa' || value === 'documente' || value === 'consultatii' ? value : 'date';
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function formatCode(code?: string | null): string {
  return code ? code.replace(/(\d{3})(?=\d)/g, '$1 ') : '—';
}
