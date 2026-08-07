# Instalare pe server (Docker)

Tot ce e nevoie stă în `compose.yaml`. Pe server nu se instalează PHP, Node, MySQL sau cron — nici o intrare în crontab. Se editează două fișiere de env și se pornește stiva.

## Ce rulează

| Serviciu | Rol | Port expus |
|---|---|---|
| `frontend` | nginx cu interfața compilată; proxy spre API și websocket | `80` |
| `api` | nginx pentru backend | `127.0.0.1:8000` |
| `app` | PHP-FPM (aplicația Laravel) | — |
| `init` | rulează o dată la fiecare pornire: migrări, roluri, `storage:link` | — |
| `queue` | procesează cozile (sincronizarea conturilor spre HIGO, notificări) | — |
| `scheduler` | **înlocuiește cron-ul** — vezi mai jos | — |
| `reverb` | websocket (chat, notificări în timp real) | `127.0.0.1:8090` |
| `mysql` / `redis` | baza de date și cache/cozi | `127.0.0.1:3306` |
| `phpmyadmin` | administrarea bazei | `8080` |

## Primul deploy

```bash
git clone git@github.com:dorinpuscasu25/telemedconsult.git && cd telemedconsult
```

```bash
cp backend/.env.docker.example backend/.env.docker && cp frontend/.env.docker.example frontend/.env.docker
```

Editează `backend/.env.docker` — secțiunile marcate `[OBLIGATORIU]`. Generează cheia aplicației și pune-o la `APP_KEY`:

```bash
docker compose run --rm --no-deps app php artisan key:generate --show
```

În `frontend/.env.docker`, `VITE_REVERB_APP_KEY` trebuie să fie **identic** cu `REVERB_APP_KEY` din backend, altfel websocket-ul nu se conectează.

```bash
docker compose up -d --build
```

Verifică:

```bash
docker compose ps
```

Toate serviciile trebuie să fie `running` (`init` rămâne `exited (0)` — asta e normal, e o rulare unică).

## Actualizări

```bash
git pull && docker compose up -d --build
```

`--build` e obligatoriu: codul e copiat în imagine la build, nu montat de pe disc. Fără el, containerele repornesc cu versiunea veche. Migrările rulează singure, în `init`, înainte ca `app` să primească trafic.

Dacă ai schimbat **doar** `frontend/.env.docker`, ajunge o repornire — valorile se injectează la pornirea containerului, în `runtime-env.js`:

```bash
docker compose restart frontend
```

## Sarcinile programate

Containerul `scheduler` rulează `php artisan schedule:work` în prim-plan și declanșează ce e definit în `backend/routes/console.php`. Nu depinde de cron-ul serverului și repornește singur (`restart: unless-stopped`).

Ce rulează azi:

| Sarcină | Interval | Ce face |
|---|---|---|
| `higo:pull` | 5 minute | Aduce examinările noi din HIGO și le atașează consultațiilor |

`higo:pull` e sigur la rulări repetate — `external_id` e unic, deci o examinare adusă și prin webhook, și prin polling nu produce date duble. Când HIGO nu e configurat, comanda scrie o avertizare și iese curat; nu umple logurile cu erori.

Verifică:

```bash
docker compose logs -f scheduler
```

Ca să rulezi o sarcină pe loc, fără să aștepți intervalul:

```bash
docker compose exec app php artisan higo:pull
```

## Pași manuali, o singură dată

**Webhook Telegram** — se înregistrează automat la fiecare pornire dacă ai pus `TELEGRAM_BOT_TOKEN` și `TELEGRAM_WEBHOOK_AUTO_SET=true`. Dacă domeniul nu era public la primul deploy, rulează după:

```bash
docker compose exec app php artisan telegram:webhook set
```

**Abonarea la notificările HIGO** — NU se face automat: fiecare rulare creează o abonare nouă la ei. Rulează o singură dată, după ce domeniul e public și pe HTTPS:

```bash
docker compose exec app php artisan higo:subscribe
```

Fără abonare, examinările tot ajung — prin `higo:pull`, cu întârziere de maximum 5 minute.

## TLS

`frontend` ascultă pe portul `80`, în HTTP. Pune în față un reverse proxy care termină TLS (nginx, Caddy, Traefik sau Cloudflare) și trimite mai departe cu `X-Forwarded-Proto: https` — configurația nginx din container îl citește deja. `APP_URL` și `FRONTEND_URL` trebuie să fie pe `https://`, altfel linkurile din emailuri și abonarea HIGO (care cere HTTPS) nu funcționează.

## Diagnostic

```bash
docker compose logs -f app queue scheduler
```

```bash
docker compose exec app php artisan about
```

Starea integrării HIGO, examinările primite și maparea lor se văd în interfață, la `/admin/higo`.

## Backup

Datele stau în trei volume Docker: `mysql-data` (baza), `redis-data` (cozi/cache) și `app-storage` (fișierele examinărilor — imagini, auscultații, filmări). Baza se salvează așa:

```bash
docker compose exec mysql sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup-$(date +%F).sql
```

Fișierele examinărilor nu se pot recupera din HIGO după expirarea linkurilor lor semnate, deci `app-storage` intră și el în backup:

```bash
docker run --rm -v telemedconsult_app-storage:/data -v "$PWD:/out" alpine tar czf /out/storage-$(date +%F).tar.gz -C /data .
```
