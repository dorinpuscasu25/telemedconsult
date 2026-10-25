import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, CheckCircle2, MapPin, Search, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { ListSkeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PageHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { ToneBadge } from '../../components/app/StatusBadge';
import { ConsultationComplaintFields } from '../../components/ConsultationComplaintFields';
import { apiRequest } from '../../lib/api';

interface Operator {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  region?: string | null;
  equipment: string[];
  is_available: boolean;
  exam_price: number;
}

interface PatientProfile {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  patient_code?: string | null;
  region?: string | null;
  locality?: string | null;
  status?: string | null;
  active_until?: string | null;
  can_request_consultation?: boolean;
}

export function OperatorsList() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [patientProfiles, setPatientProfiles] = useState<PatientProfile[]>([]);
  const [patientProfileId, setPatientProfileId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [illnessHistory, setIllnessHistory] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiRequest<{data: Operator[]}>('/catalog/operators', { auth: false })
      .then((response) => setOperators(response.data ?? []))
      .catch(() => setOperators([]))
      .finally(() => setIsLoading(false));
    apiRequest<{patient_profiles: PatientProfile[]}>('/patient/profile')
      .then((response) => {
        const profiles = response.patient_profiles ?? [];
        const requestableProfiles = profiles.filter(canRequestConsultation);
        setPatientProfiles(profiles);
        setPatientProfileId(requestableProfiles[0]?.id ? String(requestableProfiles[0].id) : '');
      })
      .catch(() => undefined);
  }, []);

  const filteredOperators = useMemo(() => operators.filter((operator) => {
    const haystack = `${operator.name} ${operator.region || ''}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  }), [operators, searchTerm]);

  const openDialog = (operator: Operator) => {
    const requestableProfiles = patientProfiles.filter(canRequestConsultation);
    setSelectedOperator(operator);
    setPatientProfileId(requestableProfiles[0]?.id ? String(requestableProfiles[0].id) : '');
    setAddress('');
    setPhone(operator.phone || '');
    setNotes('');
    setIllnessHistory('');
    setSymptoms('');
    setScheduledAt('');
    setError('');
    setIsSuccess(false);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setSelectedOperator(null);
    setIsSuccess(false);
    setError('');
  };

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOperator) return;
    if (!patientProfileId) {
      setError('Alege un profil de pacient activ înainte de confirmare.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const response = await apiRequest<{conversation?: { id: number }}>('/requests', {
        method: 'POST',
        body: JSON.stringify({
          type: 'operator',
          operator_id: selectedOperator.id,
          patient_profile_id: Number(patientProfileId),
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          current_illness_history: illnessHistory,
          symptoms,
          triage_notes: `Adresă: ${address}\nTelefon: ${phone}\nDetalii pentru operator: ${notes || 'Nespecificat'}`
        })
      });
      if (response.conversation?.id) {
        toast.success(`Cererea a fost trimisă către ${selectedOperator.name}.`, { description: 'Te anunțăm când operatorul confirmă vizita.' });
        navigate(`/patient/chat?conversation=${response.conversation.id}`);
        return;
      }
      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite solicitarea.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestableProfiles = patientProfiles.filter(canRequestConsultation);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinare la domiciliu"
        description="Un operator vine la pacient, face măsurătorile cu aparatul HIGO, iar rezultatele ajung la medic."
      />

      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ['Alegi operatorul', 'din regiunea pacientului'],
          ['Operatorul vine acasă', 'la ora stabilită împreună'],
          ['Rezultatele ajung la medic', 'și le găsești în consultații']
        ].map(([title, detail], index) => (
          <li key={title} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
            <span><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="block text-xs text-slate-500">{detail}</span></span>
          </li>
        ))}
      </ol>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Caută după nume sau regiune" aria-label="Caută operator" className="h-12 pl-10" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
      </div>

      {isLoading ? <ListSkeleton rows={3} /> : filteredOperators.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={operators.length === 0 ? 'Niciun operator disponibil momentan' : 'Niciun operator în această zonă'}
          description={operators.length === 0 ? 'Operatorii apar aici după ce sunt verificați. Revino puțin mai târziu.' : 'Încearcă alt nume sau altă regiune.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredOperators.map((operator) => (
            <article key={operator.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <Avatar className="size-12 shrink-0"><AvatarFallback className="bg-primary/10 font-semibold text-primary">{operator.name.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('')}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-slate-950">{operator.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" />{operator.region || 'Regiune nesetată'}</p>
                </div>
                <ToneBadge tone={operator.is_available ? 'success' : 'neutral'}>{operator.is_available ? 'Disponibil' : 'Ocupat'}</ToneBadge>
              </div>
              {operator.equipment.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {operator.equipment.map((item) => <Badge key={item} variant="secondary" className="bg-slate-100 text-xs text-slate-600">{item}</Badge>)}
                </div>
              )}
              <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                <p className="text-sm text-slate-500">Examinare <strong className="tabular block text-base text-slate-950">{operator.exam_price} MDL</strong></p>
                <Button onClick={() => openDialog(operator)} disabled={!operator.is_available}>Solicită</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && !isSubmitting && closeDialog()}>
        <DialogContent className="flex max-h-[min(92dvh,860px)] flex-col gap-0 p-0 sm:max-w-[560px] sm:p-0">
          {selectedOperator && !isSuccess && (
            <form onSubmit={handleRequest} className="flex min-h-0 flex-1 flex-col">
              <DialogHeader className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-5 sm:px-6">
                <DialogTitle>Solicită examinarea</DialogTitle>
                <DialogDescription>{selectedOperator.name}{selectedOperator.region ? ` · ${selectedOperator.region}` : ''}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
                {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-slate-900">Pentru cine?</legend>
                  {requestableProfiles.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {requestableProfiles.map((profile) => {
                        const selected = patientProfileId === String(profile.id);
                        return (
                          <button key={profile.id} type="button" role="radio" aria-checked={selected} onClick={() => setPatientProfileId(String(profile.id))} className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition', selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200 hover:border-slate-300')}>
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><UserRound className="h-4 w-4" /></span>
                            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-900">{patientProfileName(profile)}</span>{profile.region && <span className="block truncate text-xs text-slate-500">{profile.region}</span>}</span>
                            {selected && <Check className="h-4 w-4 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="font-semibold text-slate-900">Adaugă mai întâi pacientul</p>
                      <p className="mt-1">Examinarea se face pentru un profil de pacient activ. Îl adaugi din „Pacienții mei”.</p>
                      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigate('/patient/profile')}>Deschide Pacienții mei</Button>
                    </div>
                  )}
                </fieldset>

                <fieldset className="space-y-4">
                  <legend className="mb-2 text-sm font-semibold text-slate-900">Unde și când?</legend>
                  <div className="space-y-2">
                    <Label htmlFor="address">Adresa completă</Label>
                    <Input id="address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Strada, numărul, blocul, apartamentul" autoComplete="street-address" required />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefon de contact</Label>
                      <Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+373 6X XXX XXX" autoComplete="tel" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="operator_scheduled_at">Data și ora preferată</Label>
                      <Input id="operator_scheduled_at" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Indicații de acces <span className="font-normal text-slate-400">(opțional)</span></Label>
                    <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Etaj, cod interfon, unde se parchează…" maxLength={2000} className="min-h-[72px]" />
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-slate-900">Ce vă supără?</legend>
                  <ConsultationComplaintFields history={illnessHistory} symptoms={symptoms} onHistoryChange={setIllnessHistory} onSymptomsChange={setSymptoms} />
                </fieldset>
              </div>
              <DialogFooter className="shrink-0 border-t border-slate-100 px-5 py-3 sm:px-6">
                <Button type="button" variant="ghost" onClick={closeDialog}>Renunță</Button>
                <Button type="submit" disabled={isSubmitting || !patientProfileId}>{isSubmitting ? 'Se trimite…' : `Confirmă și achită ${selectedOperator.exam_price} MDL`}</Button>
              </DialogFooter>
            </form>
          )}

          {selectedOperator && isSuccess && (
            <div className="px-6 py-10 text-center">
              <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-9 w-9" /></span>
              <h2 className="text-2xl font-bold text-slate-950">Cerere trimisă</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{selectedOperator.name} confirmă vizita. Te anunțăm imediat, iar discuția e deja deschisă în Mesaje.</p>
              <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => navigate('/patient/consultations')}>Vezi consultațiile mele</Button>
                <Button onClick={() => navigate('/patient/chat')}>Deschide mesajele</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function patientProfileName(profile: PatientProfile) {
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || `Profil #${profile.id}`;
}

function canRequestConsultation(profile: PatientProfile) {
  if (typeof profile.can_request_consultation === 'boolean') return profile.can_request_consultation;
  if (profile.status && profile.status !== 'active') return false;
  if (profile.active_until && new Date(profile.active_until).getTime() <= Date.now()) return false;

  return Boolean(profile.first_name && profile.last_name);
}
