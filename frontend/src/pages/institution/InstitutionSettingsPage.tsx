import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Skeleton } from '../../components/ui/skeleton';
import { PageHeader, SectionHeader } from '../../components/app/PageHeader';
import { apiRequest } from '../../lib/api';
import { money } from '../../lib/format';
import { splitExample, type Institution } from '../../lib/institution';

type Form = { legal_name: string; fiscal_code: string; iban: string; bank_name: string; email: string; phone: string; address: string; doctor_share_percent: string };

const toForm = (institution: Institution): Form => ({
  legal_name: institution.legal_name ?? '',
  fiscal_code: institution.fiscal_code ?? '',
  iban: institution.iban ?? '',
  bank_name: institution.bank_name ?? '',
  email: institution.email ?? '',
  phone: institution.phone ?? '',
  address: institution.address ?? '',
  doctor_share_percent: String(institution.doctor_share_percent)
});

export function InstitutionSettingsPage() {
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ institution: Institution }>('/institution/dashboard')
      .then((response) => { setInstitution(response.institution); setForm(toForm(response.institution)); })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Nu am putut încărca setările.'));
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const response = await apiRequest<{ message: string; institution: Institution }>('/institution/settings', {
        method: 'PUT',
        body: JSON.stringify({ ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === '' ? null : value])), doctor_share_percent: Number(form.doctor_share_percent) })
      });
      setInstitution(response.institution);
      setForm(toForm(response.institution));
      toast.success(response.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva setările.');
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => (current ? { ...current, [key]: event.target.value } : current));
  const example = splitExample(Number(form?.doctor_share_percent) || 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Setări" description={institution ? `Datele instituției ${institution.name} și regula de împărțire a banilor.` : 'Datele instituției și regula de împărțire a banilor.'} />

      {!form ? <Skeleton className="h-96 w-full rounded-2xl" /> : (
        <form onSubmit={save} className="grid items-start gap-6 xl:grid-cols-2">
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader title="Împărțirea banilor" description="Se aplică medicilor fără un procent propriu, pentru consultațiile finalizate de acum înainte." />
            <div className="space-y-2">
              <Label htmlFor="share">Procentul medicului</Label>
              <div className="relative max-w-40">
                <Input id="share" type="number" min={0} max={100} step="0.5" required value={form.doctor_share_percent} onChange={set('doctor_share_percent')} className="pr-8 text-lg font-semibold" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
              </div>
            </div>
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-900">Cum se calculează</p>
              <ol className="list-decimal space-y-1 pl-5 text-slate-600">
                <li>Pacientul achită consultația pe platformă.</li>
                <li>Platforma reține comisionul ei, la fel ca pentru orice medic.</li>
                <li>Din ce rămâne, medicul primește <strong className="text-slate-900">{Number(form.doctor_share_percent) || 0}%</strong>, iar instituția restul.</li>
              </ol>
              <p className="pt-1 text-slate-600">Din <strong>100 MDL</strong> rămași: medicul <strong className="text-slate-900">{money(example.doctor)} MDL</strong>, instituția <strong className="text-slate-900">{money(example.institution)} MDL</strong>.</p>
              <p className="text-xs text-slate-500">Platforma transferă instituției suma întreagă; instituția își plătește medicii din pagina „Plăți”.</p>
            </div>
          </section>

          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader title="Date juridice și bancare" description="Folosite pentru transferurile de la platformă." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="legal_name" label="Denumire juridică"><Input id="legal_name" value={form.legal_name} onChange={set('legal_name')} /></Field>
              <Field id="fiscal_code" label="Cod fiscal (IDNO)"><Input id="fiscal_code" value={form.fiscal_code} onChange={set('fiscal_code')} /></Field>
              <Field id="iban" label="IBAN"><Input id="iban" value={form.iban} onChange={set('iban')} placeholder="MD00 XX00 0000 0000 0000 0000" className="font-mono" /></Field>
              <Field id="bank_name" label="Banca"><Input id="bank_name" value={form.bank_name} onChange={set('bank_name')} /></Field>
              <Field id="email" label="Email de contact"><Input id="email" type="email" value={form.email} onChange={set('email')} /></Field>
              <Field id="phone" label="Telefon"><Input id="phone" type="tel" value={form.phone} onChange={set('phone')} /></Field>
              <Field id="address" label="Adresa" className="sm:col-span-2"><Input id="address" value={form.address} onChange={set('address')} /></Field>
            </div>
            <p className="text-xs text-slate-500">Numele instituției îl modifică administratorul platformei.</p>
          </section>

          <div className="xl:col-span-2">
            <Button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează setările'}</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ id, label, className, children }: { id: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
