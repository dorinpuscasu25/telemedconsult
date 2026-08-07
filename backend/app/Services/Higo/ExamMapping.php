<?php

namespace App\Services\Higo;

use App\Services\ObjectiveDataSchema;
use App\Services\PlatformConfig;

/**
 * Traducerea dintre vocabularul aparatului HIGO și al nostru.
 *
 * Maparea are două straturi: valorile din `config/higo.php` (ce știm din
 * documentația și sondele lor) și suprascrierile pe care le face adminul din
 * `/admin/higo`. Stratul de admin câștigă, ca o denumire nouă apărută în aparat
 * să se poată lega de câmpul corect fără deploy — iar `higo:remap` reaplică
 * maparea corectată peste examinările deja primite.
 */
class ExamMapping
{
    /** Cheile din `platform_settings` în care stau suprascrierile adminului. */
    public const SETTINGS = [
        'loinc' => 'higo.exams.loinc_map',
        'exam_type' => 'higo.exams.exam_type_map',
        'field' => 'higo.exams.field_map',
    ];

    private const CONFIG_KEYS = [
        'loinc' => 'higo.exams.loinc_map',
        'exam_type' => 'higo.exams.exam_type_map',
        'field' => 'higo.exams.field_map',
    ];

    public function __construct(private readonly PlatformConfig $config) {}

    /**
     * Codurile LOINC ale observațiilor => câmpurile noastre.
     *
     * @return array<string, string>
     */
    public function loinc(): array
    {
        return $this->merged('loinc');
    }

    /**
     * Denumirile lor de examinare („TEMPERATURE_EXAM”) => câmpurile noastre.
     *
     * @return array<string, string>
     */
    public function examTypes(): array
    {
        return $this->merged('exam_type');
    }

    /**
     * Denumirile de câmp din payload-urile fără observații FHIR.
     *
     * @return array<string, string>
     */
    public function fields(): array
    {
        return $this->merged('field');
    }

    /**
     * Alege câmpul nostru pentru o observație și spune DUPĂ CE regulă l-a ales.
     * Motivul ajunge în panoul de admin: „temperature (cod LOINC 8310-5)” e
     * altceva decât „TEMPERATURE_EXAM (nemapat, păstrat ca atare)”.
     *
     * @return array{key: string, rule: string, matched: ?string}
     */
    public function resolve(?string $loincCode, ?string $examType, string $fallback): array
    {
        $loincCode = trim((string) $loincCode);
        $examType = trim((string) $examType);

        $loincMap = $this->loinc();

        if ($loincCode !== '' && isset($loincMap[$loincCode])) {
            return ['key' => $loincMap[$loincCode], 'rule' => 'loinc', 'matched' => $loincCode];
        }

        $examTypeMap = $this->examTypes();

        if ($examType !== '' && isset($examTypeMap[$examType])) {
            return ['key' => $examTypeMap[$examType], 'rule' => 'exam_type', 'matched' => $examType];
        }

        return ['key' => $fallback, 'rule' => 'unmapped', 'matched' => null];
    }

    /**
     * Suprascrierile adminului, fără valorile din config.
     *
     * @return array<string, string>
     */
    public function overrides(string $kind): array
    {
        $stored = $this->config->get(self::SETTINGS[$kind] ?? '', []);

        if (! is_array($stored)) {
            return [];
        }

        return collect($stored)
            ->filter(fn ($value, $key) => is_string($key) && is_string($value) && trim($key) !== '')
            ->mapWithKeys(fn (string $value, string $key) => [trim($key) => trim($value)])
            ->all();
    }

    /**
     * Valorile livrate cu codul, ca panoul să poată arăta ce e implicit și ce a
     * schimbat adminul.
     *
     * @return array<string, string>
     */
    public function defaults(string $kind): array
    {
        $defaults = config(self::CONFIG_KEYS[$kind] ?? '', []);

        return is_array($defaults) ? $defaults : [];
    }

    /**
     * Înlocuiește suprascrierile unui tip de mapare. O valoare goală șterge
     * regula (se revine la implicit), iar o țintă necunoscută e acceptată
     * intenționat: cheile care nu sunt în vocabularul nostru se afișează oricum
     * în fișă, cu numele lor.
     *
     * @param  array<string, string>  $map
     */
    public function saveOverrides(string $kind, array $map, ?int $updatedBy = null): void
    {
        $clean = collect($map)
            ->mapWithKeys(fn ($value, $key) => [trim((string) $key) => trim((string) $value)])
            ->filter(fn (string $value, string $key) => $key !== '' && $value !== '')
            ->all();

        $this->config->upsert(self::SETTINGS[$kind], $clean, 'higo', 'json', $updatedBy);
    }

    /**
     * Toate regulile în vigoare, cu proveniența fiecăreia — sursa panoului de
     * mapare din admin.
     *
     * @return list<array<string, mixed>>
     */
    public function rules(string $kind): array
    {
        $defaults = $this->defaults($kind);
        $overrides = $this->overrides($kind);

        return collect($defaults)
            ->keys()
            ->merge(array_keys($overrides))
            ->unique()
            ->sort()
            ->map(fn (string $source) => [
                'source' => $source,
                'target' => $overrides[$source] ?? $defaults[$source],
                'default' => $defaults[$source] ?? null,
                'overridden' => isset($overrides[$source]) && ($overrides[$source] !== ($defaults[$source] ?? null)),
                'known_target' => ObjectiveDataSchema::knows($overrides[$source] ?? $defaults[$source] ?? ''),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<string, string>
     */
    private function merged(string $kind): array
    {
        return array_merge($this->defaults($kind), $this->overrides($kind));
    }
}
