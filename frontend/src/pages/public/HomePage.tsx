import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ChevronDown, Stethoscope, Users } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { ServiceIcon } from '../../components/doctor/ServiceIcon';
import { AppSnapshot } from '../../components/public/AppSnapshot';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { useSiteContent } from '../../contexts/SiteContentContext';
import { apiRequest } from '../../lib/api';
import { mdl, type DoctorServiceItem, type ServiceType } from '../../lib/doctor';
import type { SiteContentKey } from '../../lib/site-content-defaults';

type CatalogDoctor = { id: string; services?: DoctorServiceItem[] };
type Partner = { id: number; name: string; logo_url: string | null };
type Post = { id: number; slug: string; title: string; excerpt: string | null; category?: string | null; cover_image_url: string | null; published_at: string | null };

const SERVICE_TYPES: ServiceType[] = ['video', 'chat', 'home'];
const STEP_KINDS = ['search', 'service', 'conclusion'] as const;
/** Întrebarea 4 e despre vizita la domiciliu; cu vizitele oprite dispare, iar răspunsul 5 are varianta online. */
const FAQ_SLOTS = [1, 2, 3, 4, 5];
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const longDate = (value?: string | null) => { if (!value) return ''; const date = new Date(value); return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`; };

/**
 * Pagina publică începe cu titlul și două butoane: medicii și contul. Urmează serviciile cu
 * prețul de la care pornesc, pașii cu fragmente din aplicație, partenerii,
 * noutățile, întrebările frecvente și secțiunea pentru profesioniști.
 */
export function HomePage() {
  const { text } = useSiteContent();
  const t = (key: string) => text(key as SiteContentKey);
  const location = useLocation();
  const homeVisits = useFeatureFlags().isEnabled('with_exam_consultations');
  const [openFaq, setOpenFaq] = useState(1);
  const [doctors, setDoctors] = useState<CatalogDoctor[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    document.title = 'telemedconsult.md — Platformă de telemedicină';
    apiRequest<{ data: CatalogDoctor[] }>('/catalog/doctors', { auth: false }).then((response) => setDoctors(response.data ?? [])).catch(() => undefined);
    apiRequest<{ data: Partner[] }>('/catalog/partners', { auth: false }).then((response) => setPartners(response.data ?? [])).catch(() => undefined);
    apiRequest<{ data: Post[] }>('/catalog/blog', { auth: false }).then((response) => setPosts(response.data ?? [])).catch(() => undefined);
  }, []);

  // Linkurile din subsol (#cum-functioneaza, #intrebari) duc la secțiune.
  useEffect(() => {
    if (!location.hash) return;
    window.setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [location.hash]);

  const fromPrice = useMemo(() => {
    const result: Partial<Record<ServiceType, number>> = {};
    doctors.flatMap((doctor) => doctor.services ?? []).forEach((service) => {
      result[service.type] = Math.min(result[service.type] ?? Infinity, service.price);
    });
    return result;
  }, [doctors]);

  const services = SERVICE_TYPES.filter((type) => homeVisits || type !== 'home').map((type) => ({
    type,
    title: t(`home.services.${type}.title`),
    desc: t(`home.services.${type}.text`),
    meta: t(`home.services.${type}.meta`)
  }));
  const faq: Array<[string, string]> = FAQ_SLOTS
    .filter((slot) => homeVisits || slot !== 4)
    .map((slot) => [t(`home.faq.${slot}.q`), t(slot === 5 && !homeVisits ? 'home.faq.5.a_online' : `home.faq.${slot}.a`)]);
  const faqEmail = t('home.faq.email');
  const pros = [2, 3].map((slot) => ({
    eyebrow: t(`home.audiences.${slot}.eyebrow`),
    title: t(`home.audiences.${slot}.title`),
    // Fără vizite, operatorul aduce pacienți prin linkul lui.
    text: t(slot === 3 && !homeVisits ? 'home.audiences.3.text_online' : `home.audiences.${slot}.text`),
    cta: t(`home.audiences.${slot}.cta`),
    to: slot === 2 ? '/register/specialist' : '/register/specialist?type=operator'
  }));

  return (
    <div>
      {/* Titlul */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 pb-7 pt-8 md:items-center md:gap-[22px] md:px-10 md:pb-16 md:pt-20 md:text-center">
          <span className="hidden rounded-full bg-blue-50 px-3 py-1.5 text-[13px] font-semibold text-blue-700 md:inline-block">{t('home.hero.badge')}</span>
          <h1 className="max-w-[860px] text-[34px] font-bold leading-[1.08] tracking-[-.03em] [text-wrap:balance] md:text-[60px] md:leading-[1.05] md:tracking-[-.035em]">
            {t('home.hero.title')} <span className="text-blue-600">{t('home.hero.title_highlight')}</span>{t('home.hero.title_end') ? ` ${t('home.hero.title_end')}` : ''}
          </h1>
          <p className="max-w-[640px] text-[15px] leading-[1.55] text-slate-600 md:text-lg">{t(homeVisits ? 'home.hero.subtitle' : 'home.hero.subtitle_online')}</p>
          <div className="flex flex-col gap-2 sm:flex-row md:mt-2.5">
            <Link to="/medici" className="flex h-12 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-[26px] text-[15px] font-semibold text-white hover:bg-blue-700 md:h-14 md:rounded-xl md:text-base">{t('home.hero.cta_primary')}<ArrowRight className="h-4 w-4" /></Link>
            <Link to="/register" className="flex h-12 items-center justify-center rounded-[10px] border border-slate-200 bg-white px-[26px] text-[15px] font-semibold text-slate-950 hover:bg-slate-50 md:h-14 md:rounded-xl md:text-base">{t('home.hero.cta_secondary')}</Link>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] md:justify-center">
            <span className="text-slate-500">{t('home.hero.specialist_prompt')}</span>
            <Link to="/register/specialist" className="flex h-9 items-center gap-1.5 rounded-full bg-blue-50 px-3.5 font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"><Stethoscope className="h-4 w-4" />{t('home.hero.cta_doctor')}</Link>
            <Link to="/register/specialist?type=operator" className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"><Users className="h-4 w-4" />{t('home.hero.cta_operator')}</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 pt-10 md:gap-24 md:px-10 md:pt-20">
        {/* Serviciile */}
        <section className="flex flex-col gap-3.5 md:gap-7">
          <div className="flex flex-col gap-2 px-1 md:px-0"><h2 className="text-2xl font-bold tracking-[-.02em] md:text-[32px]">{t(services.length === 3 ? 'home.services.title' : 'home.services.title_online')}</h2><p className="hidden text-base text-slate-600 md:block">{t('home.services.subtitle')}</p></div>
          <div className={cn('grid gap-3.5 md:gap-5', services.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
            {services.map((service) => (
              <Link key={service.type} to="/medici" className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-[18px] hover:border-slate-300 md:gap-3.5 md:p-6">
                <span className="hidden h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600 md:grid"><ServiceIcon type={service.type} className="h-[22px] w-[22px]" /></span>
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="flex items-center justify-between text-base font-semibold md:text-lg">{service.title}{fromPrice[service.type] !== undefined && <span className="text-sm font-bold md:hidden">de la {mdl(fromPrice[service.type])}</span>}</span>
                  <span className="text-sm leading-[1.55] text-slate-600">{service.desc}</span>
                </div>
                <div className="hidden items-center justify-between border-t border-slate-100 pt-3.5 md:flex">
                  <span className="text-sm text-slate-500">{service.meta}{fromPrice[service.type] !== undefined && <> · <b className="text-slate-950">de la {mdl(fromPrice[service.type])}</b></>}</span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-blue-600">{t('home.services.link')}<ArrowRight className="h-4 w-4" /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Cum funcționează */}
        <section id="cum-functioneaza" className="flex scroll-mt-24 flex-col gap-[18px] md:gap-7">
          <div className="flex flex-col gap-2 px-1 md:px-0"><h2 className="text-2xl font-bold tracking-[-.02em] md:text-[32px]">{t('home.steps.title')}</h2><p className="hidden text-base text-slate-600 md:block">{t('home.steps.subtitle')}</p></div>
          <div className="grid gap-[18px] md:grid-cols-3 md:gap-5">
            {STEP_KINDS.map((kind, index) => (
              <div key={kind} className="flex flex-col gap-3 md:gap-[18px]">
                <div className="flex items-center rounded-[18px] bg-blue-50 p-[18px] md:h-[280px] md:rounded-[20px] md:p-6"><AppSnapshot kind={kind} /></div>
                <div className="flex items-start gap-3 px-1 md:gap-3.5">
                  <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white md:h-7 md:w-7 md:text-[13px]">{index + 1}</span>
                  <div className="flex flex-col gap-1"><span className="text-base font-semibold md:text-[17px]">{t(`home.steps.${index + 1}.title`)}</span><span className="text-sm leading-[1.55] text-slate-600">{t(`home.steps.${index + 1}.text`)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Parteneri */}
        {partners.length > 0 && (
          <section className="flex flex-col gap-3.5 md:gap-6">
            <div className="flex items-baseline justify-between px-1 md:px-0"><h2 className="text-xl font-bold md:text-2xl md:tracking-[-.02em]">{t('home.partners.title')}</h2><Link to="/parteneri" className="text-sm font-semibold text-blue-600"><span className="md:hidden">{t('home.partners.all_short')}</span><span className="hidden md:inline">{t('home.partners.all')}</span></Link></div>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
              {partners.slice(0, 4).map((partner) => (
                <Link key={partner.id} to={`/parteneri?p=${partner.id}`} className="flex h-[76px] items-center justify-center rounded-xl border border-slate-200 bg-white px-2 text-center text-[15px] font-bold text-slate-700 md:h-[104px] md:rounded-[14px] md:text-xl md:tracking-[-.01em]">
                  {partner.logo_url ? <img src={partner.logo_url} alt={partner.name} className="max-h-12 max-w-[70%] object-contain md:max-h-16" /> : partner.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Noutăți */}
        {posts.length > 0 && (
          <section className="flex flex-col gap-3.5 md:gap-6">
            <div className="flex items-baseline justify-between px-1 md:px-0"><h2 className="text-xl font-bold md:text-2xl md:tracking-[-.02em]">{text('news.title')}</h2><Link to="/noutati" className="text-sm font-semibold text-blue-600"><span className="md:hidden">{t('home.news.all_short')}</span><span className="hidden md:inline">{t('home.news.all')}</span></Link></div>
            <div className="grid gap-3.5 md:grid-cols-3 md:gap-5">
              {posts.slice(0, 3).map((post, index) => (
                <Link key={post.id} to={`/noutati/${post.slug}`} className={cn('flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-slate-300', index === 2 && 'max-md:hidden')}>
                  <Cover url={post.cover_image_url} className="hidden md:flex" />
                  <div className="flex flex-col gap-1.5 p-4 md:gap-2 md:px-5 md:pb-[22px] md:pt-[18px]">
                    <span className="text-xs text-slate-500">{post.category && <b className="font-semibold text-blue-600">{post.category}</b>}{post.category && ' · '}{longDate(post.published_at)}</span>
                    <span className="text-base font-semibold leading-[1.35] md:text-[17px]">{post.title}</span>
                    {post.excerpt && <span className="hidden text-sm leading-[1.55] text-slate-600 md:block">{post.excerpt}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Întrebări frecvente */}
        <section id="intrebari" className="grid scroll-mt-24 gap-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:items-start md:gap-12">
          <div className="flex flex-col gap-2.5 px-1 md:px-0"><h2 className="text-2xl font-bold tracking-[-.02em] md:text-[32px]">{t('home.faq.title')}</h2><p className="hidden text-[15px] leading-[1.55] text-slate-600 md:block">{t('home.faq.contact')} <a href={`mailto:${faqEmail}`} className="font-medium text-blue-600">{faqEmail}</a>.</p></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {faq.map(([question, answer], index) => {
              const open = openFaq === index;
              return (
                <div key={index} className={cn(index > 0 && 'border-t border-slate-100')}>
                  <button type="button" onClick={() => setOpenFaq(open ? -1 : index)} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-semibold md:min-h-[60px] md:gap-4 md:px-[22px] md:py-0 md:text-base">
                    <span className="flex-1">{question}</span><ChevronDown className={cn('h-[18px] w-[18px] shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && <p className="px-4 pb-4 text-sm leading-[1.6] text-slate-600 md:px-[22px] md:pb-5 md:text-[15px]">{answer}</p>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Profesioniști: medicul în albastru, operatorul în verde, ca să se vadă înscrierea. */}
        <section className="grid gap-3 pb-10 md:grid-cols-2 md:gap-5 md:pb-20">
          {pros.map((pro, index) => {
            const doctor = index === 0;
            return (
              <div key={pro.eyebrow} className={cn('flex flex-col gap-2 rounded-2xl p-[18px] text-white md:gap-3.5 md:p-7', doctor ? 'bg-blue-600' : 'bg-emerald-600')}>
                <span className="flex items-center gap-2 text-xs font-semibold tracking-[.04em] text-white/80">
                  {doctor ? <Stethoscope className="h-4 w-4" /> : <Users className="h-4 w-4" />}{pro.eyebrow}
                </span>
                <span className="text-[19px] font-bold md:text-[22px] md:tracking-[-.01em]">{pro.title}</span>
                <span className="text-sm leading-[1.55] text-white/90 md:text-[15px]">{pro.text}</span>
                <Link to={pro.to} className={cn('mt-1.5 flex h-11 items-center justify-center gap-2 rounded-[10px] bg-white text-sm font-semibold md:h-[46px] md:self-start md:px-5 md:text-[15px]', doctor ? 'text-blue-700 hover:bg-blue-50' : 'text-emerald-700 hover:bg-emerald-50')}>
                  {pro.cta}<ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

export function Cover({ url, className }: { url: string | null; className?: string }) {
  return url
    ? <img src={url} alt="" className={cn('aspect-video w-full object-cover', className)} />
    : <div className={cn('aspect-video w-full items-center justify-center bg-slate-100 text-xs text-slate-400', className, !className?.includes('hidden') && 'flex')}>telemedconsult.md</div>;
}
