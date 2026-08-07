import { Activity, ArrowRight, CalendarDays, Handshake, Newspaper, ShieldCheck } from 'lucide-react';

/**
 * Miniaturi ale secțiunilor reale de pe site, folosite în panoul de conținut.
 *
 * Fiecare miniatură primește valorile din formular și se redesenează la fiecare
 * tastă, ca administratorul să vadă exact unde ajunge textul pe care îl scrie.
 * Sunt intenționat simplificate: reproduc așezarea și ierarhia vizuală, nu
 * întreaga pagină.
 */
export type PreviewValues = Record<string, string>;

type PreviewProps = { values: PreviewValues };

const shell = 'rounded-xl border border-slate-200 bg-white p-4 text-left';

function Empty({ children }: { children: string }) {
  return <span className="text-slate-300">{children}</span>;
}

/** Afișează valoarea sau un marcaj gri dacă e goală, ca previzualizarea să nu „sară”. */
function v(values: PreviewValues, key: string, placeholder = 'text gol') {
  const value = values[key];
  return value ? <>{value}</> : <Empty>{placeholder}</Empty>;
}

function HeaderPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-purple-600 text-white">
            <Activity className="h-4 w-4" />
          </div>
          <span className="text-sm font-extrabold text-slate-900">
            {v(values, 'header.brand_name', 'brand')}
            <span className="text-primary">{values['header.brand_suffix']}</span>
          </span>
        </div>
        <div className="hidden items-center gap-1 text-[11px] font-medium text-slate-600 sm:flex">
          <span className="rounded bg-primary/10 px-2 py-1 text-primary">{v(values, 'header.nav_home', 'Acasă')}</span>
          <span className="px-2 py-1">{v(values, 'header.nav_news', 'Noutăți')}</span>
          <span className="px-2 py-1">{v(values, 'header.nav_partners', 'Parteneri')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600">{v(values, 'header.cta_login', 'Autentificare')}</span>
          <span className="rounded-md bg-gradient-to-r from-primary to-purple-600 px-2.5 py-1 text-[11px] font-medium text-white">
            {v(values, 'header.cta_register', 'Creează cont')}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Când utilizatorul e logat, cele două butoane sunt înlocuite de:{' '}
        <span className="font-medium text-slate-600">{v(values, 'header.cta_dashboard', 'Panoul meu')}</span>
      </p>
    </div>
  );
}

function HomeHeroPreview({ values }: PreviewProps) {
  return (
    <div className={`${shell} text-center`}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
        <Activity className="h-3 w-3" />
        {v(values, 'home.hero.badge', 'etichetă')}
      </span>
      <h1 className="mt-3 text-xl font-extrabold leading-tight tracking-tight text-slate-900">
        {v(values, 'home.hero.title', 'Titlu')}{' '}
        <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
          {values['home.hero.title_highlight']}
        </span>{' '}
        {values['home.hero.title_end']}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
        {v(values, 'home.hero.subtitle', 'text explicativ')}
      </p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-primary to-purple-600 px-3 py-1.5 text-[11px] font-medium text-white">
          {v(values, 'home.hero.cta_primary', 'buton')} <ArrowRight className="h-3 w-3" />
        </span>
        <span className="rounded-lg border-2 border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-700">
          {v(values, 'home.hero.cta_secondary', 'buton')}
        </span>
      </div>
    </div>
  );
}

function HomeFeaturesPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="text-center">
        <h2 className="text-sm font-bold text-slate-900">{v(values, 'home.features.title', 'Titlu secțiune')}</h2>
        <p className="mt-1 text-[11px] text-slate-500">{v(values, 'home.features.subtitle', 'subtitlu')}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((slot) => (
          <div key={slot} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <div className="mb-1.5 grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <p className="text-[11px] font-semibold text-slate-900">{v(values, `home.features.${slot}.title`, `titlu ${slot}`)}</p>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500">
              {v(values, `home.features.${slot}.text`, 'text')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeStepsPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="text-center">
        <h2 className="text-sm font-bold text-slate-900">{v(values, 'home.steps.title', 'Titlu secțiune')}</h2>
        <p className="mt-1 text-[11px] text-slate-500">{v(values, 'home.steps.subtitle', 'subtitlu')}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[1, 2, 3].map((slot) => (
          <div key={slot} className="rounded-lg border border-slate-100 bg-white p-2.5">
            <div className="mb-1.5 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-primary to-purple-600 text-[11px] font-bold text-white">
              {slot}
            </div>
            <p className="text-[11px] font-semibold text-slate-900">{v(values, `home.steps.${slot}.title`, `pas ${slot}`)}</p>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500">
              {v(values, `home.steps.${slot}.text`, 'text')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeAudiencesPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((slot) => (
          <div key={slot} className="flex flex-col rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <p className="text-[11px] font-bold text-slate-900">{v(values, `home.audiences.${slot}.title`, `titlu ${slot}`)}</p>
            <p className="mt-0.5 line-clamp-2 flex-1 text-[10px] leading-relaxed text-slate-500">
              {v(values, `home.audiences.${slot}.text`, 'text')}
            </p>
            <span className="mt-2 truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-[10px] font-medium text-slate-700">
              {v(values, `home.audiences.${slot}.cta`, 'buton')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeCtaPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="flex flex-col items-center gap-3 rounded-lg bg-gradient-to-r from-primary to-purple-600 p-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <h2 className="text-base font-bold text-white">{v(values, 'home.cta.title', 'Titlu')}</h2>
          <p className="mt-1 text-[11px] text-white/80">{v(values, 'home.cta.subtitle', 'text')}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[11px] font-medium text-primary">
          {v(values, 'home.cta.button', 'buton')} <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

function NewsPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <h1 className="text-lg font-extrabold tracking-tight text-slate-900">{v(values, 'news.title', 'Titlu')}</h1>
      <p className="mt-1 text-[11px] text-slate-500">{v(values, 'news.subtitle', 'subtitlu')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="overflow-hidden rounded-lg border border-slate-100">
          <div className="grid h-12 place-items-center bg-gradient-to-br from-primary/10 to-purple-500/10 text-primary/40">
            <Newspaper className="h-5 w-5" />
          </div>
          <div className="p-2">
            <div className="flex items-center gap-1 text-[9px] text-slate-400">
              <CalendarDays className="h-2.5 w-2.5" /> 12 martie 2026
            </div>
            <p className="mt-0.5 text-[11px] font-bold text-slate-900">Titlul unui articol</p>
            <span className="mt-1.5 inline-flex items-center text-[10px] font-medium text-primary">
              {v(values, 'news.read_more', 'Citește')} <ArrowRight className="ml-0.5 h-2.5 w-2.5" />
            </span>
          </div>
        </div>
        <div className="grid place-items-center rounded-lg border border-dashed border-slate-200 p-3 text-center text-[10px] leading-relaxed text-slate-400">
          Când nu există articole:
          <span className="mt-1 block font-medium text-slate-600">{v(values, 'news.empty', 'text gol')}</span>
        </div>
      </div>
      <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
        În articol, linkul de întoarcere:{' '}
        <span className="font-medium text-slate-600">← {v(values, 'news.back', 'Înapoi')}</span>
      </p>
    </div>
  );
}

function PartnersPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
        <Handshake className="h-3 w-3" /> {v(values, 'partners.badge', 'etichetă')}
      </span>
      <h1 className="mt-2 text-lg font-extrabold tracking-tight text-slate-900">{v(values, 'partners.title', 'Titlu')}</h1>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{v(values, 'partners.subtitle', 'subtitlu')}</p>
      <div className="mt-3 flex gap-2">
        <div className="flex-1 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
          <p className="text-[11px] font-bold text-slate-900">Nume partener</p>
          <span className="mt-1.5 inline-block text-[10px] font-medium text-primary">
            {v(values, 'partners.visit', 'Vizitează site-ul')}
          </span>
        </div>
        <div className="flex-1 grid place-items-center rounded-lg border border-dashed border-slate-200 p-2 text-center text-[10px] leading-relaxed text-slate-400">
          Fără parteneri:
          <span className="mt-0.5 block font-medium text-slate-600">{v(values, 'partners.empty', 'text gol')}</span>
        </div>
      </div>
    </div>
  );
}

function FooterPreview({ values }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-primary" />© {new Date().getFullYear()} {v(values, 'footer.copyright', 'text drepturi')}
        </span>
        <span className="hidden gap-3 sm:flex">
          <span>{values['header.nav_home']}</span>
          <span>{values['header.nav_news']}</span>
          <span>{values['header.nav_partners']}</span>
        </span>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Anul se adaugă automat, nu îl scrie în text.</p>
    </div>
  );
}

/** Miniatura potrivită fiecărui bloc din catalogul backendului. */
export const CONTENT_PREVIEWS: Record<string, (props: PreviewProps) => JSX.Element> = {
  header: HeaderPreview,
  home_hero: HomeHeroPreview,
  home_features: HomeFeaturesPreview,
  home_steps: HomeStepsPreview,
  home_audiences: HomeAudiencesPreview,
  home_cta: HomeCtaPreview,
  news: NewsPreview,
  partners: PartnersPreview,
  footer: FooterPreview
};
