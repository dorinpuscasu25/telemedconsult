import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, MapPin, Users, Wallet } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';

interface OperatorRequest {
  id: string;
  type: string;
  status: string;
  symptoms: string;
  triage_notes?: string | null;
  created_at: string;
  accepted_at?: string | null;
  completed_at?: string | null;
  patient?: { name: string; email: string } | null;
}

const today = new Date().toDateString();

export function OperatorHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<OperatorRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRequests = () => {
    apiRequest<{data: OperatorRequest[]}>('/requests')
      .then((response) => setRequests(response.data))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.type === 'operator' && request.status === 'new'),
    [requests]
  );
  const todayAccepted = requests.filter(
    (request) => request.accepted_at && new Date(request.accepted_at).toDateString() === today
  ).length;
  const completedToday = requests.filter(
    (request) => request.completed_at && new Date(request.completed_at).toDateString() === today
  ).length;

  const acceptRequest = async (requestId: string) => {
    await apiRequest(`/requests/${requestId}/accept`, { method: 'POST' });
    loadRequests();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Panou operator</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            {user?.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Gestionare examinări clinice și cereri la domiciliu.</p>
        </div>
        <Button className="h-11 rounded-xl px-4" onClick={() => navigate('/operator/patients')}>
          Vezi toate solicitările
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Solicitări noi" value={isLoading ? '...' : String(pendingRequests.length)} detail="În zona ta de acoperire" icon={Activity} tone="bg-blue-50 text-blue-700" />
        <MetricCard label="Examinări astăzi" value={String(todayAccepted)} detail="Cazuri preluate" icon={Users} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard label="Finalizate astăzi" value={String(completedToday)} detail="Trimise către medic/pacient" icon={Wallet} tone="bg-amber-50 text-amber-700" />
      </div>

      <Card className="border-slate-200/70 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Solicitări în așteptare</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {pendingRequests.length === 0 && (
              <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-5 text-sm text-slate-500">
                Nu există solicitări noi pentru operator.
              </div>
            )}
            {pendingRequests.slice(0, 5).map((request) => (
              <div key={request.id} className="flex flex-col gap-4 rounded-xl border border-slate-200/70 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-950">{request.patient?.name || 'Pacient'}</h4>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{request.symptoms}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Creată: {new Date(request.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Button className="h-10 rounded-xl" onClick={() => acceptRequest(request.id)}>
                  Preluare caz
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
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
    <Card className="border-slate-200/70 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}
