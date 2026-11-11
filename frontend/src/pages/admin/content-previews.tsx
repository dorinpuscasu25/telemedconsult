import type { ReactNode } from 'react';
import { Activity, ArrowRight, ChevronDown, ExternalLink, MessageSquare, Stethoscope, Users, Video, Home } from 'lucide-react';

/**
 * Miniaturi ale secțiunilor reale de pe site, folosite în panoul „Texte site”.
 *
 * Fiecare miniatură primește valorile din formular și se redesenează la fiecare
 * tastă, ca administratorul să vadă unde ajunge textul. Reproduc așezarea și
 * ierarhia din designul paginilor publice (albastru, carduri albe), nu pagina întreagă.
 */
export type PreviewValues = Record<string, string>;

type PreviewProps = { values: PreviewValues };

const shell = 'rounded-xl border border-slate-200 bg-white p-4 text-left text-slate-950';

/** Afișează valoarea sau un marcaj gri dacă e goală, ca previzualizarea să nu „sară”. */
function v(values: PreviewValues, key: string, placeholder = 'text gol'): ReactNode {
  const value = values[key];
  return value ? value : <span className="text-slate-300">{placeholder}</span>;
}

/** Eticheta gri care spune când apare o variantă a textului. */
function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-400">{children}</p>;
}

function SectionTitle({ values, title, subtitle }: { values: PreviewValues; title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-sm font-bold tracking-tight">{v(values, title, 'Titlu secțiune')}</h2>
      {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{v(values, subtitle, 'subtitlu')}</p>}
    </div>
  );
}

function BrandMark({ values }: PreviewProps) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-blue-600 text-white"><Activity className="h-3.5 w-3.5" /></span>
      <span className="text-xs font-bold">{v(values, 'header.brand_name', 'brand')}<span className="text-blue-600">{values['header.brand_suffix']}</span></span>
    </span>
  );
}

function HeaderPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BrandMark values={values} />
        <div className="hidden flex-1 flex-wrap gap-1 text-[11px] font-medium text-slate-700 sm:flex">
          <span className="rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700">{v(values, 'header.nav_home', 'Acasă')}</span>
          <span className="px-2 py-1">{v(values, 'header.nav_doctors', 'Medici')}</span>
          <span className="px-2 py-1">{v(values, 'header.nav_news', 'Noutăți')}</span>
          <span className="px-2 py-1">{v(values, 'header.nav_partners', 'Parteneri')}</span>
        </div>
        <span className="ml-auto text-[11px] font-medium">{v(values, 'header.cta_login', 'Intră în cont')}</span>
        <span className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white">{v(values, 'header.cta_register', 'Creează cont')}</span>
      </div>
      <Note>
        Pe telefon butonul de autentificare devine <b className="font-medium text-slate-600">{v(values, 'header.cta_login_short', 'Intră')}</b>. Când utilizatorul e logat, butoanele sunt înlocuite de{' '}
        <b className="font-medium text-slate-600">{v(values, 'header.cta_dashboard', 'Panoul meu')}</b>.
      </Note>
    </div>
  );
}

function HomeHeroPreview({ values }: PreviewProps) {
  return (
    <div className={`${shell} text-center`}>
      <span className="inline-block rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{v(values, 'home.hero.badge', 'etichetă')}</span>
      <h1 className="mx-auto mt-2 max-w-sm text-lg font-bold leading-tight tracking-tight">
        {v(values, 'home.hero.title', 'Titlu')} <span className="text-blue-600">{values['home.hero.title_highlight']}</span>
        {values['home.hero.title_end'] ? ` ${values['home.hero.title_end']}` : ''}
      </h1>
      <p className="mx-auto mt-1.5 max-w-sm text-[11px] leading-relaxed text-slate-600">{v(values, 'home.hero.subtitle', 'text explicativ')}</p>
      <div className="mt-3 flex justify-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white">{v(values, 'home.hero.cta_primary', 'buton')}<ArrowRight className="h-3 w-3" /></span>
        <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold">{v(values, 'home.hero.cta_secondary', 'buton')}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 text-[10px]">
        <span className="text-slate-500">{v(values, 'home.hero.specialist_prompt', 'întrebare')}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700 ring-1 ring-blue-200"><Stethoscope className="h-3 w-3" />{v(values, 'home.hero.cta_doctor', 'buton')}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200"><Users className="h-3 w-3" />{v(values, 'home.hero.cta_operator', 'buton')}</span>
      </div>
      <Note>Cu vizitele la domiciliu oprite, textul explicativ devine: „{v(values, 'home.hero.subtitle_online')}”</Note>
    </div>
  );
}

