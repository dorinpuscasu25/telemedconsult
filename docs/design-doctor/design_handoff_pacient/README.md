# Handoff: telemedconsult.md — aplicația pacientului

## Overview
Redesign-ul aplicației pacientului pe telemedconsult.md (telemedicină, Republica Moldova). Acoperă:
- fluxul de pornire (înregistrare → pachet + plată → pacient → prima programare);
- pagina Acasă (cardul „Acum” + „De făcut” cu prioritizare);
- navigația (meniu lateral, navigație de jos pe mobil, notificări);
- chatul (medici → canale pe pacient → conversație) și apelul video;
- portofelul (Bani / Bonusuri, rezervări) și datele pacientului (fișa medicală în 8 secțiuni, documente).

Toată interfața e în română, la „tu”. Mobil 390 px întâi, desktop 1280 px.

## About the Design Files
Fișierele din acest pachet sunt **referințe de design create în HTML**: prototipuri care arată aspectul și comportamentul dorit, **nu cod de producție de copiat**. Sarcina e să recreezi aceste ecrane în codul existent al aplicației (frontend React + shadcn/ui, backend Laravel, după structura menționată în inventarul de date: `frontend/src/...`, `backend/app/...`), folosind componentele și tiparele lui.

Deschide fiecare `.dc.html` direct în browser (lângă `support.js`). Fiecare fișier e o pânză cu secțiuni numerotate. Fiecare ecran are un ID (ex. `W2a`, `C1a`), folosit și mai jos.

## Fidelity
**High-fidelity.** Culorile, tipografia, spațierea, textele și stările sunt finale. Recreează-le exact, folosind componentele shadcn/ui existente (Button, Card, Dialog, Input, Select, Tabs, Switch, Badge, Sheet) cu tokenii de mai jos.

---

## Shell comun (se aplică pe TOATE paginile)

### Desktop (≥1024 px)
**Meniu lateral**: 232 px lățime, fundal `#FFFFFF`, bordură dreapta `1px #E2E8F0`. Conținut, de sus în jos:
1. Logo: 64 px înălțime, padding 0 16 px, iconiță 32×32 (radius 9, `#2563EB`, Lucide `activity` alb 18 px) + „telemedconsult**.md**” (15/700, „.md” în `#2563EB`). Bordură jos `#F1F5F9`.
2. Butonul „Consultație nouă”: padding 16 12 8, lățime 100 %, 44 px, radius 10, `#2563EB`, text alb 14/600, iconiță `plus` 16 px. Pe desktop e singurul buton „Programează” mereu vizibil, deci nu-l repeta în antet.
3. Grupul principal (gap 2 px): Acasă (`house`), Consultații (`clipboard-list`), Mesaje (`message-square` + badge necitite), Pacienții mei (`users`), Portofel (`wallet`).
4. Eticheta „MAI MULT” (11/600, `#94A3B8`, letter-spacing .06em, padding 16 24 6).
5. Grupul secundar: Program de afiliere (`gift`), Reclamații și recenzii (`message-square-warning`), Noutăți (`newspaper`), Notificări Telegram (`send` + punct `#F59E0B` 8 px cât timp contul nu e legat).
6. Profilul (jos): avatar 36 px `#EFF6FF`/`#2563EB`, nume 13/600, „Pacient” 12 `#64748B`, `chevron-down`.

Rând de meniu: 40 px, padding 0 12, radius 10, gap 12, iconiță 18 px `#64748B`, text 14 `#334155`, `white-space:nowrap`. **Activ**: fundal `#EFF6FF`, text și iconiță `#2563EB`, 500. Badge: min 20×20, radius 999, `#2563EB`, alb 11/700.

**Antet**: 64 px, fundal alb, bordură jos `#E2E8F0`, aliniat dreapta. Conține doar clopoțelul: buton 42×42, radius 10, bordură `#E2E8F0`. Badge cu numărul de necitite: `#2563EB` (nu roșu), bordură 2 px albă, poziționat −6/−6. Clopoțelul deschide panoul de notificări (`N1a`).

Excepție: în asistentul de pornire (`3d`, `4b`, `5b`) antetul are în loc bara de progres „Pachet → Pacient → Programare” și „Termin mai târziu”.

