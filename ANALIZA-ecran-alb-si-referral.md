# Analiză: ecran alb + logica de referral

Data: 26 iulie 2026
Scope: `frontend/` (React 18 + Vite), `backend/` (Laravel + Sanctum)

---

## PARTEA 1 — Ecranul alb

### Cauza rădăcină (de ce vezi *alb* și nu o eroare)

**Nu există niciun Error Boundary în tot proiectul.** Grep pe `ErrorBoundary|componentDidCatch` în `frontend/src/` → **0 rezultate**.

În plus, `src/index.tsx` folosește API-ul legacy React 17:

```tsx
import { render } from "react-dom";
render(<App />, document.getElementById("root"));
```

Cu React 18.3 instalat, asta rulează în **legacy mode**. Consecința: orice excepție aruncată în timpul render-ului face React să **demonteze întreg arborele** → `<div id="root">` rămâne gol → **ecran complet alb, fără niciun mesaj în UI**.

Deci "ecranul alb" nu e un bug, e *simptomul*. Bug-ul real e o excepție JS pe care nimeni nu o prinde. Primul fix obligatoriu e să faci eroarea vizibilă.

**Fix 1** — `src/components/ErrorBoundary.tsx` + wrap la root, și migrare la `createRoot`:

```tsx
import { createRoot } from "react-dom/client";
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
```

Pune un al doilea ErrorBoundary în interiorul layout-urilor (`AppLayout`, `AdminLayout`, în jurul `<Outlet />`), ca o pagină care crapă să nu omoare navigația.

---

### Cauza concretă a crash-urilor: 21 de fetch-uri fără `.catch()` și fără gardă de formă

Pattern-ul repetat peste tot:

```tsx
apiRequest<{data: AdminUser[]}>(`/admin/users?...`)
  .then((response) => setUsers(response.data));   // fără .catch, fără ?? []
...
{users.map(...)}                                   // → undefined.map → TypeError
```

Dacă API-ul întoarce `{data: null}`, un 401/419/500, sau se schimbă forma răspunsului, `setUsers(undefined)` trece nesancționat și crash-ul apare **la render**, nu la fetch. Combinat cu lipsa Error Boundary → ecran alb.

Locuri afectate:

| Fișier | Linie |
|---|---|
| `pages/admin/UsersPage.tsx` | 169, 173 |
| `pages/admin/DoctorsPage.tsx` | 37 |
| `pages/admin/ContractsPage.tsx` | 36 |
| `pages/admin/ComplaintsPage.tsx` | 41 |
| `pages/admin/SpecialtiesPage.tsx` | 64 |
| `pages/admin/AdminDashboard.tsx` | 26, 27 |
| `pages/admin/TransactionsPage.tsx` | 85 |
| `pages/patient/DoctorsList.tsx` | 129, 130, 145 |
| `pages/patient/OperatorsList.tsx` | 69 |
| `pages/patient/WalletPage.tsx` | 61 |
| `pages/patient/ProfilePage.tsx` | 156 |
| `pages/doctor/StatsPage.tsx` | 62 |
| `pages/doctor/DoctorHome.tsx` | 57 |
| `pages/operator/RequestsPage.tsx` | 89 |
| `pages/operator/OperatorHome.tsx` | 31 |
| `pages/coordinator/CoordinatorDashboard.tsx` | 58 |
| `pages/public/BlogPostPage.tsx` | 35 |
| `components/NotificationBell.tsx` | 31 |

**Fix 2** — normalizează la sursă: `.then(r => setUsers(r.data ?? [])).catch(() => setUsers([]))`. Ideal, un hook `useApi<T>(path, fallback)` care face asta o singură dată pentru toate paginile.

---

### `lib/api.ts` — două găuri care explică exact "când mă loghez"

```ts
const text = await response.text();
const data = text ? JSON.parse(text) : null;   // ← NU e în try/catch
```

