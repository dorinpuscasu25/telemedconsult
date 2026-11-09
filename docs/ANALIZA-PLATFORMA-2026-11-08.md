# Analiza platformei telemedconsult.md — cum funcționează azi

> Stare la 2026-11-08 (commit `1ec3f15`). Documentul descrie **ce face codul acum**, nu ce ar trebui să facă.
> Folosește-l ca punct de plecare pentru discuții cu Claude: fiecare secțiune are trimiteri la fișiere, iar la final e o listă de puncte slabe / întrebări deschise pe care merită să le analizezi separat.

---

## 1. Ce este platforma, pe scurt

Platformă de telemedicină pentru Republica Moldova. Un **utilizator** (titular de cont) își creează unul sau mai multe **profiluri de pacient** (el + familia), alimentează un **portofel** prin MAIB și cumpără consultații. Există trei tipuri de consultație:

| Tip (`consultation_kind`) | Cine participă | Ce se întâmplă |
|---|---|---|
| `with_exam` | pacient + **operator** (teren) + **medic** | Operatorul merge la domiciliu cu aparatul HIGO, face măsurătorile, datele ajung la medic, medicul consultă (chat/video) și emite concluzia. |
| `video` | pacient + medic | Consultație directă prin chat + video LiveKit. |
| `preliminary` | pacient + medic | Ca video; medicul poate propune ulterior o examinare HIGO (upgrade la `with_exam`). |

Banii: pacientul plătește din portofel; suma e **rezervată** („held”) la creare și **capturată** către prestator la finalizare, sau **returnată** la anulare/respingere/expirare. Platforma reține un comision configurabil.

---

## 2. Arhitectura tehnică

```
                 ┌──────────────────────────────┐
  browser ──80──▶│ frontend (nginx + SPA React) │──/api──▶ api (nginx) ──▶ app (PHP-FPM, Laravel 13)
                 │                              │──/ws───▶ reverb (websocket)
                 └──────────────────────────────┘
                                                      app ◀──▶ mysql 8.4, redis
                                                      queue     (php artisan queue:work redis)
                                                      scheduler (php artisan schedule:work → higo:pull la 5 min)
                                                      init      (migrări, roluri, repair, webhook Telegram)
```

- **Backend**: `backend/` — Laravel 13, PHP 8.3, Sanctum (token Bearer), Reverb (websocket), Fortify (doar parțial, auth-ul real e în `AuthController`). Toate endpoint-urile sunt în [`backend/routes/api.php`](backend/routes/api.php) sub `/api/v1`. Există și un starter kit Inertia (`resources/js`, `routes/web.php`, `routes/settings.php`) care **nu este folosit** de produs.
- **Frontend**: `frontend/` — React 18 + Vite + Tailwind 3 + react-router 6, SPA separat. Token-ul se ține în `localStorage` (`doctor_md_token`), vezi [`frontend/src/lib/api.ts`](frontend/src/lib/api.ts). Config la runtime prin `runtime-env.js` injectat la pornirea containerului.
- **Folderele `front-end/` și `doctor-md-backend/`** conțin doar `.idea` — rămășițe, pot fi șterse.
- **Integrări externe**:
  - **MAIB** (plăți card) — `WalletController`, `PaymentVerification`.
  - **HIGO** (aparate medicale, FHIR) — `app/Services/Higo/*`, comenzi `higo:*`.
  - **LiveKit** (video) — `LiveKitService`, `ConsultationVideoController`.
  - **Telegram** (notificări) — `TelegramBot`, `TelegramChannel`, job `SendTelegramEvent`.
  - **Resend** (email: OTP, invitații).
  - **Dompdf** (PDF-ul consultației) — `ConsultationPdf`, `MedicalDocumentPublisher`.
- **Configurare de business în DB**: `PlatformConfig` (tabela `platform_settings`, versionată în `platform_setting_versions`) + `FeatureFlags` (cheile `feature.*`). Valorile implicite sunt în [`PlatformConfig::DEFAULTS`](backend/app/Services/PlatformConfig.php).
- **Teste**: ~49 fișiere în `backend/tests/Feature` (PHPUnit), acoperă fluxul de consultație, portofel, HIGO, afiliere, instituții. Frontend-ul nu are teste.

---

## 3. Roluri

Definite în [`RolesSeeder`](backend/database/seeders/RolesSeeder.php). Un user poate avea mai multe roluri; `active_role_id` decide ce vede (`POST /auth/switch-role`).

