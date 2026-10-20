import { useEffect, useState } from 'react';
import { BarChart3, Gift, Settings, Wallet } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';

type SettingsMap = Record<string, string | number | boolean | unknown[]>;

type TopDoctor = {
  doctor_id: string;
  doctor: string;
  rating: number;
  current_month_consultations: number;
  previous_total_consultations: number;
  average_response_minutes?: number | null;
  score: number;
};

const defaultSettings: SettingsMap = {
  platform_name: 'telemedconsult.md',
  support_email: 'suport@telemedconsult.md',
  'rate.platform_commission': 30,
  'rate.admin_accounting': 1.5,
  'rate.bank_guarantee': 5.5,
  'rate.bank_transaction': 3.2,
  'rate.affiliate_doctor_topup': 5,
  'rate.affiliate_operator': 6,
  'rate.affiliate_patient_topup': 3,
  'affiliate.patient_topup_min_amount': 0,
  'affiliate.patient_topup_first_only': false,
  'affiliate.patient_registration_rules': 'Invită o persoană folosind linkul tău personal. Când persoana invitată alimentează portofelul, primești automat procentul afișat mai sus din suma alimentată, direct în portofelul tău. Comisionul se acordă doar pentru plăți confirmate, nu la simpla înregistrare. Conturile proprii, duplicate sau frauduloase nu sunt eligibile. Comisionul este credit de platformă și poate fi folosit pentru serviciile disponibile pe telemedconsult.md.',
  'wallet.topup_bonus_percent': 0,
  'wallet.first_topup_promo_enabled': false,
  'wallet.first_topup_promo_doctor_ids': [],
  'consultations.addendum_days': 14,
  'wallet.registration_bonus_enabled': false,
  'wallet.registration_bonus': 0,
  'wallet.max_points_payment_percent': 30,
  minimum_consultation_price: 500,
  operator_exam_price: 250,
  'chat.free_days': 3,
  'chat.reactivation_price': 50,
  'chat.reactivation_hours': 24,
  'chat.total_days': 14,
  'video.default_price': 500,
  'video.default_duration_minutes': 10,
  'payout.request_day_start': 1,
  'payout.request_day_end': 10,
  post_consultation_window_hours: 72,
  notify_new_doctors: true,
  notify_complaints: true,
  notify_withdrawals: true
};

const settingLabels: Record<string, string> = {
  'rate.platform_commission': 'Comision platformă (%)',
  'rate.admin_accounting': 'Administrare și contabilitate (%)',
  'rate.bank_guarantee': 'Garanție bancară (%)',
  'rate.bank_transaction': 'Comision tranzacție bancară (%)',
  'rate.affiliate_doctor_topup': 'Afiliere medic la alimentare (%)',
  'rate.affiliate_operator': 'Afiliere operator (%)',
  'rate.affiliate_patient_topup': 'Comision afiliere pacient la alimentare (%)',
  'wallet.registration_bonus': 'Bonus de bun-venit (MDL)',
  'wallet.registration_bonus_enabled': 'Acordă bonus la înregistrare',
  'wallet.max_points_payment_percent': 'Procent maxim achitabil din bonusuri (%)',
  'wallet.topup_bonus_percent': 'Bonus la alimentare (%)',
  'consultations.addendum_days': 'Fereastră completări consultație (zile)',
  'affiliate.patient_topup_min_amount': 'Alimentare minimă eligibilă (MDL)',
  'affiliate.patient_topup_first_only': 'Comision doar la prima alimentare',
  'chat.free_days': 'Zile chat gratuit',
  'chat.reactivation_price': 'Preț reactivare chat',
  'chat.reactivation_hours': 'Ore reactivare chat',
  'chat.total_days': 'Durată totală chat (zile)',
  'video.default_price': 'Preț video implicit',
  'video.default_duration_minutes': 'Durată video implicită (minute)',
  'payout.request_day_start': 'Zi început cereri payout',
  'payout.request_day_end': 'Zi sfârșit cereri payout',
  post_consultation_window_hours: 'Fereastră post-consultație (ore)',
  notify_new_doctors: 'Notifică adminii la medic nou',
  notify_complaints: 'Notifică adminii la reclamații',
  notify_withdrawals: 'Notifică adminii la cereri de retragere'
};