1. **`JSON.parse` neprotejat.** Orice răspuns non-JSON aruncă `SyntaxError: Unexpected token '<'`. Se întâmplă când: nginx dă 502/504 (pagină HTML), Laravel dă pagina de debug HTML, `/api/` proxy e picat și nginx servește `index.html` prin `try_files`, sau CDN-ul întoarce o pagină de eroare. Frecvent imediat după login, când pagina trage 4–6 endpoint-uri simultan.

2. **Zero tratare de 401.** Când tokenul Sanctum expiră, fiecare cerere dă 401, `setUsers(undefined)` etc., și nu există logout/redirect automat. Utilizatorul rămâne pe o pagină care crapă în loc să fie trimis la `/login`.

**Fix 3** — în `apiRequest`:

```ts
let data = null;
try { data = text ? JSON.parse(text) : null; }
catch { throw Object.assign(new Error('Răspuns invalid de la server.'), { status: response.status, raw: text }); }

if (response.status === 401 && options.auth !== false) {
  setToken(null);
  window.location.assign('/login');   // sau un event global tratat în AuthContext
  throw new Error('Sesiune expirată.');
}
```

Notă legată: în `App.tsx` providerele sunt **în afara** Router-ului:

```tsx
<AuthProvider><FeatureFlagsProvider><Router><AppRoutes/></Router>...
```

De aceea nu poți face redirect cu `useNavigate` din `AuthContext`. Mută `<Router>` cel mai în exterior când adaugi redirect-ul pe 401.

---

### Ecran alb intermitent după deploy (explică "de multe ori")

`frontend/docker/nginx.conf`:

```nginx
location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
location = /runtime-env.js { expires -1; add_header Cache-Control "no-store"; }
location / { try_files $uri $uri/ /index.html; }   # ← fără nicio directivă de cache
```

`index.html` referă bundle-uri cu hash (`/assets/index-D--gVmHc.js`). La fiecare deploy hash-ul se schimbă și fișierul vechi **dispare**. Orice browser sau CDN care ține `index.html` din cache cere un modul care dă **404** → nimic nu se execută → **ecran alb total**, care dispare la hard refresh (Ctrl+Shift+R). Semnătura clasică a simptomului "de multe ori se face alb".

**Fix 4**:

```nginx
location = /index.html {
    expires -1;
    add_header Cache-Control "no-store, must-revalidate";
}
```

Bonus, tot din `nginx.conf`: pentru că blocurile `/assets/` și `/runtime-env.js` au propriile `add_header`, **header-ele de securitate de la nivel de `server` nu se moștenesc** acolo (regula de moștenire `add_header` din nginx). Mută-le într-un `include` comun sau repetă-le în fiecare `location`.

---

### Riscuri de crash punctuale (numerice neprotejate)

| Fișier:linie | Cod | Crapă când |
|---|---|---|
| `admin/TransactionsPage.tsx:218` | `tx.amount.toFixed(2)` | `amount` null |
| `admin/TransactionsPage.tsx:220` | `tx.fee.toFixed(2)` | `fee` null |
| `admin/TransactionsPage.tsx:242, 297` | `request.amount.toFixed(2)` | null |
| `doctor/StatsPage.tsx:200` | `withdrawal.amount.toFixed(2)` | null |
| `patient/WalletPage.tsx:208` | `tx.amount.toFixed(2)` | null |

(`DoctorHome:105`, `StatsPage:107/121`, `WalletPage:121` sunt corect protejate cu `?? 0` — model bun de urmat.)

Și o gaură reală de tipuri, `admin/UsersPage.tsx:199`:
```
TS2345: Argument of type '"patient" | "doctor" | "operator" | "admin" | "all"'
        is not assignable to parameter of type 'RoleName'. Type '"all"' is not assignable.
```

De asemenea `tsconfig.json` nu include `vite/client`, de unde 7 erori `Property 'env' does not exist on type 'ImportMeta'` care ascund erori reale în zgomot.

---

### "Când schimb ceva" — `admin/SettingsPage.tsx:126`

```tsx
try {
  await apiRequest('/admin/settings', { method: 'PUT', ... });
  setMessage('Setări salvate.');
  loadAll();
} finally { setIsSaving(false); }   // ← try/finally FĂRĂ catch
```

