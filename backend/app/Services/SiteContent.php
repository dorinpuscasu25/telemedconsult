<?php

namespace App\Services;

use App\Models\SiteContent as SiteContentModel;
use Illuminate\Support\Facades\DB;

/**
 * Textele statice ale site-ului public.
 *
 * `CATALOG` este sursa de adevăr pentru structura panoului de administrare:
 * grupuri (blocuri vizuale) → câmpuri, fiecare cu etichetă, tip, valoare
 * implicită și un indiciu despre locul în care apare pe site.
 *
 * Valorile editate de admin sunt salvate în tabela `site_contents` și
 * suprascriu valoarea implicită. O cheie absentă din tabelă cade automat pe
 * valoarea din catalog, deci site-ul nu poate ajunge cu texte goale.
 */
class SiteContent
{
    /** Tipuri de câmp acceptate în panoul de administrare. */
    public const TYPE_TEXT = 'text';

    public const TYPE_TEXTAREA = 'textarea';

    /**
     * @var array<string, array{
     *     label: string,
     *     description: string,
     *     preview: string,
     *     fields: array<string, array{label: string, type: string, value: string, hint?: string, max?: int}>
     * }>
     */
    public const CATALOG = [
        'header' => [
            'label' => 'Antet site',
            'description' => 'Bara de sus, vizibilă pe toate paginile publice.',
            'preview' => 'header',
            'fields' => [
                'header.brand_name' => ['label' => 'Nume brand', 'type' => self::TYPE_TEXT, 'value' => 'telemedconsult', 'hint' => 'Textul îngroșat de lângă logo, în stânga sus.', 'max' => 60],
                'header.brand_suffix' => ['label' => 'Sufix brand (colorat)', 'type' => self::TYPE_TEXT, 'value' => '.md', 'hint' => 'Partea albastră de după numele brandului.', 'max' => 20],
                'header.nav_home' => ['label' => 'Meniu · Acasă', 'type' => self::TYPE_TEXT, 'value' => 'Acasă', 'max' => 40],
                'header.nav_doctors' => ['label' => 'Meniu · Medici', 'type' => self::TYPE_TEXT, 'value' => 'Medici', 'hint' => 'Catalogul public de medici, cu prețuri și programare.', 'max' => 40],
                'header.nav_news' => ['label' => 'Meniu · Noutăți', 'type' => self::TYPE_TEXT, 'value' => 'Noutăți', 'hint' => 'Numele secțiunii de articole, în meniu, în subsol și în aplicație.', 'max' => 40],
                'header.nav_partners' => ['label' => 'Meniu · Parteneri', 'type' => self::TYPE_TEXT, 'value' => 'Parteneri', 'hint' => 'Apare și în subsol.', 'max' => 40],
                'header.cta_login' => ['label' => 'Buton · Intră în cont', 'type' => self::TYPE_TEXT, 'value' => 'Intră în cont', 'hint' => 'Pe calculator.', 'max' => 40],
                'header.cta_login_short' => ['label' => 'Buton · Intră (telefon)', 'type' => self::TYPE_TEXT, 'value' => 'Intră', 'hint' => 'Varianta scurtă, pe telefon.', 'max' => 20],
                'header.cta_register' => ['label' => 'Buton · Creează cont', 'type' => self::TYPE_TEXT, 'value' => 'Creează cont', 'hint' => 'În antet și în meniul de pe telefon.', 'max' => 40],
                'header.cta_dashboard' => ['label' => 'Buton · Panoul meu', 'type' => self::TYPE_TEXT, 'value' => 'Panoul meu', 'hint' => 'Înlocuiește butoanele de autentificare când utilizatorul este logat.', 'max' => 40],
            ],
        ],

        'home_hero' => [
            'label' => 'Acasă · Secțiunea de sus',
            'description' => 'Titlul mare, butoanele și înscrierea specialiștilor — primul lucru pe care îl vede vizitatorul.',
            'preview' => 'home_hero',
            'fields' => [
                'home.hero.badge' => ['label' => 'Etichetă mică (deasupra titlului)', 'type' => self::TYPE_TEXT, 'value' => 'Platformă de telemedicină', 'hint' => 'Doar pe calculator.', 'max' => 80],
                'home.hero.title' => ['label' => 'Titlu principal', 'type' => self::TYPE_TEXT, 'value' => 'Suntem mai aproape ca niciodată de', 'hint' => 'Prima parte a titlului, scrisă cu negru.', 'max' => 120],
                'home.hero.title_highlight' => ['label' => 'Titlu · partea colorată', 'type' => self::TYPE_TEXT, 'value' => 'sănătatea ta', 'hint' => 'Cuvintele scrise cu albastru.', 'max' => 60],
                'home.hero.title_end' => ['label' => 'Titlu · final', 'type' => self::TYPE_TEXT, 'value' => '', 'hint' => 'Ce urmează după partea colorată. Poate rămâne gol.', 'max' => 60],
                'home.hero.subtitle' => ['label' => 'Text explicativ', 'type' => self::TYPE_TEXTAREA, 'value' => 'Consultații video și în chat cu medici verificați, examinări la domiciliu și o fișă medicală digitală, datorită tehnologiei HIGO și TeleMedConsult.', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite.', 'max' => 400],
                'home.hero.subtitle_online' => ['label' => 'Text explicativ · doar online', 'type' => self::TYPE_TEXTAREA, 'value' => 'Consultații video și în chat cu medici verificați și o fișă medicală digitală pentru toată familia.', 'hint' => 'Apare când vizitele la domiciliu sunt oprite (totul online).', 'max' => 400],
                'home.hero.cta_primary' => ['label' => 'Buton principal', 'type' => self::TYPE_TEXT, 'value' => 'Vezi medicii', 'hint' => 'Duce la catalogul de medici.', 'max' => 40],
                'home.hero.cta_secondary' => ['label' => 'Buton secundar', 'type' => self::TYPE_TEXT, 'value' => 'Creează cont', 'hint' => 'Duce la înregistrare.', 'max' => 40],
                'home.hero.specialist_prompt' => ['label' => 'Întrebare pentru specialiști', 'type' => self::TYPE_TEXT, 'value' => 'Ești specialist?', 'hint' => 'Textul gri din fața celor două butoane de înscriere.', 'max' => 60],
                'home.hero.cta_doctor' => ['label' => 'Buton · Înscrie-te ca medic', 'type' => self::TYPE_TEXT, 'value' => 'Înscrie-te ca medic', 'max' => 50],
                'home.hero.cta_operator' => ['label' => 'Buton · Înscrie-te ca operator', 'type' => self::TYPE_TEXT, 'value' => 'Înscrie-te ca operator', 'max' => 50],
            ],
        ],

        'home_services' => [
            'label' => 'Acasă · Servicii',
            'description' => 'Cartonașele cu felurile de consultație. Prețul „de la” se calculează automat din serviciile medicilor.',
            'preview' => 'home_services',
            'fields' => [
                'home.services.title' => ['label' => 'Titlu secțiune', 'type' => self::TYPE_TEXT, 'value' => 'Trei feluri de a ajunge la medic', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite.', 'max' => 120],
                'home.services.title_online' => ['label' => 'Titlu secțiune · doar online', 'type' => self::TYPE_TEXT, 'value' => 'Două feluri de a ajunge la medic', 'hint' => 'Apare când vizitele la domiciliu sunt oprite (totul online).', 'max' => 120],
                'home.services.subtitle' => ['label' => 'Subtitlu secțiune', 'type' => self::TYPE_TEXT, 'value' => 'Fiecare medic își alege serviciile și prețurile. Vezi totul înainte să programezi.', 'hint' => 'Doar pe calculator.', 'max' => 200],
                'home.services.link' => ['label' => 'Link pe cartonaș', 'type' => self::TYPE_TEXT, 'value' => 'Vezi medicii', 'max' => 40],
                'home.services.video.title' => ['label' => 'Video · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Consultație video', 'max' => 80],
                'home.services.video.text' => ['label' => 'Video · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Vorbești cu medicul față în față, de pe telefon sau calculator.', 'max' => 300],
                'home.services.video.meta' => ['label' => 'Video · durată', 'type' => self::TYPE_TEXT, 'value' => '15–30 min', 'max' => 40],
                'home.services.chat.title' => ['label' => 'Chat · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Întrebare în chat', 'max' => 80],
                'home.services.chat.text' => ['label' => 'Chat · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Scrii întrebarea și atașezi analize sau poze. Medicul răspunde în scris.', 'max' => 300],
                'home.services.chat.meta' => ['label' => 'Chat · durată', 'type' => self::TYPE_TEXT, 'value' => 'răspuns în 24 h', 'max' => 40],
                'home.services.home.title' => ['label' => 'Domiciliu · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Vizită la domiciliu', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite.', 'max' => 80],
                'home.services.home.text' => ['label' => 'Domiciliu · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Un operator vine acasă cu dispozitive HIGO pentru ECG, tensiune și pulsoximetrie. Medicul citește rezultatele.', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite.', 'max' => 300],
                'home.services.home.meta' => ['label' => 'Domiciliu · durată', 'type' => self::TYPE_TEXT, 'value' => '60 min', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite.', 'max' => 40],
            ],
        ],

        'home_steps' => [
            'label' => 'Acasă · Cum funcționează',
            'description' => 'Cei trei pași numerotați, fiecare cu un fragment din aplicație.',
            'preview' => 'home_steps',
            'fields' => [
                'home.steps.title' => ['label' => 'Titlu secțiune', 'type' => self::TYPE_TEXT, 'value' => 'Cum funcționează', 'max' => 120],
                'home.steps.subtitle' => ['label' => 'Subtitlu secțiune', 'type' => self::TYPE_TEXT, 'value' => 'Trei pași de la căutare la concluzia medicului.', 'hint' => 'Doar pe calculator.', 'max' => 200],
                'home.steps.1.title' => ['label' => 'Pasul 1 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Găsește medicul', 'max' => 80],
                'home.steps.1.text' => ['label' => 'Pasul 1 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Caută după specialitate sau nume. Vezi instituția, serviciile și prețul.', 'max' => 300],
                'home.steps.2.title' => ['label' => 'Pasul 2 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Alege serviciul și ora', 'max' => 80],
                'home.steps.2.text' => ['label' => 'Pasul 2 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Suma se rezervă din portofel. Dacă medicul nu confirmă, revine integral.', 'max' => 300],
                'home.steps.3.title' => ['label' => 'Pasul 3 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Primești concluzia', 'max' => 80],
                'home.steps.3.text' => ['label' => 'Pasul 3 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Diagnosticul, recomandările și PDF-ul rămân în fișa medicală.', 'max' => 300],
            ],
        ],

        'home_more' => [
            'label' => 'Acasă · Parteneri și noutăți',
            'description' => 'Titlurile și linkurile celor două rânduri de pe Acasă. Partenerii și articolele se administrează din secțiunile lor.',
            'preview' => 'home_more',
            'fields' => [
                'home.partners.title' => ['label' => 'Parteneri · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Parteneri', 'max' => 80],
                'home.partners.all' => ['label' => 'Parteneri · link', 'type' => self::TYPE_TEXT, 'value' => 'Toți partenerii', 'hint' => 'Pe calculator.', 'max' => 40],
                'home.partners.all_short' => ['label' => 'Parteneri · link scurt', 'type' => self::TYPE_TEXT, 'value' => 'Toți', 'hint' => 'Pe telefon.', 'max' => 20],
                'home.news.all' => ['label' => 'Noutăți · link', 'type' => self::TYPE_TEXT, 'value' => 'Toate noutățile', 'hint' => 'Pe calculator. Titlul rândului este cel din „Pagina Noutăți”.', 'max' => 40],
                'home.news.all_short' => ['label' => 'Noutăți · link scurt', 'type' => self::TYPE_TEXT, 'value' => 'Toate', 'hint' => 'Pe telefon.', 'max' => 20],
            ],
        ],

        'home_faq' => [
            'label' => 'Acasă · Întrebări frecvente',
            'description' => 'Întrebările care se deschid la click. Fiecare răspuns stă sub întrebarea lui.',
            'preview' => 'home_faq',
            'fields' => [
                'home.faq.title' => ['label' => 'Titlu secțiune', 'type' => self::TYPE_TEXT, 'value' => 'Întrebări frecvente', 'max' => 120],
                'home.faq.contact' => ['label' => 'Text de contact', 'type' => self::TYPE_TEXT, 'value' => 'Nu găsești răspunsul? Scrie-ne la', 'hint' => 'Doar pe calculator, urmat de adresa de email.', 'max' => 200],
                'home.faq.email' => ['label' => 'Email de contact', 'type' => self::TYPE_TEXT, 'value' => 'suport@telemedconsult.md', 'max' => 120],
                'home.faq.1.q' => ['label' => 'Întrebarea 1', 'type' => self::TYPE_TEXT, 'value' => 'Cât costă o consultație?', 'max' => 200],
                'home.faq.1.a' => ['label' => 'Răspunsul 1', 'type' => self::TYPE_TEXTAREA, 'value' => 'Fiecare medic își stabilește serviciile și prețurile. Vezi prețul exact în profilul medicului, înainte să alegi ora.', 'max' => 600],
                'home.faq.2.q' => ['label' => 'Întrebarea 2', 'type' => self::TYPE_TEXT, 'value' => 'Ce se întâmplă cu banii dacă medicul nu confirmă?', 'max' => 200],
                'home.faq.2.a' => ['label' => 'Răspunsul 2', 'type' => self::TYPE_TEXTAREA, 'value' => 'Suma se rezervă din portofel când trimiți cererea. Dacă medicul refuză sau cererea expiră, banii revin integral în portofel.', 'max' => 600],
                'home.faq.3.q' => ['label' => 'Întrebarea 3', 'type' => self::TYPE_TEXT, 'value' => 'Pot programa pentru copil sau pentru părinți?', 'max' => 200],
                'home.faq.3.a' => ['label' => 'Răspunsul 3', 'type' => self::TYPE_TEXTAREA, 'value' => 'Da. Adaugi membrii familiei în cont și alegi pentru cine e fiecare consultație. Fiecare are fișa lui.', 'max' => 600],
                'home.faq.4.q' => ['label' => 'Întrebarea 4', 'type' => self::TYPE_TEXT, 'value' => 'Cum funcționează vizita la domiciliu?', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite.', 'max' => 200],
                'home.faq.4.a' => ['label' => 'Răspunsul 4', 'type' => self::TYPE_TEXTAREA, 'value' => 'Un operator vine la adresa ta cu dispozitive HIGO și face investigațiile incluse în serviciu. Medicul vede rezultatele și scrie concluzia.', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite.', 'max' => 600],
                'home.faq.5.q' => ['label' => 'Întrebarea 5', 'type' => self::TYPE_TEXT, 'value' => 'Cine îmi vede datele medicale?', 'max' => 200],
                'home.faq.5.a' => ['label' => 'Răspunsul 5', 'type' => self::TYPE_TEXTAREA, 'value' => 'Doar tu și medicii cu care ai consultații. Operatorul vede doar datele necesare vizitei.', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite.', 'max' => 600],
                'home.faq.5.a_online' => ['label' => 'Răspunsul 5 · doar online', 'type' => self::TYPE_TEXTAREA, 'value' => 'Doar tu și medicii cu care ai consultații.', 'hint' => 'Apare când vizitele la domiciliu sunt oprite (totul online).', 'max' => 600],
            ],
        ],

        'home_audiences' => [
            'label' => 'Acasă · Pentru profesioniști',
            'description' => 'Cele două cartonașe colorate de la final: medici (albastru) și operatori (verde).',
            'preview' => 'home_audiences',
            'fields' => [
                'home.audiences.2.eyebrow' => ['label' => 'Medici · etichetă', 'type' => self::TYPE_TEXT, 'value' => 'PENTRU MEDICI', 'max' => 40],
                'home.audiences.2.title' => ['label' => 'Medici · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Pentru medici', 'max' => 80],
                'home.audiences.2.text' => ['label' => 'Medici · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Oferă consultații la distanță, îți setezi disponibilitatea și ajungi la pacienți din toată țara.', 'max' => 300],
                'home.audiences.2.cta' => ['label' => 'Medici · buton', 'type' => self::TYPE_TEXT, 'value' => 'Înscrie-te ca medic', 'max' => 50],
                'home.audiences.3.eyebrow' => ['label' => 'Operatori · etichetă', 'type' => self::TYPE_TEXT, 'value' => 'PENTRU OPERATORI', 'max' => 40],
                'home.audiences.3.title' => ['label' => 'Operatori · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Pentru operatori', 'max' => 80],
                'home.audiences.3.text' => ['label' => 'Operatori · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Te deplasezi la pacienți pentru recoltări și examinări cu dispozitive medicale conectate.', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite.', 'max' => 300],
                'home.audiences.3.text_online' => ['label' => 'Operatori · text · doar online', 'type' => self::TYPE_TEXTAREA, 'value' => 'Recomanzi platforma oamenilor din zona ta prin linkul tău personal și vezi câți pacienți ai adus.', 'hint' => 'Apare când vizitele la domiciliu sunt oprite (totul online).', 'max' => 300],
                'home.audiences.3.cta' => ['label' => 'Operatori · buton', 'type' => self::TYPE_TEXT, 'value' => 'Înscrie-te ca operator', 'max' => 50],
            ],
        ],

        'doctors' => [
            'label' => 'Pagina Medici',
            'description' => 'Catalogul public de medici, înainte de autentificare.',
            'preview' => 'doctors',
            'fields' => [
                'doctors.title' => ['label' => 'Titlu pagină', 'type' => self::TYPE_TEXT, 'value' => 'Medici', 'max' => 80],
                'doctors.subtitle' => ['label' => 'Subtitlu', 'type' => self::TYPE_TEXT, 'value' => 'Câțiva dintre medicii platformei. Toată lista o vezi după ce intri în cont.', 'max' => 300],
                'doctors.empty' => ['label' => 'Text când nu există medici', 'type' => self::TYPE_TEXT, 'value' => 'Medicii apar aici în curând.', 'max' => 200],
                'doctors.book' => ['label' => 'Buton pe cartonaș', 'type' => self::TYPE_TEXT, 'value' => 'Programează-te', 'max' => 40],
                'doctors.see_all' => ['label' => 'Buton · toți medicii', 'type' => self::TYPE_TEXT, 'value' => 'Vezi toți medicii', 'hint' => 'Numărul total de medici se adaugă automat în paranteză.', 'max' => 60],
                'doctors.see_more' => ['label' => 'Buton · mai mult', 'type' => self::TYPE_TEXT, 'value' => 'Vezi mai mult', 'hint' => 'Când toți medicii sunt deja afișați.', 'max' => 60],
                'doctors.login_hint' => ['label' => 'Text sub buton (fără cont)', 'type' => self::TYPE_TEXTAREA, 'value' => 'Intri în cont și vezi toți medicii, cu orele libere. Medicul ales la „Programează-te” se păstrează.', 'max' => 300],
            ],
        ],

        'news' => [
            'label' => 'Pagina Noutăți',
            'description' => 'Lista de articole, publică și în interiorul aplicației.',
            'preview' => 'news',
            'fields' => [
                'news.title' => ['label' => 'Titlu pagină', 'type' => self::TYPE_TEXT, 'value' => 'Noutăți', 'hint' => 'Apare și ca titlu al rândului de pe Acasă și ca link de întoarcere din articol.', 'max' => 120],
                'news.all_categories' => ['label' => 'Filtru · toate categoriile', 'type' => self::TYPE_TEXT, 'value' => 'Toate', 'max' => 40],
                'news.read_more' => ['label' => 'Link pe articolul mare', 'type' => self::TYPE_TEXT, 'value' => 'Citește', 'max' => 40],
                'news.empty' => ['label' => 'Text când nu există articole', 'type' => self::TYPE_TEXT, 'value' => 'Momentan nu există articole publicate.', 'max' => 200],
                'news.empty_category' => ['label' => 'Text când categoria e goală', 'type' => self::TYPE_TEXT, 'value' => 'Nicio noutate în această categorie.', 'max' => 200],
            ],
        ],

        'partners' => [
            'label' => 'Pagina Parteneri',
            'description' => 'Antetul paginii de parteneri și panoul partenerului ales.',
            'preview' => 'partners',
            'fields' => [
                'partners.title' => ['label' => 'Titlu pagină', 'type' => self::TYPE_TEXT, 'value' => 'Partenerii noștri', 'max' => 120],
                'partners.subtitle' => ['label' => 'Subtitlu', 'type' => self::TYPE_TEXTAREA, 'value' => 'Colaborăm cu laboratoare, farmacii și furnizori de dispozitive medicale pentru a-ți oferi servicii complete de îngrijire.', 'max' => 400],
                'partners.empty' => ['label' => 'Text când nu există parteneri', 'type' => self::TYPE_TEXT, 'value' => 'Momentan nu există parteneri de afișat.', 'max' => 200],
                'partners.visit' => ['label' => 'Link către site-ul partenerului', 'type' => self::TYPE_TEXT, 'value' => 'Vizitează site-ul', 'max' => 60],
            ],
        ],

        'footer' => [
            'label' => 'Subsol site',
            'description' => 'Bara de jos, vizibilă pe toate paginile publice. „Noutăți” și „Parteneri” vin din Antet.',
            'preview' => 'footer',
            'fields' => [
                'footer.tagline' => ['label' => 'Descriere sub logo', 'type' => self::TYPE_TEXT, 'value' => 'Consultații online și examinări la domiciliu, cu dispozitive HIGO.', 'hint' => 'Apare doar când vizitele la domiciliu sunt pornite. Doar pe calculator.', 'max' => 200],
                'footer.tagline_online' => ['label' => 'Descriere sub logo · doar online', 'type' => self::TYPE_TEXT, 'value' => 'Consultații online cu medici verificați, video și în chat.', 'hint' => 'Apare când vizitele la domiciliu sunt oprite (totul online).', 'max' => 200],
                'footer.patients.title' => ['label' => 'Coloana 1 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Pacienți', 'max' => 40],
                'footer.patients.find_doctor' => ['label' => 'Coloana 1 · Caută medic', 'type' => self::TYPE_TEXT, 'value' => 'Caută medic', 'max' => 60],
                'footer.patients.how' => ['label' => 'Coloana 1 · Cum funcționează', 'type' => self::TYPE_TEXT, 'value' => 'Cum funcționează', 'max' => 60],
                'footer.patients.faq' => ['label' => 'Coloana 1 · Întrebări frecvente', 'type' => self::TYPE_TEXT, 'value' => 'Întrebări frecvente', 'max' => 60],
                'footer.pros.title' => ['label' => 'Coloana 2 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Profesioniști', 'max' => 40],
                'footer.pros.doctor' => ['label' => 'Coloana 2 · înscriere medic', 'type' => self::TYPE_TEXT, 'value' => 'Înscrie-te ca medic', 'max' => 60],
                'footer.pros.operator' => ['label' => 'Coloana 2 · înscriere operator', 'type' => self::TYPE_TEXT, 'value' => 'Înscrie-te ca operator', 'max' => 60],
                'footer.platform.title' => ['label' => 'Coloana 3 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Platformă', 'max' => 40],
                'footer.copyright' => ['label' => 'Text drepturi de autor', 'type' => self::TYPE_TEXT, 'value' => 'telemedconsult.md. Toate drepturile rezervate.', 'hint' => 'Anul curent se adaugă automat în față, nu îl scrie manual.', 'max' => 200],
            ],
        ],
    ];

    /**
     * Toate textele, cu valorile editate suprapuse peste cele implicite.
     *
     * @return array<string, string>
     */
    public function all(): array
    {
        $overrides = SiteContentModel::pluck('value', 'key')->all();
        $resolved = [];

        foreach (self::CATALOG as $group) {
            foreach ($group['fields'] as $key => $field) {
                $override = $overrides[$key] ?? null;
                $resolved[$key] = $override !== null && $override !== '' ? $override : $field['value'];
            }
        }

        return $resolved;
    }

    public function get(string $key, ?string $default = null): ?string
    {
        return $this->all()[$key] ?? $default ?? self::defaults()[$key] ?? null;
    }

    /**
     * Structura completă pentru panoul de administrare: grupuri, câmpuri,
     * valoarea curentă și valoarea implicită (pentru butonul de resetare).
     *
     * @return list<array<string, mixed>>
     */
    public function adminGroups(): array
    {
        $current = $this->all();
        $groups = [];

        foreach (self::CATALOG as $groupKey => $group) {
            $fields = [];

            foreach ($group['fields'] as $key => $field) {
                $fields[] = [
                    'key' => $key,
                    'label' => $field['label'],
                    'type' => $field['type'],
                    'hint' => $field['hint'] ?? null,
                    'max' => $field['max'] ?? 500,
                    'value' => $current[$key] ?? $field['value'],
                    'default' => $field['value'],
                ];
            }

            $groups[] = [
                'key' => $groupKey,
                'label' => $group['label'],
                'description' => $group['description'],
                'preview' => $group['preview'],
                'fields' => $fields,
            ];
        }

        return $groups;
    }

    /**
     * Salvează valorile trimise din admin.
     *
     * O valoare identică cu cea implicită (sau goală) șterge suprascrierea, ca
     * tabela să conțină doar diferențele reale față de catalog.
     *
     * @param  array<string, string|null>  $values
     */
    public function save(array $values, ?int $updatedBy = null): void
    {
        $defaults = self::defaults();

        DB::transaction(function () use ($values, $updatedBy, $defaults) {
            foreach ($values as $key => $value) {
                if (! array_key_exists($key, $defaults)) {
                    continue;
                }

                $trimmed = is_string($value) ? trim($value) : '';

                if ($trimmed === '' || $trimmed === $defaults[$key]) {
                    SiteContentModel::where('key', $key)->delete();

                    continue;
                }

                SiteContentModel::updateOrCreate(
                    ['key' => $key],
                    ['value' => $trimmed, 'updated_by' => $updatedBy],
                );
            }
        });
    }

    /** Cheile valide și valorile lor implicite. @return array<string, string> */
    public static function defaults(): array
    {
        static $defaults = null;

        if ($defaults !== null) {
            return $defaults;
        }

        $defaults = [];

        foreach (self::CATALOG as $group) {
            foreach ($group['fields'] as $key => $field) {
                $defaults[$key] = $field['value'];
            }
        }

        return $defaults;
    }

    /** Lungimea maximă acceptată pentru fiecare cheie. @return array<string, int> */
    public static function limits(): array
    {
        $limits = [];

        foreach (self::CATALOG as $group) {
            foreach ($group['fields'] as $key => $field) {
                $limits[$key] = $field['max'] ?? 500;
            }
        }

        return $limits;
    }
}
