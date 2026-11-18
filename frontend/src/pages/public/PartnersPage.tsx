import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
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

export function PartnersPage() {
  const { text } = useSiteContent();
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Parteneri · telemedconsult.md';
    apiRequest<{ data: Partner[] }>('/catalog/partners', { auth: false })
      .then((response) => setPartners(response.data ?? []))
      .catch((err) => { setPartners([]); setError(err instanceof Error ? err.message : 'Nu am putut încărca partenerii.'); });
  }, []);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pb-16 pt-5 md:gap-8 md:px-10 md:pb-20 md:pt-12">
      <div className="flex max-w-[680px] flex-col gap-2.5">
        <h1 className="text-[28px] font-bold tracking-[-.02em] md:text-[40px]">{text('partners.title')}</h1>
        <p className="text-[15px] leading-relaxed text-slate-600 md:text-[17px]">{text('partners.subtitle')}</p>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {partners !== null && partners.length === 0 && !error && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{text('partners.empty')}</p>}
      <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {partners === null && [0, 1, 2].map((key) => <div key={key} className="h-64 animate-pulse rounded-2xl bg-white" />)}
        {partners?.map((partner) => (
          <article key={partner.id} id={`partner-${partner.id}`} className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
            {partner.logo_url && <div className="flex h-24 items-center justify-center rounded-xl bg-slate-50 p-3"><img src={partner.logo_url} alt={partner.name} className="max-h-full max-w-full object-contain" loading="lazy" /></div>}
            <div className="space-y-2">
              {partner.category && <p className="text-xs font-semibold text-blue-700">{partner.category}</p>}
              <h2 className="text-xl font-bold">{partner.name}</h2>
              {partner.description && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{partner.description}</p>}
            </div>
            {partner.website_url && <a href={partner.website_url} target="_blank" rel="noopener noreferrer" className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">{text('partners.visit')}<ExternalLink className="h-4 w-4" /></a>}
          </article>
        ))}
      </div>
    </div>
  );
}
