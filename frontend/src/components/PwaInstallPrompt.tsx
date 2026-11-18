import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from './ui/button';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const installed = () => { setPrompt(null); setDismissed(true); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', installed); };
  }, []);

  const install = async () => {
    const event = prompt;
    if (!event) return;
    setPrompt(null); setError('');
    try { await event.prompt(); await event.userChoice; }
    catch { setError('Instalarea nu a putut porni. Încearcă opțiunea „Instalează aplicația” din meniul browserului.'); }
  };

  if (dismissed || (!prompt && !error)) return null;
  return <aside aria-label="Instalează aplicația" className="fixed bottom-24 left-4 right-4 z-[60] space-y-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-xl sm:left-auto sm:right-6 sm:w-80">
    <button type="button" aria-label="Închide invitația de instalare" onClick={() => setDismissed(true)} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
    <p className="pr-8 font-semibold text-slate-950">telemedconsult.md pe telefonul tău</p>
    <p className="text-sm text-slate-600">Instalează aplicația pentru a o deschide direct de pe ecranul principal.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {prompt && <Button onClick={() => void install()}><Download className="h-4 w-4" />Instalează aplicația</Button>}
  </aside>;
}
