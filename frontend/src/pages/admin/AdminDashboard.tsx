import React, { useEffect, useState } from 'react';
import { Activity, ShieldCheck, Stethoscope, UserCog, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { apiRequest } from '../../lib/api';

interface Summary {
  users: number;
  patients: number;
  doctors: number;
  operators: number;
  coordinators: number;
  pending_doctors: number;
}

interface IntegrationStatus {
  providers: Array<{key: string; label: string; status: string}>;
  message: string;
}

export function AdminDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    apiRequest<Summary>('/admin/summary').then(setSummary);
    apiRequest<IntegrationStatus>('/integrations/status', { auth: false }).then(setIntegrations);
  }, []);

  const stats = [
    { label: 'Total conturi', value: summary?.users ?? 0, icon: Users, tone: 'bg-blue-100 text-blue-700' },
    { label: 'Pacienți', value: summary?.patients ?? 0, icon: Activity, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Medici', value: summary?.doctors ?? 0, icon: Stethoscope, tone: 'bg-purple-100 text-purple-700' },
    { label: 'Operatori', value: summary?.operators ?? 0, icon: UserCog, tone: 'bg-amber-100 text-amber-700' }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
          Dashboard General
        </h1>
        <p className="text-slate-500">
          Date operaționale din backend: autentificare, roluri, utilizatori și pregătire e-Health.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="glass-card border-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center ${stat.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 text-3xl font-bold text-slate-900">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle>Roluri și aprobare</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white/60 p-4">
              <div>
                <p className="text-sm text-slate-500">Coordonatori</p>
                <p className="text-2xl font-semibold text-slate-900">{summary?.coordinators ?? 0}</p>
              </div>
              <UserCog className="h-5 w-5 text-slate-500" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white/60 p-4">
              <div>
                <p className="text-sm text-slate-500">Medici în așteptare</p>
                <p className="text-2xl font-semibold text-slate-900">{summary?.pending_doctors ?? 0}</p>
              </div>
              <Stethoscope className="h-5 w-5 text-slate-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle>Pregătire interoperabilitate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">{integrations?.message}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {integrations?.providers.map((provider) => (
                <div key={provider.key} className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white/60 p-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-800">{provider.label}</span>
                  </div>
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                    {provider.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
