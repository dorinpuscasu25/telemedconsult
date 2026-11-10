import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { apiRequest } from '../../lib/api';
import { useSiteContent } from '../../contexts/SiteContentContext';

type Partner = {
  id: number;
  name: string;
  category?: string | null;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
};

function Logo({ partner, className }: { partner: Partner; className: string }) {
  return partner.logo_url
    ? <img src={partner.logo_url} alt={partner.name} className={cn('object-contain', className)} />
    : <span className={cn('flex items-center justify-center text-center font-bold tracking-[-.01em] text-slate-700', className)}>{partner.name}</span>;
}

/**
 * R1/R2: logo-urile stau în casete de aceeași mărime. Partenerul ales apare în
 * panoul din dreapta pe desktop și într-o foaie de jos pe telefon.
 */
export function PartnersPage() {
  const { text } = useSiteContent();
  const [searchParams] = useSearchParams();
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Parteneri · telemedconsult.md';
    apiRequest<{ data: Partner[] }>('/catalog/partners', { auth: false })
      .then((response) => {
        const list = response.data ?? [];
        setPartners(list);
        const wanted = Number(searchParams.get('p'));
        setSelected(list.find((item) => item.id === wanted)?.id ?? list[0]?.id ?? null);
        if (wanted && window.innerWidth < 768) setSheet(true);
      })
      .catch((err) => { setPartners([]); setError(err instanceof Error ? err.message : 'Nu am putut încărca partenerii.'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const partner = partners?.find((item) => item.id === selected) ?? null;

  const details = partner && (
    <>
      <div className="flex h-20 items-center justify-center rounded-xl bg-slate-50 px-4 md:h-24"><Logo partner={partner} className="max-h-14 max-w-[80%] text-xl md:max-h-16 md:text-2xl" /></div>
      <div className="flex flex-col gap-1.5">
        {partner.category && <span className="hidden self-start rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 md:inline">{partner.category}</span>}
        <span className="text-xl font-bold tracking-[-.01em] md:text-[22px]">{partner.name}</span>
      </div>
      {partner.description && <p className="text-[15px] leading-[1.6] text-slate-700">{partner.description}</p>}
      {partner.website_url && (
        <a href={partner.website_url} target="_blank" rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white md:h-11 md:border md:border-slate-200 md:bg-white md:text-sm md:text-slate-950 md:hover:bg-slate-50">
          {text('partners.visit')}<ExternalLink className="hidden h-4 w-4 md:block" />
        </a>
      )}
    </>
  );

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-3.5 px-4 pb-16 pt-5 md:gap-8 md:px-10 md:pb-20 md:pt-12">
      <div className="flex max-w-[680px] flex-col gap-2.5 px-1 md:px-0">
        <h1 className="text-[28px] font-bold tracking-[-.02em] md:text-[40px] md:tracking-[-.03em]">{text('partners.title')}</h1>
        <p className="text-[15px] leading-[1.55] text-slate-600 md:text-[17px]">{text('partners.subtitle')}</p>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {partners !== null && partners.length === 0 && !error && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{text('partners.empty')}</p>}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_400px] md:items-start">
        <div className="grid grid-cols-2 gap-2.5 md:gap-4">
          {partners === null && [0, 1, 2, 3].map((key) => <div key={key} className="h-[120px] animate-pulse rounded-2xl bg-white md:h-[180px]" />)}
          {partners?.map((item) => {
            const on = item.id === selected;
            return (
              <button key={item.id} type="button" onClick={() => { setSelected(item.id); setSheet(true); }} aria-pressed={on}
                className={cn('flex h-[120px] flex-col items-center justify-center gap-2 rounded-[14px] bg-white px-2 md:h-[180px] md:gap-3.5 md:rounded-2xl',
                  on ? 'border border-slate-200 md:border-[1.5px] md:border-blue-600 md:shadow-[0_0_0_3px_rgba(37,99,235,.12)]' : 'border border-slate-200 hover:border-slate-300')}>
                <Logo partner={item} className="h-12 max-w-[85%] text-[17px] md:h-[72px] md:w-[200px] md:text-2xl" />
                {item.category && <span className="text-[11px] font-medium text-slate-500 md:text-xs">{item.category}</span>}
              </button>
            );
          })}
        </div>
        {partner && <aside className="sticky top-24 hidden flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-7 md:flex">{details}</aside>}
      </div>

      {sheet && partner && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Închide" onClick={() => setSheet(false)} className="absolute inset-0 bg-slate-900/40" />
          <div role="dialog" aria-label={partner.name} className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col gap-3.5 overflow-y-auto rounded-t-3xl bg-white px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-2.5">
            <span className="h-1 w-10 self-center rounded-sm bg-slate-300" />
            <div className="flex items-center justify-between">
              {partner.category ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{partner.category}</span> : <span />}
              <button type="button" aria-label="Închide" onClick={() => setSheet(false)} className="grid h-11 w-11 place-items-center text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            {details}
          </div>
        </div>
      )}
    </div>
  );
}