| Rol | Etichetă UI | Zonă frontend | Ce face |
|---|---|---|---|
| `patient` | Utilizator | `/patient` | Profiluri pacient, portofel, cere consultații, chat/video, rating, reclamații, afiliere. |
| `doctor` | Medic | `/doctor` | Profil, preț, disponibilitate/concedii, investigații cerute, acceptă/pornește/finalizează consultații, PDF, retrageri. |
| `operator` | Operator | `/operator` | Acoperire regiuni, capabilități (investigații), taxe de drum; acceptă vizite, face examinarea HIGO. |
| `coordinator` | Coordonator | `/coordinator` | Preia solicitări și alocă manual un prestator. |
| `institution` | Instituție medicală | `/institution` | Clinică parteneră: își gestionează medicii, cota lor, plățile către ei. |
| `admin` | Administrator | `/admin` | Tot: utilizatori, aprobări, setări, comisioane, feature flags, regiuni, investigații, HIGO, blog, conținut site, tranzacții, retrageri. |

**Autorizare**: nu există Policies/Gates. Fiecare metodă de controller verifică inline cu `abort_unless($user->hasRole(...))` și comparații de `id`. Rutele admin sunt în același grup `auth:sanctum` ca restul; protecția e doar în controller.

---

## 4. Fluxul de cont

### 4.1 Înregistrare — `POST /auth/register` ([`AuthController::register`](backend/app/Http/Controllers/Api/AuthController.php))
1. `account_type` ∈ `patient | doctor | operator`. Un cont self-serve primește **un singur** rol.
2. Pacient → `status=active`; medic/operator → `status=pending` + profil creat neaprobat (`is_approved=false`), adminii primesc notificare.
3. Se generează cod de afiliere propriu (`ReferralProgram::ensureCode`). Dacă pacientul a venit cu `referral_code`, se creează legătura în `referrals`.
4. Se trimite OTP pe email (6 cifre).

### 4.2 Confirmare email — `POST /auth/verify-email-otp`
- Marchează emailul verificat, întoarce token Sanctum.
- **Aici** se acordă bonusul de bun-venit (`RegistrationBonus`) dacă e pornit din admin — o singură dată per cont.

### 4.3 Login — `POST /auth/login` → (opțional) `POST /auth/verify-login-otp`
- Admin: doar parolă (fără 2FA).
- Ceilalți: dacă emailul nu e verificat → retrimite OTP de confirmare. Dacă `auth.email_2fa_enabled` (implicit `true`) → OTP pe email la fiecare login.
- Medic/operator în `pending` → frontend-ul îi trimite la `/pending` până la aprobare (`/admin/registrations`).

### 4.4 Instituții
- Adminul creează instituția și managerii ei (`AdminInstitutionController`).
- Instituția creează conturi de medic direct sau trimite invitații (link valabil 7 zile, `/invitatie/:token`). Medicii adăugați de instituție sunt **aprobați automat**.

---

## 5. Pregătirea pacientului

- **Profiluri de pacient** (`patient_profiles`): un titular poate avea mai multe. Fiecare are adresă (raion `region_id`, localitate `locality_id`, stradă) — **obligatorie** pentru `with_exam`.
- **Fișa medicală** structurată (`MedicalRecordSchema`, `PatientMedicalRecordController`): istoric, alergii, investigații încărcate (fișiere private, link semnat).
- **Cartele pacient** (`PatientCardPackage` / `PatientCardPurchase`) — pachete cumpărabile, sub flag `patient_cards`.
- Profilul pacientului se sincronizează în HIGO (`SyncHigoEntity`, `HigoProvisioner`).

---

## 6. Portofelul și banii

### 6.1 Trei portofele per user ([`WalletLedger`](backend/app/Services/WalletLedger.php))
| Tip | Ce conține | De unde vine |
|---|---|---|
| `real` | bani reali (MDL, stocat în bani `*_minor`) | alimentare MAIB, refund, venituri prestator |
| `points` | puncte bonus | bonus % la alimentare (`wallet.topup_bonus_percent`), comisioane afiliere |
| `promo` | credit promoțional legat de anumiți medici | campania „prima alimentare” (`FirstTopupPromotion`) |

