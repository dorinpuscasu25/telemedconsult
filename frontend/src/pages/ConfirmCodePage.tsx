import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Copy, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export function ConfirmCodePage() {
  const [initial] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return { email: params.get('email') || '', code: params.get('code') || '', purpose: params.get('purpose') === 'login' ? 'login' : 'verify' };
  });
  const [email, setEmail] = useState(initial.email);
  const [code, setCode] = useState(/^\d{6}$/.test(initial.code) ? initial.code : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { verifyEmailOtp, verifyLoginOtp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Fragments are not sent to the server. Remove the code from the browser
    // address/history once it has been read; opening an email never confirms it.
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, []);

  const copy = async () => {
    setMessage('');
    try { await navigator.clipboard.writeText(code); setMessage('Cod copiat.'); }
    catch { input.current?.focus(); input.current?.select(); setMessage('Codul este selectat. Folosește opțiunea de copiere a dispozitivului.'); }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const next = initial.purpose === 'login'
        ? await verifyLoginOtp(email.trim().toLowerCase(), code)
        : await verifyEmailOtp(email.trim().toLowerCase(), code);
      setCode('');
      navigate(next.status === 'pending' ? '/pending' : `/${next.role}`, { replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : 'Codul nu a putut fi verificat.'); }
    finally { setBusy(false); }
  };

  return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-5">
    <form onSubmit={confirm} className="w-full max-w-md space-y-5 rounded-3xl border border-slate-100 bg-white p-7 shadow-xl sm:p-9">
      <div className="flex items-center gap-3 text-lg font-bold text-slate-900"><span className="rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 p-2 text-white"><Activity className="h-6 w-6" /></span>telemedconsult.md</div>
      <div><h1 className="text-2xl font-bold text-slate-900">{initial.purpose === 'login' ? 'Confirmă autentificarea' : 'Confirmă adresa de email'}</h1><p className="mt-2 text-sm text-slate-500">Codul din email este completat automat. Verifică adresa și confirmă pentru a continua.</p></div>
      <label className="block space-y-2 text-sm font-medium"><span>Email</span><Input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <div className="space-y-2"><label htmlFor="email-confirmation-code" className="text-sm font-medium">Codul din email</label><div className="flex items-center gap-2"><Input ref={input} id="email-confirmation-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-14 text-center font-mono text-2xl tracking-[0.25em]" /><Button type="button" variant="outline" disabled={code.length !== 6} onClick={copy} aria-label="Copiază codul"><Copy className="h-4 w-4" /></Button></div></div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-blue-700">{message}</p>}
      <Button disabled={busy || code.length !== 6} className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white">{busy ? 'Se verifică…' : 'Confirmă codul'}</Button>
      <p className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0" />Confirmă doar dacă tu ai solicitat acest cod. Codul poate fi folosit o singură dată.</p>
      <Link to="/login" className="block text-center text-sm font-medium text-blue-700">Înapoi la autentificare / solicită un cod nou</Link>
    </form>
  </main>;
}
