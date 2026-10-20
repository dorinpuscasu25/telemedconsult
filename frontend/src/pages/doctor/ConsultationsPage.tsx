import { DoctorSignature } from '../../components/DoctorSignature';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertCircle, CheckCircle2, Clock, FileText, MessageSquare, Microscope, Stethoscope } from 'lucide-react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { ConsultationVideoButton } from '../../components/ConsultationVideoButton';
import { HigoConsultationProposal } from '../../components/HigoConsultationProposal';
import { ConsultationDocuments } from '../../components/ConsultationDocuments';
import { useAuth } from '../../contexts/AuthContext';
import { apiBlob, apiRequest } from '../../lib/api';
import { dateTime } from '../../lib/format';
import {
  PatientChart,
  type ExamMediaItem,
  type InvestigationSummary,
  type ObjectiveDataEntry,
  type PatientProfileSummary
} from '../../components/PatientChart';

interface ConsultationRequest {
  id: string;
  type: string;
  status: string;
  current_illness_history?: string | null;
  symptoms?: string | null;
  triage_notes?: string | null;
  specialty?: string | null;
  patient?: { id: string; name: string; email: string } | null;
  doctor?: { id: string; name: string } | null;
  amount?: number;
  provider_amount?: number;
  payment_status?: string;
  acceptance_expires_at?: string | null;
  chat_expires_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  scheduled_at?: string | null;
  proposed_scheduled_at?: string | null;
  consultation_kind?: string;
  patient_profile?: PatientProfileSummary | null;
  objective_data?: ObjectiveDataEntry[];
  exam_media?: ExamMediaItem[];
  investigations?: InvestigationSummary[];
  anamnesis_completed_at?: string | null;
  objective_data_completed_at?: string | null;
  ready_for_doctor?: boolean;
  doctor_started_at?: string | null;
  }

