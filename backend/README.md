# Doctor.md Backend

## LiveKit Cloud

Configure `LIVEKIT_URL=wss://<project>.livekit.cloud`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in the backend environment only. Use the project's actual secret (at least 32 bytes). The frontend obtains short-lived participant tokens from the authenticated API; never put the API key or secret in `VITE_*` variables.

After updating the environment, run `php artisan config:clear` and restart queue workers (`php artisan queue:restart`). The app and queue containers must use the same project configuration. Run `php artisan livekit:check` for local configuration validation, then `php artisan livekit:check --connect` to verify authentication with a read-only Cloud request. Neither command prints credentials or creates a room.

Keep a queue worker running: it revokes participant tokens and closes the Cloud room when a consultation finishes, is cancelled, or pauses for a HIGO examination. HIGO pauses rotate the video session so a delayed close cannot disconnect the resumed call. Apply migrations before deploying this change.

The public frontend must use HTTPS so browsers can access microphones and cameras. Localhost is supported for development. LiveKit Cloud supplies its own secure media endpoint; a local LiveKit container is unnecessary. The optional local fallback is `docker compose -f compose.dev.yaml --profile local-video up -d video`.

For acceptance, use two separate browser sessions/devices with a demo doctor and patient: doctor starts/calls, patient answers, enable media, minimise and navigate, reconnect after a network interruption, leave/rejoin, then publish the conclusion and verify both participants lose access. Compare desktop/mobile states with `docs/new-design/project/Chat si apel video.dc.html`. An API test does not prove media connectivity.

## HIGO Integration Notes

HIGO credentials and endpoints must be configured only through environment variables and `config/higo.php`; never hardcode partner secrets in code, jobs, tests, or logs.

Token single-flight depends on Laravel atomic cache locks. Configure `HIGO_CACHE_STORE` to a cache backend shared by both web and queue workers. Redis is preferred. The database cache store is acceptable only when the `cache_locks` table exists and both web and queue workers use the same database connection. The `array`, `file`, and `null` stores are not valid for HIGO token locking in shared runtimes.

`higo_sync_logs` intentionally stores no headers and no raw permanent provisioning payloads. Authorization headers, OAuth tokens, refresh tokens, passwords, and patient PII fields are redacted before persistence. Any future HIGO job or webhook code must use the same redaction path before writing request or response payloads.