Dacă backend-ul întoarce 422 (de ex. regula de validare pe `affiliate.patient_registration_reward`, `AdminOperationsController.php:278`), excepția scapă, mesajul de succes nu apare, eroarea nu se afișează nicăieri. Din perspectiva adminului: "am schimbat ceva și nu s-a întâmplat nimic". Adaugă `catch` cu afișare de eroare. Același lucru pentru `loadAll()`, care n-are `.catch()`.

---

### Ordinea recomandată de rezolvare

1. `ErrorBoundary` + `createRoot` → **de aici încolo vezi eroarea reală în loc de alb**
2. `Cache-Control: no-store` pe `index.html` în nginx
3. `try/catch` pe `JSON.parse` + tratare 401 în `api.ts`
4. Normalizare `?? []` / `.catch()` pe cele 21 de locuri
5. Protejare `.toFixed()` + `catch` în `SettingsPage`
6. `vite/client` în tsconfig, apoi curăță erorile TS rămase

---

## PARTEA 2 — Logica de referral

### Verdict

**Nu funcționează cum ai descris.** Există **două sisteme paralele, pe jumătate construite, care nu comunică între ele.** Logica de procent pe depunere — exact ce vrei — *există deja scrisă*, dar e cod mort.

### Sistemul A — link de referral pacient (`users.referral_code`)

- `AuthController::register` (linia 63) → `ReferralProgram::attachPatient()` creează un rând în `referrals` cu status `pending`.
- `reward_amount_minor` e o **sumă fixă în MDL**, luată din setarea `affiliate.patient_registration_reward`.
- `AuthController::verifyEmailOtp` (linia 178) → `rewardVerifiedPatient()` plătește bonusul **la confirmarea emailului**, nu la depunere.
- Valoarea default a setării e **0** (`PlatformConfig.php:23`), iar `ReferralProgram.php` marchează `reward_amount_minor <= 0` drept `ineligible`.

➡️ **În practică, astăzi, nimeni nu câștigă nimic.** Și chiar dacă pui o valoare, se plătește la verificare email, nu la depunere.

### Sistemul B — afiliere medic/operator (`doctor_profiles.affiliate_code`)

`WalletController::creditAffiliateBonus()` (linia 227) face **exact** ce vrei — procent din depunere, configurabil din admin:

```php
$rateKey = $doctorProfile ? 'rate.affiliate_doctor_topup' : 'rate.affiliate_operator';
$rate = $config->number($rateKey, 0);                          // 5% / 6%
$bonusMinor = (int) round($payment->amount_minor * ($rate / 100));
```

Se apelează din `markPaymentPaid()`, deci la momentul corect (plată confirmată). **Dar:**

- Citește codul din `$payment->metadata['affiliate_code']`, care vine din **body-ul cererii** `/wallet/top-up`.
- Frontend-ul nu îl trimite niciodată — `WalletPage.tsx:81` trimite doar `{ amount }`.
- Caută codul doar în `doctor_profiles` / `operator_profiles`. **Nu se uită niciodată** la `users.referral_code` sau la tabela `referrals`.

➡️ **Sistemul B e cod mort.** Legătura invitator↔invitat, care *este* salvată corect la înregistrare, nu e citită niciodată la depunere.

---

### Ce lipsește, punct cu punct față de specificația ta

| # | Cerință | Stare actuală |
|---|---|---|
| 1 | Comisionul e **procent** (5% / 10%) | ❌ Sumă fixă MDL. Setarea `affiliate.patient_registration_reward` e validată 0–10.000 MDL (`AdminOperationsController.php:278`) |
| 2 | Se plătește **când invitatul depune bani** | ❌ Se plătește la confirmarea emailului (`AuthController.php:178`) |
| 3 | Se folosește legătura din **linkul de referral** | ❌ `creditAffiliateBonus` ignoră tabela `referrals`; cere un cod în body-ul cererii |
| 4 | Admin poate seta **procentul** | ⚠️ Parțial: `rate.affiliate_doctor_topup` (5%) și `rate.affiliate_operator` (6%) sunt editabile din `SettingsPage.tsx:77-78`. **Nu există** `rate.affiliate_patient_topup` |
| 5 | Userul e **informat** la crearea linkului | ❌ Textul e greșit — vezi mai jos |
| 6 | % la **fiecare** depunere | ❌ **Blocat de schema DB** — vezi mai jos |