### 6.2 Alimentare — `POST /wallet/top-up`
1. Se creează `Payment` `pending`, se cere token MAIB, se inițiază plata → frontend-ul redirecționează la `payUrl`.
2. MAIB apelează `POST /payments/callback/maib`. Înainte de creditare, `PaymentVerification::settled()` verifică plata direct la MAIB; dacă nu poate, răspunde 503 ca MAIB să reîncerce.
3. `markPaymentPaid` (idempotent, cu lock): creditează `real`, apoi:
   - bonus % în `points`;
   - comision afiliere către invitator (`ReferralProgram::creditTopUpCommission`, % din alimentare, eventual doar prima);
   - bonus afiliere medic/operator dacă s-a trimis `affiliate_code`;
   - grant promo „prima alimentare” (500 MDL, la depunere ≥ 500 MDL, max 50% din plată, doar pentru medicii configurați).

### 6.3 Plata unei consultații
La `POST /requests` totalul se împarte (`FirstTopupPromotion::split`) în: **promo** (doar pe partea medicului, doar pentru medicii din campanie) + **puncte** (procent ales de pacient, plafonat de `wallet.max_points_payment_percent` = 40%) + **bani reali** (restul). Fiecare componentă e debitată din portofelul ei ca `*_service_hold`. `payment_status = held`.

### 6.4 Comisionul ([`FinancialBreakdown`](backend/app/Services/FinancialBreakdown.php))
- Medic/operator obișnuit: se aplică în cascadă `rate.platform_commission` (33%) → `admin_accounting` → `bank_guarantee` → `bank_transaction` (implicit 0).
- Operator cu abonament la aparat (`has_device_subscription`): 1.5% + 5.5% + 3.2%.
- Rezultatul (`platform_fee_minor`, `provider_amount_minor`, `rate_snapshot`) e înghețat pe solicitare în `pricing_snapshot`.

### 6.5 Captură / refund
- **Finalizare** → `captureHeldFunds`: `provider_amount_minor` intră în portofelul `real` al prestatorului; se scrie o tranzacție informativă `platform_fee` (sumă 0, comisionul în metadata). Dacă medicul e afiliat unei instituții → `InstitutionLedger::recordEarning` împarte partea între medic și instituție.
- **Anulare de pacient** (`new/accepted/rescheduled`, înainte ca medicul să pornească): refund total; dacă operatorul acceptase deja un `with_exam`, se **reține taxa de drum** și se dă operatorului (`operator_travel_income`).
- **Respingere / expirare / niciun operator**: refund total.

### 6.6 Retrageri (payout)
- Medic independent: `POST /doctor/withdrawals`, doar între zilele `payout.request_day_start..end` (1–10) ale lunii; adminul aprobă din `/admin/transactions`.
- Medic afiliat: cere de la instituție; instituția cere de la platformă (`/institution/payouts`).

---

## 7. Fluxul consultației (inima platformei)

Totul e în [`WorkflowController`](backend/app/Http/Controllers/Api/WorkflowController.php) (~2400 linii). Starea e ținută în coloana `status` (`new`, `accepted`, `rescheduled`, `completed`, `cancelled`, `rejected`, `expired`, `no_operator_available`) + o serie de timestamp-uri. [`ConsultationStateMachine`](backend/app/Services/ConsultationStateMachine.php) **derivă** o stare canonică din ele (nu o impune).

### 7.1 Pas 0 — Pacientul alege
Frontend: [`pages/patient/DoctorsList.tsx`](frontend/src/pages/patient/DoctorsList.tsx). Catalogul public: `GET /catalog/doctors`, `/catalog/specialties`, `/catalog/pricing`.

### 7.2 Pas 1 — Previzualizare: `POST /requests/preview`
- Verifică feature flags.
- Pentru `with_exam`: verifică adresa completă, calculează investigațiile **obligatorii** ale medicului, alege **automat** operatorul (`OperatorAssignmentService::pickOperatorId`) și calculează costul (`ConsultationCostEstimator`):
  `preț medic + Σ investigații (obligatorii + opționale alese; preț = override operator ?? preț catalog) + taxă de drum (operator × raion/localitate)`.
- Dacă nu există operator: răspuns `eligible=false` cu motiv `no_coverage` / `no_capability`.
- Întoarce și împărțirea plății (promo / puncte / real).

**Alegerea operatorului**: operatori `is_available && is_approved && accepting_requests`, care acoperă raionul (și localitatea, dacă e setată) și pot face toate investigațiile cerute. Sortare: proximitate (localitate > raion) → încărcare (consultații active) → rating → id.

