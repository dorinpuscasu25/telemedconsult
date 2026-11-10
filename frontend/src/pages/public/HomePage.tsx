import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, Search } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { ServiceIcon } from '../../components/doctor/ServiceIcon';
import { AppSnapshot } from '../../components/public/AppSnapshot';
import { useSiteContent } from '../../contexts/SiteContentContext';
import { apiRequest } from '../../lib/api';
import { mdl, type DoctorServiceItem, type ServiceType } from '../../lib/doctor';
import type { SiteContentKey } from '../../lib/site-content-defaults';

type CatalogDoctor = { id: string; services?: DoctorServiceItem[] };
type Partner = { id: number; name: string; logo_url: string | null };
type Post = { id: number; slug: string; title: string; excerpt: string | null; category?: string | null; cover_image_url: string | null; published_at: string | null };
type Specialty = { id: number; name: string };

const TYPES: Array<[ServiceType, string, string]> = [['video', 'Consultație video', 'Video'], ['chat', 'Chat', 'Chat'], ['home', 'La domiciliu', 'Domiciliu']];
const SERVICES: Array<{ type: ServiceType; title: string; desc: string; meta: string }> = [
  { type: 'video', title: 'Consultație video', desc: 'Vorbești cu medicul față în față, de pe telefon sau calculator.', meta: '15–30 min' },
  { type: 'chat', title: 'Întrebare în chat', desc: 'Scrii întrebarea și atașezi analize sau poze. Medicul răspunde în scris.', meta: 'răspuns în 24 h' },
  { type: 'home', title: 'Vizită la domiciliu', desc: 'Un operator vine acasă cu dispozitive HIGO pentru ECG, tensiune și pulsoximetrie. Medicul citește rezultatele.', meta: '60 min' }
];
const STEP_KINDS = ['search', 'service', 'conclusion'] as const;
const FAQ: Array<[string, string]> = [
  ['Cât costă o consultație?', 'Fiecare medic își stabilește serviciile și prețurile. Vezi prețul exact în profilul medicului, înainte să alegi ora.'],
  ['Ce se întâmplă cu banii dacă medicul nu confirmă?', 'Suma se rezervă din portofel când trimiți cererea. Dacă medicul refuză sau cererea expiră, banii revin integral în portofel.'],
  ['Pot programa pentru copil sau pentru părinți?', 'Da. Adaugi membrii familiei în cont și alegi pentru cine e fiecare consultație. Fiecare are fișa lui.'],
  ['Cum funcționează vizita la domiciliu?', 'Un operator vine la adresa ta cu dispozitive HIGO și face investigațiile incluse în serviciu. Medicul vede rezultatele și scrie concluzia.'],
  ['Cine îmi vede datele medicale?', 'Doar tu și medicii cu care ai consultații. Operatorul vede doar datele necesare vizitei.']
];
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const longDate = (value?: string | null) => { if (!value) return ''; const date = new Date(value); return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`; };

/**
 * Pagina publică începe cu căutarea unui medic (Ha). Urmează serviciile cu
 * prețul de la care pornesc, pașii cu fragmente din aplicație, partenerii,
 * noutățile, întrebările frecvente și secțiunea pentru profesioniști.
 */
export function HomePage() {
  const { text } = useSiteContent();
  const t = (key: string) => text(key as SiteContentKey);
  const navigate = useNavigate();
  const location = useLocation();
  const [type, setType] = useState<ServiceType>('video');
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState(1);
  const [doctors, setDoctors] = useState<CatalogDoctor[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);

  useEffect(() => {
    document.title = 'telemedconsult.md — Platformă de telemedicină';
    apiRequest<{ data: CatalogDoctor[] }>('/catalog/doctors', { auth: false }).then((response) => setDoctors(response.data ?? [])).catch(() => undefined);
    apiRequest<{ data: Partner[] }>('/catalog/partners', { auth: false }).then((response) => setPartners(response.data ?? [])).catch(() => undefined);
    apiRequest<{ data: Post[] }>('/catalog/blog', { auth: false }).then((response) => setPosts(response.data ?? [])).catch(() => undefined);
    apiRequest<{ data: Specialty[] }>('/catalog/specialties', { auth: false }).then((response) => setSpecialties(response.data ?? [])).catch(() => undefined);
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

  const search = (event?: React.FormEvent, term = query) => {
    event?.preventDefault();
    const params = new URLSearchParams({ type });
    if (term.trim()) params.set('q', term.trim());
    navigate(`/medici?${params.toString()}`);
  };

  const popular = specialties.slice(0, 5).map((item) => item.name);
  const pros = [2, 3].map((slot) => ({ eyebrow: slot === 2 ? 'PENTRU MEDICI' : 'PENTRU OPERATORI', title: t(`home.audiences.${slot}.title`), text: t(`home.audiences.${slot}.text`), cta: t(`home.audiences.${slot}.cta`), to: slot === 2 ? '/register/specialist' : '/register/specialist?type=operator' }));

  return (
    <div>
      {/* Căutarea */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 pb-7 pt-8 md:items-center md:gap-[22px] md:px-10 md:pb-16 md:pt-20 md:text-center">
          <span className="hidden rounded-full bg-blue-50 px-3 py-1.5 text-[13px] font-semibold text-blue-700 md:inline-block">{t('home.hero.badge')}</span>
          <h1 className="max-w-[860px] text-[34px] font-bold leading-[1.08] tracking-[-.03em] [text-wrap:balance] md:text-[60px] md:leading-[1.05] md:tracking-[-.035em]">
            {t('home.hero.title')} <span className="text-blue-600">{t('home.hero.title_highlight')}</span>{t('home.hero.title_end') ? ` ${t('home.hero.title_end')}` : ''}
          </h1>
          <p className="max-w-[640px] text-[15px] leading-[1.55] text-slate-600 md:text-lg">{t('home.hero.subtitle')}</p>
          <form onSubmit={search} className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 text-left shadow-[0_8px_24px_rgba(15,23,42,.06)] md:mt-2.5 md:w-[780px] md:rounded-[18px] md:p-2 md:shadow-[0_12px_32px_rgba(15,23,42,.08)]">
            <div className="grid grid-cols-3 gap-1 md:flex">
              {TYPES.map(([key, label, short]) => (
                <button key={key} type="button" onClick={() => setType(key)} aria-pressed={type === key}
                  className={cn('flex h-10 items-center justify-center gap-2 rounded-[10px] text-[13px] font-semibold md:h-[38px] md:px-3.5 md:text-sm', type === key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50')}>
                  <ServiceIcon type={key} className="hidden h-[18px] w-[18px] md:block" /><span className="md:hidden">{short}</span><span className="hidden md:inline">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <label className="flex h-12 flex-1 items-center gap-2.5 rounded-[10px] bg-slate-50 px-3.5 md:h-14 md:rounded-xl md:px-4">
                <Search className="h-[18px] w-[18px] shrink-0 text-slate-500" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Specialitate sau numele medicului" aria-label="Specialitate sau numele medicului" className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-950 outline-none placeholder:text-slate-500 md:text-base" />
              </label>
              <button type="submit" className="h-12 rounded-[10px] bg-blue-600 px-[26px] text-[15px] font-semibold text-white hover:bg-blue-700 md:h-14 md:rounded-xl md:text-base">Caută medic</button>
            </div>
          </form>
          {popular.length > 0 && (
            <div className="-mx-5 flex items-center gap-1.5 overflow-x-auto px-5 text-[13px] text-slate-500 [scrollbar-width:none] md:mx-0 md:flex-wrap md:justify-center md:gap-2 md:px-0">
              <span className="hidden md:inline">Des căutate:</span>
              {popular.map((name) => <button key={name} type="button" onClick={() => search(undefined, name)} className="shrink-0 rounded-full border border-slate-200 bg-white px-[11px] py-[5px] text-slate-700 hover:border-slate-300">{name}</button>)}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 pt-10 md:gap-24 md:px-10 md:pt-20">
        {/* Serviciile */}
        <section className="flex flex-col gap-3.5 md:gap-7">
          <div className="flex flex-col gap-2 px-1 md:px-0"><h2 className="text-2xl font-bold tracking-[-.02em] md:text-[32px]">Trei feluri de a ajunge la medic</h2><p className="hidden text-base text-slate-600 md:block">Fiecare medic își alege serviciile și prețurile. Vezi totul înainte să programezi.</p></div>
          <div className="grid gap-3.5 md:grid-cols-3 md:gap-5">
            {SERVICES.map((service) => (
              <Link key={service.type} to={`/medici?type=${service.type}`} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-[18px] hover:border-slate-300 md:gap-3.5 md:p-6">
                <span className="hidden h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600 md:grid"><ServiceIcon type={service.type} className="h-[22px] w-[22px]" /></span>
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="flex items-center justify-between text-base font-semibold md:text-lg">{service.title}{fromPrice[service.type] !== undefined && <span className="text-sm font-bold md:hidden">de la {mdl(fromPrice[service.type])}</span>}</span>
                  <span className="text-sm leading-[1.55] text-slate-600">{service.desc}</span>
                </div>
                <div className="hidden items-center justify-between border-t border-slate-100 pt-3.5 md:flex">
                  <span className="text-sm text-slate-500">{service.meta}{fromPrice[service.type] !== undefined && <> · <b className="text-slate-950">de la {mdl(fromPrice[service.type])}</b></>}</span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-blue-600">Vezi medicii<ArrowRight className="h-4 w-4" /></span>
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
            <div className="flex items-baseline justify-between px-1 md:px-0"><h2 className="text-xl font-bold md:text-2xl md:tracking-[-.02em]">Parteneri</h2><Link to="/parteneri" className="text-sm font-semibold text-blue-600"><span className="md:hidden">Toți</span><span className="hidden md:inline">Toți partenerii</span></Link></div>
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
            <div className="flex items-baseline justify-between px-1 md:px-0"><h2 className="text-xl font-bold md:text-2xl md:tracking-[-.02em]">{text('news.title')}</h2><Link to="/noutati" className="text-sm font-semibold text-blue-600"><span className="md:hidden">Toate</span><span className="hidden md:inline">Toate noutățile</span></Link></div>
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
          <div className="flex flex-col gap-2.5 px-1 md:px-0"><h2 className="text-2xl font-bold tracking-[-.02em] md:text-[32px]">Întrebări frecvente</h2><p className="hidden text-[15px] leading-[1.55] text-slate-600 md:block">Nu găsești răspunsul? Scrie-ne la <a href="mailto:suport@telemedconsult.md" className="font-medium text-blue-600">suport@telemedconsult.md</a>.</p></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {FAQ.map(([question, answer], index) => {
              const open = openFaq === index;
              return (
                <div key={question} className={cn(index > 0 && 'border-t border-slate-100')}>
                  <button type="button" onClick={() => setOpenFaq(open ? -1 : index)} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-semibold md:min-h-[60px] md:gap-4 md:px-[22px] md:py-0 md:text-base">
                    <span className="flex-1">{question}</span><ChevronDown className={cn('h-[18px] w-[18px] shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && <p className="px-4 pb-4 text-sm leading-[1.6] text-slate-600 md:px-[22px] md:pb-5 md:text-[15px]">{answer}</p>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Profesioniști */}
        <section className="grid gap-3 pb-10 md:grid-cols-2 md:gap-5 md:pb-20">
          {pros.map((pro) => (
            <div key={pro.eyebrow} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-[18px] md:gap-3.5 md:p-7">
              <span className="hidden text-xs font-semibold tracking-[.04em] text-slate-500 md:block">{pro.eyebrow}</span>
              <span className="text-[17px] font-semibold md:text-[22px] md:font-bold md:tracking-[-.01em]">{pro.title}</span>
              <span className="text-sm leading-[1.55] text-slate-600 md:text-[15px]">{pro.text}</span>
              <Link to={pro.to} className="mt-1.5 flex h-11 items-center justify-center gap-2 rounded-[10px] border border-slate-200 text-sm font-semibold hover:bg-slate-50 md:h-[42px] md:self-start md:px-4">{pro.cta}<ArrowRight className="hidden h-4 w-4 md:block" /></Link>
            </div>
          ))}
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
