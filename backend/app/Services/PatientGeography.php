<?php

namespace App\Services;

use Illuminate\Support\Str;

class PatientGeography
{
    public function countries(): array
    {
        return config('patient_countries');
    }

    public function countryCode(?string $name): ?string
    {
        $normalized = $this->normalize($name);
        if (in_array($normalized, ['', 'moldova', 'republica moldova', 'md'], true)) {
            return 'MD';
        }

        foreach ($this->countries() as $code => $label) {
            if ($this->normalize($label) === $normalized || strtolower($code) === $normalized) {
                return $code;
            }
        }

        return null;
    }

    public function normalize(?string $value): string
    {
        return mb_strtolower(Str::squish($value ?? ''));
    }
}
