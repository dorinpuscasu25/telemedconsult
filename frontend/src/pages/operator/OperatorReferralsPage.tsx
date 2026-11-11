import { useEffect, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { apiRequest } from '../../lib/api';
import { dateOnly } from '../../lib/format';
import { mdl } from '../../lib/doctor';
import { usePageTitle } from '../../lib/use-page-title';
import { Avatar } from '../doctor/DoctorHome';

export interface OperatorReferrals {
  enabled: boolean;
  bonus_enabled: boolean;
  code: string;
  referral_link: string;
  commission_rate: number;
  stats: {
    invited_count: number;
    invited_this_month: number;
    active_count: number;
    pending_count: number;
    spending_count: number;
    topups_total: number;
    spent_total: number;
    earned_total: number;
  };
  latest_referrals: Array<{
    id: number;
    name: string;
    email: string;
    status: 'earning' | 'waiting_topup';
    topups_total: number;
    spent_total: number;
    created_at: string;
  }>;
}

export const loadOperatorReferrals = () => apiRequest<OperatorReferrals>('/referrals');

/** Mesajul pe care operatorul îl trimite pacientului odată cu linkul. */
const shareText = 'Îți recomand telemedconsult.md: consultații cu medici online și examinări la domiciliu. Creează-ți contul aici:';

/**
 * Linkul personal al operatorului, cu copiere și trimitere directă din telefon.
 * Folosit în pagina „Pacienți aduși” și, compact, pe Acasă.
 */
export function ReferralLinkBox({ data, compact = false }: { data: OperatorReferrals; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.referral_link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copiază linkul:', data.referral_link);
    }
  };
  const share = () => { void navigator.share({ title: 'telemedconsult.md', text: shareText, url: data.referral_link }).catch(() => undefined); };
  const encoded = encodeURIComponent(`${shareText} ${data.referral_link}`);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 py-1 pl-3 pr-1">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-700">{data.referral_link.replace(/^https?:\/\//, '')}</span>
        <button type="button" onClick={() => void copy()} className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold', copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700')}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copiat' : 'Copiază'}
        </button>
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-2">
          {canShare && <button type="button" onClick={share} className="flex h-10 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50"><Share2 className="h-4 w-4" />Trimite</button>}
          <a href={`https://wa.me/?text=${encoded}`} target="_blank" rel="noreferrer" className="flex h-10 items-center rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50">WhatsApp</a>
          <a href={`viber://forward?text=${encoded}`} className="flex h-10 items-center rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50">Viber</a>
          <a href={`https://t.me/share/url?url=${encodeURIComponent(data.referral_link)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="flex h-10 items-center rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50">Telegram</a>
          <a href={`sms:?&body=${encoded}`} className="flex h-10 items-center rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50 lg:hidden">SMS</a>
        </div>
      )}
    </div>
  );
}

const FILTERS = [['all', 'Toți'], ['earning', 'Au alimentat'], ['waiting_topup', 'Fără alimentare']] as const;

/**
 * Pacienții aduși de operator prin linkul personal: câți, câți au pus bani
 * pe cont și cât au cheltuit. După aceste cifre se face plata operatorului.
 */
export function OperatorReferralsPage() {
  usePageTitle('Pacienți aduși');
  const [data, setData] = useState<OperatorReferrals | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');

  useEffect(() => {
    loadOperatorReferrals()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca pacienții aduși.'));
  }, []);

  const stats = data?.stats;
  const people = (data?.latest_referrals ?? []).filter((item) => filter === 'all' || item.status === filter);

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-[-.02em] text-slate-950 lg:text-[28px]">Pacienți aduși</h1>
        <span className="text-sm text-slate-500">Trimite linkul tău persoanelor care au nevoie de medic. Cine își face cont prin el rămâne înregistrat ca adus de tine.</span>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-semibold text-slate-950">Linkul tău</span>
          <span className="text-[13px] text-slate-500">Pacientul deschide linkul, își creează contul și apare imediat în lista de mai jos.</span>
        </div>
        {data ? <ReferralLinkBox data={data} /> : !error && <Skeleton className="h-11 w-full" />}
        {data && <span className="text-xs text-slate-500">Cod: <span className="font-mono font-semibold text-slate-700">{data.code}</span>{data.bonus_enabled && data.commission_rate > 0 ? ` · primești ${data.commission_rate}% din fiecare alimentare, ca bonus` : ''}</span>}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pacienți aduși" value={stats ? String(stats.invited_count) : null} sub={stats ? `${stats.invited_this_month} luna aceasta` : undefined} />
        <Stat label="Au pus bani pe cont" value={stats ? String(stats.active_count) : null} sub={stats ? `${stats.pending_count} încă nu` : undefined} />
        <Stat label="Au alimentat" value={stats ? mdl(stats.topups_total) : null} sub="în total" />
        <Stat label="Au cheltuit" value={stats ? mdl(stats.spent_total) : null} sub={stats ? `${stats.spending_count} ${stats.spending_count === 1 ? 'pacient' : 'pacienți'}` : undefined} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-base font-semibold text-slate-950">Lista pacienților</span>
          <div className="grid grid-cols-3 gap-0.5 rounded-[10px] bg-slate-100 p-[3px] sm:w-[360px]">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={cn('h-8 truncate rounded-lg px-2 text-[13px] font-medium', filter === value ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,.12)]' : 'text-slate-500')}>{label}</button>
            ))}
          </div>
        </div>
        {!data && !error ? <div className="border-t border-slate-100 p-5"><Skeleton className="h-12 w-full" /></div> : people.length === 0 ? (
          <p className="border-t border-slate-100 px-5 py-8 text-center text-sm text-slate-500">{data?.stats.invited_count ? 'Niciun pacient pentru acest filtru.' : 'Încă nu ai adus pacienți. Copiază linkul și trimite-l primei persoane.'}</p>
        ) : people.map((person) => (
          <div key={person.id} className="flex items-center gap-3 border-t border-slate-100 px-5 py-3.5">
            <Avatar name={person.name.replace(/\*/g, '')} size={38} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold text-slate-950">{person.name}</span>
              <span className="truncate text-xs text-slate-500">{person.email} · din {dateOnly(person.created_at)}</span>
            </span>
            {person.status === 'earning' ? (
              <span className="flex flex-col items-end gap-0.5 text-right">
                <span className="text-[13px] font-semibold text-slate-950">{mdl(person.topups_total)}</span>
                <span className="text-xs text-slate-500">cheltuit {mdl(person.spent_total)}</span>
              </span>
            ) : (
              <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">Fără alimentare</span>
            )}
          </div>
        ))}
      </section>
      <p className="text-xs text-slate-500">Numele și emailurile sunt ascunse parțial, pentru confidențialitatea pacienților. Sumele sunt bani reali, fără bonusuri.</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white p-4">
      <span className="text-[13px] text-slate-500">{label}</span>
      {value === null ? <Skeleton className="mt-1 h-7 w-20" /> : <span className="text-[22px] font-bold tracking-[-.02em] text-slate-950">{value}</span>}
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}
