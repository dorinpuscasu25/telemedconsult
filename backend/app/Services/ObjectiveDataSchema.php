<?php

namespace App\Services;

/**
 * Vocabularul canonic al datelor obiective.
 *
 * Este singura definiție a măsurătorilor din platformă și e folosită în trei
 * locuri: formularul structurat al operatorului, maparea payload-urilor venite
 * din aparatul HIGO, și afișarea în fișa medicului. Datorită ei, o valoare
 * măsurată de aparat și una notată manual ajung în exact același câmp.
 *
 * Câmpurile necunoscute nu sunt respinse nicăieri — trec mai departe cu cheia
 * lor originală, ca o mapare incompletă să nu piardă date.
 */
class ObjectiveDataSchema
{
    /**
     * Câmpurile marcate `device_only` nu apar în formularul operatorului: le
     * produce numai aparatul (câte o intrare pentru fiecare loc examinat), iar
     * operatorul are deja câmpul generic corespunzător. Ele există aici ca să
     * aibă etichetă și unitate — altfel maparea ar trebui să le comprime pe
     * toate în aceeași cheie și examinarea urechii stângi ar suprascrie-o pe a
     * celei drepte.
     *
     * @var array<string, array{label: string, unit: ?string, type: string, min?: float, max?: float, group: string, device_only?: bool}>
     */
    public const FIELDS = [
        'blood_pressure_systolic' => ['label' => 'Tensiune sistolică', 'unit' => 'mmHg', 'type' => 'number', 'min' => 40, 'max' => 300, 'group' => 'vitals'],
        'blood_pressure_diastolic' => ['label' => 'Tensiune diastolică', 'unit' => 'mmHg', 'type' => 'number', 'min' => 20, 'max' => 200, 'group' => 'vitals'],
        'heart_rate' => ['label' => 'Puls', 'unit' => 'bpm', 'type' => 'number', 'min' => 20, 'max' => 250, 'group' => 'vitals'],
        'spo2' => ['label' => 'SpO₂', 'unit' => '%', 'type' => 'number', 'min' => 50, 'max' => 100, 'group' => 'vitals'],
        'temperature' => ['label' => 'Temperatură', 'unit' => '°C', 'type' => 'number', 'min' => 30, 'max' => 45, 'group' => 'vitals'],
        'respiratory_rate' => ['label' => 'Frecvență respiratorie', 'unit' => 'rpm', 'type' => 'number', 'min' => 4, 'max' => 80, 'group' => 'vitals'],
        'glucose' => ['label' => 'Glicemie', 'unit' => 'mmol/L', 'type' => 'number', 'min' => 1, 'max' => 40, 'group' => 'vitals'],
        'weight' => ['label' => 'Greutate', 'unit' => 'kg', 'type' => 'number', 'min' => 1, 'max' => 400, 'group' => 'anthropometry'],
        'height' => ['label' => 'Înălțime', 'unit' => 'cm', 'type' => 'number', 'min' => 30, 'max' => 250, 'group' => 'anthropometry'],
        'ecg' => ['label' => 'EKG', 'unit' => null, 'type' => 'text', 'group' => 'exam'],
        'auscultation' => ['label' => 'Auscultație', 'unit' => null, 'type' => 'text', 'group' => 'exam'],
        'throat' => ['label' => 'Examinare gât', 'unit' => null, 'type' => 'text', 'group' => 'exam'],
        'ear' => ['label' => 'Otoscopie', 'unit' => null, 'type' => 'text', 'group' => 'exam'],
        'skin' => ['label' => 'Tegumente', 'unit' => null, 'type' => 'text', 'group' => 'exam'],
        'notes' => ['label' => 'Observații', 'unit' => null, 'type' => 'text', 'group' => 'exam'],

        // Locurile examinate separat de aparat. Aparatul trimite o observație
        // pentru fiecare, deci fiecare are nevoie de cheia lui.
        'ear_left' => ['label' => 'Otoscopie ureche stângă', 'unit' => null, 'type' => 'text', 'group' => 'exam', 'device_only' => true],
        'ear_right' => ['label' => 'Otoscopie ureche dreaptă', 'unit' => null, 'type' => 'text', 'group' => 'exam', 'device_only' => true],
        'auscultation_heart' => ['label' => 'Auscultație cardiacă', 'unit' => null, 'type' => 'text', 'group' => 'exam', 'device_only' => true],
        'auscultation_lungs' => ['label' => 'Auscultație pulmonară', 'unit' => null, 'type' => 'text', 'group' => 'exam', 'device_only' => true],
        'auscultation_abdomen' => ['label' => 'Auscultație abdominală', 'unit' => null, 'type' => 'text', 'group' => 'exam', 'device_only' => true],
        'cough' => ['label' => 'Tuse', 'unit' => null, 'type' => 'text', 'group' => 'exam', 'device_only' => true],
    ];