### Mobil (<1024 px)
**Navigația de jos**: 72 px (incl. 12 px safe-area), fundal alb, bordură sus `#E2E8F0`, 5 coloane egale: Acasă · Consultații · Mesaje (badge) · Portofel · Mai mult (`menu`). Item: iconiță 20, text 11. Activ `#2563EB` 600, inactiv `#64748B`.
**„Mai mult”** (`N2b`): profil, Pacienții mei, apoi grupul Program de afiliere / Reclamații și recenzii / Noutăți / Notificări Telegram (cu „Conectează”), apoi Setările contului / Ieși din cont. Fiecare rând are iconiță, titlu și o descriere scurtă.
**Clopoțelul** stă în antetul paginilor principale și deschide notificările pe tot ecranul (`N2a`).
**Butonul plutitor „Programează”** (doar pe Acasă, stările B și D): dreapta 16 px, deasupra navigației (bottom 88 px), 48 px, pill, fundal alb, bordură `#BFDBFE`, text `#1D4ED8` 14/600. Lipsește când pagina are deja acțiunea în cardul principal (stările A și E).

---

## Design Tokens

### Culori
| Rol | Hex |
|---|---|
| Primar | `#2563EB` · hover/text pe tint `#1D4ED8` |
| Tint primar | `#EFF6FF` · bordură tint `#BFDBFE` · avatar pacient `#DBEAFE` |
| Text | `#0F172A` · secundar `#334155` / `#475569` · muted `#64748B` · placeholder `#94A3B8` |
| Borduri | `#E2E8F0` · separatoare interne `#F1F5F9` · inputuri inactive `#CBD5E1` |
| Fundal pagină | `#F8FAFC` · carduri `#FFFFFF` |
| Succes | `#16A34A` · text `#15803D` · tint `#F0FDF4` · bordură `#86EFAC` |
| Atenție / blochează (nivel 2) | `#EA580C` · text `#C2410C` · tint `#FFF7ED` · bordură `#FED7AA` |
| Bonus / chihlimbar | text `#78350F`/`#92400E`/`#B45309` · tint `#FFFBEB` · bordură `#FDE68A` · rezervat `#FEF3C7` |
| Eroare / expirat (doar) | `#DC2626` · tint `#FEF2F2` · PDF `#B91C1C` |
| Stele | `#F59E0B` |
| Card întunecat (sold, consultația următoare) | `#0F172A`, text `#CBD5E1`/`#94A3B8` |
| Overlay | `rgba(15,23,42,.42–.55)` |

### Tipografie
Font **Geist** (400/500/600/700), cifre/coduri **Geist Mono** 500/600.
| Utilizare | Mărime / greutate |
|---|---|
| Titlu pagină desktop | 28/700, letter-spacing −0.02em |
| Titlu ecran mobil | 24–26/700, −0.02em |
| Titlu card „Acum” | 20/700, −0.01em |
| Titlu secțiune | 16/600 |
| Corp | 14–15/400, line-height 1.45–1.5 |
| Etichetă câmp | 14/500 (mobil), 13/500 (compact) |
| Meta / ajutor | 12–13, `#64748B` |
| Badge / chip | 11–12/600 |
| Sold mare | 40/700 · total plată 30–44/700 |

### Raze, spațiere, umbre
- Raze: câmpuri și butoane **10 px**, carduri **16 px**, chips/badge 999 px, dialoguri 16 px, ecrane mobile 32 px (doar în mock), iconițe-container 10 px.
- Înălțimi: buton principal 48 px (mobil) / 42–48 px (desktop), buton secundar 36–44 px, input 44 px (mobil) / 42 px (desktop), țintă tactilă minimă 44 px.
- Spațiere: 4, 6, 8, 10, 12, 14, 16, 20, 24, 32 px. Padding card 16–22 px; padding pagină mobil 16–20 px, desktop 28–32 px.
- Focus input: bordură 2 px `#2563EB` + `box-shadow 0 0 0 3px rgba(37,99,235,.15)`.
- Umbre: card principal `0 4px 16px rgba(37,99,235,.08)`; dialog/panou `0 24px 60px rgba(15,23,42,.18–.25)`; segment activ `0 1px 2px rgba(15,23,42,.12)`.

