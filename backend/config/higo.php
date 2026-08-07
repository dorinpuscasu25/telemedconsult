<?php

return [
    'base_url' => env('HIGO_BASE_URL'),

    'client_id' => env('HIGO_CLIENT_ID'),
    'client_secret' => env('HIGO_CLIENT_SECRET'),
    'username' => env('HIGO_USERNAME'),
    'password' => env('HIGO_PASSWORD'),

    'oauth' => [
        'token_path' => env('HIGO_OAUTH_TOKEN_PATH', '/oauth/token'),
        'grant_type' => env('HIGO_OAUTH_GRANT_TYPE', 'password'),
        'username_field' => env('HIGO_OAUTH_USERNAME_FIELD', 'username'),
        'password_field' => env('HIGO_OAUTH_PASSWORD_FIELD', 'password'),
    ],

    'http' => [
        'timeout' => (int) env('HIGO_HTTP_TIMEOUT', 20),
        'connect_timeout' => (int) env('HIGO_HTTP_CONNECT_TIMEOUT', 10),
        'retry_times' => (int) env('HIGO_HTTP_RETRY_TIMES', 3),
        'retry_sleep_milliseconds' => (int) env('HIGO_HTTP_RETRY_SLEEP_MS', 500),
    ],

    'cache' => [
        'store' => env('HIGO_CACHE_STORE', env('CACHE_STORE', 'redis')),
        'token_key' => env('HIGO_TOKEN_CACHE_KEY', 'higo:oauth:token'),
        'lock_key' => env('HIGO_TOKEN_LOCK_KEY', 'higo:oauth:token-lock'),
        'lock_seconds' => (int) env('HIGO_TOKEN_LOCK_SECONDS', 30),
        'block_seconds' => (int) env('HIGO_TOKEN_LOCK_BLOCK_SECONDS', 10),
        'refresh_margin_seconds' => (int) env('HIGO_TOKEN_REFRESH_MARGIN_SECONDS', 300),
        'max_token_cache_seconds' => (int) env('HIGO_TOKEN_MAX_CACHE_SECONDS', 3300),
        'require_shared_lock_store' => (bool) env('HIGO_REQUIRE_SHARED_LOCK_STORE', true),
        'shared_lock_stores' => ['redis', 'database', 'memcached', 'dynamodb'],
    ],

    /*
     * Provizionarea entităților noastre în HIGO.
     *
     * Formele de payload sunt FHIR R4 (Patient / Practitioner), pentru că asta
     * sugerează API-ul lor. Când primim documentația oficială, ajustările se fac
     * aici și în HigoResourceBuilder, fără să umble nimeni prin controllere:
     * fiecare entitate își are calea, tipul de resursă și metoda de update.
     */
    'sync' => [
        'enabled' => (bool) env('HIGO_SYNC_ENABLED', true),

        /** Coada pe care pleacă job-urile de sincronizare. */
        'queue' => env('HIGO_SYNC_QUEUE'),

        /**
         * Entitățile locale care au corespondent în HIGO. Rolurile care lipsesc
         * de aici (admin, coordonator) nu se trimit deloc — sunt roluri de
         * platformă, fără sens clinic în sistemul lor.
         */
        /*
         * Căile confirmate din CapabilityStatement-ul lor (GET /api/fhir/metadata,
         * FHIR R4). Atenție: serverul lor NU expune `Practitioner`; medicii și
         * operatorii au resurse proprii, iar `DoctorResource` acceptă doar
         * `create` — de aceea `supports_update` e false acolo.
         */
        'resources' => [
            'patient' => [
                'path' => env('HIGO_PATIENT_PATH', '/api/fhir/Patient'),
                'resource_type' => 'Patient',
                'update_method' => env('HIGO_PATIENT_UPDATE_METHOD', 'PUT'),
                'supports_update' => true,
            ],
            'doctor' => [
                'path' => env('HIGO_DOCTOR_PATH', '/api/fhir/DoctorResource'),
                'resource_type' => 'DoctorResource',
                'update_method' => env('HIGO_DOCTOR_UPDATE_METHOD', 'PUT'),
                'supports_update' => false,
            ],
            'operator' => [
                'path' => env('HIGO_OPERATOR_PATH', '/api/fhir/MedicalOperatorResource'),
                'resource_type' => 'MedicalOperatorResource',
                'update_method' => env('HIGO_OPERATOR_UPDATE_METHOD', 'PUT'),
                'supports_update' => true,
            ],
        ],

        /** Câmpul din răspuns care conține id-ul atribuit de HIGO. */
        'id_field' => env('HIGO_RESPONSE_ID_FIELD', 'id'),

        /**
         * HIGO cere telefoane în format E.164. Numerele noastre sunt scrise
         * local („069484967”), deci li se pune acest prefix înainte de trimitere.
         */
        'phone_country_prefix' => env('HIGO_PHONE_COUNTRY_PREFIX', '+373'),

        /**
         * Sistemul identificatorului de act de identitate trimis pe Patient.
         * HIGO respinge crearea cu `error.fhir.invalid.id.document` dacă nu-i
         * convine — valoarea exactă e de confirmat cu ei.
         */
        /**
         * Tipul actului de identitate trimis pe Patient. Valori acceptate de ei:
         * PASSPORT, PESEL (număr național de identificare — se potrivește cu
         * IDNP-ul moldovenesc), RESIDENT_CARD, iar pe unele medii NON_REQUIRED.
         */
        'patient_identifier_type' => env('HIGO_PATIENT_IDENTIFIER_TYPE', 'PESEL'),

        /** Titlul postului trimis ca `qualification` pentru operatori. */
        'operator_job_title' => env('HIGO_OPERATOR_JOB_TITLE', 'Operator medical'),

        /** Prefixe recunoscute la formatarea `(prefix)number`. */
        'known_country_prefixes' => ['+373', '+40', '+380', '+48', '+7', '+44', '+49', '+39', '+33', '+1'],
    ],

    /*
     * Recepția examinărilor din aparat.
     *
     * Nu știm încă forma exactă a payload-ului lor, așa că nu presupunem una:
     * pentru fiecare informație de care avem nevoie enumerăm mai multe căi
     * candidate (notație cu punct), iar prima care există câștigă. Așa recepția
     * funcționează fie că trimit `patientId`, `patient.id` sau `subject.id`.
     *
     * Payload-ul brut se păstrează întotdeauna, deci o mapare greșită se
     * corectează aici și se reaplică retroactiv cu `php artisan higo:remap`.
     */
    'exams' => [
        'webhook_secret' => env('HIGO_EXAM_WEBHOOK_SECRET'),

        /*
         * Credențialele cu care HIGO ne apelează pe noi (Basic auth), separate de
         * cele cu care noi îi apelăm pe ei. Le generăm și li le dăm la abonare.
         */
        'notify_client_id' => env('HIGO_NOTIFY_CLIENT_ID'),
        'notify_client_secret' => env('HIGO_NOTIFY_CLIENT_SECRET'),

        /*
         * Notificarea lor arată așa și NU conține măsurători:
         *   {"code":"NEW_DIAGNOSTIC_REPORT_CREATED",
         *    "data":{"diagnosticReportId":"46509","deviceSerialNumber":"00D2...",
         *            "observationTypes":"TEMPERATURE_EXAM,SKIN_EXAM"}}
         * De aceea căile de mai jos acoperă atât notificarea, cât și raportul
         * și observațiile aduse ulterior de HigoExamFetcher.
         */
        'external_id_paths' => [
            'notification.data.diagnosticReportId', 'diagnosticReport.id',
            'id', 'examId', 'exam_id', 'examinationId', 'uuid',
        ],
        'patient_id_paths' => [
            'diagnosticReport.subject.reference', 'observations.0.subject.reference',
            'patientId', 'patient_id', 'patient.id', 'subject.id', 'subject.reference',
        ],
        'device_serial_paths' => [
            'notification.data.deviceSerialNumber',
            'deviceSerial', 'device_serial', 'device.serial', 'device.serialNumber',
        ],
        'measurements_paths' => ['measurements', 'results', 'vitals', 'data'],
        'performed_at_paths' => [
            'diagnosticReport.effectiveDateTime',
            'performedAt', 'performed_at', 'completedAt', 'date', 'effectiveDateTime',
        ],

        /** Nivelul abonării: Encounter | DiagnosticReport | Media (vezi higo:subscribe). */
        'subscription_criteria' => env('HIGO_SUBSCRIPTION_CRITERIA', 'DiagnosticReport'),

        /*
         * Observațiile lor poartă coduri LOINC. Cele nemapate nu se pierd: intră
         * cu denumirea examinării („TEMPERATURE_EXAM”) sau cu codul brut.
         */
        'loinc_map' => [
            '8310-5' => 'temperature',
            '8331-1' => 'temperature',
            '8867-4' => 'heart_rate',
            '40443-4' => 'heart_rate', // pulsul din unda aparatului lor (HEART_RATE_WAV_EXAM)
            '8480-6' => 'blood_pressure_systolic',
            '8462-4' => 'blood_pressure_diastolic',
            '9279-1' => 'respiratory_rate',
            '2708-6' => 'spo2',
            '59408-5' => 'spo2',
            '29463-7' => 'weight',
            '8302-2' => 'height',
            '2339-0' => 'glucose',
        ],

        /**
         * Denumirile lor de examinare, ca rezervă când codul LOINC nu e mapat.
         * Cele marcate „confirmat” au venit chiar din aparat (2026-08-06);
         * restul sunt presupuneri păstrate ca alias, fiindcă nu strică nimic.
         *
         * Fiecare loc examinat are cheia lui (ureche stângă ≠ ureche dreaptă,
         * auscultație cardiacă ≠ pulmonară): două examinări care ar cădea pe
         * aceeași cheie s-ar suprascrie una pe alta în fișa medicului.
         *
         * Regulile de aici sunt IMPLICITE — adminul le poate suprascrie din
         * `/admin/higo`, fără deploy (vezi App\Services\Higo\ExamMapping).
         */
        'exam_type_map' => [
            'TEMPERATURE_EXAM' => 'temperature',              // confirmat
            'HEART_RATE_WAV_EXAM' => 'heart_rate',            // confirmat
            'HEART_RATE_EXAM' => 'heart_rate',
            'SATURATION_EXAM' => 'spo2',
            'BLOOD_PRESSURE_EXAM' => 'blood_pressure_systolic',
            'THROAT_EXAM' => 'throat',                                  // confirmat
            'RIGHT_EAR_EXAM' => 'ear_right',                            // confirmat
            'LEFT_EAR_EXAM' => 'ear_left',                              // confirmat
            'EAR_EXAM' => 'ear',
            'SKIN_EXAM' => 'skin',                                      // confirmat
            'COUGH_EXAM' => 'cough',                                    // confirmat
            'HEART_AUSCULTATION_EXAM' => 'auscultation_heart',          // confirmat
            'LUNGS_AUSCULTATION_EXAM' => 'auscultation_lungs',          // confirmat
            'ABDOMINAL_AUSCULTATION_EXAM' => 'auscultation_abdomen',    // confirmat
            'LUNGS_EXAM' => 'auscultation_lungs',
            'HEART_EXAM' => 'auscultation_heart',
            'ABDOMEN_EXAM' => 'auscultation_abdomen',
        ],

        /*
         * Denumirile lor => vocabularul nostru (App\Services\ObjectiveDataSchema).
         * Cheile nemapate NU se pierd: ajung în datele obiective cu numele lor
         * original și se afișează oricum în fișa medicului.
         */
        'field_map' => [
            'systolic' => 'blood_pressure_systolic',
            'bloodPressureSystolic' => 'blood_pressure_systolic',
            'bp_systolic' => 'blood_pressure_systolic',
            'diastolic' => 'blood_pressure_diastolic',
            'bloodPressureDiastolic' => 'blood_pressure_diastolic',
            'bp_diastolic' => 'blood_pressure_diastolic',
            'pulse' => 'heart_rate',
            'heartRate' => 'heart_rate',
            'bpm' => 'heart_rate',
            'oxygenSaturation' => 'spo2',
            'saturation' => 'spo2',
            'SpO2' => 'spo2',
            'bodyTemperature' => 'temperature',
            'temp' => 'temperature',
            'respiratoryRate' => 'respiratory_rate',
            'breathRate' => 'respiratory_rate',
            'bloodGlucose' => 'glucose',
            'bodyWeight' => 'weight',
            'bodyHeight' => 'height',
            'ekg' => 'ecg',
            'electrocardiogram' => 'ecg',
            'stethoscope' => 'auscultation',
            'lungs' => 'auscultation',
            'throatImage' => 'throat',
            'earImage' => 'ear',
            'skinImage' => 'skin',
            'comment' => 'notes',
            'remarks' => 'notes',
        ],
    ],

    /*
     * Imaginile și înregistrările examinării. Url-urile lor sunt bloburi Azure
     * semnate, valabile o oră, deci fișierele se descarcă la noi și se servesc
     * din `ExamMediaController` — niciodată direct din linkul lor.
     */
    'media' => [
        'disk' => env('HIGO_MEDIA_DISK', 'local'),
        'timeout' => (int) env('HIGO_MEDIA_TIMEOUT', 30),
        /** Cât timp e valabil linkul semnat din fișa consultației. */
        'link_minutes' => (int) env('HIGO_MEDIA_LINK_MINUTES', 60),
    ],

    'logging' => [
        'enabled' => (bool) env('HIGO_SYNC_LOGGING', true),
        'redacted_value' => '[REDACTED]',
        'sensitive_keys' => [
            'authorization',
            'access_token',
            'refresh_token',
            'token',
            'client_secret',
            'clientSecret',
            'password',
            'username',
            'email',
            'phone',
            'telecom',
            'name',
            'given',
            'family',
            'first_name',
            'last_name',
            'birthDate',
            'birth_date',
            'identifier',
            'identity_number',
            'address',
            'emergency_contact',
        ],
    ],
];
