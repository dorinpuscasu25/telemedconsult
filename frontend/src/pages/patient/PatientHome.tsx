import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, CalendarClock, Gift, MessageSquare, MessageSquareWarning, Stethoscope, User, Users, Wallet } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';

interface WalletData {
  wallet: {
    balance: number;
    currency: string;
  };
}

interface ConsultationRequest {
  id: string;
  type: 'doctor' | 'operator';
  status: string;
  symptoms: string;
  scheduled_at?: string | null;
  proposed_scheduled_at?: string | null;
  created_at: string;
  doctor?: { name: string } | null;
  operator?: { name: string } | null;
  specialty?: string | null;
}

interface PatientProfile {
  id: number;
  can_request_consultation?: boolean;
}

interface PatientProfileResponse {
  patient_profiles: PatientProfile[];
}

interface CatalogResponse<T> {
  data: T[];
}

const statusLabels: Record<string, string> = {
  new: 'Nouă',
  accepted: 'În lucru',
  rescheduled: 'Reprogramare propusă',
  completed: 'Finalizată',
  cancelled: 'Anulată'
};

const activeStatuses = ['new', 'accepted', 'rescheduled'];

export function PatientHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<WalletData['wallet'] | null>(null);
  const [requests, setRequests] = useState<ConsultationRequest[]>([]);
  const [patientProfiles, setPatientProfiles] = useState<PatientProfile[]>([]);
  const [doctorsCount, setDoctorsCount] = useState(0);
  const [operatorsCount, setOperatorsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiRequest<WalletData>('/wallet'),
      apiRequest<PatientProfileResponse>('/patient/profile'),
      apiRequest<CatalogResponse<ConsultationRequest>>('/requests'),
      apiRequest<CatalogResponse<unknown>>('/catalog/doctors', { auth: false }),
      apiRequest<CatalogResponse<unknown>>('/catalog/operators', { auth: false })
    ])
      .then(([walletResponse, profileResponse, requestsResponse, doctorsResponse, operatorsResponse]) => {
        setWallet(walletResponse.wallet);
        setPatientProfiles(profileResponse.patient_profiles ?? []);
        setRequests(requestsResponse.data);
        setDoctorsCount(doctorsResponse.data.length);
        setOperatorsCount(operatorsResponse.data.length);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const activeRequests = useMemo(
    () => requests.filter((request) => activeStatuses.includes(request.status)),
    [requests]
  );
  const latestRequests = requests.slice(0, 4);
  const nextRequest = activeRequests[0];
  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency ?? 'MDL';
  const hasRequestablePatient = patientProfiles.some((profile) => profile.can_request_consultation);
  const medicalStartPath = hasRequestablePatient ? '/patient/doctors' : '/patient/profile';
  const operatorStartPath = hasRequestablePatient ? '/patient/operators' : '/patient/profile';

  const acceptProposal = async (requestId: string) => {
    await apiRequest(`/requests/${requestId}/accept-proposed-time`, { method: 'POST' });
    const response = await apiRequest<CatalogResponse<ConsultationRequest>>('/requests');
    setRequests(response.data);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-primary">Panou pacient</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                Salut, {user?.name || 'pacient'}.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Alege rapid consultația potrivită, verifică solicitările active și gestionează portofelul din același loc.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
              <Button size="lg" className="h-11 rounded-xl px-4" onClick={() => navigate(medicalStartPath)}>
                <Stethoscope className="mr-2 h-4 w-4" />
                Medic
              </Button>
              <Button size="lg" variant="outline" className="h-11 rounded-xl px-4 bg-white" onClick={() => navigate(operatorStartPath)}>
                <Users className="mr-2 h-4 w-4" />
                Operator
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Balanță"
              value={isLoading ? '...' : `${balance.toFixed(2)} ${currency}`}
              detail={balance >= 450 ? 'Disponibil pentru consultații' : 'Necesită alimentare'}
              icon={Wallet}
              tone="bg-blue-50 text-blue-700"
            />
            <MetricCard
              label="Solicitări active"
              value={isLoading ? '...' : String(activeRequests.length)}
              detail={activeRequests.length === 1 ? 'Caz în desfășurare' : 'Cazuri în desfășurare'}
              icon={Activity}
              tone="bg-emerald-50 text-emerald-700"
            />
            <MetricCard
              label="Specialiști disponibili"
              value={isLoading ? '...' : String(doctorsCount + operatorsCount)}
              detail={`${doctorsCount} medici, ${operatorsCount} operatori`}
              icon={Users}
              tone="bg-amber-50 text-amber-700"
            />
          </div>
        </div>

        <Card className="border-slate-200/70 bg-slate-950 text-white shadow-sm">
          <CardContent className="flex h-full flex-col justify-between p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-300">Următorul pas</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  {nextRequest ? statusLabels[nextRequest.status] || nextRequest.status : hasRequestablePatient ? 'Solicită asistență' : 'Activează accesul'}
                </h2>
              </div>
              <CalendarClock className="h-6 w-6 text-slate-300" />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              {nextRequest
                ? `${nextRequest.type === 'operator' ? 'Examinare la domiciliu' : 'Consultație medicală'}: ${nextRequest.symptoms}`
                : hasRequestablePatient
                  ? 'Nu ai nicio consultație activă. Poți porni direct cu un medic sau poți cere o examinare la domiciliu.'
                  : 'Nu poți solicita medic sau operator încă. Cumpără un pachet în Pacienții mei, apoi adaugă primul profil de pacient.'}
            </p>
            <Button
              className="mt-6 h-11 rounded-xl bg-white text-slate-950 hover:bg-slate-100"
              onClick={() => navigate(nextRequest ? '/patient/chat' : medicalStartPath)}
            >
              {nextRequest ? <MessageSquare className="mr-2 h-4 w-4" /> : <Stethoscope className="mr-2 h-4 w-4" />}
              {nextRequest ? 'Deschide chat' : hasRequestablePatient ? 'Alege medic' : 'Deschide Pacienții mei'}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Acțiuni rapide</h2>
                <p className="text-sm text-slate-500">Cele mai folosite fluxuri pentru pacient.</p>
              </div>
              <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => navigate('/patient/wallet')}>
                Portofel
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            <div className="mt-5 grid gap-3">
              <ActionRow
                title="Pacienții mei"
                description="Cumpără o cartelă și adaugă profilurile pentru care vei solicita servicii."
                icon={User}
                onClick={() => navigate('/patient/profile')}
              />
              <ActionRow
                title="Program de afiliere"
                description="Copiază linkul personal, invită pacienți și urmărește bonusurile din portofel."
                icon={Gift}
                onClick={() => navigate('/patient/profile?tab=referrals')}
              />
              <ActionRow
                title="Consultație online"
                description="Alege medicul, specializarea și descrie simptomele."
                icon={Stethoscope}
                onClick={() => navigate(medicalStartPath)}
              />
              <ActionRow
                title="Examinare la domiciliu"
                description="Trimite o cerere către operatorii disponibili."
                icon={Users}
                onClick={() => navigate(operatorStartPath)}
              />
              <ActionRow
                title="Chat medical"
                description="Continuă conversațiile deschise cu medicul sau operatorul."
                icon={MessageSquare}
                onClick={() => navigate('/patient/chat')}
              />
              <ActionRow
                title="Reclamații și recenzii"
                description="Trimite feedback pentru consultațiile finalizate."
                icon={MessageSquareWarning}
                onClick={() => navigate('/patient/complaints')}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Ultimele solicitări</h2>
                <p className="text-sm text-slate-500">Date citite direct din backend.</p>
              </div>
              <Button variant="outline" size="sm" className="rounded-lg bg-white" onClick={() => navigate('/patient/chat')}>
                Vezi chat
              </Button>
            </div>

            <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {latestRequests.length === 0 && (
                <div className="p-5 text-sm text-slate-500">
                  Nu există solicitări încă.
                </div>
              )}
              {latestRequests.map((request) => (
                <div key={request.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">
                        {request.type === 'operator' ? 'Examinare operator' : request.specialty || 'Consultație medic'}
                      </p>
                      <Badge variant="secondary" className="rounded-full">
                        {statusLabels[request.status] || request.status}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-500">{request.symptoms}</p>
                    {request.proposed_scheduled_at && (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        Propus: {new Date(request.proposed_scheduled_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <p className="text-xs text-slate-400">
                      {new Date(request.created_at).toLocaleDateString()}
                    </p>
                    {request.status === 'rescheduled' && (
                      <Button size="sm" className="h-8 rounded-lg" onClick={() => acceptProposal(request.id)}>
                        Acceptă ora
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p>
    </div>
  );
}

function ActionRow({
  title,
  description,
  icon: Icon,
  onClick
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-4 text-left transition hover:border-primary/30 hover:bg-slate-50"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-950">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-500">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}