### Iconițe
Exclusiv **Lucide** (stroke 2, 16–20 px): house, clipboard-list, message-square, message-square-warning, users, wallet, gift, newspaper, send, bell, plus, search, menu, x, check, check-check, chevron-down/right, arrow-left, video, mic, camera, paperclip, file-text, calendar, calendar-check, clock, star, lock, eye/eye-off, credit-card, mail, map-pin, rotate-ccw, upload, camera, settings, log-out. În codul de producție folosește `lucide-react`.

---

## Tipare de componente (reutilizează peste tot)
- **Segmented control** (Nu/Da, Toate/Bani/Bonusuri, Sex, Fumat): container `#F1F5F9`, padding 3, radius 10; segment activ fundal alb + umbra segmentului, text `#0F172A`; inactiv transparent `#64748B`.
- **Opțiune card / radio card** (pachete, tip consultație, nivel activitate): bordură 1 px `#E2E8F0`, radius 16. Când e selectat: 1.5 px `#2563EB`, fundal `#EFF6FF`, radio 20 px cu punct de 10 px.
- **Chip selectabil** (alergii, rude, vaccinuri): 34–40 px, pill. Neselectat: bordură `#E2E8F0`, text „+ X”. Selectat: 1.5 px `#2563EB`, `#EFF6FF`, `#1D4ED8`, text „✓ X”. „Altceva…”: bordură dashed `#CBD5E1`.
- **Status pill**: 11–12/600, padding 3 8. Rezervat (chihlimbar), Plătit (slate), Returnat (verde), În curs (albastru), Finalizată (slate), Confirmată (verde), Așteaptă medicul (chihlimbar).
- **Comutator (Switch)**: 44×26, thumb 20, activ `#2563EB`, inactiv `#CBD5E1`.
- **Bară de progres în pași**: segmente de 4 px, radius 2, gap 4–6. Făcut/curent `#2563EB`, viitor `#E2E8F0`.
- **Inel de progres al fișei**: r 18–22, stroke 4–5, fundal `#E2E8F0`, progres `#2563EB` (sau `#16A34A` la 8/8), text „5/8” în centru.
- **Indicator de salvare**: „Se salvează…” `#64748B` (~700 ms după o schimbare), apoi „✓ Salvat” `#16A34A`, în dreapta antetului editorului.
- **Rând de alertă** („De făcut”, notificări): iconiță în pătrat 36 px, radius 10, colorat după nivel; titlu 14/600; meta 12; un singur buton secundar (36 px); × doar pe alertele informative.
- **Bottom sheet (mobil)**: radius 20 20 0 0, mâner 40×4 `#E2E8F0`, overlay.
- **Dialog (desktop)**: 560 px, radius 16, antet cu pas + titlu 20/600, footer cu „Înapoi” (secundar) stânga și acțiunea principală dreapta.

## Principii (reguli de produs)
1. O singură acțiune principală pe ecran.
2. Orice eroare sau stare blocată spune de ce și are butonul care o rezolvă. Niciun mesaj roșu fără acțiune.
3. Roșu doar pentru ce e expirat sau eșuat. Ce blochează e portocaliu, informativul e neutru.
4. Fiecare alertă sau notificare spune pentru cine e („pentru Ana”). Tot ce are termen arată timpul rămas.
5. Fără bannere peste pasul curent, peste apel sau peste zona de scriere.
6. Datele se cer doar când e nevoie de ele. Exemplu: adresa apare doar la „cu examinare la domiciliu”.

---

## Screens / Views (index)
Detaliile de layout pentru fiecare ecran sunt în fișierul HTML respectiv. Mai jos e harta și regulile de comportament.