### 7.3 Pas 2 — Creare: `POST /requests`
- Blocat dacă pacientul are consultații `completed` fără rating (`closed_at` null) — **ratingul e obligatoriu** înainte de o nouă solicitare.
- Pentru `with_exam`: operatorul e reales automat, `acceptance_expires_at = now + 15 min` (`assignment.acceptance_window_minutes`).
- Dacă e programată (`scheduled_at`): `ensureSchedulable` verifică disponibilitatea medicului, concediile, suprapunerile (fus orar `Europe/Chisinau`).
- Într-o tranzacție: creează `ConsultationRequest`, rezervă banii, creează `Conversation` (`pending` pentru `with_exam`, `open` pentru video/preliminary), primul mesaj = simptomele; trimite evenimente Reverb + notificări; leagă pacientul de operator în HIGO.

### 7.4 Flux `with_exam`

```
pacient creează (new, operator atribuit, 15 min să accepte)
   │
   ├─ operator refuză / nu răspunde în 15 min ──▶ reassignOperator: următorul operator eligibil
   │                                               (exclude pe cei care au refuzat)
   │                                               └─ niciunul ─▶ no_operator_available + refund total
   ▼
operator acceptă (POST /accept → status accepted, operator_accepted_at)
   ▼
operator merge la domiciliu, măsoară cu aparatul HIGO
   ├─ datele vin automat: webhook HIGO sau higo:pull (5 min) → HigoExamIngestor → ConsultationObjectiveData
   ├─ opțional formular manual: POST /objective-data
   └─ POST /examination-done → objective_data_completed_at  ◀── poarta „ready for doctor”
   ▼
medic: POST /start → doctor_started_at; chatul cu pacientul se deschide
   ├─ chat (Reverb), atașamente, apel video (LiveKit, invitație care sună 75 s)
   ├─ poate cere investigație suplimentară (mesaj în chat)
   └─ operatorul poate taxa servicii suplimentare pe loc (POST /add-on-service, debit direct)
   ▼
medic: POST /complete (diagnostic, tratament, recomandări, rețetă opțională)
   → status completed, conclusion_sent_at
   → Consultation creată + snapshot date obiective + FHIR Encounter
   → captură bani → portofel medic (+ împărțire instituție)
   → PDF publicat (MedicalDocument), camera video închisă
   → chat gratuit 3 zile, fereastră totală 14 zile
   ▼
pacient: rating (POST /requests/{id}/review) → closed_at
```

Detalii:
- **Expirarea celor 15 minute** nu are job programat: se procesează **leneș**, la fiecare `GET /requests` (`expireStaleRequests`) sau când cineva încearcă să accepte.
- **Atribuirea HIGO → consultație**: după `higo_patient_id` al profilului (cea mai recentă solicitare deschisă), altfel după seria aparatului → operatorul → ultima solicitare acceptată.
- **Admin HIGO** (`/admin/higo`): starea sincronizării, reîncercări, maparea câmpurilor HIGO → vocabularul nostru (`ExamMapping`), remap, resetare parole practitioner.

### 7.5 Flux `video` / `preliminary`
- Fără operator; chatul e deschis de la creare.
- Medicul acceptă (`/accept`) sau propune altă oră (`/propose-time` → `rescheduled` → pacientul `/accept-proposed-time`).
- Video: `POST /video/invite` (sună celălalt participant), `POST /video/token` (token LiveKit), pagina `/consultations/:id/video`.
- **Upgrade HIGO**: medicul `POST /higo-proposal` (investigații din lista lui, expiră în 24h) → pacientul vede costul suplimentar `GET /higo-quote` → `POST /higo-confirm`: se rezervă diferența, solicitarea devine `with_exam`, se atribuie operator, apelul video se închide. De aici continuă ca la 7.4.

### 7.6 Chat după concluzie
Stările din `chatState`: `pending` (examinarea nu e gata) → `open` → `reactivatable` (după 3 zile gratuite, până la 14 zile; pacientul plătește `chat.reactivation_price` = 50 MDL pentru 24h) → `closed`.

### 7.7 Documente
- La finalizare se publică un `MedicalDocument` (PDF cu antetul clinicii, parafa/semnătura medicului).
- Medicul poate adăuga **addendum** timp de 14 zile (`consultations.addendum_days`).
- Fișierele sunt pe disc privat, servite prin **URL-uri semnate** (PDF, rețetă, atașamente chat, media HIGO).

### 7.8 Coordonator
`/coordinator`: vede solicitările, le „preia” (`claim`) și poate aloca manual un medic sau operator (`assign-provider`).

---

## 8. Timp real și notificări

