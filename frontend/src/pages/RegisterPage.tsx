import { DoctorRegistrationSteps } from '../components/auth/DoctorRegistrationSteps';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, CheckCircle2, Eye, EyeOff, Gift, Mail, RotateCw, ShieldCheck, Stethoscope, Users } from 'lucide-react';
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
import { AccountType, useAuth, WELCOME_BONUS_KEY } from '../contexts/AuthContext';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';
import { apiRequest } from '../lib/api';
import { rememberNext, safePatientPath } from '../lib/onboarding-next';

type RegisterStep = 'details' | 'verify';
type Specialty = { id: number; name: string };
type Region = { id: number; name: string };

const SPECIALIST_TYPES: { value: AccountType; label: string; hint: string; icon: React.ElementType }[] = [
  { value: 'doctor', label: 'Medic', hint: 'Oferă consultații', icon: Stethoscope },
  { value: 'operator', label: 'Operator', hint: 'Examinări la domiciliu', icon: Users }
];

/**
 * `/register` e formularul pacientului (nume, email, parolă). Medicii și operatorii
 * se înregistrează pe `/register/specialist`, pe același endpoint.
 */
export function RegisterPage({ audience = 'patient' }: { audience?: 'patient' | 'specialist' }) {
  const isPatientForm = audience === 'patient';
  const { isEnabled } = useFeatureFlags();
  const [step, setStep] = useState<RegisterStep>('details');
  // `/register/specialist?type=operator` deschide direct contul de operator.
  const [accountType, setAccountType] = useState<AccountType>(isPatientForm ? 'patient' : new URLSearchParams(window.location.search).get('type') === 'operator' ? 'operator' : 'doctor');
  const [showPassword, setShowPassword] = useState(false);
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
  const [resendIn, setResendIn] = useState(0);
  const [verified, setVerified] = useState<{ bonus: number } | null>(null);
  const { register, verifyEmailOtp, resendEmailOtp } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const nextPath = safePatientPath(searchParams.get('next'));
  useEffect(() => { rememberNext(nextPath); }, [nextPath]);
  const referralCode = useMemo(() => (searchParams.get('ref') || '').trim().toUpperCase(), [searchParams]);
  const passwordsMatch = isPatientForm || passwordConfirmation.length === 0 || password === passwordConfirmation;
  const isProvider = accountType === 'doctor' || accountType === 'operator';

  useEffect(() => {
    apiRequest<{ data: Specialty[] }>('/catalog/specialties', { auth: false })
      .then((response) => setSpecialties(response.data ?? []))
      .catch(() => setSpecialties([]));
    apiRequest<{ data: Region[] }>('/catalog/regions', { auth: false })
      .then((response) => setRegions(response.data ?? []))
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

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
    if (!isPatientForm && password !== passwordConfirmation) {
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
        password_confirmation: isPatientForm ? password : passwordConfirmation,
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
      setResendIn(60);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut crea contul.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (isSubmitting) return;
    setError('');
    setMessage('');

    if (!/^\d{6}$/.test(otpCode)) {
      setError('Introduceți codul de 6 cifre primit pe email.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await verifyEmailOtp(normalizedEmail, otpCode);
      if (user.role === 'patient' && user.status !== 'pending') {
        // 2b: confirmarea și bonusul se arată aici; asistentul nu-l mai repetă.
        let bonus = 0;
        try { bonus = Number(sessionStorage.getItem(WELCOME_BONUS_KEY)) || 0; sessionStorage.removeItem(WELCOME_BONUS_KEY); } catch { /* fără stocare */ }
        setVerified({ bonus });
        return;
      }
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
      setResendIn(60);
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

          <Card className="border-0 bg-white shadow-none sm:border sm:border-slate-200 sm:shadow-xl sm:shadow-slate-200/70">
            {!isPatientForm && accountType === 'doctor' && <DoctorRegistrationSteps current={step === 'details' ? 1 : 2} />}
            {step === 'details' ? (
              <form onSubmit={handleRegister}>
                <CardHeader className={isPatientForm ? 'space-y-2' : 'space-y-2 text-center'}>
                  {!isPatientForm && <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </div>}
                  <CardTitle className={isPatientForm ? 'text-[28px] font-bold leading-[1.2] tracking-tight' : 'text-2xl font-bold tracking-tight'}>{isPatientForm ? 'Creează-ți contul' : 'Cont de medic sau operator'}</CardTitle>
                  <CardDescription>
                    {isPatientForm
                      ? (isEnabled('with_exam_consultations') ? 'Consultații video sau acasă, pentru tine și familia ta.' : 'Consultații online cu medici, pentru tine și familia ta.')
                      : accountType === 'doctor'
                        ? 'Întâi datele tale. Apoi confirmi emailul, alegi instituția la care lucrezi și aștepți aprobarea.'
                        : 'Contul se activează după confirmarea emailului și aprobarea unui administrator.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isPatientForm && (
                    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-emerald-950">Ești medic sau operator?</span>
                        <span className="text-xs text-emerald-800">Contul de specialist se face separat. Alege-l aici:</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Link to="/register/specialist" className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[13px] font-semibold text-white hover:bg-blue-700"><Stethoscope className="h-4 w-4" />Sunt medic</Link>
                        <Link to="/register/specialist?type=operator" className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[13px] font-semibold text-white hover:bg-emerald-700"><Users className="h-4 w-4" />Sunt operator</Link>
                      </div>
                    </div>
                  )}
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

                  {!isPatientForm && <div className="space-y-2">
                    <Label className="text-[15px] font-semibold text-slate-950">Ce fel de cont îți faci?</Label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {SPECIALIST_TYPES.map((option) => {
                        const active = accountType === option.value;
                        // Medicul în albastru, operatorul în verde: alegerea se vede de la prima privire.
                        const tone = option.value === 'doctor'
                          ? { on: 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20', off: 'border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-400', icon: 'bg-blue-100 text-blue-700' }
                          : { on: 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/20', off: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-400', icon: 'bg-emerald-100 text-emerald-700' };
                        return (
                          <button
                            type="button"
                            key={option.value}
                            onClick={() => setAccountType(option.value)}
                            aria-pressed={active}
                            className={`relative flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-center transition-all ${active ? tone.on : tone.off}`}>
                            {active && <CheckCircle2 className="absolute right-2 top-2 h-4 w-4" />}
                            <span className={`grid h-10 w-10 place-items-center rounded-full ${active ? 'bg-white/20 text-white' : tone.icon}`}><option.icon className="h-5 w-5" /></span>
                            <span className="text-base font-bold">Sunt {option.label.toLowerCase()}</span>
                            <span className={`text-xs leading-tight ${active ? 'text-white/85' : 'opacity-80'}`}>{option.value === 'operator' && !isEnabled('with_exam_consultations') ? 'Aduce pacienți pe platformă' : option.hint}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>}

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

                  {!isPatientForm && <Field label="Telefon *" htmlFor="phone">
                    <Input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="069 123 456"
                      required={accountType !== 'patient'}
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white" />
                    {accountType !== 'patient' && (
                      <p className="mt-1 text-xs text-slate-500">
                        Obligatoriu — pacienții te contactează la acest număr.
                      </p>
                    )}
                  </Field>}

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
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-11 rounded-xl border-slate-200 bg-white pr-24" />
                      <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-2 my-auto flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-pressed={showPassword}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        {showPassword ? 'Ascunde' : 'Arată'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">Minim 8 caractere.</p>
                  </Field>

                  {!isPatientForm && <Field label="Confirmare parolă" htmlFor="password_confirmation">
                    <Input
                      id="password_confirmation"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      className={`h-11 rounded-xl bg-white ${passwordsMatch ? 'border-slate-200' : 'border-red-300 focus-visible:ring-red-200'}`} />
                  </Field>}
                </CardContent>
                <CardFooter className="flex flex-col space-y-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-xl text-base shadow-lg shadow-primary/20">
                    {isSubmitting ? 'Se creează contul...' : isProvider ? 'Trimite cererea' : 'Creează contul'}
                  </Button>
                  {isPatientForm && (
                    <p className="text-center text-xs text-slate-500">
                      Continuând, ești de acord cu Termenii și Politica de confidențialitate.
                    </p>
                  )}
                  <div className="text-center text-sm text-slate-500">
                    {isPatientForm ? 'Ai deja cont?' : 'Aveți deja cont?'}{' '}
                    <Link to={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login'} className="font-semibold text-primary transition-colors hover:text-primary/80">
                      {isPatientForm ? 'Intră' : 'Autentificați-vă'}
                    </Link>
                  </div>
                  {!isPatientForm && (
                    <Link to="/register" className="text-center text-xs text-slate-400 hover:text-slate-600">
                      Vrei consultații pentru tine sau familie? Cont de pacient
                    </Link>
                  )}
                </CardFooter>
              </form>
            ) : (
              <form ref={formRef} onSubmit={handleVerify} className="flex flex-col gap-7 p-6 sm:p-8">
                <span className={`grid h-12 w-12 place-items-center rounded-[14px] ${verified ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                  {verified ? <CheckCircle2 className="h-6 w-6" /> : <Mail className="h-6 w-6" />}
                </span>
                <div className="flex flex-col gap-2">
                  <h1 className="text-[28px] font-bold leading-[1.2] tracking-tight text-slate-950">{verified ? 'Gata, contul e activ' : 'Verifică-ți emailul'}</h1>
                  <p className="text-[15px] leading-[1.5] text-slate-500">
                    {verified
                      ? 'Mai sunt 3 pași până la prima consultație: alegi pachetul, adaugi pacientul și programezi.'
                      : <>Ți-am trimis un cod de 6 cifre la <span className="font-medium text-slate-950">{normalizedEmail}</span>.</>}
                  </p>
                </div>
                <Feedback error={error} message={verified ? '' : message} />
                {requiresApproval && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    După confirmarea emailului, contul tău va fi verificat de un administrator înainte de activare.
                  </div>
                )}
                <OtpBoxes
                  value={otpCode}
                  done={Boolean(verified)}
                  disabled={isSubmitting || Boolean(verified)}
                  onChange={(next) => {
                    setOtpCode(next);
                    if (next.length === 6 && next !== otpCode) window.setTimeout(() => formRef.current?.requestSubmit(), 0);
                  }} />
                {verified ? (
                  <>
                    {verified.bonus > 0 && (
                      <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-amber-100 text-amber-700"><Gift className="h-5 w-5" /></span>
                        <span className="flex flex-col gap-0.5"><span className="text-[15px] font-semibold text-amber-900">Ai primit {verified.bonus} MDL bonus</span><span className="text-[13px] text-amber-800">Se scad automat din prima consultație.</span></span>
                      </div>
                    )}
                    <Button type="button" onClick={() => navigate('/patient/start')} className="h-12 w-full rounded-[10px] text-[15px] font-semibold">Începe</Button>
                  </>
                ) : (
                  <>
                    {devOtp && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">Cod demo: {devOtp}</div>}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">N-a ajuns?</span>
                        <button type="button" disabled={isResending || resendIn > 0} onClick={handleResend} className="flex h-10 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50">
                          <RotateCw className="h-4 w-4" />{isResending ? 'Se retrimite…' : 'Retrimite codul'}
                        </button>
                      </div>
                      <p className="text-[13px] text-slate-500">Verifică și dosarul Spam.{resendIn > 0 ? ` Poți retrimite peste ${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}.` : ''}</p>
                    </div>
                    {isSubmitting && <p role="status" className="text-sm text-slate-500">Se verifică…</p>}
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
                  </>
                )}
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

/** Șase căsuțe pentru cod (2a); un singur input ascuns ține valoarea, ca lipirea și autocompletarea să meargă. */
function OtpBoxes({ value, onChange, disabled, done }: { value: string; onChange: (value: string) => void; disabled: boolean; done: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="relative grid grid-cols-6 gap-2">
      <span className="sr-only">Codul din email</span>
      <input
        id="otp"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        disabled={disabled}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        className="absolute inset-0 h-full w-full cursor-text opacity-0" />
      {Array.from({ length: 6 }, (_, index) => {
        const digit = value[index];
        const active = focused && !done && index === Math.min(value.length, 5);
        return (
          <span key={index} aria-hidden="true" className={`grid h-14 place-items-center rounded-[10px] text-2xl font-semibold text-slate-950 ${
            done ? 'border border-green-300 bg-green-50'
              : active ? 'border-2 border-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,.15)]'
                : digit ? 'border border-slate-300' : 'border border-slate-200'}`}>
            {digit ?? (active ? <span className="h-6 w-0.5 animate-pulse bg-blue-600" /> : null)}
          </span>
        );
      })}
    </label>
  );
}