function HomeServicesPreview({ values }: PreviewProps) {
  const items = [
    { key: 'video', icon: Video },
    { key: 'chat', icon: MessageSquare },
    { key: 'home', icon: Home }
  ];
  return (
    <div className={shell}>
      <SectionTitle values={values} title="home.services.title" subtitle="home.services.subtitle" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {items.map(({ key, icon: Icon }) => (
          <div key={key} className="flex flex-col gap-1 rounded-lg border border-slate-200 p-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-blue-50 text-blue-600"><Icon className="h-3.5 w-3.5" /></span>
            <p className="text-[11px] font-semibold">{v(values, `home.services.${key}.title`, 'titlu')}</p>
            <p className="line-clamp-3 flex-1 text-[10px] leading-relaxed text-slate-600">{v(values, `home.services.${key}.text`, 'text')}</p>
            <div className="mt-1 flex items-center justify-between gap-1 border-t border-slate-100 pt-1.5 text-[9px]">
              <span className="truncate text-slate-500">{v(values, `home.services.${key}.meta`, 'durată')} · <b className="text-slate-950">de la 300 MDL</b></span>
              <span className="shrink-0 font-semibold text-blue-600">{v(values, 'home.services.link', 'link')}</span>
            </div>
          </div>
        ))}
      </div>
      <Note>Fără vizite la domiciliu, cartonașul al treilea dispare și titlul devine „{v(values, 'home.services.title_online')}”.</Note>
    </div>
  );
}

function HomeStepsPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <SectionTitle values={values} title="home.steps.title" subtitle="home.steps.subtitle" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[1, 2, 3].map((slot) => (
          <div key={slot} className="flex flex-col gap-1.5">
            <div className="h-10 rounded-lg bg-blue-50" />
            <div className="flex gap-1.5">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-blue-600 text-[9px] font-bold text-white">{slot}</span>
              <div>
                <p className="text-[11px] font-semibold">{v(values, `home.steps.${slot}.title`, `pas ${slot}`)}</p>
                <p className="line-clamp-3 text-[10px] leading-relaxed text-slate-600">{v(values, `home.steps.${slot}.text`, 'text')}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeMorePreview({ values }: PreviewProps) {
  const row = (title: ReactNode, link: string, short: string) => (
    <div className="flex items-baseline justify-between">
      <span className="text-xs font-bold">{title}</span>
      <span className="text-[10px] font-semibold text-blue-600">{v(values, link, 'link')} <span className="font-normal text-slate-400">/ pe telefon: {v(values, short, 'link')}</span></span>
    </div>
  );
  return (
    <div className={`${shell} space-y-3`}>
      <div className="space-y-1.5">
        {row(v(values, 'home.partners.title', 'Titlu'), 'home.partners.all', 'home.partners.all_short')}
        <div className="grid grid-cols-4 gap-1.5">{[0, 1, 2, 3].map((key) => <span key={key} className="h-7 rounded-md border border-slate-200" />)}</div>
      </div>
      <div className="space-y-1.5">
        {row(v(values, 'news.title', 'Noutăți'), 'home.news.all', 'home.news.all_short')}
        <div className="grid grid-cols-3 gap-1.5">{[0, 1, 2].map((key) => <span key={key} className="h-9 rounded-md border border-slate-200 bg-slate-50" />)}</div>
      </div>
    </div>
  );
}

function HomeFaqPreview({ values }: PreviewProps) {
  return (
    <div className={`${shell} grid gap-3 sm:grid-cols-[1fr_1.6fr]`}>
      <div>
        <h2 className="text-sm font-bold">{v(values, 'home.faq.title', 'Titlu')}</h2>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{v(values, 'home.faq.contact', 'text')} <span className="font-medium text-blue-600">{v(values, 'home.faq.email', 'email')}</span>.</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        {[1, 2, 3, 4, 5].map((slot) => (
          <div key={slot} className={slot > 1 ? 'border-t border-slate-100' : ''}>
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-semibold">
              <span className="flex-1">{v(values, `home.faq.${slot}.q`, `întrebarea ${slot}`)}</span>
              <ChevronDown className={`h-3 w-3 text-slate-400 ${slot === 2 ? 'rotate-180' : ''}`} />
            </div>
            {slot === 2 && <p className="px-2.5 pb-2 text-[10px] leading-relaxed text-slate-600">{v(values, 'home.faq.2.a', 'răspuns')}</p>}
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-slate-400 sm:col-span-2">Răspunsurile se văd la click pe întrebare. Fără vizite la domiciliu, întrebarea 4 dispare, iar răspunsul 5 devine „{v(values, 'home.faq.5.a_online')}”.</p>
    </div>
  );
}

function HomeAudiencesPreview({ values }: PreviewProps) {
  return (
    <div className={`${shell} grid grid-cols-2 gap-2`}>
      {[2, 3].map((slot) => (
        <div key={slot} className={`flex flex-col gap-1 rounded-lg p-2.5 text-white ${slot === 2 ? 'bg-blue-600' : 'bg-emerald-600'}`}>
          <span className="flex items-center gap-1 text-[9px] font-semibold tracking-wide text-white/80">
            {slot === 2 ? <Stethoscope className="h-3 w-3" /> : <Users className="h-3 w-3" />}{v(values, `home.audiences.${slot}.eyebrow`, 'etichetă')}
          </span>
          <p className="text-xs font-bold">{v(values, `home.audiences.${slot}.title`, 'titlu')}</p>
          <p className="line-clamp-3 flex-1 text-[10px] leading-relaxed text-white/90">{v(values, `home.audiences.${slot}.text`, 'text')}</p>
          <span className={`mt-1 self-start rounded-md bg-white px-2 py-1 text-[10px] font-semibold ${slot === 2 ? 'text-blue-700' : 'text-emerald-700'}`}>{v(values, `home.audiences.${slot}.cta`, 'buton')}</span>
        </div>
      ))}
      <p className="col-span-2 text-[10px] leading-relaxed text-slate-400">Fără vizite la domiciliu, textul operatorilor devine „{v(values, 'home.audiences.3.text_online')}”.</p>
    </div>
  );
}

function DoctorsPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <h1 className="text-base font-bold tracking-tight">{v(values, 'doctors.title', 'Titlu')}</h1>
      <p className="mt-0.5 text-[11px] text-slate-600">{v(values, 'doctors.subtitle', 'subtitlu')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[0, 1].map((key) => (
          <div key={key} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2">
            <div className="flex items-center gap-1.5"><span className="h-6 w-6 rounded-full bg-blue-100" /><span className="text-[11px] font-semibold">Dr. Exemplu</span></div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold">de la 300 MDL</span>
              <span className="rounded-md bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white">{v(values, 'doctors.book', 'buton')}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold">{v(values, 'doctors.see_all', 'buton')} (24)<ArrowRight className="h-3 w-3" /></span>
        <span className="text-center text-[10px] text-slate-500">{v(values, 'doctors.login_hint', 'text')}</span>
      </div>
      <Note>
        Când toți medicii sunt afișați, butonul devine „{v(values, 'doctors.see_more')}”. Fără medici: „{v(values, 'doctors.empty')}”.
      </Note>
    </div>
  );
}

function NewsPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-base font-bold tracking-tight">{v(values, 'news.title', 'Titlu')}</h1>
        <div className="flex gap-1 text-[10px] font-semibold">
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-white">{v(values, 'news.all_categories', 'Toate')}</span>
          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-700">Platformă</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1.2fr_1fr] overflow-hidden rounded-lg border border-slate-200">
        <div className="bg-slate-100" />
        <div className="space-y-1 p-2.5">
          <p className="text-[9px] text-slate-500"><b className="text-blue-600">Platformă</b> · 4 noiembrie 2026</p>
          <p className="text-[11px] font-bold leading-snug">Titlul articolului</p>
          <p className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600">{v(values, 'news.read_more', 'Citește')}<ArrowRight className="h-2.5 w-2.5" /></p>
        </div>
      </div>
      <Note>
        Fără articole: „{v(values, 'news.empty')}”. Categorie fără articole: „{v(values, 'news.empty_category')}”. Titlul paginii e și linkul de întoarcere din articol.
      </Note>
    </div>
  );
}

function PartnersPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <h1 className="text-base font-bold tracking-tight">{v(values, 'partners.title', 'Titlu')}</h1>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{v(values, 'partners.subtitle', 'subtitlu')}</p>
      <div className="mt-3 grid grid-cols-[1fr_1fr_1.3fr] gap-2">
        <span className="h-14 rounded-lg border-[1.5px] border-blue-600" />
        <span className="h-14 rounded-lg border border-slate-200" />
        <div className="flex flex-col gap-1 rounded-lg border border-slate-200 p-2">
          <span className="text-[11px] font-bold">Nume partener</span>
          <span className="mt-auto inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 py-1 text-[10px] font-semibold">{v(values, 'partners.visit', 'link')}<ExternalLink className="h-2.5 w-2.5" /></span>
        </div>
      </div>
      <Note>Fără parteneri: „{v(values, 'partners.empty')}”.</Note>
    </div>
  );
}

function FooterPreview({ values }: PreviewProps) {
  const column = (title: string, links: ReactNode[]) => (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold">{v(values, title, 'titlu')}</span>
      {links.map((link, index) => <span key={index} className="text-[10px] text-slate-600">{link}</span>)}
    </div>
  );
  return (
    <div className={shell}>
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3">
        <div className="flex flex-col gap-1.5">
          <BrandMark values={values} />
          <span className="text-[10px] leading-relaxed text-slate-500">{v(values, 'footer.tagline', 'descriere')}</span>
        </div>
        {column('footer.patients.title', [v(values, 'footer.patients.find_doctor'), v(values, 'footer.patients.how'), v(values, 'footer.patients.faq')])}
        {column('footer.pros.title', [v(values, 'footer.pros.doctor'), v(values, 'footer.pros.operator')])}
        {column('footer.platform.title', [v(values, 'header.nav_news', 'Noutăți'), v(values, 'header.nav_partners', 'Parteneri')])}
      </div>
      <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">© {new Date().getFullYear()} {v(values, 'footer.copyright', 'text drepturi')}</p>
      <Note>Fără vizite la domiciliu, descrierea devine „{v(values, 'footer.tagline_online')}”. Anul se adaugă automat.</Note>
    </div>
  );
}

/** Miniatura potrivită fiecărui bloc din catalogul backendului (cheia `preview`). */
export const CONTENT_PREVIEWS: Record<string, (props: PreviewProps) => JSX.Element> = {
  header: HeaderPreview,
  home_hero: HomeHeroPreview,
  home_services: HomeServicesPreview,
  home_steps: HomeStepsPreview,
  home_more: HomeMorePreview,
  home_faq: HomeFaqPreview,
  home_audiences: HomeAudiencesPreview,
  doctors: DoctorsPreview,
  news: NewsPreview,
  partners: PartnersPreview,
  footer: FooterPreview
};
