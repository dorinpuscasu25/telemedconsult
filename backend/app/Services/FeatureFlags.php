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
        'with_exam_consultations' => ['label' => 'Consultații cu examinare', 'default' => true, 'description' => 'Fluxul cu operator la domiciliu (atribuire, examinare, taxă drum).'],
        'video_consultations' => ['label' => 'Consultații video', 'default' => true, 'description' => 'Consultațiile preliminare video/Meet cu medicul.'],
        'higo_devices' => ['label' => 'Aparate & integrare HIGO', 'default' => true, 'description' => 'Dispozitivele HIGO și sincronizarea datelor obiective.'],
        'doctors' => ['label' => 'Catalog medici', 'default' => true, 'description' => 'Vizibilitatea medicilor pentru pacienți în catalog.'],
        'operators' => ['label' => 'Operatori & examinări', 'default' => true, 'description' => 'Modulul de operatori teren și examinări.'],
        'patient_cards' => ['label' => 'Cartele pacient', 'default' => true, 'description' => 'Cumpărarea de cartele pentru profiluri de pacient.'],
        'telegram_notifications' => ['label' => 'Notificări Telegram', 'default' => true, 'description' => 'Trimiterea notificărilor prin canalul Telegram.'],
        'affiliate_program' => ['label' => 'Program de afiliere', 'default' => true, 'description' => 'Codurile și bonusurile de afiliere.'],
    ];

    public function __construct(private readonly PlatformConfig $config) {}

    public function enabled(string $key): bool
    {
        $default = self::FLAGS[$key]['default'] ?? true;

        return $this->config->bool(self::PREFIX.$key, $default);
    }

    /**
     * @return array<string, bool> key => enabled, for every known flag
     */
    public function enabledMap(): array
    {
        return collect(self::FLAGS)
            ->mapWithKeys(fn (array $definition, string $key) => [$key => $this->enabled($key)])
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
