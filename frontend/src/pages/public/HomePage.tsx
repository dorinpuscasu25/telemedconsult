import React from 'react';
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

const FEATURES = [
  {
    icon: Video,
    title: 'Consultații video și chat',
    text: 'Discută cu medici verificați prin video sau mesagerie, fără să pierzi timp în sala de așteptare.'
  },
  {
    icon: MapPin,
    title: 'Operatori la domiciliu',
    text: 'Recoltări și examinări cu dispozitive medicale, direct acasă la tine, în regiunea ta.'
  },
  {
    icon: ClipboardList,
    title: 'Fișă medicală digitală',
    text: 'Istoricul, investigațiile și rețetele tale, organizate sigur într-un singur loc.'
  },
  {
    icon: ShieldCheck,
    title: 'Date protejate',
    text: 'Confidențialitate și acces controlat — doar tu și medicii tăi vedeți datele.'
  }
];

const STEPS = [
  { step: '1', title: 'Creează-ți contul', text: 'Înregistrare rapidă ca pacient, medic sau operator.' },
  { step: '2', title: 'Alege serviciul', text: 'Selectează un medic sau o examinare potrivită nevoilor tale.' },
  { step: '3', title: 'Primești îngrijire', text: 'Consultație online, recomandări și, la nevoie, vizita unui operator.' }
];

const AUDIENCES = [
  {
    icon: HeartPulse,
    title: 'Pentru pacienți',
    text: 'Acces rapid la medici, examinări la domiciliu și o fișă medicală mereu la îndemână.',
    cta: 'Creează cont de pacient'
  },
  {
    icon: Stethoscope,
    title: 'Pentru medici',
    text: 'Oferă consultații la distanță, îți setezi disponibilitatea și ajungi la pacienți din toată țara.',
    cta: 'Înscrie-te ca medic'
  },
  {
    icon: Users,
    title: 'Pentru operatori',
    text: 'Te deplasezi la pacienți pentru recoltări și examinări cu dispozitive medicale conectate.',
    cta: 'Înscrie-te ca operator'
  }
];

export function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-purple-500/10 blur-[120px]" />

      {/* Hero */}
      <section className="relative mx-auto w-full max-w-7xl px-4 pb-9 pt-10 sm:pb-12 sm:pt-16 md:px-8 md:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary sm:px-4 sm:text-sm">
            <Activity className="h-4 w-4 shrink-0" />
            Platformă de telemedicină
          </span>
          <h1 className="mt-5 text-[2.15rem] font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:mt-6 sm:text-5xl md:text-6xl">
            Sănătatea ta, <span className="gradient-text">mai aproape</span> ca niciodată
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-500 sm:mt-6 sm:text-lg">
            telemedconsult.md conectează pacienții cu medici și operatori medicali pentru consultații online rapide,
            examinări la domiciliu și o fișă medicală digitală sigură.
          </p>
          <div className="mt-7 flex w-full flex-col items-stretch justify-center gap-3 sm:mt-8 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-purple-600 px-8 text-base shadow-lg shadow-primary/25 sm:w-auto">
              <Link to="/register">
                Începe acum <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full rounded-xl border-2 bg-white/60 px-8 text-base sm:w-auto">
              <Link to="/blog">Află mai multe</Link>
            </Button>
          </div>
        </div>

      </section>

      {/* Features */}
      <section className="relative mx-auto w-full max-w-7xl px-4 py-9 sm:py-12 md:px-8">
        <div className="mx-auto mb-7 max-w-2xl text-center sm:mb-10">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Tot ce ai nevoie într-un singur loc</h2>
          <p className="mt-3 text-slate-500">O platformă completă, gândită pentru pacienți, medici și operatori.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="glass-card border-0">
              <CardContent className="p-5 sm:p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 font-semibold text-slate-900">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{feature.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative mx-auto w-full max-w-7xl px-4 py-9 sm:py-12 md:px-8">
        <div className="mx-auto mb-7 max-w-2xl text-center sm:mb-10">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Cum funcționează</h2>
          <p className="mt-3 text-slate-500">Trei pași simpli până la îngrijirea de care ai nevoie.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.step} className="border-slate-200/70 bg-white/80 shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-600 text-lg font-bold text-white">
                  {step.step}
                </div>
                <h3 className="mb-2 font-semibold text-slate-900">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{step.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Audiences */}
      <section className="relative mx-auto w-full max-w-7xl px-4 py-9 sm:py-12 md:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {AUDIENCES.map((audience) => (
            <Card key={audience.title} className="glass-card border-0">
              <CardContent className="flex h-full flex-col p-5 sm:p-7">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/10 text-primary">
                  <audience.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-slate-900">{audience.title}</h3>
                <p className="mb-6 flex-1 text-sm leading-relaxed text-slate-500">{audience.text}</p>
                <Button asChild variant="outline" className="h-11 w-full rounded-xl px-4">
                  <Link to="/register">
                    <span className="truncate">{audience.cta}</span> <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-6 sm:pb-20 sm:pt-8 md:px-8">
        <Card className="overflow-hidden border-0 bg-gradient-to-r from-primary to-purple-600 shadow-xl shadow-primary/20">
          <CardContent className="flex flex-col items-center gap-6 p-6 text-center sm:p-10 md:flex-row md:justify-between md:text-left">
            <div className="max-w-xl">
              <h2 className="text-2xl font-bold text-white md:text-3xl">Pregătit să începi?</h2>
              <p className="mt-2 text-white/80">
                Creează-ți contul în câteva minute și descoperă o nouă formă de îngrijire medicală.
              </p>
            </div>
            <Button asChild size="lg" className="h-12 w-full rounded-xl bg-white px-8 text-base text-primary hover:bg-white/90 sm:w-auto">
              <Link to="/register">
                Creează cont <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