### Blocaj de schemă (important înainte să scrii cod)

În migrarea `2026_07_14_000100_create_referrals_table.php`:

```php
$table->foreignId('referred_user_id')->unique()->...      // 1 rând / invitat
$table->foreignId('referral_id')->nullable()->unique()->... // 1 tranzacție / referral, VREODATĂ
```

Ambele coloane sunt `unique`. Schema permite structural **o singură plată per invitat, pentru totdeauna**.

- Vrei % **doar la prima depunere** → schema actuală merge, doar mută trigger-ul și schimbă calculul.
- Vrei % la **fiecare depunere** → ai nevoie de o tabelă nouă `referral_commissions` (`referral_id`, `payment_id` unic, `rate_snapshot`, `amount_minor`) sau să scoți `unique` de pe `wallet_transactions.referral_id`. **Aceasta e decizia de luat prima.**

### Informarea userului e incorectă

- `PlatformConfig.php:24` — `affiliate.patient_registration_rules` spune: *"Bonusul afișat se rezervă la înregistrare și intră în portofelul tău după ce noul pacient își confirmă emailul."* Descrie regula veche.
- `SettingsPage.tsx:181` (`CardDescription`) repetă aceeași afirmație greșită către admin.
- `ReferralController::show` întoarce `reward_amount` ca sumă fixă MDL. Nu există niciun câmp de procent în răspuns, deci tab-ul "Afiliere" al pacientului (`ProfilePage.tsx`, tab `referrals`) nu poate afișa "primești X% din depuneri".

---

### Plan de implementare propus

**Backend**

1. `PlatformConfig::DEFAULTS` — adaugă:
   - `rate.affiliate_patient_topup` → `10`, grup `affiliate`, tip `number` (procentul)
   - `affiliate.patient_topup_min_amount` → `0` (depunere minimă eligibilă)
   - `affiliate.patient_topup_first_only` → `true|false` (o dată vs. recurent)
2. `AdminOperationsController::updateSettings` — înlocuiește validarea 0–10.000 MDL cu 0–100 pentru procent.
3. Mută logica în `ReferralProgram`, metodă nouă `creditTopUpCommission(Payment $payment)`:
   - caută `Referral::where('referred_user_id', $payment->user_id)`
   - respinge self-referral, depuneri sub minim, program dezactivat
   - `bonus = payment->amount_minor * rate / 100`
   - creditează walletul invitatorului cu lock, scrie `WalletTransaction` cu `rate_snapshot` (deja e pattern-ul din cod — păstrează-l, e corect pentru audit)
4. `WalletController::markPaymentPaid` — apelează `creditTopUpCommission()`. Unifică sau elimină `creditAffiliateBonus()` ca să nu ai două căi de plată.
5. Scoate `rewardVerifiedPatient()` din `verifyEmailOtp` (sau păstrează-l ca "activare" a referralului, fără plată).
6. Migrare nouă pentru `referral_commissions` dacă alegi varianta recurentă.
7. `ReferralController::show` — întoarce `commission_rate` (procent), `min_amount`, `first_only`, plus `stats.earned_total` recalculat.

**Frontend**

8. `SettingsPage.tsx` — câmp "Comision afiliere pacient la alimentare (%)" + minim depunere + toggle prima-depunere; corectează `CardDescription`.
9. `ProfilePage.tsx` tab Afiliere — afișează clar: *"Primești X% din fiecare sumă alimentată de persoanele pe care le invitezi"* + regulile actualizate, **înainte** ca userul să copieze linkul.
10. `PlatformConfig.php:24` — rescrie textul `affiliate.patient_registration_rules` ca să reflecte regula pe depunere.