### 1. `Flux pornire pacient.dc.html`
| ID | Ecran | Note |
|---|---|---|
| 1a | Înregistrare | nume complet, email, parolă cu „Arată”, fără confirmare; link discret „Ești medic sau operator?” |
| 2a–2b | Cod din email | 6 căsuțe, verificare automată la a 6-a cifră, „Retrimite codul” cu cooldown; „Ai primit 50 MDL bonus” doar dacă bonusul s-a acordat |
| 3a/3d | Asistent · Pachet | 1 profil 240 · 2 profiluri 450 · 6 profiluri 600 MDL; bifat implicit „+500 MDL în portofel”; buton „Plătește X MDL” = pachet + 500 dacă e bifat |
| 3b/3c | Întoarcerea de la MAIB | reușită → „Continuă: adaugă pacientul”; eșuată → „Încearcă din nou · X MDL” + „Schimbă pachetul” |
| 4a/4b | Asistent · Pacient | „Pentru mine” (precompletat) / „Pentru altcineva”; prenume, nume, data nașterii, sex, raion, localitate; bloc opțional separat „Ajută medicul să se pregătească” (3× Nu/Da + text) |
| 5a/5b | Lista de medici | pacientul fixat sus, se poate schimba; preț video + preț cu examinare; „Programează” |
| 6a–6g | Programare în 3 pași | ecran întreg pe mobil, dialog pe desktop; adresă + telefon inline doar la „cu examinare” fără adresă; acuze (obligatoriu); ore libere + „Altă oră”; confirmare cu „Folosește bonusurile” și starea „Îți lipsesc X MDL” → „Alimentează X MDL și trimite cererea” |
| 7a/7b | Cerere trimisă | acțiune principală „Primește notificări pe Telegram” |
| 8 | Acasă (vechi) | **ÎNLOCUIT** de `Acasa pacient.dc.html` |

### 2. `Acasa pacient.dc.html`
Ecranele A–E. Toate alertele vin dintr-o singură listă sortată (nivel 1 → 2 → 3, apoi după termen):
- primul element → cardul „Acum” (mare, un singur buton principal);
- următoarele 3 → „De făcut”, apoi „Vezi toate (N)”;
- o alertă dispare când e rezolvată (evaluarea dispare la ~1,4 s după ce alegi o notă).
Secțiunile fără conținut nu apar deloc (starea A). Portofelul e în coloana din dreapta pe desktop și după consultații pe mobil.

### 3. `Navigatie si chat v2.dc.html` (sursa de adevăr pentru shell și chat)
| ID | Ecran |
|---|---|
| N1a | Meniul lateral + panoul de notificări (400 px, grupat Azi / Ieri / Mai devreme, Toate/Necitite, „Marchează toate ca citite”, „Primește-le și pe Telegram”, „Vezi toate”) |
| N2a | Notificări pe mobil, pe tot ecranul |
| N2b | „Mai mult” pe mobil |
| C1a | Chat desktop: medici (264 px) · canale (248 px) · conversație |
| C2a–C2c | Chat mobil: listă → conversație cu rândul „pentru Ana · Schimbă” → bottom sheet cu canalele |

