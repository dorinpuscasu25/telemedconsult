<?php

namespace App\Services\Higo;

use App\Services\ObjectiveDataSchema;

/**
 * Aduce valorile aparatului în unitatea în care le citește medicul.
 *
 * Observațiile lor poartă unitatea alături de valoare (`valueQuantity`), iar
 * aceasta nu e garantat aceeași cu a noastră: aparatul configurat pe Fahrenheit
 * trimite 100.6, care fără conversie ar apărea în fișă ca „100.6 °C”. De aceea
 * valoarea se convertește la unitatea canonică din `ObjectiveDataSchema`, iar
 * ce nu se poate converti rămâne neatins — niciodată reetichetat.
 */
class ExamUnits
{
    /**
     * Factori de conversie către unitatea canonică, pe unitate de intrare
     * normalizată (litere mici, fără paranteze UCUM). `offset` se aplică DUPĂ
     * factor: valoare_canonică = valoare * factor + offset.
     *
     * @var array<string, array<string, array{factor: float, offset?: float}>>
     */
    private const CONVERSIONS = [
        '°c' => [
            '°f' => ['factor' => 0.5555555555555556, 'offset' => -17.77777777777778],
            'k' => ['factor' => 1.0, 'offset' => -273.15],
        ],
        'kg' => [
            'g' => ['factor' => 0.001],
            'lb' => ['factor' => 0.45359237],
            'lbs' => ['factor' => 0.45359237],
        ],
        'cm' => [
            'm' => ['factor' => 100.0],
            'mm' => ['factor' => 0.1],
            'in' => ['factor' => 2.54],
        ],
        'mmhg' => [
            'kpa' => ['factor' => 7.500616827],
            'cmh2o' => ['factor' => 0.735559],
        ],
        'mmol/l' => [
            'mg/dl' => ['factor' => 0.0555],
        ],
    ];

    /**
     * Sinonimele cu care poate veni aceeași unitate. Cheile UCUM ale lor sunt
     * în paranteze drepte (`[degF]`), iar `Cel` e forma FHIR pentru Celsius.
     *
     * @var array<string, string>
     */
    private const ALIASES = [
        'c' => '°c',
        'cel' => '°c',
        'celsius' => '°c',
        'degc' => '°c',
        'f' => '°f',
        'degf' => '°f',
        'fahrenheit' => '°f',
        'in_i' => 'in',
        'inch' => 'in',
        'inches' => 'in',
        'lb_av' => 'lb',
        'pound' => 'lb',
        'mm[hg]' => 'mmhg',
        'mm hg' => 'mmhg',
        'mg/dl' => 'mg/dl',
        'mmol/l' => 'mmol/l',
        'percent' => '%',
        '/min' => 'bpm',
        '1/min' => 'bpm',
        'beats/minute' => 'bpm',
    ];

    /**
     * Normalizează o măsurătoare venită din aparat.
     *
     * @return array{value: mixed, unit: ?string, converted: bool, original_value: mixed, original_unit: ?string}
     */
    public static function normalize(string $key, mixed $value, ?string $unit): array
    {
        $result = [
            'value' => $value,
            'unit' => ObjectiveDataSchema::unit($key) ?? self::clean($unit),
            'converted' => false,
            'original_value' => $value,
            'original_unit' => self::clean($unit),
        ];

        $canonical = ObjectiveDataSchema::unit($key);

        if ($canonical === null || ! is_numeric($value)) {
            return $result;
        }

        $from = self::canonicalize($unit);
        $to = self::canonicalize($canonical);

        if ($from === null || $from === $to) {
            return $result;
        }

        $conversion = self::CONVERSIONS[$to][$from] ?? null;

        if ($conversion === null) {
            return $result;
        }

        $converted = ((float) $value * $conversion['factor']) + ($conversion['offset'] ?? 0.0);

        return [
            // Două zecimale: aparatul nu are precizie mai bună, iar 36.72222…
            // în fișă arată a eroare de calcul.
            'value' => round($converted, 2),
            'unit' => $canonical,
            'converted' => true,
            'original_value' => $value,
            'original_unit' => self::clean($unit),
        ];
    }

    private static function canonicalize(?string $unit): ?string
    {
        $unit = self::clean($unit);

        if ($unit === null) {
            return null;
        }

        $unit = mb_strtolower($unit);
        $unit = trim($unit, '[]');

        return self::ALIASES[$unit] ?? $unit;
    }

    private static function clean(?string $unit): ?string
    {
        $unit = trim((string) $unit);

        return $unit === '' ? null : $unit;
    }
}
