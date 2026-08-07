import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { CheckCircle2, MapPin, MessageSquare, Phone, PlusCircle, Send, Stethoscope, XCircle } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { ObjectiveDataForm, toObjectivePayload } from '../../components/ObjectiveDataForm';
import { dateTime } from '../../lib/format';

interface CostLine {
  id: number;
  name: string;
  requirement: string;
  price: number;
}

interface RequestItem {
  id: string;
  type: string;
  status: string;
  consultation_kind?: string;
  symptoms?: string | null;
  triage_notes?: string | null;
  objective_data_completed_at?: string | null;
  patient?: { id: string; name: string; email: string } | null;
  patient_profile?: { name?: string; patient_code?: string | null; region?: string | null; locality?: string | null; address?: string | null } | null;
  doctor?: { id: string; name: string } | null;
  operator?: { id: string; name: string } | null;
  amount?: number;
  provider_amount?: number;
  payment_status?: string;
  pricing_snapshot?: { cost_breakdown?: { investigations?: CostLine[]; travel_fee?: number } } | null;
  acceptance_expires_at?: string | null;
  scheduled_at?: string | null;
  proposed_scheduled_at?: string | null;
  created_at: string;
}

interface Doctor {
  id: string;
  name: string;
  specialty?: string | null;
}