- **Reverb** (canal privat `conversation.{id}` pentru participanți, `App.Models.User.{id}` pentru notificări). Broadcaster „rezilient” (`ResilientBroadcaster`) — o pană la websocket nu pică cererea.
- **Polling** în paralel în frontend: banner consultație activă (5 s), buton video (5 s), apel primit/ieșit (2 s), chat (15 s), clopoțel notificări (30 s), dashboard medic/operator.
- **Notificări**: `AppEventNotification` → DB (clopoțel) + Telegram (dacă userul și-a legat contul și flag-ul e pornit). Livrarea Telegram trece prin coadă.

---

## 9. Administrare și conținut

- **Setări** (`/admin/settings`): comisioane, bonusuri, afiliere, chat, video, payout, 2FA, notificări — toate în `platform_settings`, versionate.
- **Feature flags** (`/admin/features`): `payments`, `with_exam_consultations`, `video_consultations`, `higo_devices`, `doctors`, `operators`, `patient_cards`, `telegram_notifications`, `affiliate_program`.
- **Nomenclatoare**: specialități, regiuni/localități, tipuri de investigații (preț implicit), parametri clinici.
- **Conținut public**: blog („Noutăți”), parteneri, texte site editabile (`SiteContent`).
- **Financiar**: tranzacții, ajustări manuale de portofel, acordare manuală promo, retrageri, top medici, statistici afiliere, reclamații, șabloane de contract.

---

## 10. Hartă rapidă: unde se află ce

| Subiect | Backend | Frontend |
|---|---|---|
| Auth | `Api/AuthController.php` | `contexts/AuthContext.tsx`, `pages/LoginPage.tsx`, `RegisterPage.tsx`, `ConfirmCodePage.tsx` |
| Consultații | `Api/WorkflowController.php`, `Services/ConsultationStateMachine.php`, `ConsultationCostEstimator.php`, `OperatorAssignmentService.php` | `pages/patient/DoctorsList.tsx`, `pages/doctor/ConsultationsPage.tsx`, `pages/operator/RequestsPage.tsx`, `components/doctor/FinalizeConsultationDialog.tsx` |
| Chat | `WorkflowController` (conversations), `Events/*`, `routes/channels.php` | `pages/shared/ChatView.tsx`, `lib/realtime.ts` |
| Video | `Api/ConsultationVideoController.php`, `Services/LiveKitService.php`, `Jobs/CloseConsultationVideo.php` | `pages/shared/VideoConsultationPage.tsx`, `components/*VideoCall*.tsx` |
| Bani | `Api/WalletController.php`, `Services/WalletLedger.php`, `FinancialBreakdown.php`, `FirstTopupPromotion.php`, `ReferralProgram.php`, `InstitutionLedger.php` | `pages/patient/WalletPage.tsx`, `pages/admin/TransactionsPage.tsx` |
| HIGO | `Services/Higo/*`, `Console/Commands/Higo*`, `Api/HigoExamController.php`, `Api/AdminHigoController.php` | `pages/admin/HigoSyncPage.tsx`, `components/ObjectiveDataForm.tsx` |
| Documente | `Api/ConsultationDocumentController.php`, `Services/ConsultationPdf.php`, `MedicalDocumentPublisher.php` | `components/ConsultationDocuments.tsx` |
| Instituții | `Api/Institution*Controller.php`, `Services/InstitutionMembership.php` | `pages/institution/*` |
| Setări / flags | `Services/PlatformConfig.php`, `FeatureFlags.php` | `pages/admin/SettingsPage.tsx`, `FeatureFlagsPage.tsx`, `contexts/FeatureFlagsContext.tsx` |

---

## 11. Observații — puncte de analizat în continuare

Le-am găsit citind codul; **nu le-am verificat rulând aplicația**. Fiecare merită o discuție separată cu Claude („verifică punctul X și propune o soluție”).

