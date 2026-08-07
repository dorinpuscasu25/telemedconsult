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
                'header.brand_name' => [
                    'label' => 'Nume brand',
                    'type' => self::TYPE_TEXT,
                    'value' => 'telemedconsult',
                    'hint' => 'Textul îngroșat de lângă logo, în stânga sus.',
                    'max' => 60,
                ],
                'header.brand_suffix' => [
                    'label' => 'Sufix brand (colorat)',
                    'type' => self::TYPE_TEXT,
                    'value' => '.md',
                    'hint' => 'Partea colorată de după numele brandului.',
                    'max' => 20,
                ],
                'header.nav_home' => [
                    'label' => 'Meniu · Acasă',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Acasă',
                    'max' => 40,
                ],
                'header.nav_news' => [
                    'label' => 'Meniu · Noutăți',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Noutăți',
                    'hint' => 'Numele secțiunii de articole, în meniu și în aplicație.',
                    'max' => 40,
                ],
                'header.nav_partners' => [
                    'label' => 'Meniu · Parteneri',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Parteneri',
                    'max' => 40,
                ],
                'header.cta_login' => [
                    'label' => 'Buton · Autentificare',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Autentificare',
                    'max' => 40,
                ],
                'header.cta_register' => [
                    'label' => 'Buton · Creează cont',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Creează cont',
                    'max' => 40,
                ],
                'header.cta_dashboard' => [
                    'label' => 'Buton · Panoul meu',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Panoul meu',
                    'hint' => 'Înlocuiește butoanele de autentificare când utilizatorul este logat.',
                    'max' => 40,
                ],
            ],
        ],

        'home_hero' => [
            'label' => 'Pagina principală · Secțiunea de sus',
            'description' => 'Primul lucru pe care îl vede un vizitator când intră pe site.',
            'preview' => 'home_hero',
            'fields' => [
                'home.hero.badge' => [
                    'label' => 'Etichetă mică (deasupra titlului)',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Platformă de telemedicină',
                    'max' => 80,
                ],
                'home.hero.title' => [
                    'label' => 'Titlu principal',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Sănătatea ta,',
                    'hint' => 'Prima parte a titlului, scrisă cu negru.',
                    'max' => 120,
                ],
                'home.hero.title_highlight' => [
                    'label' => 'Titlu · partea colorată',
                    'type' => self::TYPE_TEXT,
                    'value' => 'mai aproape',
                    'hint' => 'Cuvintele evidențiate cu degrade albastru-violet.',
                    'max' => 60,
                ],
                'home.hero.title_end' => [
                    'label' => 'Titlu · final',
                    'type' => self::TYPE_TEXT,
                    'value' => 'ca niciodată',
                    'hint' => 'Ce urmează după partea colorată. Poate rămâne gol.',
                    'max' => 60,
                ],
                'home.hero.subtitle' => [
                    'label' => 'Text explicativ',
                    'type' => self::TYPE_TEXTAREA,
                    'value' => 'telemedconsult.md conectează pacienții cu medici și operatori medicali pentru consultații online rapide, examinări la domiciliu și o fișă medicală digitală sigură.',
                    'max' => 400,
                ],
                'home.hero.cta_primary' => [
                    'label' => 'Buton principal',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Începe acum',
                    'hint' => 'Duce la pagina de înregistrare.',
                    'max' => 40,
                ],
                'home.hero.cta_secondary' => [
                    'label' => 'Buton secundar',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Află mai multe',
                    'hint' => 'Duce la secțiunea de noutăți.',
                    'max' => 40,
                ],
            ],
        ],

        'home_features' => [
            'label' => 'Pagina principală · Beneficii',
            'description' => 'Cele patru cartonașe cu avantajele platformei.',
            'preview' => 'home_features',
            'fields' => [
                'home.features.title' => [
                    'label' => 'Titlu secțiune',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Tot ce ai nevoie într-un singur loc',
                    'max' => 120,
                ],
                'home.features.subtitle' => [
                    'label' => 'Subtitlu secțiune',
                    'type' => self::TYPE_TEXT,
                    'value' => 'O platformă completă, gândită pentru pacienți, medici și operatori.',
                    'max' => 200,
                ],
                'home.features.1.title' => ['label' => 'Cartonaș 1 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Consultații video și chat', 'max' => 80],
                'home.features.1.text' => ['label' => 'Cartonaș 1 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Discută cu medici verificați prin video sau mesagerie, fără să pierzi timp în sala de așteptare.', 'max' => 300],
                'home.features.2.title' => ['label' => 'Cartonaș 2 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Operatori la domiciliu', 'max' => 80],
                'home.features.2.text' => ['label' => 'Cartonaș 2 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Recoltări și examinări cu dispozitive medicale, direct acasă la tine, în regiunea ta.', 'max' => 300],
                'home.features.3.title' => ['label' => 'Cartonaș 3 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Fișă medicală digitală', 'max' => 80],
                'home.features.3.text' => ['label' => 'Cartonaș 3 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Istoricul, investigațiile și rețetele tale, organizate sigur într-un singur loc.', 'max' => 300],
                'home.features.4.title' => ['label' => 'Cartonaș 4 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Date protejate', 'max' => 80],
                'home.features.4.text' => ['label' => 'Cartonaș 4 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Confidențialitate și acces controlat — doar tu și medicii tăi vedeți datele.', 'max' => 300],
            ],
        ],

        'home_steps' => [
            'label' => 'Pagina principală · Cum funcționează',
            'description' => 'Cei trei pași numerotați.',
            'preview' => 'home_steps',
            'fields' => [
                'home.steps.title' => ['label' => 'Titlu secțiune', 'type' => self::TYPE_TEXT, 'value' => 'Cum funcționează', 'max' => 120],
                'home.steps.subtitle' => ['label' => 'Subtitlu secțiune', 'type' => self::TYPE_TEXT, 'value' => 'Trei pași simpli până la îngrijirea de care ai nevoie.', 'max' => 200],
                'home.steps.1.title' => ['label' => 'Pasul 1 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Creează-ți contul', 'max' => 80],
                'home.steps.1.text' => ['label' => 'Pasul 1 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Înregistrare rapidă ca pacient, medic sau operator.', 'max' => 300],
                'home.steps.2.title' => ['label' => 'Pasul 2 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Alege serviciul', 'max' => 80],
                'home.steps.2.text' => ['label' => 'Pasul 2 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Selectează un medic sau o examinare potrivită nevoilor tale.', 'max' => 300],
                'home.steps.3.title' => ['label' => 'Pasul 3 · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Primești îngrijire', 'max' => 80],
                'home.steps.3.text' => ['label' => 'Pasul 3 · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Consultație online, recomandări și, la nevoie, vizita unui operator.', 'max' => 300],
            ],
        ],

        'home_audiences' => [
            'label' => 'Pagina principală · Pentru cine',
            'description' => 'Cele trei cartonașe cu buton de înregistrare (pacienți, medici, operatori).',
            'preview' => 'home_audiences',
            'fields' => [
                'home.audiences.1.title' => ['label' => 'Pacienți · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Pentru pacienți', 'max' => 80],
                'home.audiences.1.text' => ['label' => 'Pacienți · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Acces rapid la medici, examinări la domiciliu și o fișă medicală mereu la îndemână.', 'max' => 300],
                'home.audiences.1.cta' => ['label' => 'Pacienți · buton', 'type' => self::TYPE_TEXT, 'value' => 'Creează cont de pacient', 'max' => 50],
                'home.audiences.2.title' => ['label' => 'Medici · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Pentru medici', 'max' => 80],
                'home.audiences.2.text' => ['label' => 'Medici · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Oferă consultații la distanță, îți setezi disponibilitatea și ajungi la pacienți din toată țara.', 'max' => 300],
                'home.audiences.2.cta' => ['label' => 'Medici · buton', 'type' => self::TYPE_TEXT, 'value' => 'Înscrie-te ca medic', 'max' => 50],
                'home.audiences.3.title' => ['label' => 'Operatori · titlu', 'type' => self::TYPE_TEXT, 'value' => 'Pentru operatori', 'max' => 80],
                'home.audiences.3.text' => ['label' => 'Operatori · text', 'type' => self::TYPE_TEXTAREA, 'value' => 'Te deplasezi la pacienți pentru recoltări și examinări cu dispozitive medicale conectate.', 'max' => 300],
                'home.audiences.3.cta' => ['label' => 'Operatori · buton', 'type' => self::TYPE_TEXT, 'value' => 'Înscrie-te ca operator', 'max' => 50],
            ],
        ],

        'home_cta' => [
            'label' => 'Pagina principală · Banner final',
            'description' => 'Bannerul albastru mare de dinaintea subsolului.',
            'preview' => 'home_cta',
            'fields' => [
                'home.cta.title' => [
                    'label' => 'Titlu',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Pregătit să începi?',
                    'max' => 120,
                ],
                'home.cta.subtitle' => [
                    'label' => 'Text',
                    'type' => self::TYPE_TEXTAREA,
                    'value' => 'Creează-ți contul în câteva minute și descoperă o nouă formă de îngrijire medicală.',
                    'max' => 300,
                ],
                'home.cta.button' => [
                    'label' => 'Buton',
                    'type' => self::TYPE_TEXT,
                    'value' => 'Creează cont',
                    'max' => 40,
                ],
            ],
        ],

        'news' => [
            'label' => 'Pagina Noutăți',
            'description' => 'Lista de articole, publică și în interiorul aplicației.',
            'preview' => 'news',
            'fields' => [
                'news.title' => ['label' => 'Titlu pagină', 'type' => self::TYPE_TEXT, 'value' => 'Noutăți', 'max' => 120],
                'news.subtitle' => ['label' => 'Subtitlu', 'type' => self::TYPE_TEXTAREA, 'value' => 'Articole, ghiduri și noutăți despre telemedicină și sănătatea ta.', 'max' => 300],
                'news.empty' => ['label' => 'Text când nu există articole', 'type' => self::TYPE_TEXT, 'value' => 'Momentan nu există articole publicate.', 'max' => 200],
                'news.read_more' => ['label' => 'Link pe cartonaș', 'type' => self::TYPE_TEXT, 'value' => 'Citește', 'max' => 40],
                'news.back' => ['label' => 'Link de întoarcere din articol', 'type' => self::TYPE_TEXT, 'value' => 'Înapoi la noutăți', 'max' => 60],
            ],
        ],

        'partners' => [
            'label' => 'Pagina Parteneri',
            'description' => 'Antetul paginii de parteneri.',
            'preview' => 'partners',
            'fields' => [
                'partners.badge' => ['label' => 'Etichetă mică', 'type' => self::TYPE_TEXT, 'value' => 'Parteneri', 'max' => 60],
                'partners.title' => ['label' => 'Titlu pagină', 'type' => self::TYPE_TEXT, 'value' => 'Partenerii noștri', 'max' => 120],
                'partners.subtitle' => ['label' => 'Subtitlu', 'type' => self::TYPE_TEXTAREA, 'value' => 'Colaborăm cu laboratoare, farmacii și furnizori de dispozitive medicale pentru a-ți oferi servicii complete de îngrijire.', 'max' => 400],
                'partners.empty' => ['label' => 'Text când nu există parteneri', 'type' => self::TYPE_TEXT, 'value' => 'Momentan nu există parteneri de afișat.', 'max' => 200],
                'partners.visit' => ['label' => 'Link către site-ul partenerului', 'type' => self::TYPE_TEXT, 'value' => 'Vizitează site-ul', 'max' => 60],
            ],
        ],

        'footer' => [
            'label' => 'Subsol site',
            'description' => 'Bara de jos, vizibilă pe toate paginile publice.',
            'preview' => 'footer',
            'fields' => [
                'footer.copyright' => [
                    'label' => 'Text drepturi de autor',
                    'type' => self::TYPE_TEXT,
                    'value' => 'telemedconsult.md. Toate drepturile rezervate.',
                    'hint' => 'Anul curent se adaugă automat în față, nu îl scrie manual.',
                    'max' => 200,
                ],
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