export function RequestsPage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isObjectiveModalOpen, setIsObjectiveModalOpen] = useState(false);
  const [isAddonModalOpen, setIsAddonModalOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [completeData, setCompleteData] = useState({
    diagnosis: '',
    recommendations: ''
  });
  const [objectiveValues, setObjectiveValues] = useState<Record<string, string>>({});
  const [objectiveError, setObjectiveError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const hasObjectiveValues = Object.values(objectiveValues).some((entry) => (entry ?? '').trim() !== '');
  const [addonForm, setAddonForm] = useState({ name: '', amount: 50 });
  const [isSaving, setIsSaving] = useState(false);

  const loadRequests = () => {
    apiRequest<{data: RequestItem[]}>('/requests')
      .then((response) => {
        setRequests(response.data ?? []);
      })
      .catch(() => setRequests([]));
  };

  useEffect(() => {
    loadRequests();
    apiRequest<{data: Doctor[]}>('/catalog/doctors', { auth: false })
      .then((response) => setDoctors(response.data ?? []))
      .catch(() => setDoctors([]));
  }, []);

  const openAccept = (request: RequestItem) => {
    setSelectedRequest(request);
    setNotes('');
    setIsAcceptModalOpen(true);
  };

  const openForward = (request: RequestItem) => {
    setSelectedRequest(request);
    setNotes(request.triage_notes || '');
    setSelectedDoctor('');
    setIsForwardModalOpen(true);
  };

  const openComplete = (request: RequestItem) => {
    setSelectedRequest(request);
    setCompleteData({ diagnosis: '', recommendations: '' });
    setIsCompleteModalOpen(true);
  };

  const openObjective = (request: RequestItem) => {
    setSelectedRequest(request);
    setObjectiveValues({});
    setObjectiveError('');
    setIsObjectiveModalOpen(true);
  };

  const openAddon = (request: RequestItem) => {
    setSelectedRequest(request);
    setAddonForm({ name: '', amount: 50 });
    setIsAddonModalOpen(true);
  };

  /**
   * Toate acțiunile trec pe aici: erorile de la server devin vizibile, iar lista
   * se reîmprospătează întotdeauna. Înainte, fiecare handler avea doar `finally`,
   * așa că un refuz al backendului (de exemplu „examinarea nu e gata”) dispărea
   * fără urmă și părea că butonul nu face nimic.
   */
  const runAction = async (action: () => Promise<unknown>, successMessage: string, onDone?: () => void) => {
    setActionError('');
    setActionMessage('');
    setIsSaving(true);

    try {
      await action();
      setActionMessage(successMessage);
      onDone?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Acțiunea nu a putut fi finalizată.');
    } finally {
      setIsSaving(false);
      loadRequests();
    }
  };

  const acceptRequest = async () => {
    if (!selectedRequest) return;
    await runAction(
      () => apiRequest(`/requests/${selectedRequest.id}/accept`, { method: 'POST' }),
      'Examinare preluată. Pacientul a fost anunțat.',
      () => setIsAcceptModalOpen(false)
    );
  };

  const rejectRequest = async (request: RequestItem) => {
    if (!window.confirm('Respingi solicitarea? Va fi reatribuită altui operator sau anulată cu refund.')) return;
    await runAction(
      () => apiRequest(`/requests/${request.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Solicitare respinsă de operator.' })
      }),
      'Solicitare respinsă.'
    );
  };

  const proposeTime = async (request: RequestItem) => {
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
    await runAction(
      () => apiRequest(`/requests/${selectedRequest.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          diagnosis: completeData.diagnosis,
          recommendations: completeData.recommendations,
          treatment_plan: notes || null
        })
      }),
      'Consultație finalizată.',
      () => setIsCompleteModalOpen(false)
    );
  };

  const completeExamination = async (request: RequestItem) => {
    if (!window.confirm('Confirmi că ai terminat examinarea? Datele din aparat se atașează automat când sosesc.')) return;

    await runAction(
      () => apiRequest(`/requests/${request.id}/examination-done`, { method: 'POST' }),
      'Examinare finalizată. Datele din aparat se atașează automat când sosesc.'
    );
  };

  const forwardRequest = async () => {
    if (!selectedRequest || !selectedDoctor) return;
    await runAction(
      () => apiRequest(`/requests/${selectedRequest.id}/forward-to-doctor`, {
        method: 'POST',
        body: JSON.stringify({ doctor_id: selectedDoctor, triage_notes: notes })
      }),
      'Datele au fost transmise medicului.',
      () => setIsForwardModalOpen(false)
    );
  };

  const saveObjectiveData = async () => {
    if (!selectedRequest) return;
    setObjectiveError('');
    setIsSaving(true);
    try {
      await apiRequest(`/requests/${selectedRequest.id}/objective-data`, {
        method: 'POST',
        body: JSON.stringify({
          source: 'manual_operator',
          payload: toObjectivePayload(objectiveValues)
        })
      });
      setIsObjectiveModalOpen(false);
      setObjectiveValues({});
      loadRequests();
    } catch (err) {
      setObjectiveError(err instanceof Error ? err.message : 'Nu am putut salva datele.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveAddon = async () => {
    if (!selectedRequest) return;
    setIsSaving(true);
    try {
      await apiRequest(`/requests/${selectedRequest.id}/add-on-service`, {
        method: 'POST',
        body: JSON.stringify(addonForm)
      });
      setIsAddonModalOpen(false);
      loadRequests();
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Coloanele urmăresc etapa OPERATORULUI, nu statusul global al consultației.
   * După ce examinarea e finalizată, munca lui s-a încheiat — cazul rămâne
   * deschis la medic, dar nu mai are ce face operatorul cu el.
   */
  const byStage = (stage: 'new' | 'active' | 'done') =>
    requests.filter((request) => {
      if (['cancelled', 'rejected', 'expired'].includes(request.status)) return false;
      if (stage === 'new') return ['new', 'rescheduled'].includes(request.status);
      if (stage === 'done') return Boolean(request.objective_data_completed_at) || request.status === 'completed';

      return request.status === 'accepted' && !request.objective_data_completed_at;
    });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Solicitări Examinare</h1>
        <p className="text-slate-500">Gestionează cererile reale de examinare clinică la domiciliu.</p>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>
      )}
      {actionMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{actionMessage}</div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Column
          title="Noi"
          dot="bg-amber-500"
          requests={byStage('new')}
          empty="Nu există solicitări noi."
          render={(request, index) => (
            <RequestCard key={request.id} request={request} index={index} tone="amber">
              <Button className="w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => openAccept(request)}>
                Preluare caz
              </Button>
              <Button variant="outline" className="w-full rounded-xl border-red-200 text-red-600 hover:bg-red-50" onClick={() => rejectRequest(request)}>
                <XCircle className="h-4 w-4 mr-2" /> Respinge și refund
              </Button>
            </RequestCard>
          )}
        />

        <Column
          title="În desfășurare"
          dot="bg-blue-500"
          requests={byStage('active')}
          empty="Nu există solicitări preluate."
          render={(request, index) => (
            <RequestCard key={request.id} request={request} index={index} tone="blue">
              <div className="flex flex-col gap-2">
                {/* Acțiunea normală: măsurătorile se fac cu aparatul HIGO, iar
                    datele sosesc singure. Formularul de mai jos rămâne opțional,
                    pentru ce aparatul nu acoperă. */}
                <Button
                  className="w-full rounded-xl bg-gradient-to-r from-primary to-purple-600 border-0"
                  disabled={Boolean(request.objective_data_completed_at)}
                  onClick={() => completeExamination(request)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {request.objective_data_completed_at ? 'Examinare finalizată' : 'Am terminat examinarea'}
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => openObjective(request)}>
                  <Stethoscope className="h-4 w-4 mr-2" /> Adaugă date manual
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => openForward(request)}>
                  <Send className="h-4 w-4 mr-2" /> Transmite la medic
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => openAddon(request)}>
                  <PlusCircle className="h-4 w-4 mr-2" /> Serviciu pe loc
                </Button>
                <Button asChild variant="outline" className="w-full rounded-xl">
                  <Link to="/operator/chat"><MessageSquare className="h-4 w-4 mr-2" /> Chat pacient</Link>
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => proposeTime(request)}>
                  Reprogramează
                </Button>
                {/* Concluzia o scrie medicul. Butonul apare doar la vizitele
                    fără medic asignat, unde operatorul își încheie singur cazul. */}
                {!request.doctor && (
                <Button variant="outline" className="w-full rounded-xl" onClick={() => openComplete(request)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Finalizează ca operator
                </Button>
                )}
              </div>
            </RequestCard>
          )}
        />

        <Column
          title="Finalizate"
          dot="bg-green-500"
          requests={byStage('done')}
          empty="Nicio examinare finalizată încă."
          render={(request, index) => (
            <RequestCard key={request.id} request={request} index={index} tone="green">
              <Badge variant="secondary" className="bg-green-50 text-green-700">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {request.status === 'completed' ? 'Consultație încheiată' : 'Examinare finalizată — la medic'}
              </Badge>
            </RequestCard>
          )}
        />
      </div>

      <Dialog open={isAcceptModalOpen} onOpenChange={setIsAcceptModalOpen}>
        <DialogContent className="sm:max-w-[425px] glass-panel border-0 rounded-2xl z-50">
          <DialogHeader>
            <DialogTitle className="text-2xl">Preluare caz</DialogTitle>
            <DialogDescription>Confirmați preluarea examinării pentru acest pacient.</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="py-4 space-y-4">
              <RequestSummary request={selectedRequest} />
              <div className="space-y-2">
                <Label>Note examinare preliminare</Label>
                <Textarea
                  placeholder="Detalii preliminare..."
                  className="rounded-xl min-h-[100px]"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAcceptModalOpen(false)} className="rounded-xl">
              Anulare
            </Button>
            <Button onClick={acceptRequest} disabled={isSaving} className="rounded-xl bg-slate-900 text-white">
              {isSaving ? 'Se salvează...' : 'Confirmă preluarea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isObjectiveModalOpen} onOpenChange={setIsObjectiveModalOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto glass-panel border-0 rounded-2xl z-50">
          <DialogHeader>
            <DialogTitle className="text-2xl">Date obiective</DialogTitle>
            <DialogDescription>Aceste date apar în consultația pacientului și la medic.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {selectedRequest && <RequestSummary request={selectedRequest} />}
            {objectiveError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{objectiveError}</p>
            )}
            <ObjectiveDataForm value={objectiveValues} onChange={setObjectiveValues} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsObjectiveModalOpen(false)} className="rounded-xl">Anulare</Button>
            <Button onClick={saveObjectiveData} disabled={!hasObjectiveValues || isSaving} className="rounded-xl">Salvează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddonModalOpen} onOpenChange={setIsAddonModalOpen}>
        <DialogContent className="sm:max-w-[420px] glass-panel border-0 rounded-2xl z-50">
          <DialogHeader>
            <DialogTitle className="text-2xl">Serviciu suplimentar</DialogTitle>
            <DialogDescription>Plata se debitează instant din portofelul pacientului.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="space-y-2">
              <Label>Denumire</Label>
              <Input value={addonForm.name} onChange={(event) => setAddonForm({ ...addonForm, name: event.target.value })} className="rounded-xl" placeholder="Ex: Dermatoscopie" />
            </div>
            <div className="space-y-2">
              <Label>Suma MDL</Label>
              <Input type="number" min={0} value={addonForm.amount} onChange={(event) => setAddonForm({ ...addonForm, amount: Number(event.target.value) })} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddonModalOpen(false)} className="rounded-xl">Anulare</Button>
            <Button onClick={saveAddon} disabled={!addonForm.name || isSaving} className="rounded-xl">Încasează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isForwardModalOpen} onOpenChange={setIsForwardModalOpen}>
        <DialogContent className="sm:max-w-[500px] glass-panel border-0 rounded-2xl z-50">
          <DialogHeader>
            <DialogTitle className="text-2xl">Transmite la medic</DialogTitle>
            <DialogDescription>Selectați medicul căruia îi transmiteți datele examinării.</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="py-4 space-y-4">
              <RequestSummary request={selectedRequest} />
              <div className="space-y-2">
                <Label>Selectează medicul</Label>
                <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Alege medicul..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl z-50">
                    {doctors.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        {doctor.name} {doctor.specialty ? `(${doctor.specialty})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date examinare / note pentru medic</Label>
                <Textarea
                  placeholder="Date colectate, simptome observate, valori măsurate..."
                  className="rounded-xl min-h-[120px]"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsForwardModalOpen(false)} className="rounded-xl">
              Anulare
            </Button>
            <Button onClick={forwardRequest} disabled={!selectedDoctor || isSaving} className="rounded-xl bg-gradient-to-r from-primary to-purple-600 border-0">
              <Send className="h-4 w-4 mr-2" />
              {isSaving ? 'Se transmite...' : 'Transmite datele'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCompleteModalOpen} onOpenChange={setIsCompleteModalOpen}>
        <DialogContent className="sm:max-w-[500px] glass-panel border-0 rounded-2xl z-50">
          <DialogHeader>
            <DialogTitle className="text-2xl">Finalizează examinarea</DialogTitle>
            <DialogDescription>Completează concluziile operatorului. Banii rezervați vor fi procesați.</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="py-4 space-y-4">
              <RequestSummary request={selectedRequest} />
              <div className="space-y-2">
                <Label>Concluzie / diagnostic preliminar</Label>
                <Input
                  value={completeData.diagnosis}
                  onChange={(event) => setCompleteData({ ...completeData, diagnosis: event.target.value })}
                  className="rounded-xl"
                  placeholder="Ex: Examinare la domiciliu efectuată"
                />
              </div>
              <div className="space-y-2">
                <Label>Recomandări</Label>
                <Textarea
                  value={completeData.recommendations}
                  onChange={(event) => setCompleteData({ ...completeData, recommendations: event.target.value })}
                  className="rounded-xl min-h-[100px]"
                  placeholder="Observații, recomandări, necesitate medic specialist..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompleteModalOpen(false)} className="rounded-xl">
              Anulare
            </Button>
            <Button
              onClick={completeRequest}
              disabled={!completeData.diagnosis.trim() || isSaving}
              className="rounded-xl bg-slate-900 text-white">
              {isSaving ? 'Se salvează...' : 'Finalizează'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Column({ title, dot, requests, empty, render }: {
  title: string;
  dot: string;
  requests: RequestItem[];
  empty: string;
  render: (request: RequestItem, index: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg text-slate-900 flex items-center">
        <span className={`w-2 h-2 rounded-full ${dot} mr-2`} />
        {title} ({requests.length})
      </h3>
      {requests.length === 0 && <Card className="glass-card border-0"><CardContent className="p-5 text-sm text-slate-500">{empty}</CardContent></Card>}
      {requests.map(render)}
    </div>
  );
}

function RequestCard({ request, index, tone, children }: {
  request: RequestItem;
  index: number;
  tone: 'amber' | 'blue' | 'green';
  children: React.ReactNode;
}) {
  const border = tone === 'amber' ? 'border-l-amber-500' : tone === 'blue' ? 'border-l-blue-500' : 'border-l-green-500';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Card className={`glass-card border-l-4 ${border} border-y-0 border-r-0 shadow-md`}>
        <CardContent className="p-5">
          <div className="flex justify-between items-start mb-3">
            <div className="min-w-0">
              {/* Titularul contului nu e pacientul: examinarea e pentru profilul
                  de pe solicitare, iar codul lui e „Personal ID”-ul din HIGO. */}
              <h4 className="font-bold text-slate-900">{request.patient_profile?.name || request.patient?.name || 'Pacient'}</h4>
              {request.patient_profile?.patient_code && (
                <p className="text-xs text-slate-500">Cod pacient {request.patient_profile.patient_code}</p>
              )}
            </div>
            <span className="text-xs font-medium text-slate-500">{dateTime(request.created_at)}</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary" className="rounded-full">
              {Number(request.amount || 0).toFixed(2)} MDL rezervat
            </Badge>
            {request.payment_status && (
              <Badge variant="outline" className="rounded-full">
                Plată: {request.payment_status}
              </Badge>
            )}
            {request.status === 'new' && request.acceptance_expires_at && (
              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                Până la {new Date(request.acceptance_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Badge>
            )}
          </div>
          <div className="space-y-2 mb-4">
            {request.scheduled_at && (
              <p className="text-sm font-medium text-slate-700">Programat: {dateTime(request.scheduled_at)}</p>
            )}
            {request.proposed_scheduled_at && (
              <p className="text-sm font-medium text-amber-700">Propus: {dateTime(request.proposed_scheduled_at)}</p>
            )}
            {request.patient_profile?.address && (
              <div className="flex items-start text-sm text-slate-700">
                <MapPin className="h-4 w-4 mr-2 mt-0.5 shrink-0 text-primary" />
                <span className="whitespace-pre-wrap">
                  {[request.patient_profile.locality, request.patient_profile.region].filter(Boolean).join(', ')}
                  {request.patient_profile.address ? ` — ${request.patient_profile.address}` : ''}
                </span>
              </div>
            )}
            {(() => {
              const required = (request.pricing_snapshot?.cost_breakdown?.investigations ?? []).filter((line) => line.requirement === 'required');
              const travelFee = request.pricing_snapshot?.cost_breakdown?.travel_fee;
              if (required.length === 0 && travelFee == null) return null;
              return (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                  {required.length > 0 && (
                    <p><strong className="text-slate-700">Investigații:</strong> {required.map((line) => line.name).join(', ')}</p>
                  )}
                  {travelFee != null && (
                    <p><strong className="text-slate-700">Taxă drum:</strong> {travelFee} MDL</p>
                  )}
                </div>
              );
            })()}
            <div className="flex items-start text-sm text-slate-600">
              <span className="whitespace-pre-wrap">{request.symptoms || 'Fără detalii.'}</span>
            </div>
          </div>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function RequestSummary({ request }: { request: RequestItem }) {
  return (
    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
      <h4 className="font-bold text-slate-900">
        {request.patient_profile?.name || request.patient?.name}
        {request.patient_profile?.patient_code && (
          <span className="ml-2 text-xs font-normal text-slate-500">Cod pacient {request.patient_profile.patient_code}</span>
        )}
      </h4>
      <div className="flex items-start text-sm text-slate-600">
        <MapPin className="h-4 w-4 mr-2 mt-0.5 shrink-0 text-slate-400" />
        <span className="whitespace-pre-wrap">{request.symptoms}</span>
      </div>
      <div className="flex items-center text-sm text-slate-600">
        <Phone className="h-4 w-4 mr-2 text-slate-400" />
        <span>{request.patient?.email}</span>
      </div>
    </div>
  );
}
