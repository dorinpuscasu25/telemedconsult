import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle } from
'../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { type OtpRequiredError, useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [otpMode, setOtpMode] = useState<'email_verification' | 'login_2fa'>('email_verification');
  const { login, verifyEmailOtp, verifyLoginOtp, resendEmailOtp } = useAuth();
  const navigate = useNavigate();
  const routeForRole = (role: string) => role === 'admin' ? '/admin' : `/${role}`;
  const routeForUser = (user: { role: string; status?: string }) =>
    user.status === 'pending' ? '/pending' : routeForRole(user.role);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      const user = await login(email, password);
      navigate(routeForUser(user));
    } catch (err) {
      const nextError = err instanceof Error ? err.message : 'Nu am putut autentifica utilizatorul.';
      setError(nextError);
      const otpError = err as OtpRequiredError;
      if (err instanceof Error && err.name === 'EmailVerificationRequired') {
        if (otpError.devOtp) {
          setDevOtp(otpError.devOtp);
          setOtpCode(otpError.devOtp);
        }
        setError('');
        setRequiresVerification(true);
        setOtpMode('email_verification');
        setMessage('Introduceți codul primit pe email pentru a activa contul.');
      } else if (err instanceof Error && err.name === 'LoginOtpRequired') {
        if (otpError.devOtp) {
          setDevOtp(otpError.devOtp);
          setOtpCode(otpError.devOtp);
        }
        setError('');
        setRequiresVerification(true);
        setOtpMode('login_2fa');
        setMessage('Introduceți codul primit pe email pentru autentificare.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!/^\d{6}$/.test(otpCode)) {
      setError('Introduceți codul de 6 cifre primit pe email.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = otpMode === 'login_2fa'
        ? await verifyLoginOtp(email.trim().toLowerCase(), otpCode)
        : await verifyEmailOtp(email.trim().toLowerCase(), otpCode);
      navigate(routeForUser(user));
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
      if (otpMode === 'login_2fa') {
        await login(email.trim().toLowerCase(), password);
        return;
      }
      const response = await resendEmailOtp(email.trim().toLowerCase());
      setMessage(response.message);
      setDevOtp(response.dev_otp || null);
      if (response.dev_otp) setOtpCode(response.dev_otp);
    } catch (err) {
      if (err instanceof Error && err.name === 'LoginOtpRequired') {
        const otpError = err as OtpRequiredError;
        setMessage('Am trimis un cod nou pe email.');
        if (otpError.devOtp) {
          setDevOtp(otpError.devOtp);
          setOtpCode(otpError.devOtp);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Nu am putut retrimite codul.');
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 p-4">
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          duration: 0.4
        }}
        className="w-full max-w-md z-10">
        
        <Link to="/" className="flex items-center justify-center mb-8 group">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 mr-3 group-hover:scale-105 transition-transform">
            <Activity className="h-6 w-6" />
          </div>
          <span className="font-bold text-2xl text-slate-900 tracking-tight sm:text-3xl">
            telemedconsult<span className="text-primary">.md</span>
          </span>
        </Link>

        <Card className="w-full border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-2xl font-bold tracking-tight">
              Autentificare
            </CardTitle>
            <CardDescription className="text-slate-500">
              Introduceți datele pentru a accesa contul
            </CardDescription>
          </CardHeader>
          <form onSubmit={requiresVerification ? handleVerify : handleLogin}>
            <CardContent className="space-y-5">
              {(error || message) &&
              <div className={`rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                {error || message}
              </div>
              }
              {!requiresVerification ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-700 font-medium">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="nume@exemplu.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-white/50 border-slate-200 focus:border-primary focus:ring-primary/20 h-11 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="password"
                        className="text-slate-700 font-medium">
                        Parolă
                      </Label>
                      <Link
                        to="#"
                        className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                        Ați uitat parola?
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-white/50 border-slate-200 focus:border-primary focus:ring-primary/20 h-11 rounded-xl" />
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <div className="mb-2 flex items-center font-semibold text-slate-900">
                      <Mail className="mr-2 h-4 w-4 text-primary" />
                      {otpMode === 'login_2fa' ? 'Autentificare în doi pași' : 'Verificare necesară'}
                    </div>
                    Codul a fost trimis la <span className="font-medium text-slate-900">{email.trim().toLowerCase()}</span>.
                  </div>
                  {devOtp && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                      Cod demo: {devOtp}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="otp" className="text-slate-700 font-medium">
                      Cod OTP
                    </Label>
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
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 text-base rounded-xl shadow-lg shadow-primary/20">
                {requiresVerification && <CheckCircle2 className="mr-2 h-4 w-4" />}
                {isSubmitting ? (requiresVerification ? 'Se verifică...' : 'Se autentifică...') : (requiresVerification ? 'Verifică și intră în cont' : 'Intră în cont')}
              </Button>
              {requiresVerification && (
                <>
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
                      setRequiresVerification(false);
                      setOtpCode('');
                      setDevOtp(null);
                      setError('');
                      setMessage('');
                    }}
                    className="text-sm font-medium text-slate-500 hover:text-slate-800">
                    Înapoi la autentificare
                  </button>
                </>
              )}
              <div className="text-sm text-center text-slate-500">
                Nu aveți cont?{' '}
                <Link
                  to="/register"
                  className="text-primary hover:text-primary/80 font-semibold transition-colors">
                  
                  Înregistrați-vă
                </Link>
              </div>
            </CardFooter>
          </form>

        </Card>
      </motion.div>
    </div>);

}
