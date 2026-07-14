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
