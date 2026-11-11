import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, BarChart3, Bell, Gift, MessagesSquare, Percent, Settings, Sparkles, Wallet, type LucideIcon } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { PageHeader } from '../../components/app/PageHeader';
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
  'rate.platform_commission': 33,
  'rate.admin_accounting': 0,
  'rate.bank_guarantee': 0,
  'rate.bank_transaction': 0,
  'rate.affiliate_doctor_topup': 3,
  'rate.affiliate_operator': 3,
  'rate.affiliate_patient_topup': 3,
  'affiliate.patient_topup_min_amount': 0,
  'affiliate.patient_topup_first_only': false,
  'affiliate.patient_registration_rules': 'Invită o persoană folosind linkul tău personal. Când persoana invitată alimentează portofelul, primești automat procentul afișat mai sus din suma alimentată, direct în portofelul tău. Comisionul se acordă doar pentru plăți confirmate, nu la simpla înregistrare. Conturile proprii, duplicate sau frauduloase nu sunt eligibile. Comisionul este credit de platformă și poate fi folosit pentru serviciile disponibile pe telemedconsult.md.',
  'wallet.topup_bonus_percent': 0,
  'wallet.first_topup_promo_enabled': false,
  'wallet.first_topup_promo_doctor_ids': [],
  'wallet.first_topup_promo_max_grants': 0,
  'consultations.addendum_days': 14,
  'wallet.registration_bonus_enabled': false,
  'wallet.registration_bonus': 0,
  'wallet.max_points_payment_percent': 40,
  'onboarding.first_consultation_topup': 500,
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
  'consultations.auto_close_days': 3,
  'consultations.no_show_refund_hours': 24,
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
  'rate.affiliate_patient_topup': 'Comision afiliere (%) — la toate încărcările invitaților, în bonusuri',
  'wallet.registration_bonus': 'Bonus de bun-venit (MDL)',
  'wallet.registration_bonus_enabled': 'Acordă bonus la înregistrare',
  'wallet.max_points_payment_percent': 'Procent maxim achitabil din bonusuri (%)',
  'onboarding.first_consultation_topup': 'Sumă propusă pentru prima consultație (MDL)',
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

