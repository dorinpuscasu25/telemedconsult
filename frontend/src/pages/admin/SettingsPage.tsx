import React, { useEffect, useState } from 'react';
import { BarChart3, Gift, Settings } from 'lucide-react';
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
  'affiliate.patient_registration_reward': 0,
  'affiliate.patient_registration_rules': 'Invită o persoană folosind linkul tău personal. Bonusul afișat se rezervă la înregistrare și intră în portofelul tău după ce noul pacient își confirmă emailul. Se acordă un singur bonus pentru fiecare pacient nou. Conturile proprii, duplicate sau frauduloase nu sunt eligibile. Bonusul este credit de platformă și poate fi folosit pentru serviciile disponibile pe telemedconsult.md.',
  minimum_consultation_price: 500,
  operator_exam_price: 250,
  'chat.free_days': 3,
  'chat.reactivation_price': 50,
  'chat.reactivation_hours': 24,
  'chat.total_days': 14,
  'video.default_price': 300,
  'video.default_duration_minutes': 15,
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
  'affiliate.patient_registration_reward': 'Bonus fix pentru pacient verificat (MDL)',
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
  'rate.affiliate_operator'
];

const workflowSettingKeys = [
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
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadAll = () => {
    apiRequest<{data: SettingsMap}>('/admin/settings').then((response) => {
      setSettings({ ...defaultSettings, ...response.data });
    });
    apiRequest<{data: TopDoctor[]}>('/admin/top-doctors').then((response) => setTopDoctors(response.data ?? []));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const update = (key: string, value: string | number | boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async () => {
    setMessage('');
    setIsSaving(true);
    try {
      await apiRequest('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          settings: Object.entries(settings).map(([key, value]) => ({
            key,
            value,
            type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string'
          }))
        })
      });
      setMessage('Setări salvate.');
      loadAll();
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
            <NumberField label="Preț minim consultație" value={Number(settings.minimum_consultation_price)} onChange={(value) => update('minimum_consultation_price', value)} />
            <NumberField label="Preț examinare operator" value={Number(settings.operator_exam_price)} onChange={(value) => update('operator_exam_price', value)} />
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle>Comisioane & afiliere</CardTitle>
            <CardDescription>Se aplică tranzacțiilor noi și se salvează snapshot pe tranzacție.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {commissionSettingKeys.map((key) => (
              <NumberField key={key} label={settingLabel(key)} value={Number(settings[key])} onChange={(value) => update(key, value)} />
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card border-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center"><Gift className="mr-2 h-5 w-5 text-primary" /> Program de afiliere pacienți</CardTitle>
            <CardDescription>Suma este rezervată când pacientul se înregistrează și intră în portofelul celui care l-a invitat după confirmarea emailului.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[280px_1fr]">
            <NumberField
              label={settingLabel('affiliate.patient_registration_reward')}
              value={Number(settings['affiliate.patient_registration_reward'])}
              onChange={(value) => update('affiliate.patient_registration_reward', value)}
            />
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
              <NumberField key={key} label={settingLabel(key)} value={Number(settings[key])} onChange={(value) => update(key, value)} />
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

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} className="rounded-xl bg-white/50" />
    </div>
  );
}
