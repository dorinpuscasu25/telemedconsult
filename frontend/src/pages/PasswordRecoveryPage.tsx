import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export function PasswordRecoveryPage() {
  const [params] = useSearchParams();
  const resetting = useLocation().pathname === '/reset-password';
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      const response = await apiRequest<{ message: string }>(`/auth/${resetting ? 'reset-password' : 'forgot-password'}`, { auth: false, method: 'POST', body: JSON.stringify({ email, ...(resetting ? { token: params.get('token'), password, password_confirmation: confirmation } : {}) }) });
      setMessage(response.message);
    } catch (err) { setError(err instanceof Error ? err.message : 'Operațiunea nu a reușit.'); }
    finally { setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl bg-white p-8 shadow-lg"><h1 className="text-2xl font-bold">{resetting ? 'Alege o parolă nouă' : 'Recuperarea parolei'}</h1><label className="block space-y-2"><span>Email</span><Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{resetting && <><label className="block space-y-2"><span>Parolă nouă</span><Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label className="block space-y-2"><span>Confirmă parola</span><Input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label></>}{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p role="status" className="text-sm text-green-700">{message}</p>}<Button disabled={busy} className="w-full">{busy ? 'Se procesează…' : resetting ? 'Schimbă parola' : 'Trimite linkul de resetare'}</Button><Link className="block text-center text-sm text-blue-700" to="/login">Înapoi la autentificare</Link>{resetting && <Link className="block text-center text-sm text-blue-700" to="/forgot-password">Solicită un link nou</Link>}</form></main>;
}