export function ConsultationsPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadSequence = useRef(0);
  const openedChart = useRef('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeStatus, setActiveStatus] = useState('new');
  const prescriptionInput = useRef<HTMLInputElement>(null);
  const chartFromExam = useRef(false);
  const [prescription, setPrescription] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [requests, setRequests] = useState<ConsultationRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ConsultationRequest | null>(null);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [chartRequest, setChartRequest] = useState<ConsultationRequest | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const starting = useRef(new Set<string>());
  const [rescheduleRequest, setRescheduleRequest] = useState<ConsultationRequest | null>(null);
  const [proposedTime, setProposedTime] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [examData, setExamData] = useState({
    current_illness_history: '',
    objective_exam: '',
    higo_reviewed: false,
    diagnosis: '',
    treatment_plan: '',
    recommendations: '',
    investigation_recommendations: '',
    prescription_notes: ''
  });

  const invalidateRequests = useCallback(() => { loadSequence.current++; }, []);

  const loadRequests = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const response = await apiRequest<{ data: ConsultationRequest[] }>('/requests');
      if (sequence !== loadSequence.current) return;
      setRequests(response.data);
      setChartRequest((current) => current ? response.data.find((item) => String(item.id) === String(current.id)) ?? null : null);
      setLoadError('');
    } catch (err) {
      if (sequence === loadSequence.current) setLoadError(err instanceof Error ? err.message : 'Nu am putut încărca consultațiile.');
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setRequests([]);
    setChartRequest(null);
    openedChart.current = '';
    void loadRequests();
    const timer = window.setInterval(() => void loadRequests(), 15000);
    const refresh = () => void loadRequests();
    window.addEventListener('focus', refresh);
    return () => { invalidateRequests(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [invalidateRequests, loadRequests, user?.id, role]);

  const openExam = (request: ConsultationRequest) => {
    setSelectedRequest(request);
    setPrescription(null);
    setPreviewUrl('');
    setError('');
    setExamData({
      current_illness_history: request.current_illness_history || '',
      objective_exam: '',
      higo_reviewed: false,
      diagnosis: '',
      treatment_plan: '',
      recommendations: '',
      investigation_recommendations: '',
      prescription_notes: ''
    });
    setIsExamModalOpen(true);
  };

  /**
   * Ca și la operator: erorile serverului trebuie să ajungă la utilizator, iar
   * lista să se reîmprospăteze după fiecare acțiune. Fără asta, un refuz al
   * backendului părea că butonul pur și simplu nu face nimic.
   */
  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setError('');
    setMessage('');

    try {
      await action();
      setMessage(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acțiunea nu a putut fi finalizată.');
    } finally {
      loadRequests();
    }
  };

  const startConsultation = async (request: ConsultationRequest) => {
    if (request.doctor_started_at || starting.current.has(request.id)) return;
    starting.current.add(request.id);
    setStartingId(request.id);
    setError('');
    try {
      const response = await apiRequest<{ request: ConsultationRequest }>(`/requests/${request.id}/start`, { method: 'POST' });
      setRequests((items) => items.map((item) => item.id === request.id ? response.request : item));
      setMessage('Consultația a început. Poți intra în apelul video sau în chat.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut începe consultația.');
    } finally {
      starting.current.delete(request.id);
      setStartingId(null);
    }
  };

  const acceptRequest = async (request: ConsultationRequest) => {
    await runAction(
      () => apiRequest(`/requests/${request.id}/accept`, { method: 'POST' }),
      'Solicitare acceptată.'
    );
  };

  const rejectRequest = async (request: ConsultationRequest) => {
    if (!window.confirm('Respingi solicitarea și returnezi banii pacientului?')) return;
    await runAction(
      () => apiRequest(`/requests/${request.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Solicitare respinsă de medic.' })
      }),
      'Solicitare respinsă, banii au fost returnați.'
    );
  };

  const proposeTime = (request: ConsultationRequest) => {
    setRescheduleRequest(request);
    setProposedTime('');
    setScheduleError('');
  };

  const submitProposedTime = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rescheduleRequest || scheduleSaving) return;
    if (!proposedTime || new Date(proposedTime).getTime() <= Date.now()) {
      setScheduleError('Alege o dată și o oră în viitor.');
      return;
    }
    setScheduleSaving(true);
    setScheduleError('');
    try {
      await apiRequest(`/requests/${rescheduleRequest.id}/propose-time`, {
        method: 'POST',
        body: JSON.stringify({ scheduled_at: new Date(proposedTime).toISOString() })
      });
      setRescheduleRequest(null);
      setMessage('Oră nouă propusă pacientului. Așteptăm confirmarea sa.');
      loadRequests();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Nu am putut propune ora.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const completeRequest = async () => {
    if (!selectedRequest) return;
    setError('');
    setIsSaving(true);
    try {
      await apiRequest(`/requests/${selectedRequest.id}/complete`, {
        method: 'POST',
        body: (() => { const body = new FormData(); Object.entries(examData).forEach(([key, value]) => body.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value)); if (prescription) body.append('prescription', prescription); return body; })()
      });
      setIsExamModalOpen(false);
      loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut finaliza consultația.');
    } finally {
      setIsSaving(false);
    }
  };

  const preview = async () => {
    if (!selectedRequest) return;
    setError(''); setIsSaving(true);
    try { const blob = await apiBlob(`/requests/${selectedRequest.id}/documents/preview`, { method: 'POST', body: JSON.stringify({ ...examData, has_prescription: !!prescription }) }); setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Previzualizarea nu a reușit.'); }
    finally { setIsSaving(false); }
  };
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    const id = searchParams.get('request');
    if (!id || !requests.length) return;
    const item = requests.find((item) => String(item.id) === id);
    if (item) {
      setActiveStatus(['new', 'rescheduled'].includes(item.status) ? 'new' : ['accepted', 'completed'].includes(item.status) ? item.status : 'closed');
      if (searchParams.get('chart') === '1' && openedChart.current !== id) {
        setChartRequest(item);
        openedChart.current = id;
      }
      document.getElementById(`consultation-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [requests, searchParams, activeStatus]);

  const requestInvestigation = async (request: ConsultationRequest) => {
    const title = window.prompt('Ce investigație suplimentară soliciți?');
    if (!title) return;
    const notes = window.prompt('Note pentru pacient/operator (opțional)') || '';
    await runAction(() => apiRequest(`/requests/${request.id}/additional-investigation`, {
      method: 'POST',
      body: JSON.stringify({ title, notes })
    }), 'Investigație suplimentară solicitată.');
  };

  const requestsByStatus = (status: string) => requests.filter((request) => status === 'new' ? ['new', 'rescheduled'].includes(request.status) : status === 'closed' ? !['new', 'rescheduled', 'accepted', 'completed'].includes(request.status) : request.status === status);

  const renderRequestCard = ({ request, index, variant }: { request: ConsultationRequest; index: number; variant: 'new' | 'accepted' | 'completed' | 'closed' }) => {
    // Titularul contului nu e pacientul: consultația e pentru profilul ales la
    // programare, iar numele lui e cel pe care îl caută și operatorul în HIGO.
    const patientName = request.patient_profile?.name || request.patient?.name || 'Pacient';
    const border = variant === 'new' ? 'border-l-amber-500' : variant === 'accepted' ? 'border-l-green-500' : 'border-l-slate-300';
    return (
      <motion.div
        key={request.id} id={`consultation-${request.id}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}>
        <Card className={`glass-card border-l-4 ${border} border-y-0 border-r-0 ${variant === 'completed' || variant === 'closed' ? 'opacity-80' : ''} ${searchParams.get('request') === String(request.id) ? 'ring-2 ring-blue-400' : ''}`}>
          <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start space-x-4">
              <Avatar className="h-12 w-12 bg-primary/10 text-primary">
                <AvatarFallback>{patientName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg text-slate-900"><button type="button" onClick={() => setChartRequest(request)} className="text-left text-blue-700 hover:underline" aria-label={`Deschide fișa pacientului ${patientName}`}>{patientName}</button></h3>
                  {variant === 'new' && <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Nou</Badge>}
                  {variant === 'accepted' && <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200"><Clock className="w-3 h-3 mr-1" /> Activ</Badge>}
                  {variant === 'closed' && <Badge variant="secondary">{{ expired: 'Expirată', cancelled: 'Anulată', rejected: 'Respinsă', no_operator_available: 'Fără operator disponibil' }[request.status] || request.status}</Badge>}
                  {variant === 'completed' && <Badge variant="secondary" className="bg-slate-100 text-slate-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Finalizat</Badge>}
                </div>
                <p className="text-sm text-slate-500 mb-2">
                  {request.specialty || 'Consultație'} · #{request.id} • {dateTime(request.created_at)}
                </p>
                <p className="mb-2 text-xs text-slate-500">{request.patient_profile?.patient_code && `ID pacient: ${request.patient_profile.patient_code} · `}Titular cont: {request.patient?.name || '—'}</p>
                {request.scheduled_at && (
                  <p className="mb-2 text-sm font-medium text-slate-700">
                    {request.status === 'new' ? 'Ora solicitată de pacient' : 'Ora confirmată'}: {dateTime(request.scheduled_at)}
                  </p>
                )}
                {request.proposed_scheduled_at && (
                  <p className="mb-2 text-sm font-medium text-amber-700">
                    Propus: {dateTime(request.proposed_scheduled_at)}
                  </p>
                )}
                <div className="mb-2 flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary" className="rounded-full">
                    {Number(request.amount || 0).toFixed(2)} MDL rezervat
                  </Badge>
                  {request.payment_status && (
                    <Badge variant="outline" className="rounded-full">
                      Plată: {{ held: 'Rezervată', captured: 'Achitată', paid: 'Achitată', refunded: 'Restituită', none: 'Fără cost' }[request.payment_status] || request.payment_status}
                    </Badge>
                  )}
                  {variant === 'new' && request.acceptance_expires_at && (
                    <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                      Răspuns până la {new Date(request.acceptance_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Badge>
                  )}
                </div>
                <p className="text-slate-700 bg-slate-50 p-3 rounded-lg text-sm border border-slate-100 whitespace-pre-wrap">
                  <strong>Acuzele pacientului (plângerile / simptomele): </strong>
                  {request.symptoms || request.triage_notes || 'Fără detalii.'}
                </p>
                {variant === 'closed' && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{request.cancellation_reason || 'Această solicitare este închisă. Fișa și istoricul rămân disponibile.'}</p>}
                {['new', 'accepted'].includes(request.status) && <HigoConsultationProposal requestId={request.id} />}
                {request.status === 'completed' && <ConsultationDocuments requestId={request.id} />}
                {request.current_illness_history && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Istoricul bolii actuale: </strong>{request.current_illness_history}</p>}
                {request.consultation_kind === 'with_exam' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={`rounded-full ${request.objective_data_completed_at ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                      <Activity className="mr-1 h-3 w-3" />
                      Date obiective {request.objective_data_completed_at ? '✓' : 'în așteptare'}
                    </Badge>
                    {(request.objective_data ?? []).some((entry) => entry.from_device) && (
                      <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-sky-700">
                        Aparat HIGO
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto shrink-0">
              <Button onClick={() => setChartRequest(request)} variant="outline" className="rounded-xl">
                <Stethoscope className="mr-2 h-4 w-4" /> Fișa pacientului
              </Button>
              {variant === 'new' && request.status !== 'rescheduled' && (
                <>
                  <Button onClick={() => acceptRequest(request)} className="rounded-xl bg-gradient-to-r from-primary to-purple-600 border-0">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> {request.scheduled_at ? 'Confirmă ora solicitată' : 'Acceptă'}
                  </Button>
                  <Button onClick={() => rejectRequest(request)} variant="outline" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50">
                    Respinge și refund
                  </Button>
                  <Button onClick={() => proposeTime(request)} variant="outline" className="rounded-xl">
                    Propune altă oră
                  </Button>
                  <Button onClick={() => openExam(request)} variant="outline" className="rounded-xl">
                    <FileText className="mr-2 h-4 w-4" /> Finalizează direct
                  </Button>
                </>
              )}
              {request.status === 'rescheduled' && <p className="max-w-64 text-sm text-amber-700">Așteptăm confirmarea pacientului pentru ora propusă.</p>}
              {variant === 'accepted' && (
                <>
                  {request.scheduled_at && !request.doctor_started_at && new Date(request.scheduled_at).getTime() > Date.now() && <p className="max-w-64 text-sm text-slate-500">Poți deschide consultația la {dateTime(request.scheduled_at)}. Pacientul așteaptă să începi.</p>}
                  {request.ready_for_doctor && (
                    <Button
                      disabled={!!request.doctor_started_at || startingId === request.id || !!(request.scheduled_at && new Date(request.scheduled_at).getTime() > Date.now())}
                      onClick={() => startConsultation(request)}
                      variant="outline"
                      className="rounded-xl disabled:opacity-100 disabled:bg-emerald-50 disabled:text-emerald-700 disabled:border-emerald-200">
                      {request.doctor_started_at ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Stethoscope className="mr-2 h-4 w-4" />}
                      {request.doctor_started_at ? 'Consultație începută' : startingId === request.id ? 'Se începe...' : 'Începe consultația'}
                    </Button>
                  )}
                  <Button asChild variant="outline" className="rounded-xl border-primary text-primary hover:bg-primary/5">
                    <Link to={`/doctor/chat?request=${request.id}`}><MessageSquare className="mr-2 h-4 w-4" /> Chat</Link>
                  </Button>
                  <ConsultationVideoButton requestId={request.id} />
                  {request.consultation_kind === 'with_exam' && <Button onClick={() => requestInvestigation(request)} variant="outline" className="rounded-xl">
                    <Microscope className="mr-2 h-4 w-4" /> Cere investigație
                  </Button>}
                  <Button onClick={() => openExam(request)} className="rounded-xl bg-slate-900 text-white">
                    <FileText className="mr-2 h-4 w-4" /> Finalizează
                  </Button>
                  <Button onClick={() => proposeTime(request)} variant="outline" className="rounded-xl">
                    Reprogramează
                  </Button>
                </>
              )}
              {(variant === 'completed' || variant === 'closed') && (
                <Button asChild variant="ghost" className="rounded-xl text-slate-500">
                  <Link to={`/doctor/chat?request=${request.id}`}>Vezi istoric</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Consultații</h1>
        <p className="text-slate-500">Gestionează solicitările reale de la pacienți.</p><Button type="button" variant="outline" className="mt-3" onClick={() => { setIsLoading(true); void loadRequests(); }} disabled={isLoading}>Reîncarcă consultațiile</Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {!isLoading && !loadError && searchParams.get('request') && !requests.some((item) => String(item.id) === searchParams.get('request')) && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Consultația solicitată nu este disponibilă pentru acest cont de medic.</p>}
      {loadError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}
      {isLoading && <p role="status" className="text-sm text-slate-500">Se încarcă consultațiile...</p>}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
      )}

      <Tabs value={activeStatus} onValueChange={(value) => { setActiveStatus(value); const next = new URLSearchParams(searchParams); next.delete('request'); setSearchParams(next, { replace: true }); }} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-white/50 backdrop-blur-sm p-1 rounded-xl mb-6">
          <TabsTrigger value="new" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm relative">
            În așteptare ({requestsByStatus('new').length})
            {requestsByStatus('new').length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
          </TabsTrigger>
          <TabsTrigger value="accepted" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Active ({requestsByStatus('accepted').length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Finalizate ({requestsByStatus('completed').length})
          </TabsTrigger>
          <TabsTrigger value="closed" className="rounded-lg">Închise ({requestsByStatus('closed').length})</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="grid gap-4">
          {requestsByStatus('new').map((request, index) => renderRequestCard({ request, index, variant: 'new' }))}
          {!isLoading && !loadError && requestsByStatus('new').length === 0 && <EmptyState text="Nu există solicitări noi." />}
        </TabsContent>
        <TabsContent value="accepted" className="grid gap-4">
          {requestsByStatus('accepted').map((request, index) => renderRequestCard({ request, index, variant: 'accepted' }))}
          {!isLoading && !loadError && requestsByStatus('accepted').length === 0 && <EmptyState text="Nu există consultații active." />}
        </TabsContent>
        <TabsContent value="completed" className="grid gap-4">
          {requestsByStatus('completed').map((request, index) => renderRequestCard({ request, index, variant: 'completed' }))}
          {!isLoading && !loadError && requestsByStatus('completed').length === 0 && <EmptyState text="Nu există consultații finalizate." />}
        </TabsContent>
        <TabsContent value="closed" className="grid gap-4">
          {requestsByStatus('closed').map((request, index) => renderRequestCard({ request, index, variant: 'closed' }))}
          {!isLoading && !loadError && requestsByStatus('closed').length === 0 && <EmptyState text="Nu există solicitări închise." />}
        </TabsContent>
      </Tabs>

      <Dialog open={!!rescheduleRequest} onOpenChange={(open) => { if (!open && !scheduleSaving) setRescheduleRequest(null); }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Propune altă oră</DialogTitle><DialogDescription>Alege când poți consulta pacientul. Acesta va primi propunerea pentru confirmare.</DialogDescription></DialogHeader>
          <form onSubmit={submitProposedTime} className="space-y-5">
            {rescheduleRequest?.scheduled_at && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Programarea actuală: {dateTime(rescheduleRequest.scheduled_at)}</p>}
            <div className="space-y-2"><Label htmlFor="proposed-time">Data și ora nouă</Label><Input id="proposed-time" type="datetime-local" required value={proposedTime} onChange={(event) => setProposedTime(event.target.value)} disabled={scheduleSaving} /><p className="text-xs text-slate-500">Ora locală: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p></div>
            {scheduleError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{scheduleError}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={scheduleSaving} onClick={() => setRescheduleRequest(null)}>Anulează</Button><Button type="submit" disabled={scheduleSaving || !proposedTime} className="bg-gradient-to-r from-primary to-purple-600">{scheduleSaving ? 'Se trimite...' : 'Trimite propunerea'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isExamModalOpen} onOpenChange={setIsExamModalOpen}>
        <DialogContent className="sm:max-w-[620px] glass-panel border-0 rounded-2xl z-50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Finalizare consultație</DialogTitle>
            <DialogDescription>
              Completează concluzia medicală și verifică PDF-ul înainte de publicare. Pacientul îl va găsi în istoricul consultațiilor.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="py-4 space-y-6">
              {error && <div className="flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mr-2 h-4 w-4" /> {error}</div>}
              <PatientChart
                consultationOnly
                profile={selectedRequest.patient_profile}
                illnessHistory={selectedRequest.current_illness_history}
                symptoms={selectedRequest.symptoms}
                triageNotes={selectedRequest.triage_notes}
                objectiveData={selectedRequest.objective_data}
                examMedia={selectedRequest.exam_media}
                investigations={selectedRequest.investigations}
                anamnesisCompletedAt={selectedRequest.anamnesis_completed_at}
                objectiveDataCompletedAt={selectedRequest.objective_data_completed_at}
              />

              <Button variant="outline" onClick={() => { chartFromExam.current = true; setIsExamModalOpen(false); setChartRequest(selectedRequest); }}>Istoricul vieții și fișa electronică a pacientului</Button>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block space-y-2"><span>Istoricul bolii actuale</span><Textarea value={examData.current_illness_history} onChange={(event) => setExamData({ ...examData, current_illness_history: event.target.value })} /></label>
                  <p className="whitespace-pre-wrap text-sm"><strong>Acuzele pacientului (plângerile / simptomele): </strong>{selectedRequest?.symptoms}</p>
                  <label className="block space-y-2"><span>Examen obiectiv / observațiile medicului</span><Textarea value={examData.objective_exam} onChange={(event) => setExamData({ ...examData, objective_exam: event.target.value })} /></label>
                  {selectedRequest?.consultation_kind === 'with_exam' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={examData.higo_reviewed} onChange={(event) => setExamData({ ...examData, higo_reviewed: event.target.checked })} />Confirm că am examinat datele HIGO disponibile</label>}
                  <Label htmlFor="diagnosis">Diagnostic</Label>
                  <Input
                    id="diagnosis"
                    value={examData.diagnosis}
                    onChange={(event) => setExamData({ ...examData, diagnosis: event.target.value })}
                    placeholder="Ex: Faringită acută"
                    className="rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="treatment_plan">Plan tratament</Label>
                  <Textarea
                    id="treatment_plan"
                    value={examData.treatment_plan}
                    onChange={(event) => setExamData({ ...examData, treatment_plan: event.target.value })}
                    className="rounded-xl min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recommendations">Recomandări</Label>
                  <Textarea
                    id="recommendations"
                    value={examData.recommendations}
                    onChange={(event) => setExamData({ ...examData, recommendations: event.target.value })}
                    className="rounded-xl min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="investigation_recommendations">Investigații recomandate</Label>
                  <Textarea
                    id="investigation_recommendations"
                    maxLength={4000}
                    value={examData.investigation_recommendations}
                    onChange={(event) => setExamData({ ...examData, investigation_recommendations: event.target.value })}
                    placeholder="Analize și investigații recomandate pacientului"
                    className="min-h-[80px] rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prescription-upload">Rețetă scanată / fotografiată</Label><input ref={prescriptionInput} id="prescription-upload" className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024)) { setError('Încarcă rețeta în format PDF, JPG sau PNG, maximum 10 MB.'); event.target.value = ''; setPrescription(null); return; } setPrescription(file); }} />
                  <div className="flex flex-wrap items-center gap-2"><Button variant="outline" type="button" onClick={() => prescriptionInput.current?.click()}>Încarcă rețeta PDF / JPG / PNG</Button>{prescription && <><span className="text-sm">{prescription.name}</span><Button type="button" variant="ghost" onClick={() => { setPrescription(null); if (prescriptionInput.current) prescriptionInput.current.value = ''; }}>Elimină</Button></>}</div>
                  <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Mesaj transmis automat pacientului: Spuneți-ne din ce rețea de farmacii ați luat medicamentul pe rețetă, pentru a transmite rețeta originală în rețeaua respectivă.</p>
                  <Label htmlFor="prescription_notes">Medicamente / rețetă</Label>
                  <Textarea
                    id="prescription_notes"
                    value={examData.prescription_notes}
                    onChange={(event) => setExamData({ ...examData, prescription_notes: event.target.value })}
                    className="rounded-xl min-h-[80px]"
                  />
                </div>
              </div>
            </div>
          )}

          <DoctorSignature onSaved={() => setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return ''; })} />
          {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="font-medium text-blue-700">Deschide previzualizarea PDF</a>}
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setIsExamModalOpen(false)} className="rounded-xl sm:w-auto w-full">
              Anulare
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button onClick={() => navigate(`/doctor/chat?request=${selectedRequest?.id}`)} variant="secondary" className="rounded-xl w-full sm:w-auto">
                <MessageSquare className="h-4 w-4 mr-2" /> Chat
              </Button>
              <Button onClick={preview} disabled={isSaving || !examData.diagnosis} variant="outline">Previzualizează PDF</Button>
              <Button onClick={completeRequest} disabled={isSaving || !examData.diagnosis} className="rounded-xl bg-gradient-to-r from-primary to-purple-600 border-0 w-full sm:w-auto">
                {isSaving ? 'Se publică...' : 'Publică consultația PDF'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(chartRequest)} onOpenChange={(open) => { if (!open) { setChartRequest(null); if (chartFromExam.current) { chartFromExam.current = false; setIsExamModalOpen(true); } } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Fișa pacientului — {chartRequest?.patient_profile?.name || chartRequest?.patient?.name}</DialogTitle>
            <DialogDescription>
              Consultația #{chartRequest?.id} · Titular cont: {chartRequest?.patient?.name || '—'}. Datele de mai jos aparțin pacientului selectat.
            </DialogDescription>
          </DialogHeader>

          {chartRequest && (
            <div className="py-2">
              <PatientChart
                profile={chartRequest.patient_profile}
                illnessHistory={chartRequest.current_illness_history}
                symptoms={chartRequest.symptoms}
                triageNotes={chartRequest.triage_notes}
                objectiveData={chartRequest.objective_data}
                examMedia={chartRequest.exam_media}
                investigations={chartRequest.investigations}
                anamnesisCompletedAt={chartRequest.anamnesis_completed_at}
                objectiveDataCompletedAt={chartRequest.objective_data_completed_at}
              />
            </div>
          )}

          <DialogFooter>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to={`/doctor/chat?request=${chartRequest?.id}`}>
                <MessageSquare className="mr-2 h-4 w-4" /> Întreabă pacientul
              </Link>
            </Button>
            {chartRequest?.ready_for_doctor && (
              <Button
                onClick={() => {
                  const request = chartRequest;
                  setChartRequest(null);
                  openExam(request);
                }}
                className="rounded-xl bg-slate-900 text-white">
                <FileText className="mr-2 h-4 w-4" /> Finalizează
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="glass-card border-0">
      <CardContent className="p-8 text-center text-slate-500">{text}</CardContent>
    </Card>
  );
}
