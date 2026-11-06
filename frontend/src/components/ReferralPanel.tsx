import React, { useState } from 'react';
import { CheckCircle2, Copy, Gift, UsersRound, WalletCards } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { dateOnly, money } from '../lib/format';

export type ReferralResponse = {
  enabled: boolean;
  code: string;
  referral_link: string;
  /** Procentul din fiecare alimentare a invitatului care ajunge la invitator. */
  commission_rate: number;
  /** Alimentările sub această sumă nu generează comision. */
  minimum_topup: number;
  /** true = comision doar la prima alimentare a invitatului. */
  first_deposit_only: boolean;
  currency: string;
  rules: string | null;
  stats: {
    invited_count: number;
    active_count: number;
    pending_count: number;
    earned_total: number;
    commission_count: number;
  };
  latest_referrals: Array<{
    id: number;
    name: string;
    email: string;
    status: 'earning' | 'waiting_topup';
    earned_total: number;
    commission_count: number;
    created_at: string;
  }>;
  latest_commissions: Array<{
    id: number;
    deposit_amount: number;
    commission_amount: number;
    rate_percent: number;
    currency: string;
    created_at: string;
  }>;
};

/**
 * Panoul programului de afiliere: linkul personal, statistici, invitați și
 * comisioane. Folosit de pacienți și de operatori (același mecanism de 3%).
 */
export function ReferralPanel({ data: referralData, audience = 'patient' }: { data: ReferralResponse; audience?: 'patient' | 'operator' }) {
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copyReferralLink = async () => {
    if (!referralData?.referral_link) return;

    try {
      await navigator.clipboard.writeText(referralData.referral_link);
      setCopiedReferral(true);
      window.setTimeout(() => setCopiedReferral(false), 2000);
    } catch {
      setCopyError('Nu am putut copia linkul. Selectează-l și copiază-l manual.');
    }
  };
  return (
    <>
              <Card className="border-slate-200/70 bg-white shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">
                        <Gift className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500">
                          Comisionul tău din {referralData.first_deposit_only ? 'prima alimentare' : 'fiecare alimentare'}
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-slate-950">{referralData.commission_rate}%</p>
                        {!referralData.first_deposit_only && <p className="text-xs text-slate-500">(La toate suplinirile de cont ale invitaților tăi primești {referralData.commission_rate}% bonusuri pe cartela de bonusuri)</p>}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3 sm:text-right">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Câștig total</p>
                      <p className="mt-1 text-xl font-bold text-slate-950">{money(referralData.stats.earned_total)} {referralData.currency}</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <ReferralStep number="1" title="Copiază linkul" text="Folosește linkul personal afișat mai jos." />
                    <ReferralStep number="2" title="Trimite-l unei persoane" text={audience === 'operator' ? 'Persoana își creează cont de pacient prin linkul tău și rămâne înregistrată ca adusă de tine.' : 'Persoana își creează un cont nou de pacient.'} />
                    <ReferralStep
                      number="3"
                      title="Primești comisionul"
                      text={`La fiecare suplinire de cont, ${referralData.commission_rate}% din sumă intră automat pe cartela ta de bonusuri.`}
                    />
                  </div>

                  <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                    Primești <strong>{referralData.commission_rate}%</strong> din{' '}
                    {referralData.first_deposit_only ? 'prima sumă alimentată' : 'fiecare sumă alimentată'} de persoana invitată, ca bonusuri pe cartela de bonusuri.
                    {referralData.minimum_topup > 0 && ` Sunt eligibile alimentările de cel puțin ${money(referralData.minimum_topup)} ${referralData.currency}.`}
                    {' '}Comisionul se acordă doar pentru plăți confirmate, nu la simpla înregistrare.
                  </p>
                </CardContent>
              </Card>

              {!referralData.enabled && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Programul de afiliere este momentan dezactivat. Linkul tău rămâne rezervat și va putea fi folosit după reactivare.
                </div>
              )}

              <Card className="border-slate-200/70 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Linkul tău personal de invitație</CardTitle>
                  <CardDescription>Copiază linkul și trimite-l persoanei pe care vrei să o inviți.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input readOnly value={referralData.referral_link} className="h-11 min-w-0 rounded-xl bg-slate-50" />
                    <Button type="button" disabled={!referralData.enabled} onClick={copyReferralLink} className="h-11 shrink-0 rounded-xl px-5">
                      {copiedReferral ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                      {copiedReferral ? 'Link copiat' : 'Copiază linkul'}
                    </Button>
                  </div>
                  {copyError && <p className="mt-2 text-xs text-red-600">{copyError}</p>}
                  <p className="mt-3 text-xs text-slate-500">Codul tău de invitație: <span className="font-semibold text-slate-700">{referralData.code}</span></p>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-3">
                <ReferralStat icon={UsersRound} label="Persoane invitate" value={referralData.stats.invited_count} />
                <ReferralStat icon={CheckCircle2} label="Au alimentat portofelul" value={referralData.stats.active_count} />
                <ReferralStat icon={WalletCards} label="Fără alimentare încă" value={referralData.stats.pending_count} />
              </div>

              <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <Card className="border-slate-200/70 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Regulament</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{referralData.rules}</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/70 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Ultimele invitații</CardTitle>
                    <CardDescription>Datele sunt mascate pentru protejarea confidențialității.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(referralData.latest_referrals ?? []).length === 0 && (
                      <p className="text-sm text-slate-500">Nu ai invitații încă. Copiază linkul și trimite-l unei persoane care are nevoie de un cont de pacient.</p>
                    )}
                    {(referralData.latest_referrals ?? []).map((referral) => (
                      <div key={referral.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{referral.name}</p>
                          <p className="text-sm text-slate-500">{referral.email} • {dateOnly(referral.created_at)}</p>
                        </div>
                        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${referral.status === 'earning' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {referral.status === 'earning'
                            ? `+${money(referral.earned_total)} ${referralData.currency}`
                            : 'Nu a alimentat încă'}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200/70 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Comisioane primite</CardTitle>
                  <CardDescription>Fiecare alimentare a persoanelor invitate generează un comision separat.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(referralData.latest_commissions ?? []).length === 0 && (
                    <p className="text-sm text-slate-500">Încă nu ai primit comisioane. Comisionul apare aici după prima alimentare confirmată a unei persoane invitate.</p>
                  )}
                  {(referralData.latest_commissions ?? []).map((commission) => (
                    <div key={commission.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          Alimentare de {money(commission.deposit_amount)} {commission.currency}
                        </p>
                        <p className="text-sm text-slate-500">
                          {dateOnly(commission.created_at)} • cotă {commission.rate_percent}%
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        +{money(commission.commission_amount)} {commission.currency}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
    </>
  );
}

function ReferralStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <Card className="border-slate-200/70 bg-white shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-950">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReferralStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">
        {number}
      </div>
      <div>
        <p className="font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">{text}</p>
      </div>
    </div>
  );
}
