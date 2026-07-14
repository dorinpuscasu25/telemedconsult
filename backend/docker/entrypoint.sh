#!/bin/sh
set -eu

mkdir -p \
    storage/app/public \
    storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
    bootstrap/cache

chown -R www-data:www-data storage bootstrap/cache

if [ "${1:-}" = "php" ] && [ "${2:-}" = "artisan" ]; then
    exec su-exec www-data "$@"
fi

exec "$@"
