import { Link } from 'react-router-dom';
import {
  Activity,
  Stethoscope,
  Video,
  ShieldCheck,
  MapPin,
  HeartPulse,
  Users,
  ClipboardList,
  ArrowRight
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { useSiteContent } from '../../contexts/SiteContentContext';
import type { SiteContentKey } from '../../lib/site-content-defaults';

// Doar pictogramele rămân în cod; toate textele vin din panoul de conținut.
const FEATURE_ICONS = [Video, MapPin, ClipboardList, ShieldCheck];
const AUDIENCE_ICONS = [HeartPulse, Stethoscope, Users];
const SLOTS = [1, 2, 3, 4] as const;

export function HomePage() {
  const { text } = useSiteContent();
  const t = (key: string) => text(key as SiteContentKey);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-purple-500/10 blur-[120px]" />

      {/* Hero */}
      <section className="relative mx-auto w-full max-w-7xl px-4 pb-9 pt-10 sm:pb-12 sm:pt-16 md:px-8 md:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary sm:px-4 sm:text-sm">
            <Activity className="h-4 w-4 shrink-0" />
            {t('home.hero.badge')}
          </span>
          <h1 className="mt-5 text-[2.15rem] font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:mt-6 sm:text-5xl md:text-6xl">
            {t('home.hero.title')} <span className="gradient-text">{t('home.hero.title_highlight')}</span>{' '}
            {t('home.hero.title_end')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-500 sm:mt-6 sm:text-lg">
            {t('home.hero.subtitle')}
          </p>
          <div className="mt-7 flex w-full flex-col items-stretch justify-center gap-3 sm:mt-8 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-purple-600 px-8 text-base shadow-lg shadow-primary/25 sm:w-auto">
              <Link to="/register">
                {t('home.hero.cta_primary')} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full rounded-xl border-2 bg-white/60 px-8 text-base sm:w-auto">
              <Link to="/noutati">{t('home.hero.cta_secondary')}</Link>
            </Button>
          </div>
        </div>

      </section>

      {/* Features */}
      <section className="relative mx-auto w-full max-w-7xl px-4 py-9 sm:py-12 md:px-8">
        <div className="mx-auto mb-7 max-w-2xl text-center sm:mb-10">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t('home.features.title')}</h2>
          <p className="mt-3 text-slate-500">{t('home.features.subtitle')}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SLOTS.map((slot, index) => {
            const Icon = FEATURE_ICONS[index];
            return (
              <Card key={slot} className="glass-card border-0">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 font-semibold text-slate-900">{t(`home.features.${slot}.title`)}</h3>
                  <p className="text-sm leading-relaxed text-slate-500">{t(`home.features.${slot}.text`)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="relative mx-auto w-full max-w-7xl px-4 py-9 sm:py-12 md:px-8">
        <div className="mx-auto mb-7 max-w-2xl text-center sm:mb-10">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t('home.steps.title')}</h2>
          <p className="mt-3 text-slate-500">{t('home.steps.subtitle')}</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[1, 2, 3].map((slot) => (
            <Card key={slot} className="border-slate-200/70 bg-white/80 shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-600 text-lg font-bold text-white">
                  {slot}
                </div>
                <h3 className="mb-2 font-semibold text-slate-900">{t(`home.steps.${slot}.title`)}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{t(`home.steps.${slot}.text`)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Audiences */}
      <section className="relative mx-auto w-full max-w-7xl px-4 py-9 sm:py-12 md:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {[1, 2, 3].map((slot, index) => {
            const Icon = AUDIENCE_ICONS[index];
            return (
              <Card key={slot} className="glass-card border-0">
                <CardContent className="flex h-full flex-col p-5 sm:p-7">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">{t(`home.audiences.${slot}.title`)}</h3>
                  <p className="mb-6 flex-1 text-sm leading-relaxed text-slate-500">{t(`home.audiences.${slot}.text`)}</p>
                  <Button asChild variant="outline" className="h-11 w-full rounded-xl px-4">
                    <Link to="/register">
                      <span className="truncate">{t(`home.audiences.${slot}.cta`)}</span>{' '}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-6 sm:pb-20 sm:pt-8 md:px-8">
        <Card className="overflow-hidden border-0 bg-gradient-to-r from-primary to-purple-600 shadow-xl shadow-primary/20">
          <CardContent className="flex flex-col items-center gap-6 p-6 text-center sm:p-10 md:flex-row md:justify-between md:text-left">
            <div className="max-w-xl">
              <h2 className="text-2xl font-bold text-white md:text-3xl">{t('home.cta.title')}</h2>
              <p className="mt-2 text-white/80">{t('home.cta.subtitle')}</p>
            </div>
            <Button asChild size="lg" className="h-12 w-full rounded-xl bg-white px-8 text-base text-primary hover:bg-white/90 sm:w-auto">
              <Link to="/register">
                {t('home.cta.button')} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
