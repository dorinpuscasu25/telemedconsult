import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MessageSquare, Star, TrendingUp, Users } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '../../components/ui/card';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';

interface DashboardData {
  summary: {
    current_month_revenue: number;
    previous_month_revenue: number;
    revenue_change_percent: number | null;
    current_month_consultations: number;
    rating: number;
    reviews_count: number;
    average_response_minutes: number | null;
  };
  pending_requests: Array<{
    id: string;
    patient?: { id: string; name: string; email: string } | null;
    specialty?: string | null;
    symptoms?: string | null;
    created_at: string;
  }>;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ro-MD', {
    maximumFractionDigits: 0
  }).format(value);

const formatResponseTime = (minutes: number | null) => {
  if (minutes === null) return 'N/A';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

export function DoctorHome() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const loadDashboard = () => {
    setError('');
    apiRequest<DashboardData>('/doctor/dashboard')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca dashboard-ul.'));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const summary = data?.summary;
  const pendingRequests = data?.pending_requests ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Dr. {user?.name}
          </h1>
          <p className="text-slate-500">Panoul de control al medicului, calculat din date reale.</p>
        </div>
        <Button type="button" variant="outline" className="self-start rounded-lg" onClick={loadDashboard}>
          Reîncarcă
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Venit luna curentă"
          value={`${formatMoney(summary?.current_month_revenue ?? 0)} MDL`}
          detail={summary?.revenue_change_percent === null || summary?.revenue_change_percent === undefined
            ? 'Fără lună precedentă'
            : `${summary.revenue_change_percent}% față de luna trecută`}
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
        />
        <SummaryCard
          label="Consultații luna curentă"
          value={String(summary?.current_month_consultations ?? 0)}
          detail="Finalizate în platformă"
          icon={<Users className="h-4 w-4 text-slate-500" />}
        />
        <SummaryCard
          label="Rating mediu"
          value={(summary?.rating ?? 0).toFixed(1)}
          detail={`${summary?.reviews_count ?? 0} recenzii`}
          icon={<Star className="h-4 w-4 text-yellow-500" />}
        />
        <SummaryCard
          label="Timp mediu răspuns"
          value={formatResponseTime(summary?.average_response_minutes ?? null)}
          detail={summary?.average_response_minutes === null || summary?.average_response_minutes === undefined ? 'Nu există acceptări încă' : 'Din solicitări acceptate'}
          icon={<Clock className="h-4 w-4 text-slate-500" />}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Consultații în așteptare</CardTitle>
          <Button asChild variant="outline" className="h-9 self-start rounded-lg">
            <Link to="/doctor/consultations">Vezi toate</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="mb-4 h-12 w-12 text-slate-300" />
              <h3 className="text-lg font-medium text-slate-900">
                Nu aveți consultații noi
              </h3>
              <p className="text-slate-500">
                Lista este calculată din solicitările reale cu status nou.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingRequests.map((request) => (
                <div key={request.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{request.patient?.name || 'Pacient'}</h3>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700">
                        Nou
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500">
                      {request.specialty || 'Consultație'} • {new Date(request.created_at).toLocaleString()}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                      {request.symptoms || 'Fără detalii.'}
                    </p>
                  </div>
                  <Button asChild className="h-9 shrink-0 rounded-lg">
                    <Link to="/doctor/consultations">Gestionează</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}