    public const GROUP_LABELS = [
        'vitals' => 'Semne vitale',
        'anthropometry' => 'Măsurători',
        'exam' => 'Examinare',
    ];

    /**
     * Regulile de validare pentru cheile cunoscute dintr-un payload.
     * Cheile necunoscute rămân nevalidate intenționat: le acceptăm ca atare.
     *
     * @return array<string, list<string>>
     */
    public static function validationRules(string $prefix = 'payload'): array
    {
        $rules = [];

        foreach (self::FIELDS as $key => $field) {
            if ($field['type'] === 'number') {
                $rules["{$prefix}.{$key}"] = [
                    'nullable',
                    'numeric',
                    'min:'.$field['min'],
                    'max:'.$field['max'],
                ];

                continue;
            }

            $rules["{$prefix}.{$key}"] = ['nullable', 'string', 'max:4000'];
        }

        return $rules;
    }

    /**
     * Mesaje explicite: „temperatura trebuie să fie între 30 și 45" e mai util
     * pentru operatorul de pe teren decât eroarea generică de validare.
     *
     * @return array<string, string>
     */
    public static function validationMessages(string $prefix = 'payload'): array
    {
        $messages = [];

        foreach (self::FIELDS as $key => $field) {
            if ($field['type'] !== 'number') {
                continue;
            }

            $unit = $field['unit'] ? ' '.$field['unit'] : '';
            $messages["{$prefix}.{$key}.min"] = "{$field['label']}: valoare între {$field['min']} și {$field['max']}{$unit}.";
            $messages["{$prefix}.{$key}.max"] = $messages["{$prefix}.{$key}.min"];
            $messages["{$prefix}.{$key}.numeric"] = "{$field['label']}: introdu un număr.";
        }

        return $messages;
    }

    /**
     * Catalogul expus frontendului, ca formularul operatorului să se genereze
     * din aceeași sursă cu validarea. Câmpurile pe care le produce doar
     * aparatul rămân pe dinafară: operatorul are pentru ele câmpul generic.
     *
     * @return list<array<string, mixed>>
     */
    public static function catalog(): array
    {
        $catalog = [];

        foreach (self::FIELDS as $key => $field) {
            if ($field['device_only'] ?? false) {
                continue;
            }

            $catalog[] = [
                'key' => $key,
                'label' => $field['label'],
                'unit' => $field['unit'],
                'type' => $field['type'],
                'min' => $field['min'] ?? null,
                'max' => $field['max'] ?? null,
                'group' => $field['group'],
                'group_label' => self::GROUP_LABELS[$field['group']] ?? $field['group'],
            ];
        }

        return $catalog;
    }

    public static function knows(string $key): bool
    {
        return array_key_exists($key, self::FIELDS);
    }

    /**
     * Eticheta câmpului. Cheile necunoscute (o măsurătoare nouă a aparatului,
     * încă nemapată) se umanizează, ca fișa medicului să nu arate `skin_temp_2`.
     */
    public static function label(string $key): string
    {
        return self::FIELDS[$key]['label']
            ?? ucfirst(str_replace('_', ' ', $key));
    }

    /**
     * Unitatea canonică a câmpului — ținta conversiilor din `ExamUnits` și
     * eticheta afișată lângă valoare.
     */
    public static function unit(string $key): ?string
    {
        return self::FIELDS[$key]['unit'] ?? null;
    }

    /**
     * Toate câmpurile, inclusiv cele produse doar de aparat. Folosit de panoul
     * de mapare din admin, unde adminul TREBUIE să poată alege și ținte pe care
     * operatorul nu le completează de mână.
     *
     * @return list<array<string, mixed>>
     */
    public static function allFields(): array
    {
        $fields = [];

        foreach (self::FIELDS as $key => $field) {
            $fields[] = [
                'key' => $key,
                'label' => $field['label'],
                'unit' => $field['unit'],
                'type' => $field['type'],
                'group' => $field['group'],
                'group_label' => self::GROUP_LABELS[$field['group']] ?? $field['group'],
                'device_only' => $field['device_only'] ?? false,
            ];
        }

        return $fields;
    }
}
