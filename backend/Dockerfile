FROM php:8.3-fpm-alpine AS app

WORKDIR /var/www/html

RUN apk add --no-cache \
        icu-libs \
        libzip \
        su-exec \
    && apk add --no-cache --virtual .build-deps \
        $PHPIZE_DEPS \
        icu-dev \
        libzip-dev \
        linux-headers \
        oniguruma-dev \
    && docker-php-ext-install -j"$(nproc)" \
        bcmath \
        intl \
        mbstring \
        opcache \
        pcntl \
        pdo_mysql \
        zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del .build-deps

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY docker/php.ini /usr/local/etc/php/conf.d/99-telemedconsult.ini
COPY docker/entrypoint.sh /usr/local/bin/telemedconsult-entrypoint
COPY . .

RUN composer install \
        --no-dev \
        --no-interaction \
        --no-progress \
        --prefer-dist \
        --optimize-autoloader \
    && rm -f public/storage \
    && ln -s ../storage/app/public public/storage \
    && mkdir -p \
        storage/app/public \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod +x /usr/local/bin/telemedconsult-entrypoint

ENTRYPOINT ["telemedconsult-entrypoint"]
CMD ["php-fpm", "-F"]

FROM nginx:1.27-alpine AS api-nginx

WORKDIR /var/www/html

COPY --from=app /var/www/html/public ./public
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