/** Secțiunile din submeniu; cheia apare în URL (?tab=…) ca pagina să se poată redeschide pe aceeași secțiune. */
const SECTIONS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: 'general', label: 'General', icon: Settings },
  { key: 'commissions', label: 'Comisioane', icon: Percent },
  { key: 'payments', label: 'Plata consultațiilor', icon: Banknote },
  { key: 'wallet', label: 'Portofel și bonusuri', icon: Wallet },
  { key: 'promo', label: 'Promoția 500 + 500', icon: Sparkles },
  { key: 'affiliate', label: 'Afiliere pacienți', icon: Gift },
  { key: 'workflow', label: 'Chat, video, payout', icon: MessagesSquare },
  { key: 'notifications', label: 'Notificări', icon: Bell },
  { key: 'top-doctors', label: 'Top medici', icon: BarChart3 }
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

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = SECTIONS.find((section) => section.key === requestedTab)?.key ?? 'general';
  const promoDoctorIds = (Array.isArray(settings['wallet.first_topup_promo_doctor_ids']) ? settings['wallet.first_topup_promo_doctor_ids'] : []).map(Number);

  return (
    <div className="space-y-6 pb-24">
      <PageHeader title="Setări platformă" description="Parametri business editabili și scor medici. Regiunile se administrează din secțiunea dedicată „Regiuni”." />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', value); return next; }, { replace: true })}
        orientation="vertical"
        className="gap-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start"
      >
        <TabsList className="flex w-full flex-row justify-start gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm lg:sticky lg:top-20 lg:flex-col lg:items-stretch lg:overflow-visible">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <TabsTrigger
              key={key}
              value={key}
              className="flex-none justify-start rounded-xl px-3 text-slate-600 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none lg:w-full"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0">
          <TabsContent value="general">
            <Section title="General" description="Datele platformei și prețurile de bază.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <TextField label="Nume platformă" value={String(settings.platform_name)} onChange={(value) => update('platform_name', value)} />
                <TextField label="Email suport" value={String(settings.support_email)} onChange={(value) => update('support_email', value)} />
                <NumberField label="Preț minim consultație (MDL)" value={Number(settings.minimum_consultation_price)} onChange={(value) => update('minimum_consultation_price', value)} />
                <NumberField label="Preț examinare operator (MDL)" value={Number(settings.operator_exam_price)} onChange={(value) => update('operator_exam_price', value)} />
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="commissions">
            <Section title="Comisioane și afiliere" description="Se aplică tranzacțiilor noi și se salvează snapshot pe tranzacție.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {commissionSettingKeys.map((key) => (
                  <NumberField key={key} label={settingLabel(key)} value={Number(settings[key])} onChange={(value) => update(key, value)} />
                ))}
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="payments">
            <Section
              title="Plata consultațiilor"
              description="Suma consultației rămâne rezervată din portofelul pacientului până la închidere. Medicul (sau operatorul) primește banii când pacientul închide consultația lăsând recenzia. Pacientul vede aceste termene la programare și pe consultație."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <NumberField label="Închidere automată fără recenzie (zile)" value={Number(settings['consultations.auto_close_days'])} onChange={(value) => update('consultations.auto_close_days', Math.max(1, Math.floor(value)))} />
                  <p className="text-xs leading-5 text-slate-500">Numărate de la publicarea concluziei. La termen, consultația se închide singură și plata ajunge la medic.</p>
                </div>
                <div className="space-y-2">
                  <NumberField label="Returnare dacă nu are loc (ore după ora programată)" value={Number(settings['consultations.no_show_refund_hours'])} onChange={(value) => update('consultations.no_show_refund_hours', Math.max(1, Math.floor(value)))} />
                  <p className="text-xs leading-5 text-slate-500">Dacă la atâtea ore după ora programată nu există concluzie, banii revin integral pacientului. Examinările la domiciliu deja făcute rămân pentru decizia ta.</p>
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="wallet" className="space-y-6">
            <Section title="Bonusuri în portofel" description="Suma depusă intră integral în portofelul de bază. Bonusul procentual se adaugă separat în portofelul de bonusuri.">
              <div className="grid gap-4 md:grid-cols-2">
                <NumberField label="Bonus la alimentare (%) — 0 dezactivează" value={Number(settings['wallet.topup_bonus_percent'])} onChange={(value) => update('wallet.topup_bonus_percent', Math.min(100, Math.max(0, value)))} />
                <NumberField label={settingLabel('wallet.max_points_payment_percent')} value={Number(settings['wallet.max_points_payment_percent'])} onChange={(value) => update('wallet.max_points_payment_percent', Math.min(100, Math.max(0, value)))} />
              </div>
            </Section>
            <Section
              title="Bonus de bun-venit"
              description="Suma se creditează automat în portofelul utilizatorului nou, o singură dată, la confirmarea emailului — nu la crearea contului, ca să nu se poată acumula bonusuri cu adrese inventate. Se acordă doar conturilor de utilizator; medicii și operatorii nu primesc."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <ToggleRow label={settingLabel('wallet.registration_bonus_enabled')} hint="Dezactivat = niciun bonus, indiferent de sumă." checked={Boolean(settings['wallet.registration_bonus_enabled'])} onChange={(value) => update('wallet.registration_bonus_enabled', value)} />
                <NumberField label={settingLabel('wallet.registration_bonus')} value={Number(settings['wallet.registration_bonus'])} onChange={(value) => update('wallet.registration_bonus', value)} />
              </div>
            </Section>
            <Section title="Pornire pacient nou" description="La alegerea pachetului, pacientul poate bifa să adauge această sumă în portofel, în aceeași plată cu pachetul, ca să nu mai alimenteze separat la prima programare. 0 = opțiunea nu apare.">
              <div className="grid gap-4 md:grid-cols-2">
                <NumberField label={settingLabel('onboarding.first_consultation_topup')} value={Number(settings['onboarding.first_consultation_topup'])} onChange={(value) => update('onboarding.first_consultation_topup', value)} />
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="promo">
            <Section title="Promoție la prima alimentare: 500 + 500 MDL" description="Prima alimentare confirmată de minimum 500 MDL aduce o singură dată 500 MDL bonus promoțional. Bonusul se folosește automat pentru maximum 50% din consultația medicului eligibil.">
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-4">
                  <ToggleRow label="Activează promoția pentru alimentările viitoare" checked={Boolean(settings['wallet.first_topup_promo_enabled'])} onChange={(value) => update('wallet.first_topup_promo_enabled', value)} />
                  <NumberField label="Număr maxim de acordări automate (ex. primii 120) — 0 = nelimitat" value={Number(settings['wallet.first_topup_promo_max_grants'])} onChange={(value) => update('wallet.first_topup_promo_max_grants', Math.max(0, Math.floor(value)))} />
                  <p className="text-xs text-slate-500">Utilizatorilor înregistrați deja promoția li se acordă manual din Utilizatori → Portofel → „Acordă promoția”. Acordările manuale nu se scad din limita de mai sus.</p>
                  <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Exemplu: depui 500 MDL și primești separat 500 MDL bonus promoțional. La o consultație eligibilă de 500 MDL se folosesc automat 250 MDL din banii depuși și 250 MDL din bonus. După două asemenea consultații, ai consumat 500 MDL din fiecare sold.</div>
                  <p className="text-xs text-slate-500">Bonusul promoțional nu achită deplasarea operatorului sau examinările suplimentare. Automat nu se acordă conturilor care au avut deja o alimentare confirmată; pentru acestea folosește acordarea manuală.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Medici eligibili {promoDoctorIds.length > 0 && <span className="font-normal text-slate-500">· {promoDoctorIds.length} selectați</span>}</p>
                  <p className="text-xs text-slate-500">Dacă nu selectezi niciun medic, promoția se folosește la toți medicii. Modificările se aplică bonusurilor acordate ulterior; bonusurile deja primite își păstrează condițiile.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {promoDoctors.map((doctor) => (
                      <label key={doctor.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={promoDoctorIds.includes(Number(doctor.id))}
                          onChange={(event) => update('wallet.first_topup_promo_doctor_ids', event.target.checked ? [...promoDoctorIds, Number(doctor.id)] : promoDoctorIds.filter((id) => id !== Number(doctor.id)))}
                        />
                        {doctor.name}
                      </label>
                    ))}
                  </div>
                  {!promoDoctors.length && <p className="text-sm text-amber-700">Nu sunt medici aprobați disponibili pentru selectare.</p>}
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="affiliate">
            <Section title="Program de afiliere pacienți" description="Cel care invită primește procentul de mai jos din fiecare sumă alimentată în portofel de persoana invitată. Comisionul se acordă doar la plăți confirmate, iar cota folosită se salvează ca snapshot pe fiecare comision.">
              <div className="grid gap-6 xl:grid-cols-[minmax(280px,380px)_1fr]">
                <div className="space-y-4">
                  <p className="text-sm font-medium">Regulă rapidă de afiliere</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => setSettings((current) => ({ ...current, 'rate.affiliate_patient_topup': 3, 'affiliate.patient_topup_first_only': false }))}>3% la fiecare alimentare</Button>
                    <Button type="button" variant="outline" onClick={() => setSettings((current) => ({ ...current, 'rate.affiliate_patient_topup': 10, 'affiliate.patient_topup_first_only': true }))}>10% o singură dată</Button>
                  </div>
                  <p className="text-xs text-slate-500">Exemplu la 3%: 1.000 MDL → 30 MDL bonus pentru invitator; 500 MDL → 15 MDL. Alegerea se aplică după salvare.</p>
                  <NumberField label={settingLabel('rate.affiliate_patient_topup')} value={Number(settings['rate.affiliate_patient_topup'])} onChange={(value) => update('rate.affiliate_patient_topup', value)} />
                  <NumberField label={settingLabel('affiliate.patient_topup_min_amount')} value={Number(settings['affiliate.patient_topup_min_amount'])} onChange={(value) => update('affiliate.patient_topup_min_amount', value)} />
                  <ToggleRow label={settingLabel('affiliate.patient_topup_first_only')} hint="Dezactivat = comision la fiecare alimentare." checked={Boolean(settings['affiliate.patient_topup_first_only'])} onChange={(value) => update('affiliate.patient_topup_first_only', value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="affiliate-rules">Regulament afișat pacientului</Label>
                  <Textarea
                    id="affiliate-rules"
                    rows={12}
                    maxLength={4000}
                    value={String(settings['affiliate.patient_registration_rules'] ?? '')}
                    onChange={(event) => update('affiliate.patient_registration_rules', event.target.value)}
                    className="rounded-xl bg-white/50"
                  />
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="workflow">
            <Section title="Chat, video și payout">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {workflowSettingKeys.map((key) => (
                  <NumberField key={key} disabled={key === 'consultations.addendum_days'} label={settingLabel(key)} value={key === 'consultations.addendum_days' ? 14 : Number(settings[key])} onChange={(value) => update(key, value)} />
                ))}
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="notifications">
            <Section title="Notificări pentru admini">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {notificationSettingKeys.map((key) => (
                  <ToggleRow key={key} label={settingLabel(key)} checked={Boolean(settings[key])} onChange={(value) => update(key, value)} />
                ))}
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="top-doctors">
            <Section title="Top medici" description="Scorul calculat din rating, consultațiile lunii și timpul de răspuns. Doar pentru vizualizare.">
              <div className="grid gap-3">
                {topDoctors.map((doctor, index) => (
                  <div key={doctor.doctor_id} className="grid gap-2 rounded-xl border border-slate-200 bg-white/70 p-4 md:grid-cols-[40px_1fr_repeat(4,auto)] md:items-center md:gap-6">
                    <strong>#{index + 1}</strong>
                    <span className="font-semibold">{doctor.doctor}</span>
                    <span className="text-sm text-slate-500">Luna: {doctor.current_month_consultations}</span>
                    <span className="text-sm text-slate-500">Total anterior: {doctor.previous_total_consultations}</span>
                    <span className="text-sm text-slate-500">Răspuns: {doctor.average_response_minutes ?? '-'} min</span>
                    <span className="font-bold text-primary">{doctor.score}</span>
                  </div>
                ))}
                {!topDoctors.length && <p className="text-sm text-slate-500">Încă nu există date pentru clasament.</p>}
              </div>
            </Section>
          </TabsContent>
        </div>
      </Tabs>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && <span role="alert" className="text-sm font-medium text-red-600">{error}</span>}
        <span className="mr-auto hidden text-xs text-slate-500 sm:block">Butonul salvează setările din toate secțiunile.</span>
        <Button disabled={isSaving} onClick={saveSettings} className="rounded-xl bg-gradient-to-r from-primary to-purple-600 px-8">
          {isSaving ? 'Se salvează...' : 'Salvează toate'}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="glass-card border-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription className="max-w-4xl">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white/50 p-4">
      <span className="text-sm font-medium leading-5">
        {label}
        {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
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
