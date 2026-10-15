import { useEffect, useState } from 'react';
import { apiBlob, apiRequest } from '../lib/api';
import { Button } from './ui/button';

export function DoctorSignature() {
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { let alive = true; let objectUrl = ''; apiBlob('/doctor/signature').then((blob) => { if (alive) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => undefined); return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [message]);
  const upload = async () => {
    if (!file) return;
    setSaving(true); setError('');
    const body = new FormData(); body.append('signature', file);
    try { await apiRequest('/doctor/signature', { method: 'POST', body }); setMessage(`Parafa a fost salvată la ${new Date().toLocaleTimeString('ro-RO')}.`); setFile(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Încărcarea nu a reușit.'); }
    finally { setSaving(false); }
  };
  return <div className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Parafă și semnătură pentru documentele consultațiilor</h3><p className="text-sm text-slate-500">Încarcă imaginea proprie JPG sau PNG (maximum 2 MB). Imaginea se aplică documentelor noi, la publicare; documentele deja publicate se păstrează.</p>{url && <img src={url} alt="Parafa și semnătura medicului" className="max-h-32 max-w-full" />}<input aria-label="Imagine parafă și semnătură" type="file" accept="image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Button type="button" disabled={saving || !file} onClick={upload}>{saving ? 'Se încarcă…' : 'Salvează parafa'}</Button>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p className="text-sm text-green-700">{message}</p>}</div>;
}