**Testare**

11. Test funcțional: A invită pe B → B se înregistrează cu `?ref=CODE` → B alimentează 500 MDL → A primește 50 MDL la 10% → a doua depunere respectă regula `first_only`. Plus caz self-referral și caz procent 0.

---

## Întrebarea de decis prima

**% la fiecare depunere, sau doar la prima?** Răspunsul determină dacă e nevoie de migrare nouă (`referral_commissions`) sau doar de mutat trigger-ul pe schema existentă.

---

## STARE: IMPLEMENTAT

Ambele probleme au fost rezolvate. Suportă **ambele** variante de comision printr-un toggle de admin, deci decizia de mai sus nu mai blochează.

### Ecran alb

| Fix | Fișiere |
|---|---|
| `ErrorBoundary` la root + per pagină (resetat pe schimbare de rută) | `components/ErrorBoundary.tsx` (nou), `index.tsx`, `layouts/AppLayout.tsx`, `AdminLayout.tsx`, `PublicLayout.tsx` |
| Migrare `ReactDOM.render` → `createRoot` + log pe `unhandledrejection` | `index.tsx` |
| `try/catch` pe `JSON.parse`, tratare 401 cu logout + eveniment global, mesaj pe rețea picată | `lib/api.ts`, `contexts/AuthContext.tsx` |
| `Router` mutat cel mai în exterior (providerele pot naviga) | `App.tsx` |
| 21 de fetch-uri normalizate cu `?? []` și `.catch()` | 18 pagini + `NotificationBell` |
| Helper-e defensive `money()` / `num()` / `dateTime()` / `dateOnly()` aplicate peste toate `.toFixed()` și `new Date().toLocaleString()` | `lib/format.ts` (nou) + 11 pagini |
| `catch` + afișare eroare la salvarea setărilor | `admin/SettingsPage.tsx` |
| `Cache-Control: no-store` pe `index.html`; header-e de securitate incluse explicit în locațiile cu `add_header` propriu | `docker/nginx.conf`, `docker/security-headers.conf` (nou), `Dockerfile` |
| `types: ["vite/client"]`, curățare importuri React nefolosite, fix gaura de tip `'all'` | `tsconfig.json`, 18 fișiere, `admin/UsersPage.tsx` |

`npx tsc --noEmit` → **0 erori** (de la 28). `vite build` → **OK**.

### Referral

Comisionul este acum **procent din fiecare alimentare confirmată**, configurabil din admin.

- **Setări noi** (`PlatformConfig.php`): `rate.affiliate_patient_topup` (10%), `affiliate.patient_topup_min_amount`, `affiliate.patient_topup_first_only`. Setarea veche cu sumă fixă a fost eliminată.
- **Tabelă nouă** `referral_commissions` — un rând per plată comisionată, cu `payment_id` **unique** pentru idempotență (un callback MAIB repetat nu poate plăti de două ori). Rezolvă blocajul de schemă: schema veche permitea o singură plată per invitat, vreodată.
- **`ReferralProgram::creditTopUpCommission()`** — apelată din `WalletController::markPaymentPaid()`, în aceeași tranzacție. Verifică: program activ, legătură în `referrals`, self-referral, sumă minimă, mod prima-depunere, idempotență. Salvează `rate_snapshot` pentru audit.
- **Confirmarea emailului nu mai plătește nimic** (`AuthController::verifyEmailOtp`).
- **Validare admin**: toate cotele procentuale sunt limitate 0–100 server-side (`AdminOperationsController`), nu doar cea de afiliere.
- **Informarea userului**: tab-ul Afiliere afișează procentul, suma minimă, regula prima-vs-fiecare depunere și un istoric de comisioane — **înainte** de copierea linkului. Textul regulamentului a fost rescris.
- **9 teste** în `PatientReferralProgramTest.php`: procent pe fiecare depunere, idempotență la callback dublu, mod prima-depunere, sumă minimă, snapshot de cotă la schimbarea procentului, cotă 0 / program dezactivat, self-referral, cod invalid, limite admin.