const commissionSettingKeys = [
  'rate.platform_commission',
  'rate.admin_accounting',
  'rate.bank_guarantee',
  'rate.bank_transaction',
  'rate.affiliate_doctor_topup',
  'rate.affiliate_operator',
  'rate.affiliate_patient_topup'
];

const workflowSettingKeys = [
  'consultations.addendum_days',
  'chat.free_days',
  'chat.reactivation_price',
  'chat.reactivation_hours',
  'chat.total_days',
  'video.default_price',
  'video.default_duration_minutes',
  'payout.request_day_start',
  'payout.request_day_end',
  'post_consultation_window_hours'
];

const notificationSettingKeys = [
  'notify_new_doctors',
  'notify_complaints',
  'notify_withdrawals'
];

function settingLabel(key: string): string {
  return settingLabels[key] ?? key;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsMap>(defaultSettings);
  const [topDoctors, setTopDoctors] = useState<TopDoctor[]>([]);
  const [promoDoctors, setPromoDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadAll = () => {
    setError('');
    apiRequest<{data: SettingsMap}>('/admin/settings')
      .then((response) => setSettings({ ...defaultSettings, ...(response.data ?? {}) }))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca setările.'));
    apiRequest<{data: TopDoctor[]}>('/admin/top-doctors')
      .then((response) => setTopDoctors(response.data ?? []))
      .catch(() => setTopDoctors([]));
    apiRequest<{ data: Array<{ id: string; name: string }> }>('/catalog/doctors')
      .then((response) => setPromoDoctors(response.data))
      .catch(() => setPromoDoctors([]));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const update = (key: string, value: string | number | boolean | unknown[]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async () => {
    setMessage('');
    setError('');
    setIsSaving(true);
    try {
      await apiRequest('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          settings: Object.entries({ ...settings, 'consultations.addendum_days': 14 }).map(([key, value]) => ({
            key,
            value,
            // Setările structurate (de ex. regulile de mapare HIGO, editate din
            // alt panou) trec pe aici la fiecare salvare: fără `json` și-ar
            // pierde tipul și ar apărea ca text.
            type:
              typeof value === 'boolean'
                ? 'boolean'
                : typeof value === 'number'
                  ? 'number'
                  : value !== null && typeof value === 'object'
                    ? 'json'
                    : 'string'
          }))
        })
      });
      setMessage('Setări salvate.');
      loadAll();
    } catch (err) {
      // Fără acest catch, un 422 de validare (de ex. procent peste 100) dispărea
      // în silence: mesajul de succes nu apărea și nimic nu explica de ce.
      setError(err instanceof Error ? err.message : 'Nu am putut salva setările.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Setări platformă</h1>
        <p className="text-slate-500">Parametri business editabili și scor medici. Regiunile se administrează din secțiunea dedicată „Regiuni”.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="flex items-center"><Settings className="mr-2 h-5 w-5 text-primary" /> General</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <TextField label="Nume platformă" value={String(settings.platform_name)} onChange={(value) => update('platform_name', value)} />
            <TextField label="Email suport" value={String(settings.support_email)} onChange={(value) => update('support_email', value)} />
            <NumberField label="Bonus la alimentare (%) — 0 dezactivează" value={Number(settings['wallet.topup_bonus_percent'])} onChange={(value) => update('wallet.topup_bonus_percent', Math.min(100, Math.max(0, value)))} />
            <p className="text-sm text-slate-500">Suma depusă intră integral în portofelul de bază. Bonusul procentual se adaugă separat în portofelul de bonusuri.</p>
            <NumberField label="Preț minim consultație" value={Number(settings.minimum_consultation_price)} onChange={(value) => update('minimum_consultation_price', value)} />
            <NumberField label="Preț examinare operator" value={Number(settings.operator_exam_price)} onChange={(value) => update('operator_exam_price', value)} />
            <NumberField label={settingLabel('wallet.max_points_payment_percent')} value={Number(settings['wallet.max_points_payment_percent'])} onChange={(value) => update('wallet.max_points_payment_percent', Math.min(100, Math.max(0, value)))} />
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle>Comisioane & afiliere</CardTitle>
            <CardDescription>Se aplică tranzacțiilor noi și se salvează snapshot pe tranzacție.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {commissionSettingKeys.map((key) => (
              <NumberField key={key} disabled={key === 'consultations.addendum_days'} label={settingLabel(key)} value={key === 'consultations.addendum_days' ? 14 : Number(settings[key])} onChange={(value) => update(key, value)} />
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card border-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Promoție la prima alimentare: 500 + 500 MDL</CardTitle>
            <CardDescription>Prima alimentare confirmată de minimum 500 MDL aduce o singură dată 500 MDL bonus promoțional. Bonusul se folosește automat pentru maximum 50% din consultația medicului eligibil.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-xl border bg-white/50 p-4"><span className="text-sm font-medium">Activează promoția pentru alimentările viitoare</span><Switch checked={Boolean(settings['wallet.first_topup_promo_enabled'])} onCheckedChange={(value) => update('wallet.first_topup_promo_enabled', value)} /></label>
            <div className="space-y-2"><p className="text-sm font-medium">Medic eligibil</p><p className="text-xs text-slate-500">Selectează medicul care oferă promoția. Modificările se aplică bonusurilor acordate ulterior; bonusurile deja primite își păstrează condițiile.</p>
              {promoDoctors.map((doctor) => <label key={doctor.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={(Array.isArray(settings['wallet.first_topup_promo_doctor_ids']) ? settings['wallet.first_topup_promo_doctor_ids'] : []).map(Number).includes(Number(doctor.id))} onChange={(event) => { const ids = (Array.isArray(settings['wallet.first_topup_promo_doctor_ids']) ? settings['wallet.first_topup_promo_doctor_ids'] : []).map(Number); update('wallet.first_topup_promo_doctor_ids', event.target.checked ? [...ids, Number(doctor.id)] : ids.filter((id) => id !== Number(doctor.id))); }} />{doctor.name}</label>)}
              {!promoDoctors.length && <p className="text-sm text-amber-700">Nu sunt medici aprobați disponibili pentru selectare.</p>}
            </div>
            <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Exemplu: depui 500 MDL și primești separat 500 MDL bonus promoțional. La o consultație eligibilă de 500 MDL se folosesc automat 250 MDL din banii depuși și 250 MDL din bonus. După două asemenea consultații, ai consumat 500 MDL din fiecare sold.</div>
            <p className="text-xs text-slate-500">Bonusul promoțional nu achită deplasarea operatorului sau examinările suplimentare. Nu se acordă retroactiv conturilor care au avut deja o alimentare confirmată.</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center"><Wallet className="mr-2 h-5 w-5 text-primary" /> Bonus de bun-venit</CardTitle>
            <CardDescription>
              Suma se creditează automat în portofelul utilizatorului nou, o singură dată, la confirmarea emailului —
              nu la crearea contului, ca să nu se poată acumula bonusuri cu adrese inventate. Se acordă doar conturilor
              de utilizator; medicii și operatorii nu primesc.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/50 p-4">
              <Label className="pr-3 text-sm leading-5">
                {settingLabel('wallet.registration_bonus_enabled')}
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Dezactivat = niciun bonus, indiferent de sumă.
                </span>
              </Label>
              <Switch
                checked={Boolean(settings['wallet.registration_bonus_enabled'])}
                onCheckedChange={(value) => update('wallet.registration_bonus_enabled', value)}
              />
            </div>
            <NumberField
              label={settingLabel('wallet.registration_bonus')}
              value={Number(settings['wallet.registration_bonus'])}
              onChange={(value) => update('wallet.registration_bonus', value)}
            />
          </CardContent>
        </Card>

        <Card className="glass-card border-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center"><Gift className="mr-2 h-5 w-5 text-primary" /> Program de afiliere pacienți</CardTitle>
            <CardDescription>
              Cel care invită primește procentul de mai jos din fiecare sumă alimentată în portofel de persoana invitată.
              Comisionul se acordă doar la plăți confirmate, iar cota folosită se salvează ca snapshot pe fiecare comision.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[280px_1fr]">
            <div className="space-y-4">
              <p className="text-sm font-medium">Regulă rapidă de afiliere</p>
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setSettings((current) => ({ ...current, 'rate.affiliate_patient_topup': 3, 'affiliate.patient_topup_first_only': false }))}>3% la fiecare alimentare</Button><Button type="button" variant="outline" onClick={() => setSettings((current) => ({ ...current, 'rate.affiliate_patient_topup': 10, 'affiliate.patient_topup_first_only': true }))}>10% o singură dată</Button></div>
              <p className="text-xs text-slate-500">Exemplu la 3%: 1.000 MDL → 30 MDL bonus pentru invitator; 500 MDL → 15 MDL. Alegerea se aplică după salvare.</p>
              <NumberField
                label={settingLabel('rate.affiliate_patient_topup')}
                value={Number(settings['rate.affiliate_patient_topup'])}
                onChange={(value) => update('rate.affiliate_patient_topup', value)}
              />
              <NumberField
                label={settingLabel('affiliate.patient_topup_min_amount')}
                value={Number(settings['affiliate.patient_topup_min_amount'])}
                onChange={(value) => update('affiliate.patient_topup_min_amount', value)}
              />
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/50 p-4">
                <Label className="pr-3 text-sm leading-5">
                  {settingLabel('affiliate.patient_topup_first_only')}
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    Dezactivat = comision la fiecare alimentare.
                  </span>
                </Label>
                <Switch
                  checked={Boolean(settings['affiliate.patient_topup_first_only'])}
                  onCheckedChange={(value) => update('affiliate.patient_topup_first_only', value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Regulament afișat pacientului</Label>
              <Textarea
                rows={6}
                maxLength={4000}
                value={String(settings['affiliate.patient_registration_rules'] ?? '')}
                onChange={(event) => update('affiliate.patient_registration_rules', event.target.value)}
                className="rounded-xl bg-white/50"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardHeader>
          <CardTitle>Chat, video și payout</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {workflowSettingKeys.map((key) => (
              <NumberField key={key} disabled={key === 'consultations.addendum_days'} label={settingLabel(key)} value={key === 'consultations.addendum_days' ? 14 : Number(settings[key])} onChange={(value) => update(key, value)} />
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardHeader>
          <CardTitle>Notificări</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notificationSettingKeys.map((key) => (
              <div key={key} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/50 p-4">
                <Label>{settingLabel(key)}</Label>
                <Switch checked={Boolean(settings[key])} onCheckedChange={(value) => update(key, value)} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="flex items-center"><BarChart3 className="mr-2 h-5 w-5 text-primary" /> Top medici</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {topDoctors.map((doctor, index) => (
            <div key={doctor.doctor_id} className="grid gap-2 rounded-xl border border-slate-200 bg-white/70 p-4 md:grid-cols-[40px_1fr_repeat(4,auto)] md:items-center">
              <strong>#{index + 1}</strong>
              <span className="font-semibold">{doctor.doctor}</span>
              <span className="text-sm text-slate-500">Luna: {doctor.current_month_consultations}</span>
              <span className="text-sm text-slate-500">Total anterior: {doctor.previous_total_consultations}</span>
              <span className="text-sm text-slate-500">Răspuns: {doctor.average_response_minutes ?? '-'} min</span>
              <span className="font-bold text-primary">{doctor.score}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-4">
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && <span className="text-sm font-medium text-red-600">{error}</span>}
        <Button disabled={isSaving} onClick={saveSettings} className="rounded-xl bg-gradient-to-r from-primary to-purple-600 px-8">
          {isSaving ? 'Se salvează...' : 'Salvează toate'}
        </Button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl bg-white/50" />
    </div>
  );
}

function NumberField({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" disabled={disabled} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} className="rounded-xl bg-white/50" />
    </div>
  );
}
