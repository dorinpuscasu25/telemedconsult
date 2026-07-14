import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, CheckCircle2, Gift, HeartPulse, Mail, ShieldCheck, Stethoscope, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../components/ui/select';
import { AccountType, useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';

type RegisterStep = 'details' | 'verify';
type Specialty = { id: number; name: string };
type Region = { id: number; name: string };

const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string; icon: React.ElementType }[] = [
  { value: 'patient', label: 'Pacient', hint: 'Consultații și îngrijire', icon: HeartPulse },
  { value: 'doctor', label: 'Medic', hint: 'Oferă consultații', icon: Stethoscope },
  { value: 'operator', label: 'Operator', hint: 'Examinări la domiciliu', icon: Users }
];

export function RegisterPage() {
  const [step, setStep] = useState<RegisterStep>('details');
  const [accountType, setAccountType] = useState<AccountType>('patient');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [region, setRegion] = useState('');
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [otpCode, setOtpCode] = useState('');
  const [message, setMessage] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const { register, verifyEmailOtp, resendEmailOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const referralCode = useMemo(() => (searchParams.get('ref') || '').trim().toUpperCase(), [searchParams]);
  const passwordsMatch = passwordConfirmation.length === 0 || password === passwordConfirmation;
  const isProvider = accountType === 'doctor' || accountType === 'operator';

  useEffect(() => {
    apiRequest<{ data: Specialty[] }>('/catalog/specialties', { auth: false })
      .then((response) => setSpecialties(response.data ?? []))
      .catch(() => setSpecialties([]));
    apiRequest<{ data: Region[] }>('/catalog/regions', { auth: false })
      .then((response) => setRegions(response.data ?? []))
      .catch(() => setRegions([]));
  }, []);

  const specialtyLabel = specialties.find((item) => String(item.id) === specialtyId)?.name;

  const routeForRole = (role: string) => (role === 'admin' ? '/admin' : `/${role}`);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 8) {
      setError('Parola trebuie să aibă minim 8 caractere.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Parolele introduse nu coincid.');
      return;
    }
    if (accountType === 'doctor' && !specialtyId) {
      setError('Alegeți specialitatea.');
      return;
    }
    if (accountType === 'operator' && !region) {
      setError('Alegeți regiunea.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await register({
        name: name.trim(),
        email: normalizedEmail,
        phone: phone.trim() || undefined,
        password,
        password_confirmation: passwordConfirmation,
        account_type: accountType,
        specialty_id: accountType === 'doctor' ? Number(specialtyId) : undefined,
        license_number: accountType === 'doctor' ? licenseNumber.trim() || undefined : undefined,
        region: accountType === 'operator' ? region : undefined,
        referral_code: accountType === 'patient' && referralCode ? referralCode : undefined
      });
      setMessage(response.message);
      setRequiresApproval(Boolean(response.requires_approval));
      setDevOtp(response.dev_otp || null);
      if (response.dev_otp) setOtpCode(response.dev_otp);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut crea contul.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!/^\d{6}$/.test(otpCode)) {
      setError('Introduceți codul de 6 cifre primit pe email.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await verifyEmailOtp(normalizedEmail, otpCode);
      navigate(user.status === 'pending' ? '/pending' : routeForRole(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut verifica emailul.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');
    setIsResending(true);
    try {
      const response = await resendEmailOtp(normalizedEmail);
      setMessage(response.message);
      setDevOtp(response.dev_otp || null);
      if (response.dev_otp) setOtpCode(response.dev_otp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut retrimite codul.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-[480px]">
          <Link to="/" className="mb-8 flex items-center justify-center">
            <div className="mr-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
              <Activity className="h-6 w-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight sm:text-3xl">
              telemedconsult<span className="text-primary">.md</span>
            </span>
          </Link>

          <Card className="border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
            {step === 'details' ? (
              <form onSubmit={handleRegister}>
                <CardHeader className="space-y-2 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight">Creare cont</CardTitle>
                  <CardDescription>
                    {accountType === 'patient'
                      ? 'Contul de pacient se activează imediat după confirmarea emailului.'
                      : 'Contul se activează după confirmarea emailului și aprobarea unui administrator.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Feedback error={error} message={message} />

                  {referralCode && (
                    <div className={`flex gap-3 rounded-xl border p-3 text-sm ${accountType === 'patient' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                      <Gift className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <p className="font-semibold">Invitație de afiliere detectată</p>
                        <p className="mt-0.5 leading-5">
                          {accountType === 'patient'
                            ? 'Linkul va fi aplicat automat. Persoana care te-a invitat primește bonusul după ce îți confirmi emailul.'
                            : 'Bonusul se aplică numai unei înregistrări noi de pacient.'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="font-medium text-slate-700">Tip de cont</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {ACCOUNT_TYPES.map((option) => {
                        const active = accountType === option.value;
                        return (
                          <button
                            type="button"
                            key={option.value}
                            onClick={() => setAccountType(option.value)}
                            className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                              active
                                ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}>
                            <option.icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-slate-400'}`} />
                            <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-slate-700'}`}>
                              {option.label}
                            </span>
                            <span className="text-[11px] leading-tight text-slate-400">{option.hint}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Field label="Nume complet" htmlFor="name">
                    <Input
                      id="name"
                      autoComplete="name"
                      placeholder="Ion Popescu"
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white" />
                  </Field>

                  <Field label="Email" htmlFor="email">
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="nume@exemplu.com"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white" />
                  </Field>

                  <Field label="Telefon" htmlFor="phone">
                    <Input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+373 600 00 000"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white" />
                  </Field>

                  {accountType === 'doctor' && (
                    <>
                      <Field label="Specialitate" htmlFor="specialty">
                        <Select value={specialtyId} onValueChange={setSpecialtyId}>
                          <SelectTrigger id="specialty" className="h-11 rounded-xl border-slate-200 bg-white">
                            {specialtyLabel || <span className="text-muted-foreground">Alege specialitatea</span>}
                          </SelectTrigger>
                          <SelectContent className="max-h-64 overflow-y-auto">
                            {specialties.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Număr de licență" htmlFor="license">
                        <Input
                          id="license"
                          placeholder="ex. MD-123456"
                          value={licenseNumber}
                          onChange={(event) => setLicenseNumber(event.target.value)}
                          className="h-11 rounded-xl border-slate-200 bg-white" />
                      </Field>
                    </>
                  )}

                  {accountType === 'operator' && (
                    <Field label="Regiune" htmlFor="region">
                      <Select value={region} onValueChange={setRegion}>
                        <SelectTrigger id="region" className="h-11 rounded-xl border-slate-200 bg-white">
                          {region || <span className="text-muted-foreground">Alege regiunea</span>}
                        </SelectTrigger>
                        <SelectContent className="max-h-64 overflow-y-auto">
                          {regions.map((item) => (
                            <SelectItem key={item.id} value={item.name}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  <Field label="Parolă" htmlFor="password">
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white" />
                  </Field>

                  <Field label="Confirmare parolă" htmlFor="password_confirmation">
                    <Input
                      id="password_confirmation"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      className={`h-11 rounded-xl bg-white ${passwordsMatch ? 'border-slate-200' : 'border-red-300 focus-visible:ring-red-200'}`} />
                  </Field>
                </CardContent>
                <CardFooter className="flex flex-col space-y-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-xl text-base shadow-lg shadow-primary/20">
                    {isSubmitting ? 'Se creează contul...' : isProvider ? 'Trimite cererea' : 'Creează cont'}
                  </Button>
                  <div className="text-center text-sm text-slate-500">
                    Aveți deja cont?{' '}
                    <Link to="/login" className="font-semibold text-primary transition-colors hover:text-primary/80">
                      Autentificați-vă
                    </Link>
                  </div>
                </CardFooter>
              </form>
            ) : (
              <form onSubmit={handleVerify}>
                <CardHeader className="space-y-2 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Mail className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight">Verificare email</CardTitle>
                  <CardDescription>
                    Am trimis un cod de 6 cifre la <span className="font-medium text-slate-700">{normalizedEmail}</span>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Feedback error={error} message={message} />
                  {requiresApproval && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      După confirmarea emailului, contul tău va fi verificat de un administrator înainte de activare.
                    </div>
                  )}
                  <Field label="Cod OTP" htmlFor="otp">
                    <Input
                      id="otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="000000"
                      required
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="h-12 rounded-xl border-slate-200 bg-white text-center text-xl font-semibold tracking-[0.35em]" />
                  </Field>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Codul expiră în 10 minute. Dacă nu îl găsiți, verificați și folderul Spam.
                  </div>
                  {devOtp && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                      Cod demo: {devOtp}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex flex-col space-y-3">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-xl text-base shadow-lg shadow-primary/20">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {isSubmitting ? 'Se verifică...' : 'Verifică și continuă'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isResending}
                    onClick={handleResend}
                    className="h-11 w-full rounded-xl bg-white">
                    {isResending ? 'Se retrimite...' : 'Retrimite codul'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('details');
                      setOtpCode('');
                      setError('');
                      setMessage('');
                    }}
                    className="inline-flex items-center justify-center text-sm font-medium text-slate-500 hover:text-slate-800">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Înapoi la datele contului
                  </button>
                </CardFooter>
              </form>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="font-medium text-slate-700">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Feedback({ error, message }: { error: string; message: string }) {
  if (!error && !message) return null;

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
      {error || message}
    </div>
  );
}