**Reguli pentru chat:**
- 2 niveluri: medic → canal. Canalele unui medic: câte unul pentru fiecare pacient care a avut consultații cu el (avatar, prenume, ultimul mesaj, status pill, cod), apoi, după un separator, „Discuție directă” (fără pacient).
- **Canalul ales la deschidere:** primul canal cu necitite, în ordinea listei. Dacă niciunul nu are, cel cu activitatea cea mai recentă. Conversația nu e niciodată goală.
- Canalul activ: fundal alb, bordură `#BFDBFE`, bară de 3 px `#2563EB` în stânga, nume `#1D4ED8`.
- Antetul conversației: „Dr. X” + „pentru Ana · Cod …” (sau „Discuție directă · fără pacient”). Acțiuni: „Fișa pacientului” (nu apare la discuția directă) și „Documente”. Datele de contact ale medicului nu apar nicăieri.
- Cronologia: episoade („Consultația #2 · Video · 13 oct · Finalizată”, cu link spre concluzie și rețetă), episoadele trecute la opacitate 0.55, separator „Mesaje noi”, mesaje de sistem, mesajele pacientului în dreapta pe `#2563EB`, ale medicului în stânga, albe, cu numele deasupra.
- Stările zonei de scriere (a–e): vezi `Chat si apel video.dc.html#c2`.

### 4. `Chat si apel video.dc.html`
- C1 și C3 (taburi și chips pentru pacienți): **ÎNLOCUITE** de v2.
- C2: stările zonei de scriere (a) în curs, (b) înainte de examinare, (c) „Chat gratuit încă 2 zile”, (d) „Redeschide chatul pentru 24 h · 50 MDL”, (e) după 14 zile „Programează o consultație”.
- V1–V7: apelul video. Reguli:
  - medicul inițiază apelul, pacientul nu sună;
  - timerul numără invers durata consultației, iar la 0 trece pe minus (−01:12) în portocaliu;
  - apelul se închide doar la „Ieși”, cu confirmare;
  - apelul minimizat e o fereastră de 320×180 care se fixează în cel mai apropiat colț la tragere și rămâne pe orice pagină;
  - stările de conexiune slabă, cameră oprită (avatar) și „celălalt a ieșit”;
  - ecranul medicului are mesaje predefinite „Întârzii 5 / 10 / 15 min”, trimise în chatul pacientului următor.

### 5. `Portofel si date pacient.dc.html`
- W1–W5: portofelul are două buzunare, Bani și Bonusuri, fiecare cu „?”. Rândul „Rezervat pentru consultații” are link spre consultație. Istoricul are filtrul Toate/Bani/Bonusuri și ciclul Rezervat → Plătit / Returnat. Alimentarea are 200/500/1000/Altă sumă, iar întoarcerea are stările reușit/în procesare/eșuat. Sliderul de bonusuri e în MDL, cu maximul = min(% medic × preț, sold bonusuri). Contul nou are o stare goală.
- D1–D5: Pacienții mei (inel „Fișa 5/8” + un singur buton spre lucrul lipsă), fișa medicală (8 secțiuni: Completată / Nimic de raportat / Necompletată), editoare pe secțiuni (ecran întreg pe mobil, panou lateral pe desktop, salvare automată), date personale, documente.

---

## State Management (principal)
- `alerts[]` pentru Acasă: `{id, level: 1|2|3|'expired', patientId, title, sub, deadline?, cta, dismissable}`. Se sortează pe server sau în client; prima ajunge în „Acum”.
- `notifications[]`: `{id, kind, title, meta, patientId?, cta?, readAt}`. Badge-ul de pe clopoțel arată câte au `readAt == null`.
- Chat: `doctors[] → channels[] {patientId | null, unread, lastMessageAt, consultationStatus}`. `activeChannel` = regula de alegere automată de mai sus și se resetează la schimbarea medicului.
- Portofel: `balance.money`, `balance.bonus`, `balance.promo` (în interiorul bonusurilor), `reserved[]`. Tranzacțiile au `pocket: 'money'|'bonus'` și `status: 'reserved'|'paid'|'returned'`.
- Fișa medicală: per secțiune `{status: 'filled'|'none_declared'|'empty', data}`. **Câmpul `none_declared` e nou**, schema actuală nu îl are.

## Decizii deschise (de confirmat înainte de implementare)
1. „Nimic de raportat”: necesită un câmp nou per secțiune în `medical_record`.
2. Fumat și alcool sunt text liber în schema actuală. Designul folosește enumerări (`nu/renuntat/da` + număr pe zi și ani; `nu/ocazional/regulat`).
3. Sexul „Altul” e acceptat de backend, dar nu apare în UI (nici în design).
4. Primul profil apare gratuit în inventar (`active_until = null`), dar fluxul cere pachet înainte de orice pacient. De aliniat.
5. Codul pacientului are 15 cifre în baza de date. Chatul arată un cod scurt („Cod 435272”), ca în brief. De ales unul.
6. Badge-ul de pe clopoțel e albastru în design (în aplicația actuală e roșu).

## Assets
Nu există imagini de produs. Avatarele sunt inițiale. Previzualizările de documente sunt placeholdere. Iconițele: Lucide. Fonturile: Geist și Geist Mono (Google Fonts sau `geist` din npm).

## Files
- `Navigatie si chat v2.dc.html`: shell (meniu, antet, navigație mobil, notificări) și chat. **Sursa de adevăr pentru shell.**
- `Acasa pacient.dc.html`: pagina Acasă, stările A–E.
- `Flux pornire pacient.dc.html`: înregistrare → prima cerere (ecranele 1–7).
- `Portofel si date pacient.dc.html`: portofel și fișa pacientului.
- `Chat si apel video.dc.html`: stările zonei de scriere și apelul video (C1/C3 înlocuite).
- `support.js`: runtime-ul necesar ca fișierele să se deschidă în browser. Nu face parte din implementare.
