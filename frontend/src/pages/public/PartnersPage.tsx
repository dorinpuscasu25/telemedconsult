import React, { useEffect, useState } from 'react';
import { Handshake, ExternalLink, Building2 } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { apiRequest } from '../../lib/api';

type Partner = {
  id: number;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
};

export function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ data: Partner[] }>('/catalog/partners', { auth: false })
      .then((response) => setPartners(response.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca partenerii.'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8">
      <div className="mb-10 max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <Handshake className="h-4 w-4" /> Parteneri
        </span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900">Partenerii noștri</h1>
        <p className="mt-3 text-lg text-slate-500">
          Colaborăm cu laboratoare, farmacii și furnizori de dispozitive medicale pentru a-ți oferi
          servicii complete de îngrijire.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl bg-white/60" />
          ))}
        </div>
      ) : partners.length === 0 ? (
        <Card className="glass-card border-0">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-slate-500">
            <Building2 className="h-8 w-8 text-slate-400" />
            Momentan nu există parteneri de afișat.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((partner) => (
            <Card key={partner.id} className="glass-card h-full border-0">
              <CardContent className="flex h-full flex-col p-6">
                <div className="mb-4 flex h-16 items-center">
                  {partner.logo_url ? (
                    <img src={partner.logo_url} alt={partner.name} className="max-h-16 max-w-[160px] object-contain" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Building2 className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <h2 className="mb-2 text-lg font-bold text-slate-900">{partner.name}</h2>
                {partner.description && (
                  <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-500">{partner.description}</p>
                )}
                {partner.website_url && (
                  <a
                    href={partner.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex items-center text-sm font-medium text-primary hover:text-primary/80">
                    Vizitează site-ul <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