> Testele backend nu au putut fi rulate aici (PHP indisponibil în mediul de lucru). Rulează local:
> `php artisan migrate && php artisan test --filter=PatientReferralProgramTest`

---

## PARTEA 3 — Texte editabile din admin + Noutăți

### Panoul de texte (`/admin/content` → „Texte site")

**56 de texte** din site-ul public sunt acum editabile fără cod, împărțite în **9 blocuri** care corespund secțiunilor reale: Antet, Hero, Beneficii, Cum funcționează, Pentru cine, Banner final, Noutăți, Parteneri, Subsol.

Fiecare bloc, când e deschis, arată câmpurile în stânga și o **previzualizare live în dreapta** care se redesenează la fiecare tastă — reproduce așezarea reală a secțiunii, deci se vede exact unde ajunge textul. În plus: contor de caractere cu limită, indiciu sub fiecare câmp („apare lângă logo, stânga sus"), marcaj portocaliu pe câmpurile modificate, „Revino la textul implicit" per câmp și „Resetează blocul" per secțiune. Salvarea se face **pe bloc**, nu global.

**Arhitectură** — valorile implicite trăiesc în cod (`SiteContent::CATALOG`), nu în baza de date:

- un deploy nou aduce automat texte valide, fără seed obligatoriu;
- tabela `site_contents` ține **doar** diferențele față de implicit — un text golit sau readus la valoarea originală șterge rândul;
- aceleași valori implicite sunt împachetate și în bundle-ul frontend (`site-content-defaults.ts`), deci paginile se randează cu text corect **înainte** de răspunsul API și chiar dacă API-ul e picat — nu există stare de „pagină fără text";
- un test backend compară automat catalogul PHP cu fallback-ul TS și pică dacă se desincronizează.

| Fișier | Rol |
|---|---|
| `backend/app/Services/SiteContent.php` | Catalogul: blocuri, câmpuri, etichete, indicii, limite, valori implicite |
| `backend/app/Http/Controllers/Api/SiteContentController.php` | `GET /catalog/site-content` (public), `GET/PUT /admin/site-content`, `POST /admin/site-content/reset` |
| `frontend/src/contexts/SiteContentContext.tsx` | Provider cu `text(key)` și fallback local |
| `frontend/src/pages/admin/SiteContentPage.tsx` | Panoul pe blocuri |
| `frontend/src/pages/admin/content-previews.tsx` | Cele 9 miniaturi de previzualizare |

### Blog → Noutăți

- Redenumit în tot UI-ul: meniu public, subsol, sidebar admin, titlul paginii de administrare.
- Rute noi `/noutati` și `/noutati/:slug`. Vechile `/blog` și `/blog/:slug` **redirecționează**, deci linkurile deja trimise continuă să funcționeze.
- Numele secțiunii este el însuși editabil (`header.nav_news`) — se schimbă simultan în meniu, în subsol și în aplicație.

### Acces pentru utilizatorii logați

Linkul „Noutăți" apare acum în meniul aplicației pentru **toate rolurile** — pacient, medic, operator, coordonator — plus în sidebar-ul de admin. Articolele se citesc **în interiorul aplicației** (`/patient/noutati`, `/doctor/noutati`, etc.), fără deconectare, cu întoarcere corectă la lista rolului curent. La pacient, unde meniul era deja încărcat, linkul intră în dropdown-ul „Mai multe" pe ecrane late.

### Observație despre captura de ecran

Textele din poză — „Te-ai pregătit să începi?" și „Toate rezervate drepturi" — **nu există în codul din repo**, care conținea deja „Pregătit să începi?" și „Toate drepturile rezervate". Asta înseamnă că versiunea live e mai veche decât codul, ceea ce se leagă direct de problema de cache de la Partea 1: `index.html` fără `no-store` putea servi bundle-uri vechi. După fix și un redeploy, textele vor fi cele corecte — iar de acum le poți schimba direct din admin.
