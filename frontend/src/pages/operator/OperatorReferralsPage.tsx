import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/app/PageHeader';
import { ReferralPanel, type ReferralResponse } from '../../components/ReferralPanel';
import { apiRequest } from '../../lib/api';

/** Linkul de afiliere al operatorului: pacienții aduși și bonusurile primite. */
export function OperatorReferralsPage() {
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<ReferralResponse>('/referrals')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca programul de afiliere.'));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Linkul meu de afiliere" description="Trimite linkul persoanelor care vor să se înregistreze pe platformă. Vezi câți ai adus și bonusurile primite." />
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="text-sm text-slate-500">Se încarcă...</p>}
      {data && <ReferralPanel data={data} audience="operator" />}
    </div>
  );
}
