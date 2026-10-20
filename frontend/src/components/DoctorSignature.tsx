import { useEffect, useRef, useState } from 'react';
import { apiBlob, apiRequest } from '../lib/api';
import { Button } from './ui/button';

export function DoctorSignature({ onSaved, kind = 'signature' }: { onSaved?: () => void; kind?: 'signature' | 'logo' } = {}) {
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const logo = kind === 'logo';
  const endpoint = logo ? '/doctor/clinic-logo' : '/doctor/signature';
  useEffect(() => {
    let alive = true; let objectUrl = '';
    apiBlob(endpoint).then((blob) => { if (alive) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => undefined);
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [endpoint, message]);
  const upload = async () => {
    if (!file) return;
    setSaving(true); setError('');
    const body = new FormData(); body.append(logo ? 'logo' : 'signature', file);
    try {
      const result = await apiRequest<{ message: string }>(endpoint, { method: 'POST', body });
      setMessage(`${result.message} ${new Date().toLocaleTimeString('ro-RO')}`); setFile(null);
      if (input.current) input.current.value = '';
      onSaved?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'Încărcarea nu a reușit.'); }
    finally { setSaving(false); }
  };
  return <div className="space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">{logo ? 'Sigla clinicii pentru antetul PDF' : 'Parafă și semnătură pentru documentele consultațiilor'}</h3>
    <p className="text-sm text-slate-500">{logo ? 'Încarcă sigla sau imaginea cu siglele clinicii în format JPG sau PNG (maximum 2 MB). Se afișează automat în antetul consultațiilor PDF, alături de datele clinicii și contactele medicului din profil.' : 'Încarcă imaginea proprie JPG sau PNG (maximum 2 MB). Imaginea salvată se aplică automat la publicare, împreună cu data și ora consultației.'}</p>
    {url && <img src={url} alt={logo ? 'Sigla clinicii' : 'Parafa și semnătura medicului'} className="max-h-32 max-w-full" />}
    <input ref={input} aria-label={logo ? 'Imagine sigla clinicii' : 'Imagine parafă și semnătură'} type="file" accept="image/png,image/jpeg" onChange={(event) => { setError(''); setFile(event.target.files?.[0] ?? null); }} />
    <Button type="button" disabled={saving || !file} onClick={() => void upload()}>{saving ? 'Se încarcă…' : logo ? 'Salvează sigla clinicii' : 'Salvează parafa'}</Button>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p role="status" className="text-sm text-green-700">{message}</p>}
  </div>;
}
