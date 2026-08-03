FROM node:22-bookworm-slim AS frontend

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY resources ./resources
COPY public ./public
RUN npm run build

FROM composer:2 AS dependencies

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-interaction \
    --no-progress \
    --no-scripts \
    --prefer-dist

FROM dunglas/frankenphp:1-php8.4-bookworm AS runtime

RUN install-php-extensions intl mbstring opcache pdo_sqlite zip

WORKDIR /app
COPY . .
COPY --from=dependencies /app/vendor ./vendor
COPY --from=frontend /app/public/build ./public/build
COPY docker/Caddyfile /etc/frankenphp/Caddyfile
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN composer dump-autoload --classmap-authoritative --no-dev --no-interaction --no-scripts \
    && php artisan package:discover --ansi \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chmod -R ug+rwX storage bootstrap/cache

ENV APP_ENV=production \
    APP_DEBUG=false \
    CACHE_STORE=file \
    LOG_CHANNEL=stderr \
    QUEUE_CONNECTION=sync \
    SESSION_DRIVER=file \
    SERVER_NAME=:80

EXPOSE 80 443 443/udp

ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]
