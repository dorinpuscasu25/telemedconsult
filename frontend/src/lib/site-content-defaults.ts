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
  // Antet site
  'header.brand_name': 'telemedconsult',
  'header.brand_suffix': '.md',
  'header.nav_home': 'Acasă',
  'header.nav_doctors': 'Medici',
  'header.nav_news': 'Noutăți',
  'header.nav_partners': 'Parteneri',
  'header.cta_login': 'Intră în cont',
  'header.cta_login_short': 'Intră',
  'header.cta_register': 'Creează cont',
  'header.cta_dashboard': 'Panoul meu',

  // Acasă · Secțiunea de sus
  'home.hero.badge': 'Platformă de telemedicină',
  'home.hero.title': 'Suntem mai aproape ca niciodată de',
  'home.hero.title_highlight': 'sănătatea ta',
  'home.hero.title_end': '',
  'home.hero.subtitle': 'Consultații video și în chat cu medici verificați, examinări la domiciliu și o fișă medicală digitală, datorită tehnologiei HIGO și TeleMedConsult.',
  'home.hero.subtitle_online': 'Consultații video și în chat cu medici verificați și o fișă medicală digitală pentru toată familia.',
  'home.hero.cta_primary': 'Vezi medicii',
  'home.hero.cta_secondary': 'Creează cont',
  'home.hero.specialist_prompt': 'Ești specialist?',
  'home.hero.cta_doctor': 'Înscrie-te ca medic',
  'home.hero.cta_operator': 'Înscrie-te ca operator',

  // Acasă · Servicii
  'home.services.title': 'Trei feluri de a ajunge la medic',
  'home.services.title_online': 'Două feluri de a ajunge la medic',
  'home.services.subtitle': 'Fiecare medic își alege serviciile și prețurile. Vezi totul înainte să programezi.',
  'home.services.link': 'Vezi medicii',
  'home.services.video.title': 'Consultație video',
  'home.services.video.text': 'Vorbești cu medicul față în față, de pe telefon sau calculator.',
  'home.services.video.meta': '15–30 min',
  'home.services.chat.title': 'Întrebare în chat',
  'home.services.chat.text': 'Scrii întrebarea și atașezi analize sau poze. Medicul răspunde în scris.',
  'home.services.chat.meta': 'răspuns în 24 h',
  'home.services.home.title': 'Vizită la domiciliu',
  'home.services.home.text': 'Un operator vine acasă cu dispozitive HIGO pentru ECG, tensiune și pulsoximetrie. Medicul citește rezultatele.',
  'home.services.home.meta': '60 min',

  // Acasă · Cum funcționează
  'home.steps.title': 'Cum funcționează',
  'home.steps.subtitle': 'Trei pași de la căutare la concluzia medicului.',
  'home.steps.1.title': 'Găsește medicul',
  'home.steps.1.text': 'Caută după specialitate sau nume. Vezi instituția, serviciile și prețul.',
  'home.steps.2.title': 'Alege serviciul și ora',
  'home.steps.2.text': 'Suma se rezervă din portofel. Dacă medicul nu confirmă, revine integral.',
  'home.steps.3.title': 'Primești concluzia',
  'home.steps.3.text': 'Diagnosticul, recomandările și PDF-ul rămân în fișa medicală.',

  // Acasă · Parteneri și noutăți
  'home.partners.title': 'Parteneri',
  'home.partners.all': 'Toți partenerii',
  'home.partners.all_short': 'Toți',
  'home.news.all': 'Toate noutățile',
  'home.news.all_short': 'Toate',

  // Acasă · Întrebări frecvente
  'home.faq.title': 'Întrebări frecvente',
  'home.faq.contact': 'Nu găsești răspunsul? Scrie-ne la',
  'home.faq.email': 'suport@telemedconsult.md',
  'home.faq.1.q': 'Cât costă o consultație?',
  'home.faq.1.a': 'Fiecare medic își stabilește serviciile și prețurile. Vezi prețul exact în profilul medicului, înainte să alegi ora.',
  'home.faq.2.q': 'Ce se întâmplă cu banii dacă medicul nu confirmă?',
  'home.faq.2.a': 'Suma se rezervă din portofel când trimiți cererea. Dacă medicul refuză sau cererea expiră, banii revin integral în portofel.',
  'home.faq.3.q': 'Pot programa pentru copil sau pentru părinți?',
  'home.faq.3.a': 'Da. Adaugi membrii familiei în cont și alegi pentru cine e fiecare consultație. Fiecare are fișa lui.',
  'home.faq.4.q': 'Cum funcționează vizita la domiciliu?',
  'home.faq.4.a': 'Un operator vine la adresa ta cu dispozitive HIGO și face investigațiile incluse în serviciu. Medicul vede rezultatele și scrie concluzia.',
  'home.faq.5.q': 'Cine îmi vede datele medicale?',
  'home.faq.5.a': 'Doar tu și medicii cu care ai consultații. Operatorul vede doar datele necesare vizitei.',
  'home.faq.5.a_online': 'Doar tu și medicii cu care ai consultații.',

  // Acasă · Pentru profesioniști
  'home.audiences.2.eyebrow': 'PENTRU MEDICI',
  'home.audiences.2.title': 'Pentru medici',
  'home.audiences.2.text': 'Oferă consultații la distanță, îți setezi disponibilitatea și ajungi la pacienți din toată țara.',
  'home.audiences.2.cta': 'Înscrie-te ca medic',
  'home.audiences.3.eyebrow': 'PENTRU OPERATORI',
  'home.audiences.3.title': 'Pentru operatori',
  'home.audiences.3.text': 'Te deplasezi la pacienți pentru recoltări și examinări cu dispozitive medicale conectate.',
  'home.audiences.3.text_online': 'Recomanzi platforma oamenilor din zona ta prin linkul tău personal și vezi câți pacienți ai adus.',
  'home.audiences.3.cta': 'Înscrie-te ca operator',

  // Pagina Medici
  'doctors.title': 'Medici',
  'doctors.subtitle': 'Câțiva dintre medicii platformei. Toată lista o vezi după ce intri în cont.',
  'doctors.empty': 'Medicii apar aici în curând.',
  'doctors.book': 'Programează-te',
  'doctors.see_all': 'Vezi toți medicii',
  'doctors.see_more': 'Vezi mai mult',
  'doctors.login_hint': 'Intri în cont și vezi toți medicii, cu orele libere. Medicul ales la „Programează-te” se păstrează.',

  // Pagina Noutăți
  'news.title': 'Noutăți',
  'news.all_categories': 'Toate',
  'news.read_more': 'Citește',
  'news.empty': 'Momentan nu există articole publicate.',
  'news.empty_category': 'Nicio noutate în această categorie.',

  // Pagina Parteneri
  'partners.title': 'Partenerii noștri',
  'partners.subtitle': 'Colaborăm cu laboratoare, farmacii și furnizori de dispozitive medicale pentru a-ți oferi servicii complete de îngrijire.',
  'partners.empty': 'Momentan nu există parteneri de afișat.',
  'partners.visit': 'Vizitează site-ul',

  // Subsol site
  'footer.tagline': 'Consultații online și examinări la domiciliu, cu dispozitive HIGO.',
  'footer.tagline_online': 'Consultații online cu medici verificați, video și în chat.',
  'footer.patients.title': 'Pacienți',
  'footer.patients.find_doctor': 'Caută medic',
  'footer.patients.how': 'Cum funcționează',
  'footer.patients.faq': 'Întrebări frecvente',
  'footer.pros.title': 'Profesioniști',
  'footer.pros.doctor': 'Înscrie-te ca medic',
  'footer.pros.operator': 'Înscrie-te ca operator',
  'footer.platform.title': 'Platformă',
  'footer.copyright': 'telemedconsult.md. Toate drepturile rezervate.'
} as const;

export type SiteContentKey = keyof typeof SITE_CONTENT_DEFAULTS;
