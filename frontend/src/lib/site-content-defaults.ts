/**
 * Textele implicite ale site-ului public.
 *
 * Sursa de adevăr pentru STRUCTURĂ este catalogul din backend
 * (`app/Services/SiteContent.php`). Valorile de aici sunt doar copia de
 * siguranță împachetată în bundle: garantează că paginile se randează cu text
 * valid înainte să răspundă API-ul și dacă API-ul nu răspunde deloc.
 *
 * Când adaugi o cheie nouă în catalogul PHP, adaug-o și aici cu aceeași valoare.
 */
export const SITE_CONTENT_DEFAULTS = {
  // Antet
  'header.brand_name': 'telemedconsult',
  'header.brand_suffix': '.md',
  'header.nav_home': 'Acasă',
  'header.nav_news': 'Noutăți',
  'header.nav_partners': 'Parteneri',
  'header.cta_login': 'Autentificare',
  'header.cta_register': 'Creează cont',
  'header.cta_dashboard': 'Panoul meu',

  // Pagina principală · secțiunea de sus
  'home.hero.badge': 'Platformă de telemedicină',
  'home.hero.title': 'Sănătatea ta,',
  'home.hero.title_highlight': 'mai aproape',
  'home.hero.title_end': 'ca niciodată',
  'home.hero.subtitle':
    'telemedconsult.md conectează pacienții cu medici și operatori medicali pentru consultații online rapide, examinări la domiciliu și o fișă medicală digitală sigură.',
  'home.hero.cta_primary': 'Începe acum',
  'home.hero.cta_secondary': 'Află mai multe',

  // Pagina principală · beneficii
  'home.features.title': 'Tot ce ai nevoie într-un singur loc',
  'home.features.subtitle': 'O platformă completă, gândită pentru pacienți, medici și operatori.',
  'home.features.1.title': 'Consultații video și chat',
  'home.features.1.text':
    'Discută cu medici verificați prin video sau mesagerie, fără să pierzi timp în sala de așteptare.',
  'home.features.2.title': 'Operatori la domiciliu',
  'home.features.2.text': 'Recoltări și examinări cu dispozitive medicale, direct acasă la tine, în regiunea ta.',
  'home.features.3.title': 'Fișă medicală digitală',
  'home.features.3.text': 'Istoricul, investigațiile și rețetele tale, organizate sigur într-un singur loc.',
  'home.features.4.title': 'Date protejate',
  'home.features.4.text': 'Confidențialitate și acces controlat — doar tu și medicii tăi vedeți datele.',

  // Pagina principală · cum funcționează
  'home.steps.title': 'Cum funcționează',
  'home.steps.subtitle': 'Trei pași simpli până la îngrijirea de care ai nevoie.',
  'home.steps.1.title': 'Creează-ți contul',
  'home.steps.1.text': 'Înregistrare rapidă ca pacient, medic sau operator.',
  'home.steps.2.title': 'Alege serviciul',
  'home.steps.2.text': 'Selectează un medic sau o examinare potrivită nevoilor tale.',
  'home.steps.3.title': 'Primești îngrijire',
  'home.steps.3.text': 'Consultație online, recomandări și, la nevoie, vizita unui operator.',

  // Pagina principală · pentru cine
  'home.audiences.1.title': 'Pentru pacienți',
  'home.audiences.1.text': 'Acces rapid la medici, examinări la domiciliu și o fișă medicală mereu la îndemână.',
  'home.audiences.1.cta': 'Creează cont de pacient',
  'home.audiences.2.title': 'Pentru medici',
  'home.audiences.2.text':
    'Oferă consultații la distanță, îți setezi disponibilitatea și ajungi la pacienți din toată țara.',
  'home.audiences.2.cta': 'Înscrie-te ca medic',
  'home.audiences.3.title': 'Pentru operatori',
  'home.audiences.3.text': 'Te deplasezi la pacienți pentru recoltări și examinări cu dispozitive medicale conectate.',
  'home.audiences.3.cta': 'Înscrie-te ca operator',

  // Pagina principală · banner final
  'home.cta.title': 'Pregătit să începi?',
  'home.cta.subtitle': 'Creează-ți contul în câteva minute și descoperă o nouă formă de îngrijire medicală.',
  'home.cta.button': 'Creează cont',

  // Noutăți
  'news.title': 'Noutăți',
  'news.subtitle': 'Articole, ghiduri și noutăți despre telemedicină și sănătatea ta.',
  'news.empty': 'Momentan nu există articole publicate.',
  'news.read_more': 'Citește',
  'news.back': 'Înapoi la noutăți',

  // Parteneri
  'partners.badge': 'Parteneri',
  'partners.title': 'Partenerii noștri',
  'partners.subtitle':
    'Colaborăm cu laboratoare, farmacii și furnizori de dispozitive medicale pentru a-ți oferi servicii complete de îngrijire.',
  'partners.empty': 'Momentan nu există parteneri de afișat.',
  'partners.visit': 'Vizitează site-ul',

  // Subsol
  'footer.copyright': 'telemedconsult.md. Toate drepturile rezervate.'
} as const;

export type SiteContentKey = keyof typeof SITE_CONTENT_DEFAULTS;
