<?php

return [
    'demo_code_enabled' => (bool) env('OTP_DEMO_CODE_ENABLED', env('APP_ENV') !== 'production'),
    'demo_cache_key_prefix' => env('OTP_DEMO_CACHE_KEY_PREFIX', 'otp:demo-code:'),
    'expires_minutes' => (int) env('OTP_EXPIRES_MINUTES', 10),
];
