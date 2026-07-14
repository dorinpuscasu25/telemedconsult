import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, UserCheck, Users } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import { apiRequest } from '../../lib/api';

interface CoordinatorRequest {
  id: string;
  type: 'doctor' | 'operator';
  status: string;
  symptoms: string;
  triage_notes?: string | null;
  created_at: string;
  patient?: { name: string; email: string } | null;
  doctor?: { id: string; name: string } | null;
  operator?: { id: string; name: string } | null;
  coordinator?: { id: string; name: string } | null;
  specialty?: string | null;
}

interface Provider {
  id: string;
  name: string;
  specialty?: string | null;
  region?: string | null;
  is_available: boolean;
}

interface DashboardData {
  summary: {
    new_requests: number;
    rescheduled_requests: number;
    assigned_to_me: number;
    unassigned: number;
  };
  requests: CoordinatorRequest[];
  doctors: Provider[];
  operators: Provider[];
}

export function CoordinatorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [providerByRequest, setProviderByRequest] = useState<Record<string, string>>({});
  const [notesByRequest, setNotesByRequest] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = () => {
    apiRequest<DashboardData>('/coordinator/dashboard').then(setData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const requests = data?.requests ?? [];
  const providersByType = useMemo(() => ({
    doctor: data?.doctors ?? [],
    operator: data?.operators ?? []
  }), [data]);

  const claim = async (requestId: string) => {
    setError('');
    setMessage('');
    try {
      await apiRequest(`/coordinator/requests/${requestId}/claim`, { method: 'POST' });
      setMessage('Solicitarea a fost preluată.');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut prelua solicitarea.');
    }
  };

  const assign = async (request: CoordinatorRequest) => {
    const rawProvider = providerByRequest[request.id];
    if (!rawProvider) return;
    const [providerType, providerId] = rawProvider.split(':');

    setError('');
    setMessage('');
    try {
      await apiRequest(`/coordinator/requests/${request.id}/assign-provider`, {
        method: 'POST',
        body: JSON.stringify({
          provider_type: providerType,
          provider_id: providerId,
          triage_notes: notesByRequest[request.id] || null
        })
      });
      setMessage('Provider alocat.');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut aloca providerul.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Coordonare solicitări</h1>
        <p className="mt-1 text-sm text-slate-500">Preia, urmărește și alocă solicitările active către medici sau operatori.</p>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Noi" value={data?.summary.new_requests ?? 0} icon={ClipboardCheck} />
        <Metric label="Reprogramate" value={data?.summary.rescheduled_requests ?? 0} icon={ClipboardCheck} />
        <Metric label="Ale mele" value={data?.summary.assigned_to_me ?? 0} icon={UserCheck} />
        <Metric label="Nealocate" value={data?.summary.unassigned ?? 0} icon={Users} />
      </div>

      <div className="space-y-4">
        {requests.length === 0 && (
          <Card className="border-slate-200 bg-white">
            <CardContent className="p-8 text-center text-sm text-slate-500">Nu există solicitări active.</CardContent>
          </Card>
        )}
        {requests.map((request) => {
          const selectedProviders = providersByType[request.type] || [];
          return (
            <Card key={request.id} className="border-slate-200/70 bg-white shadow-sm">
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_360px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{request.type === 'operator' ? 'Operator' : 'Medic'}</Badge>
                    <Badge variant="secondary">{request.status}</Badge>
                    {request.coordinator && <Badge variant="outline">Coordonator: {request.coordinator.name}</Badge>}
                  </div>
                  <h2 className="mt-3 font-semibold text-slate-950">{request.patient?.name || 'Pacient'} • {request.specialty || 'General'}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{request.symptoms}</p>
                  {(request.doctor || request.operator) && (
                    <p className="mt-2 text-sm font-medium text-slate-800">
                      Alocat: {request.doctor?.name || request.operator?.name}
                    </p>
                  )}
                  {request.triage_notes && <p className="mt-2 text-sm text-slate-500">Note: {request.triage_notes}</p>}
                </div>
                <div className="space-y-3">
                  {!request.coordinator && (
                    <Button variant="outline" className="h-10 w-full rounded-xl bg-white" onClick={() => claim(request.id)}>
                      Preia solicitarea
                    </Button>
                  )}
                  <Select
                    value={providerByRequest[request.id] || ''}
                    onValueChange={(value) => setProviderByRequest((current) => ({ ...current, [request.id]: value }))}
                  >
                    <SelectTrigger className="h-10 rounded-xl bg-white">
                      <SelectValue placeholder="Alege provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedProviders.map((provider) => (
                        <SelectItem key={provider.id} value={`${request.type}:${provider.id}`}>
                          {provider.name} {provider.specialty || provider.region ? `- ${provider.specialty || provider.region}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={notesByRequest[request.id] || ''}
                    onChange={(event) => setNotesByRequest((current) => ({ ...current, [request.id]: event.target.value }))}
                    placeholder="Note triere..."
                    className="min-h-20 rounded-xl bg-white"
                  />
                  <Button className="h-10 w-full rounded-xl" disabled={!providerByRequest[request.id]} onClick={() => assign(request)}>
                    Alocă provider
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof ClipboardCheck }) {
  return (
    <Card className="border-slate-200/70 bg-white shadow-sm">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </CardContent>
    </Card>
  );
}
