<?php

namespace App\Services;

/**
 * Module-level feature flags, toggled by admins. Backed by platform_settings
 * (key `feature.<name>`, group `features`) via PlatformConfig, so they inherit
 * versioning. Unknown flags default to enabled; known flags use their catalog
 * default, so existing behaviour is unchanged until an admin turns one off.
 */
class FeatureFlags
{
    public const PREFIX = 'feature.';

    public const GROUP = 'features';

    /**
     * The module catalog shown in admin. Order = display order.
     *
     * @var array<string, array{label: string, description: string, default: bool}>
     */
    public const FLAGS = [
        'payments' => ['label' => 'Plăți & portofel', 'default' => true, 'description' => 'Alimentare portofel, debitări și plăți pentru consultații. Dezactivat = blochează alimentările.'],
        'with_exam_consultations' => ['label' => 'Vizite la domiciliu cu HIGO', 'default' => true, 'description' => 'Operatorul merge la pacient cu aparatul HIGO, iar datele ajung la medic. Oprit: dispar vizitele la domiciliu, serviciile „la domiciliu” ale medicilor și HIGO; operatorii doar aduc pacienți prin linkul lor, iar consultațiile sunt online.'],
        'video_consultations' => ['label' => 'Consultații video', 'default' => true, 'description' => 'Consultațiile video directe cu medicul, prin LiveKit.'],
        'doctors' => ['label' => 'Catalog medici', 'default' => true, 'description' => 'Vizibilitatea medicilor pentru pacienți în catalog.'],
        'patient_cards' => ['label' => 'Cartele pacient', 'default' => true, 'description' => 'Cumpărarea de cartele pentru profiluri de pacient.'],
        'telegram_notifications' => ['label' => 'Notificări Telegram', 'default' => true, 'description' => 'Trimiterea notificărilor prin canalul Telegram.'],
        'affiliate_program' => ['label' => 'Program de afiliere', 'default' => true, 'description' => 'Codurile și bonusurile de afiliere.'],
    ];

    /**
     * Module care nu au comutator propriu: urmează vizitele la domiciliu. Fără
     * vizite nu există nici examinări de operator, nici date HIGO.
     *
     * @var array<string, string>
     */
    public const LINKED = [
        'higo_devices' => 'with_exam_consultations',
        'operators' => 'with_exam_consultations',
    ];

    public function __construct(private readonly PlatformConfig $config) {}

    /** true = vizitele la domiciliu cu operator și HIGO sunt pornite. */
    public function homeVisits(): bool
    {
        return $this->enabled('with_exam_consultations');
    }

    public function enabled(string $key): bool
    {
        if (isset(self::LINKED[$key])) {
            return $this->enabled(self::LINKED[$key]);
        }

        $default = self::FLAGS[$key]['default'] ?? true;

        return $this->config->bool(self::PREFIX.$key, $default);
    }

    /**
     * @return array<string, bool> key => enabled, for every known flag
     */
    public function enabledMap(): array
    {
        return collect([...array_keys(self::FLAGS), ...array_keys(self::LINKED)])
            ->mapWithKeys(fn (string $key) => [$key => $this->enabled($key)])
            ->all();
    }

    /**
     * @return list<array{key: string, label: string, description: string, enabled: bool}>
     */
    public function catalog(): array
    {
        return collect(self::FLAGS)
            ->map(fn (array $definition, string $key) => [
                'key' => $key,
                'label' => $definition['label'],
                'description' => $definition['description'],
                'enabled' => $this->enabled($key),
            ])
            ->values()
            ->all();
    }
}
