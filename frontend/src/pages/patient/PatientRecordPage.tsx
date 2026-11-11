import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Info } from 'lucide-react';
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
  const isDesktop = useIsDesktop();
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

  const age = profile.birth_date ? patientAge(profile.birth_date) : null;
  const closeSection = () => setParam({ section: null });
  const menu = <MoreMenu items={[{ label: 'Exportă datele', onSelect: () => void exportProfile() }, { label: 'Șterge profilul', onSelect: () => void deleteProfile(), danger: true }]} />;
  const editor = sectionOpen && openSection
    ? <SectionEditor key={openSection} profileId={profile.id} sectionKey={openSection} record={record} patientName={name} birthDate={profile.birth_date} onRecordChange={setRecord} onClose={closeSection}
        footer={isDesktop ? undefined : <button type="button" onClick={closeSection} className="h-12 w-full rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700">Gata</button>} />
    : null;

  return (
    // Pagina ocupă toată lățimea: antetul alb sus, apoi conținutul (D2a / D2b).
    <div className="-mx-4 -mb-28 -mt-5 flex min-h-[calc(100dvh-72px)] flex-col lg:-mx-8 lg:-mb-10 lg:-mt-7 lg:min-h-[calc(100dvh-64px)]">
      <div className="border-b border-slate-200 bg-white lg:px-8 lg:pt-7">
        {/* Telefon */}
        <div className="flex items-center gap-2 px-2 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))] lg:hidden">
          <Link to="/patient/profile" aria-label="Pacienții mei" className="grid h-10 w-10 shrink-0 place-items-center text-slate-700"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-[13px] font-semibold text-blue-700">{initials(name)}</span>
          <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-base font-semibold text-slate-950">{name}</span><span className="truncate text-xs text-slate-500">{age ? `${age} · ` : ''}<span className="font-mono">{formatCode(profile.patient_code)}</span></span></span>
          {menu}
        </div>
        {/* Desktop */}
        <div className="hidden items-center gap-3.5 pb-4 lg:flex">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700">{initials(name)}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-[22px] font-bold tracking-tight text-slate-950">{name}</span><span className="text-[13px] text-slate-500">{age ? `${age} · ` : ''}Cod pacient <span className="font-mono">{formatCode(profile.patient_code)}</span></span></span>
          {menu}
        </div>
        <nav className="flex justify-between whitespace-nowrap px-2 lg:justify-start lg:gap-1 lg:px-0" aria-label="Secțiunile pacientului">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setParam({ tab: key === 'date' ? null : key, section: null })} aria-current={tab === key ? 'page' : undefined}
              className={cn('flex h-10 items-center px-1.5 text-[13px] lg:px-3 lg:text-sm', tab === key ? 'font-semibold text-slate-950 shadow-[inset_0_-2px_0_#2563EB]' : 'text-slate-500 hover:text-slate-900')}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 p-4 lg:px-8 lg:py-6">
          {tab === 'fisa' && (
            <div className="flex flex-col gap-3 lg:gap-3.5">
              <p className="flex items-center gap-2.5 rounded-xl bg-blue-50 px-3.5 py-3 text-[13px] text-blue-900 lg:hidden"><Info className="h-4 w-4 shrink-0" />Medicul vede această fișă la fiecare consultație.</p>
              <div className="flex items-center justify-between px-0.5 py-1 lg:hidden">
                <span className="text-sm font-semibold text-slate-950">{done} din {MEDICAL_SECTIONS.length} secțiuni</span>
                <span className="h-1.5 w-[140px] overflow-hidden rounded-[3px] bg-slate-200"><span className="block h-full bg-green-600" style={{ width: `${(done / MEDICAL_SECTIONS.length) * 100}%` }} /></span>
              </div>
              <div className="hidden items-center justify-between lg:flex">
                <span className="flex items-center gap-2 text-[13px] text-blue-900"><Info className="h-4 w-4" />Medicul vede această fișă la fiecare consultație.</span>
                <span className="text-[13px] font-semibold text-slate-950">{done} din {MEDICAL_SECTIONS.length}</span>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {MEDICAL_SECTIONS.map((section, index) => {
                  const state = sectionState(record, section.key);
                  const active = openSection === section.key;
                  const badge = STATE_BADGE[state];
                  return (
                    <li key={section.key} className={cn(index > 0 && 'border-t border-slate-100')}>
                      <button type="button" onClick={() => setParam({ section: section.key })}
                        className={cn('flex w-full items-center gap-3 p-3.5 text-left hover:bg-slate-50 lg:px-4 lg:py-[13px]', active && 'lg:bg-blue-50 lg:shadow-[inset_3px_0_0_#2563EB] lg:hover:bg-blue-50')}>
                        <StateMark state={state} />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-[15px] font-medium text-slate-950 lg:text-sm">{section.title}</span>
                          <span className={cn('truncate text-xs', state === 'empty' ? 'text-slate-400' : 'text-slate-500')}>{sectionSummary(record, section.key)}</span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 lg:hidden" />
                        <span className={cn('hidden shrink-0 rounded-full px-[9px] py-[3px] text-xs font-semibold lg:inline', badge.className)}>{badge.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {tab === 'date' && <div className="-m-4 bg-white p-5 lg:m-0 lg:rounded-2xl lg:border lg:border-slate-200 lg:p-6"><PersonalDataForm key={profile.id} profile={profile} regions={regions} onSaved={() => void loadProfile()} /></div>}
          {tab === 'documente' && <div><DocumentsPanel profileId={profile.id} documents={documents} onChanged={() => void loadRecord()} /></div>}
          {tab === 'consultatii' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-6">
              <PatientMedicalRecord profile={profile} regions={regions} only="consultations" requestedConsultationId={searchParams.get('request')} onSaved={() => void loadRecord()} onDirtyChange={() => undefined} />
            </div>
          )}
        </div>

        {/* D2b: pe desktop editorul stă lângă listă. */}
        {isDesktop && editor && <aside className="flex w-[420px] shrink-0 flex-col border-l border-slate-200 bg-white" aria-label="Editor secțiune">{editor}</aside>}
      </div>

      {/* D3: pe telefon editorul ocupă tot ecranul. */}
      {!isDesktop && (
        <Sheet open={sectionOpen} onOpenChange={(open) => { if (!open) closeSection(); }}>
          <SheetContent side="right" className="w-full max-w-none gap-0 overflow-hidden border-0 p-0 sm:max-w-none [&>button:last-child]:hidden">
            <SheetTitle className="sr-only">{MEDICAL_SECTIONS.find((section) => section.key === openSection)?.title ?? 'Secțiune'}</SheetTitle>
            <SheetDescription className="sr-only">Se salvează automat.</SheetDescription>
            {editor}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

const STATE_BADGE: Record<SectionState, { label: string; className: string }> = {
  done: { label: 'Completată', className: 'bg-green-50 text-green-700' },
  nothing: { label: 'Nimic de raportat', className: 'bg-slate-100 text-slate-600' },
  empty: { label: 'Necompletată', className: 'bg-white text-slate-500' }
};

function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return desktop;
}

function StateMark({ state }: { state: SectionState }) {
  if (state === 'done') return <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-green-600 text-[13px] font-bold text-white" aria-label="Completată">✓</span>;
  if (state === 'nothing') return <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-slate-200 text-[13px] font-bold text-slate-600" aria-label="Nimic de raportat">✓</span>;
  return <span className="h-[26px] w-[26px] shrink-0 rounded-full border-[1.5px] border-dashed border-slate-300 bg-white" aria-label="Necompletată" />;
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
