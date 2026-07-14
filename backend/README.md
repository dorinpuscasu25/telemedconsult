# Doctor.md Backend

## HIGO Integration Notes

HIGO credentials and endpoints must be configured only through environment variables and `config/higo.php`; never hardcode partner secrets in code, jobs, tests, or logs.

Token single-flight depends on Laravel atomic cache locks. Configure `HIGO_CACHE_STORE` to a cache backend shared by both web and queue workers. Redis is preferred. The database cache store is acceptable only when the `cache_locks` table exists and both web and queue workers use the same database connection. The `array`, `file`, and `null` stores are not valid for HIGO token locking in shared runtimes.

`higo_sync_logs` intentionally stores no headers and no raw permanent provisioning payloads. Authorization headers, OAuth tokens, refresh tokens, passwords, and patient PII fields are redacted before persistence. Any future HIGO job or webhook code must use the same redaction path before writing request or response payloads.
