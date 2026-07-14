import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABEL: Record<string, string> = {
  doctor: 'medic',
  operator: 'operator'
};

export function PendingApprovalPage() {
  const { user, role, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState('');

  const label = role ? ROLE_LABEL[role] ?? 'furnizor' : 'furnizor';

  const checkStatus = async () => {
    setIsChecking(true);
    setMessage('');
    const refreshed = await refreshUser();
    setIsChecking(false);
    if (refreshed && refreshed.status === 'active') {
      navigate(refreshed.role === 'admin' ? '/admin' : `/${refreshed.role}`, { replace: true });
      return;
    }
    if (refreshed && (refreshed.status === 'suspended' || refreshed.status === 'rejected')) {
      setMessage('Cererea ta nu a fost aprobată. Contactează echipa telemedconsult.md pentru detalii.');
      return;
    }
    setMessage('Contul este încă în curs de verificare. Revenim cu un răspuns cât mai curând.');
  };

  return (
    <div className="grid min-h-screen place-items-center gradient-bg px-4 py-10">
      <Card className="w-full max-w-md border-0 shadow-2xl glass-card">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Clock className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Cont în verificare</CardTitle>
          <CardDescription>
            Bună, {user?.name}. Cererea ta de cont de {label} a fost înregistrată și așteaptă aprobarea
            unui administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>
              Vei fi notificat prin email imediat ce contul este activat. Între timp, poți verifica
              starea contului mai jos.
            </p>
          </div>

          {message && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {message}
            </div>
          )}

          <Button className="h-11 w-full rounded-xl" onClick={checkStatus} disabled={isChecking}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Se verifică...' : 'Verifică starea contului'}
          </Button>
          <Button variant="outline" className="h-11 w-full rounded-xl" onClick={() => logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Deconectare
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