### Business / bani
1. **Operatorul nu primește bani la finalizarea unei consultații `with_exam` cu medic.** `complete()` alege ca prestator medicul dacă există, iar `captureHeldFunds` trimite tot `provider_amount_minor` (calculat pe totalul care include investigațiile operatorului și taxa de drum) în portofelul medicului. Operatorul primește bani doar la anulare (taxa de drum) sau pe serviciile suplimentare. De confirmat dacă e intenționat (decontare în afara platformei?) sau un gol.
2. **Comisionul pentru `with_exam` e calculat după profilul medicului**, nu separat pe partea medicului vs. partea operatorului — tarifele de abonament ale operatorului nu se aplică niciodată în acest caz.
3. **Serviciile suplimentare ale operatorului** (`add-on-service`) debitează pacientul imediat, fără confirmarea lui, și ocolesc `WalletLedger` (scriu direct în `wallets`).
4. **Reactivarea chatului** și `add-on-service` folosesc cod vechi de debit (nu `WalletLedger::move`) — două căi de a mișca bani, risc de inconsecvență.
5. Comisionul platformei se înregistrează ca tranzacție cu sumă 0 pe portofelul prestatorului — nu există un „cont al platformei”; veniturile platformei se reconstituie din metadata.

### Fluxul consultației
6. **Expirarea celor 15 minute e leneșă** (doar la `GET /requests`). Dacă nimeni nu deschide lista, solicitarea rămâne blocată; reatribuirea operatorului depinde de traficul altor useri. Candidat pentru un job în `scheduler` (ex. la fiecare minut).
7. **Starea e împrăștiată**: `status` + ~15 timestamp-uri + `ConsultationStateMachine` care doar derivă. `TRANSITIONS` nu e folosit ca gardă reală; fiecare endpoint are propriile `abort_unless`. Ușor de introdus stări imposibile.
8. **`WorkflowController` are ~2400 linii** — acceptă, finalizează, chat, bani, notificări, FHIR. Candidat pentru extragere în servicii/acțiuni (ex. `CompleteConsultation`, `ConsultationPayments`, `ChatService`).
9. **Coordonatorul** (`assignProvider`) suprascrie `type` la `operator`/`doctor` și nu verifică `consultation_kind`, nici nu actualizează conversația — poate strica o consultație `with_exam` în curs.
10. **Atribuirea examinărilor HIGO** după seria aparatului ia „ultima solicitare acceptată” a operatorului — dacă operatorul are două vizite în aceeași zi, datele pot ajunge la pacientul greșit. Merită verificat cât de des se ajunge pe această cale.
11. **Rating obligatoriu** blochează orice solicitare nouă — inclusiv pentru alt membru al familiei. De validat cu clientul.

### Securitate
12. **`/auth/login` și `/auth/verify-login-otp` nu au `throttle`** (spre deosebire de register/forgot). Un OTP de 6 cifre fără limită de încercări poate fi ghicit prin forță brută.
13. **Adminul se loghează doar cu parolă**, fără 2FA — contul cu cele mai multe drepturi are cea mai slabă protecție.
14. **Fără Policies**: autorizarea e inline în fiecare metodă; rutele `/admin/*` nu au middleware de rol. O metodă nouă la care se uită `authorizeAdmin` devine publică pentru orice user logat.
15. Token-ul API stă în `localStorage` (expus la XSS). Acceptabil pentru SPA, dar de știut.

### Tehnic / întreținere
16. **Mult polling** (2–15 s) pe lângă Reverb — încărcare pe server pe măsură ce crește numărul de useri; o parte se poate muta pe evenimente websocket.
17. **Cod mort**: starter kit-ul Inertia din backend (`resources/js`, `routes/web.php`, `routes/settings.php`, Fortify), folderele `front-end/` și `doctor-md-backend/`.
18. Frontend fără teste; câteva pagini de 600–1000 linii (`UsersPage`, `ChatView`, `HigoSyncPage`, `DoctorsList`).
19. Câmpul `selected_services` e folosit și pentru lista de investigații, și pentru metadata Google Meet (`storeMeetLink` scrie `google_meet` în el) — tip amestecat în aceeași coloană.

---

## 12. Cum să folosești documentul cu Claude

Exemple de cereri care pornesc bine de aici:
- „Citește `ANALIZA-PLATFORMA-2026-11-08.md`, punctul 1. Verifică în cod cum se plătește operatorul și propune un model de împărțire medic/operator.”
- „Punctul 6: mută expirarea solicitărilor într-un job programat, cu teste.”
- „Punctele 12–14: audit de securitate pe autentificare și autorizare.”
- „Desenează fluxul `with_exam` din secțiunea 7.4 ca diagramă și marchează unde poate rămâne blocat.”
- „Propune un plan de spart `WorkflowController` în servicii, fără schimbare de comportament.”

Documente anterioare din repo, utile pentru context: `PLAN-cerinte-client-2026-10-14.md`, `AUDIT-UI-UX-2026-10-21.md`, `ANALIZA-ecran-alb-si-referral.md`, `DEPLOY.md`.
