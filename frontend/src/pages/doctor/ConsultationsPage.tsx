import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, CheckCircle2, Clock, FileText, MessageSquare, Microscope, Stethoscope, Video } from 'lucide-react';
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
import { apiRequest } from '../../lib/api';
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
  const [requests, setRequests] = useState<ConsultationRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ConsultationRequest | null>(null);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [chartRequest, setChartRequest] = useState<ConsultationRequest | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [examData, setExamData] = useState({
    diagnosis: '',
    treatment_plan: '',
    recommendations: '',
    prescription_notes: ''
  });

  const loadRequests = () => {
    apiRequest<{data: ConsultationRequest[]}>('/requests').then((response) => {
      setRequests(response.data);
    });
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const openExam = (request: ConsultationRequest) => {
    setSelectedRequest(request);
    setError('');
    setExamData({
      diagnosis: '',
      treatment_plan: '',
      recommendations: '',
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
    await runAction(
      () => apiRequest(`/requests/${request.id}/start`, { method: 'POST' }),
      'Consultație pornită. Chatul cu pacientul este deschis.'
    );
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

  const proposeTime = async (request: ConsultationRequest) => {
    const value = window.prompt('Propune o dată/oră nouă (format: YYYY-MM-DD HH:mm)');
    if (!value) return;
    await runAction(
      () => apiRequest(`/requests/${request.id}/propose-time`, {
        method: 'POST',
        body: JSON.stringify({ scheduled_at: value.replace(' ', 'T') })
      }),
      'Oră nouă propusă pacientului.'
    );
  };

  const completeRequest = async () => {
    if (!selectedRequest) return;
    setError('');
    setIsSaving(true);
    try {
      await apiRequest(`/requests/${selectedRequest.id}/complete`, {
        method: 'POST',
        body: JSON.stringify(examData)
      });
      setIsExamModalOpen(false);
      loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut finaliza consultația.');
    } finally {
      setIsSaving(false);
    }
  };

  const addMeetLink = async (request: ConsultationRequest) => {
    const meetLink = window.prompt('Lipește linkul Google Meet');
    if (!meetLink) return;
    await runAction(() => apiRequest(`/requests/${request.id}/meet-link`, {
      method: 'POST',
      body: JSON.stringify({ meet_link: meetLink, scheduled_at: request.scheduled_at || null })
    }), 'Link Meet adăugat.');
  };

  const requestInvestigation = async (request: ConsultationRequest) => {
    const title = window.prompt('Ce investigație suplimentară soliciți?');
    if (!title) return;
    const notes = window.prompt('Note pentru pacient/operator (opțional)') || '';
    await runAction(() => apiRequest(`/requests/${request.id}/additional-investigation`, {
      method: 'POST',
      body: JSON.stringify({ title, notes })
    }), 'Investigație suplimentară solicitată.');
  };

  const requestsByStatus = (status: string) => requests.filter((request) => status === 'new' ? ['new', 'rescheduled'].includes(request.status) : request.status === status);

  const RequestCard = ({ request, index, variant }: { request: ConsultationRequest; index: number; variant: 'new' | 'accepted' | 'completed' }) => {
    // Titularul contului nu e pacientul: consultația e pentru profilul ales la
    // programare, iar numele lui e cel pe care îl caută și operatorul în HIGO.
    const patientName = request.patient_profile?.name || request.patient?.name || 'Pacient';
    const border = variant === 'new' ? 'border-l-amber-500' : variant === 'accepted' ? 'border-l-green-500' : 'border-l-slate-300';
    return (
      <motion.div
        key={request.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}>
        <Card className={`glass-card border-l-4 ${border} border-y-0 border-r-0 ${variant === 'completed' ? 'opacity-80' : ''}`}>
          <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start space-x-4">
              <Avatar className="h-12 w-12 bg-primary/10 text-primary">
                <AvatarFallback>{patientName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg text-slate-900">{patientName}</h3>
                  {variant === 'new' && <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Nou</Badge>}
                  {variant === 'accepted' && <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200"><Clock className="w-3 h-3 mr-1" /> Activ</Badge>}
                  {variant === 'completed' && <Badge variant="secondary" className="bg-slate-100 text-slate-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Finalizat</Badge>}
                </div>
                <p className="text-sm text-slate-500 mb-2">
                  {request.specialty || 'Consultație'} • {dateTime(request.created_at)}
                </p>
                {request.scheduled_at && (
                  <p className="mb-2 text-sm font-medium text-slate-700">
                    Programat: {dateTime(request.scheduled_at)}
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
                      Plată: {request.payment_status}
                    </Badge>
                  )}
                  {variant === 'new' && request.acceptance_expires_at && (
                    <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                      Răspuns până la {new Date(request.acceptance_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Badge>
                  )}
                </div>
                <p className="text-slate-700 bg-slate-50 p-3 rounded-lg text-sm border border-slate-100 whitespace-pre-wrap">
                  {request.symptoms || request.triage_notes || 'Fără detalii.'}
                </p>
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
              {variant === 'new' && (
                <>
                  <Button onClick={() => acceptRequest(request)} className="rounded-xl bg-gradient-to-r from-primary to-purple-600 border-0">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Acceptă
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
              {variant === 'accepted' && (
                <>
                  {request.ready_for_doctor && !request.doctor_started_at && (
                    <Button
                      onClick={() => startConsultation(request)}
                      className="rounded-xl bg-gradient-to-r from-primary to-purple-600 border-0">
                      <Stethoscope className="mr-2 h-4 w-4" /> Începe consultația
                    </Button>
                  )}
                  <Button asChild variant="outline" className="rounded-xl border-primary text-primary hover:bg-primary/5">
                    <Link to="/doctor/chat"><MessageSquare className="mr-2 h-4 w-4" /> Chat</Link>
                  </Button>
                  {(request.consultation_kind === 'video' || request.type === 'video') && (
                    <Button onClick={() => addMeetLink(request)} variant="outline" className="rounded-xl">
                      <Video className="mr-2 h-4 w-4" /> Adaugă link Meet
                    </Button>
                  )}
                  <Button onClick={() => requestInvestigation(request)} variant="outline" className="rounded-xl">
                    <Microscope className="mr-2 h-4 w-4" /> Cere investigație
                  </Button>
                  <Button onClick={() => openExam(request)} className="rounded-xl bg-slate-900 text-white">
                    <FileText className="mr-2 h-4 w-4" /> Finalizează
                  </Button>
                  <Button onClick={() => proposeTime(request)} variant="outline" className="rounded-xl">
                    Reprogramează
                  </Button>
                </>
              )}
              {variant === 'completed' && (
                <Button asChild variant="ghost" className="rounded-xl text-slate-500">
                  <Link to="/doctor/chat">Vezi istoric</Link>
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
        <p className="text-slate-500">Gestionează solicitările reale de la pacienți.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
      )}

      <Tabs defaultValue="new" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 bg-white/50 backdrop-blur-sm p-1 rounded-xl mb-6">
          <TabsTrigger value="new" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm relative">
            În Așteptare
            {requestsByStatus('new').length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
          </TabsTrigger>
          <TabsTrigger value="accepted" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Active
          </TabsTrigger>
          <TabsTrigger value="completed" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Finalizate
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="grid gap-4">
          {requestsByStatus('new').map((request, index) => <RequestCard key={request.id} request={request} index={index} variant="new" />)}
          {requestsByStatus('new').length === 0 && <EmptyState text="Nu există solicitări noi." />}
        </TabsContent>
        <TabsContent value="accepted" className="grid gap-4">
          {requestsByStatus('accepted').map((request, index) => <RequestCard key={request.id} request={request} index={index} variant="accepted" />)}
          {requestsByStatus('accepted').length === 0 && <EmptyState text="Nu există consultații active." />}
        </TabsContent>
        <TabsContent value="completed" className="grid gap-4">
          {requestsByStatus('completed').map((request, index) => <RequestCard key={request.id} request={request} index={index} variant="completed" />)}
          {requestsByStatus('completed').length === 0 && <EmptyState text="Nu există consultații finalizate." />}
        </TabsContent>
      </Tabs>

      <Dialog open={isExamModalOpen} onOpenChange={setIsExamModalOpen}>
        <DialogContent className="sm:max-w-[620px] glass-panel border-0 rounded-2xl z-50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Finalizare consultație</DialogTitle>
            <DialogDescription>
              Datele se salvează în backend și se creează document medical cu payload FHIR.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="py-4 space-y-6">
              {error && <div className="flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mr-2 h-4 w-4" /> {error}</div>}
              <PatientChart
                profile={selectedRequest.patient_profile}
                symptoms={selectedRequest.symptoms}
                triageNotes={selectedRequest.triage_notes}
                objectiveData={selectedRequest.objective_data}
                examMedia={selectedRequest.exam_media}
                investigations={selectedRequest.investigations}
                anamnesisCompletedAt={selectedRequest.anamnesis_completed_at}
                objectiveDataCompletedAt={selectedRequest.objective_data_completed_at}
              />

              <div className="space-y-4">
                <div className="space-y-2">
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

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setIsExamModalOpen(false)} className="rounded-xl sm:w-auto w-full">
              Anulare
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button onClick={() => navigate('/doctor/chat')} variant="secondary" className="rounded-xl w-full sm:w-auto">
                <MessageSquare className="h-4 w-4 mr-2" /> Chat
              </Button>
              <Button onClick={completeRequest} disabled={isSaving || !examData.diagnosis} className="rounded-xl bg-gradient-to-r from-primary to-purple-600 border-0 w-full sm:w-auto">
                {isSaving ? 'Se salvează...' : 'Finalizează'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(chartRequest)} onOpenChange={(open) => !open && setChartRequest(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Fișa pacientului</DialogTitle>
            <DialogDescription>
              Ce a declarat pacientul și ce a măsurat operatorul la domiciliu.
            </DialogDescription>
          </DialogHeader>

          {chartRequest && (
            <div className="py-2">
              <PatientChart
                profile={chartRequest.patient_profile}
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
              <Link to="/doctor/chat">
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
