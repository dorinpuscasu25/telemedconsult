# Audit UI/UX — Pacient, Medic, Operator

Data: 2026-10-21 · Scop: zona aplicației (fără admin și fără site-ul public) · Regulă: **nu schimbăm logica de business**, doar prezentarea, fluxurile din UI și textele.

Auditul e făcut pe cod (`frontend/src`). Baza locală nu are consultații, deci n-am putut fotografia stările reale ale ecranelor.

---

## 1. Diagnostic pe scurt

Aplicația face multe lucruri corect funcțional, dar interfața e construită **ecran cu ecran, fără un sistem comun**. De aici vin aproape toate problemele:

1. **Nu există un „ce am de făcut acum”.** Fiecare rol vede liste și carduri, dar nu o coadă de sarcini clară. Medicul are până la **7 butoane egale** pe un card de consultație; operatorul are tot **7** pe un card „În desfășurare”.
2. **Stiluri amestecate.** Gradient mov pe butoane (13 locuri), carduri „glass” (18 locuri), carduri albe simple, card negru (home pacient), carduri portocalii (portofel). Titluri de pagină în 9 variante. 4 raze de colț diferite.
3. **Feedback-ul acțiunilor e primitiv.** `window.prompt` / `window.confirm` pentru acțiuni medicale și bani (respingere cu refund, propunere oră cu format text `YYYY-MM-DD HH:mm`, cerere investigație). Mesajele de succes sunt banere statice sus în pagină, care rămân acolo și împing conținutul în jos. `sonner` e instalat, dar nefolosit.
4. **Texte de developer în UI.** „Date citite direct din backend”, „calculat din date reale”, „Lista este calculată din solicitările reale cu status nou”, „cererile reale de examinare”. Utilizatorul nu trebuie să afle cum e făcută aplicația.
5. **Navigația pacientului e supraîncărcată și redundantă** (9 itemi; „Pacienții mei”, „Afiliere” și „Contul meu” sunt toate aceeași pagină `/patient/profile`), iar operatorul are un link spart („Profil” → o pagină care afișează literal `Profile`).

---

## 2. Probleme comune tuturor rolurilor

### 2.1 Sistem vizual
| Problemă | Unde | Efect |
|---|---|---|
| Butoane principale în 3 stiluri: `bg-gradient-to-r from-primary to-purple-600`, `bg-slate-900`, `bg-primary` | ConsultationsPage, RequestsPage, ChatView, DoctorsList | Utilizatorul nu învață care e „acțiunea principală” |
| `glass-card` / `glass-panel` (blur + transparență) pe fond gradient | 18 locuri | Contrast scăzut, aspect de template, cost mare de randare pe telefoane slabe |
| Fond `gradient-bg` mov/roz pe toată aplicația | `AppLayout` | Arată a landing page, nu a instrument medical; scade lizibilitatea |
| Titluri `h1` în 9 combinații (2xl/3xl, slate-900/950, mb-1/mb-2) | toate paginile | Fiecare pagină „sare” la navigare |
| `rounded-xl` (313), `rounded-lg` (51), `rounded-2xl` (27), `rounded-3xl`, `rounded-md` | peste tot | Inconsistență vizibilă mai ales în dialoguri |
| Text de `10–11px` pentru ore și etichete | ChatView, ConsultationsPage | Greu de citit, mai ales pentru pacienți în vârstă |
| Culorile de status scrise de mână în fiecare fișier (amber/green/blue/slate) | ConsultationsPage, RequestsPage, ChatView, PatientHome | Același status are culori și denumiri diferite pe ecrane diferite |

**Statusuri cu nume diferite pentru același lucru:**
- `new` = „În așteptarea confirmării” (pacient), „Nou” (medic), „Noi” (operator), „În așteptare” (chat)
- `accepted` = „Confirmată” (pacient), „Activ” (medic), „În desfășurare” (operator), „Activ” (chat)
- Badge-ul de plată la operator afișează valoarea brută: `Plată: held`

### 2.2 Feedback, încărcare, erori
- **Loading** = `'...'` sau text „Se încarcă…”. Doar 4 locuri au skeleton. Paginile „sar” când vin datele.
- **Succes / eroare** = banner static sus în pagină, care nu dispare. În ConsultationsPage poți vedea simultan eroarea, „Se încarcă…”, mesajul de succes și o notificare de status.
- **Confirmări native** (`window.confirm`) pentru: respingere cu refund (medic, operator), „am terminat examinarea”, ștergere profil pacient, ștergere concediu, ștergere înregistrări din fișă.
- **Input nativ** (`window.prompt`) pentru: cerere investigație suplimentară (2 prompturi la rând!) și reprogramare la operator, cu format de dată scris de mână. Medicul are deja un dialog bun cu `datetime-local` pentru reprogramare — operatorul nu.
- Acțiunile de pe carduri (Acceptă, Respinge) nu au stare de loading individuală → dublu-click posibil, niciun semn că s-a întâmplat ceva până la reîncărcarea listei.

### 2.3 Navigație și layout
- Bara de sus are logo + meniu + clopoțel + cont, plus **încă o bară de navigație** sub ea pe tot ce e sub `xl` (1280px). Pe laptopuri de 13" utilizatorul vede navigația orizontală scrollabilă, nu meniul complet.
- Nu există navigație de jos pe mobil (tab bar), deși pacienții vor folosi aproape doar telefonul.
- `ActiveConsultationBanner` + `TelegramConnectionBanner` + mesajele paginii se pot stivui și ocupa jumătate din ecran pe mobil înainte de conținut.
- Titlul tab-ului din browser nu se schimbă între pagini.

### 2.4 Texte (copy)
- Texte de developer (vezi Diagnostic #4) în: `PatientHome.tsx:257`, `DoctorHome.tsx:79`, `DoctorHome.tsx:138`, `RequestsPage.tsx:282`, `StatsPage.tsx:99`.
- Mesaje contradictorii pentru pacientul nou:
  - Home: „Cumpără un pachet în Pacienții mei, apoi adaugă primul profil de pacient.”
  - Pacienții mei: „Primul profil de pacient este gratuit.”
  - Dialogul de solicitare medic: „cumpără un pachet **din wallet**” — pachetele nu se cumpără din portofel.
- Ton inconsistent: „Alimentare Cont”, „Portofel Electronic”, „Confirmare Solicitare” (Title Case englezesc) față de restul în stil românesc normal.
- „Utilizator” ca etichetă de rol pentru pacient în meniul de cont.

### 2.5 Accesibilitate
- Butoane doar cu iconiță fără `aria-label` (atașament în chat, butonul video pe cardul medicului).
- Focus vizibil inconsistent; checkbox-uri native nestilizate lângă componente Radix stilizate.
- Animații `framer-motion` pe fiecare card/mesaj, fără `prefers-reduced-motion`.

### 2.6 Polling
12 intervale independente (2s, 3s, 5s, 10s, 15s, 30s) pe aceeași pagină — banner, chat, navigație consultație, buton video, apeluri. Nu e strict UI, dar se simte: listele „clipesc” și se reordonează sub cursor. Nu propun să schimbăm mecanismul, doar ca UI-ul să nu re-animeze cardurile la fiecare refresh (animația de intrare rulează din nou).

---

## 3. Pacient

### 3.1 Acasă (`PatientHome.tsx`)
**Ce merge:** cardul „Următorul pas” e ideea corectă.

**Probleme**
- 3 zone concurează pentru aceeași acțiune: butoanele „Medic / Operator” din header, cardul negru „Următorul pas”, lista „Acțiuni rapide” (6 rânduri, care repetă meniul de sus).
- Metrica „Specialiști disponibili: 12” nu ajută pacientul la nimic.
- „Solicitări active” arată doar un număr; solicitarea propriu-zisă e jos în dreapta, mică.
- Butonul „Acceptă ora” pentru reprogramare e ascuns într-un rând de listă — e cea mai urgentă acțiune a pacientului.
- Cardul negru e singurul element negru din aplicație.

**Propunere**
- Sus: **un singur card de stare** care se schimbă după situație (fără pacient activ → „Adaugă pacientul”; cerere nouă → „Așteptăm confirmarea medicului”, cu ora; reprogramare → „Medicul propune altă oră”, cu butoane Accept / Alege alt medic; consultație azi → numărătoare inversă + „Intră în consultație”).
- Dedesubt: 2 carduri mari de acțiune — **„Consultație online cu un medic”** și **„Examinare la domiciliu”** — cu o propoziție despre diferență și prețul de la.
- „Consultațiile mele” ca listă (timeline) cu statusuri clare și acces direct la chat / PDF.
- Portofelul ca element mic (sold + „Alimentează”), nu ca metrică principală.
- Scoatem „Acțiuni rapide”, care dublează meniul.

### 3.2 Solicitarea unei consultații (`DoctorsList.tsx`)
**Probleme**
- Un singur dialog lung cu ~10 secțiuni: profil pacient, tip, istoric boală, simptome, dată/oră, investigații opționale, cost, bonusuri, mod de plată. Pe telefon e un scroll foarte lung într-un modal.
- Tipul consultației e ales de 2 ori (butonul de pe card + select-ul din dialog).
- Butonul video de pe card e doar iconiță când sunt active ambele tipuri.
- Câmpul „Achită din bonusuri (%)” e un input numeric — pacientul nu gândește în procente.
- Ecranul de succes spune doar „Cererea a fost salvată” — nu spune ce urmează sau în cât timp.
- Filtrul are doar nume + specialitate; nu poți filtra după preț, disponibilitate, tip consultație.

**Propunere: un flux pe 3 pași (wizard sau pagină dedicată `/patient/doctors/:id/request`)**
1. **Pentru cine și ce tip** — carduri mari selectabile pentru profilul pacientului și tipul consultației (cu preț pe fiecare).
2. **Ce vă supără și când** — simptome, istoric, dată/oră (sloturi sugerate în loc de `datetime-local` gol, dacă backendul le oferă; altfel `datetime-local` cu text de ajutor).
3. **Rezumat și plată** — costul detaliat, un comutator „Folosește bonusurile (max X MDL)” în loc de procent, ce se reține din portofel, buton „Confirmă și achită X MDL”.

Ecranul de succes: „Cererea a fost trimisă către Dr. X. Medicul are până la HH:MM să confirme. Te anunțăm pe Telegram/notificări.” + „Vezi consultația” / „Înapoi acasă”.

Pagina medicului (acum un dialog mic): profil complet — foto, specialitate, experiență, rating cu recenzii, prețuri, tipuri de consultație, CTA lipit jos pe mobil.

### 3.3 Pacienții mei / Afiliere / Contul meu (`ProfilePage.tsx`, 866 linii)
**Probleme**
- 3 itemi de meniu diferiți duc în aceeași pagină cu `?tab=`; regula „activ” din meniu e scrisă special pentru asta (`AppLayout.tsx:545`).
- Conceptele „titular de cont”, „profil pacient”, „pachet / cartelă”, „slot” nu sunt explicate nicăieri.
- Fișa medicală e editabilă inline cu `window.confirm` pentru modificări nesalvate.

**Propunere**
- Separare în rute reale: `/patient/patients` (familia), `/patient/patients/:id` (fișa unui pacient, cu taburi: Date, Fișă medicală, Consultații, Documente), `/patient/account`, `/patient/referrals`.
- Lista pacienților ca **carduri de persoană** (nume, vârstă, status: Activ până la / Inactiv) cu „Solicită consultație pentru X” direct de pe card.
- Un mic explainer o singură dată: „Contul tău poate avea mai mulți pacienți (tu, copiii, părinții). Primul e gratuit, următorii necesită un pachet.”
- Afilierea mutată în meniul de cont, nu în navigația principală.

### 3.4 Portofel (`WalletPage.tsx`)
- 3 carduri cu 3 stiluri (gradient mov, gradient portocaliu, glass alb). Cardul „Plăți securizate / Card bancar” e decorativ.
- Banner-ul promoțional e un paragraf lung.
- **Propunere:** un card de sold (bază + bonusuri ca rânduri separate, cu tooltip „la ce se pot folosi”), buton principal „Alimentează”, apoi istoricul tranzacțiilor ca listă grupată pe zile, cu filtru Bază / Bonusuri. Banner-ul promo: titlu + o propoziție + „Detalii”.

### 3.5 Reclamații și recenzii
- „Reclamații” în navigația principală sună negativ și ocupă loc. **Propunere:** recenzia se cere contextual, pe consultația finalizată („Cum a fost consultația cu Dr. X?” cu stele); reclamațiile trec în meniul de cont → „Ajutor și reclamații”.

### 3.6 Navigația pacientului
Acum: Acasă · Pacienții mei · Afiliere · Medici · Operatori · Portofel · Chat · Reclamații · Noutăți (9)

**Propus (5):** Acasă · Consultații · Mesaje · Pacienții mei · Portofel
- „Medici” / „Operatori” devin acțiuni („Consultație nouă”), nu destinații.
- Afiliere, Reclamații, Noutăți, Telegram → meniul de cont.
- Pe mobil: tab bar jos cu aceleași 5.

---

## 4. Medic

### 4.1 Acasă (`DoctorHome.tsx`)
**Probleme**
- Primul lucru vizibil e venitul lunii, nu pacienții care așteaptă.
- Lista „Consultații în așteptare” are doar „Gestionează”, care duce în altă pagină — nu poți accepta de aici.
- Nu există „Azi”: medicul nu vede programările de azi în ordine cronologică.
- Butonul „Reîncarcă” manual, deși pagina de consultații face polling.

**Propunere**
- Sus: **„Necesită răspuns”** (cereri noi cu timer până la expirare: „expiră în 23 min”) cu Accept / Altă oră direct pe rând.
- **„Agenda de azi”**: timeline pe ore, cu starea fiecărei consultații (așteaptă examinarea / gata de început / în desfășurare / de finalizat) și butonul potrivit.
- **„De finalizat”**: consultații începute fără PDF publicat.
- Statisticile (venit, rating, timp de răspuns) jos, compacte, sau doar în pagina Statistici.

### 4.2 Consultații (`ConsultationsPage.tsx`)
Ecranul cel mai important al medicului și cel mai aglomerat.

**Probleme**
- Card „Nou”: Fișa pacientului · Acceptă · Respinge și refund · Propune altă oră · Finalizează direct = **5 butoane** cu aceeași greutate vizuală, într-o coloană.
- Card „Activ”: Fișa · Începe · Chat · Video · Cere investigație · Finalizează · Reprogramează = **7 butoane**.
- „Respinge și refund” are aceeași greutate ca „Acceptă”.
- „Cere investigație” = două `window.prompt` la rând.
- Fișa pacientului, finalizarea și chatul sunt 3 locuri diferite (dialog, dialog, altă pagină), cu salturi între dialoguri (`chartFromExam` redeschide dialogul de finalizare la închiderea fișei).
- Dialogul de finalizare amestecă `<label>` simple, `Label` + `Input`, checkbox nativ, un blob albastru cu mesajul către pacient și semnătura doctorului — totul într-un modal de 620px.
- Grid-ul de meta (Pacient / Data / Plată) are etichete de 11px uppercase.
- Tab-urile au contoare și un punct roșu, dar nu există căutare sau sortare.

**Propunere: un „spațiu de lucru” pe consultație**
- Lista rămâne pe stânga (compactă: nume, specialitate, ora, status, timer), **detaliul pe dreapta** (sau pagină `/doctor/consultations/:id` pe mobil).
- În detaliu, taburi: **Rezumat · Fișa pacientului · Date obiective / HIGO · Chat · Documente**.
- Bară de acțiuni după stare, cu **o singură acțiune principală**:
  - Nou → `Acceptă` (principal) · `Propune altă oră` (secundar) · `⋯` (Respinge, Finalizează direct)
  - Acceptat, așteaptă examinarea → status „Se așteaptă datele de la operator” + `Chat`
  - Gata de început → `Începe consultația` (principal) · `Video` · `Chat`
  - În desfășurare → `Finalizează` (principal) · `Video` · `Chat` · `⋯` (Cere investigație, Reprogramează)
- „Respinge” → dialog cu motiv (select + text) și text clar „Pacientul primește banii înapoi”.
- „Cere investigație” → dialog cu titlu + note.
- **Finalizarea** ca panou lat / pagină, nu modal: fișa pacientului citibilă în stânga, formularul în dreapta (Istoric → Examen obiectiv → Diagnostic → Plan → Recomandări → Investigații → Rețetă), salvare automată ca ciornă (doar local), previzualizare PDF integrată (iframe) în loc de link „Deschide previzualizarea”.

### 4.3 Profil medic și concediu
- „Mod Concediu” stă în meniul de cont și deschide profilul cu `?vacations=1`. **Propunere:** comutator de disponibilitate vizibil în header („Disponibil / În concediu până la …”), iar gestionarea intervalelor în Profil → Disponibilitate.
- Profilul (628 linii) → secțiuni cu navigare laterală: Date publice · Prețuri și tipuri de consultație · Disponibilitate · Semnătură · Platforme.

### 4.4 Statistici
- OK ca structură. De scos textul de developer de la `StatsPage.tsx:99` și de aliniat cardurile la sistemul comun.

---

## 5. Operator

### 5.1 Acasă (`OperatorHome.tsx`)
- Metrica „Finalizate astăzi” folosește iconița `Wallet`.
- „Preluare caz” pe home acceptă **direct, fără confirmare**, în timp ce pe pagina Pacienți aceeași acțiune deschide dialog cu note. Comportament diferit pentru același buton.
- **Propunere:** „Următoarea vizită” sus (adresă, ora, pacient, „Deschide în hărți”, „Sună / Chat”), apoi lista de cereri noi cu timer de expirare, apoi traseul zilei.

### 5.2 Solicitări (`RequestsPage.tsx`)
**Probleme**
- Kanban cu 3 coloane, carduri lungi; pe mobil (unde operatorul lucrează efectiv, pe teren) coloanele se stivuiesc și „Finalizate” ajunge foarte jos.
- Card „În desfășurare” are **7 butoane full-width** stivuite: Am terminat · Adaugă date manual · Transmite la medic · Serviciu pe loc · Chat pacient · Reprogramează · Finalizează ca operator.
- „Chat pacient” duce la `/operator/chat` fără să deschidă conversația pacientului respectiv.
- Reprogramarea = `window.prompt` cu format `YYYY-MM-DD HH:mm`.
- „Serviciu pe loc” debitează instant bani din portofelul pacientului, fără ecran de confirmare cu suma.
- `RequestSummary` pune iconița `MapPin` lângă simptome și `Phone` lângă **email**.
- Adresa nu e link spre hărți; nu există telefon apelabil.
- Titlul paginii e „Solicitări Examinare”, meniul spune „Pacienți”.

**Propunere: vizualizare „vizită” gândită pentru telefon**
- Listă cu taburi (Noi · Azi · Finalizate), nu kanban, pe mobil; kanban opțional pe desktop.
- Detaliul unei vizite ca pagină: pacient + cod HIGO, **adresă cu „Deschide în Google Maps/Waze”**, ora, investigațiile cerute ca **checklist**, simptomele.
- Acțiuni după etapă, cu bară fixă jos:
  - Nou → `Preia cazul` · `⋯` Respinge
  - Preluat → `Am terminat examinarea` (principal) · `Adaugă date manual` · `⋯` (Serviciu pe loc, Reprogramează, Transmite la medic, Finalizează ca operator)
- „Chat” deschide direct conversația acelui pacient (`?request=`).
- „Serviciu pe loc” → dialog cu confirmare explicită: „Se vor reține X MDL din portofelul pacientului Y”.
- Reprogramare → același dialog cu `datetime-local` pe care îl are deja medicul (refolosit).

### 5.3 Rute stricate / goale
- `App.tsx:314`: `/operator/profile` afișează `<div>Profile</div>`, iar meniul de cont trimite operatorul acolo. Fie o pagină minimă de profil (nume, telefon, regiune, Telegram), fie scoatem linkul.

---

## 6. Chat și video (comune)

### 6.1 Chat (`ChatView.tsx`)
**Probleme**
- Până la **3 niveluri de navigare** pe desktop: coloană interlocutori → coloană „canale” pacienți (`#Nume`) → conversația, plus „Discuție directă” și „General”. Modelul de tip Slack (`#`) e ciudat pentru un pacient.
- Pe mobil devine 2 dropdown-uri + uneori un `<select>` nativ.
- Header-ul are până la 4 butoane (Consultații N, Fișa, Apel video dezactivat, Consultația) plus bara `ConsultationChatNavigation` dedesubt.
- Inputul e `Input` pe un rând — mesajele medicale lungi nu se pot scrie confortabil; nu există Enter/Shift+Enter, nici previzualizarea atașamentului înainte de trimitere.
- Mesajele nu sunt grupate pe zile; ora e `10px`.
- Nu există mesaje de sistem distincte vizual (ex. „Medicul a acceptat consultația”).
- Bule cu gradient mov pentru mesajele proprii.

**Propunere**
- 2 niveluri: **listă de conversații** (un rând = o consultație sau o discuție directă, cu numele pacientului, al medicului și ultimul mesaj) → **conversația**. Gruparea pe titular / pacient devine un filtru în listă, nu o coloană.
- Header simplu: nume + status + `Video` + `ⓘ` (deschide panoul de detalii cu fișa, documentele, istoricul).
- Separatoare pe zile, mesaje grupate pe expeditor, mesaje de sistem centrate și gri, `Textarea` care crește automat, Enter trimite / Shift+Enter rând nou, chip de atașament cu progres.
- Pe mobil: listă și conversație ca ecrane separate (pattern WhatsApp), cu „înapoi”.

### 6.2 Video
- Banner-ul de consultație activă e bun ca idee; pe mobil se combină cu restul banerelor. **Propunere:** pe mobil devine o bară compactă fixă jos („● Consultație în desfășurare · Revino”), ca la apelurile din WhatsApp.
- Pagina video: titlul cu gradient și iconiță mare ocupă spațiu; apelul ar trebui să fie full-screen cu chatul ca panou lateral comutabil.

---

## 7. Fundația propusă (design system minim)

Fără bibliotecă nouă — doar ordine în ce există (Tailwind + Radix + componentele din `components/ui`).

1. **Tokeni**: o culoare primară (albastrul actual, fără mov), neutre `slate`, plus `success / warning / danger / info`. Fond aplicație `slate-50` simplu, carduri albe cu `border`, fără glass și fără gradient. O singură rază (`rounded-xl` pentru carduri, `rounded-lg` pentru controale).
2. **Tipografie**: `PageHeader` (titlu 2xl/3xl + descriere + acțiuni), `SectionHeader`; minim 12px pentru orice text.
3. **`StatusBadge`** cu o singură hartă status → etichetă + culoare, pe rol (pacientul vede „Așteaptă confirmarea”, medicul „Cerere nouă”), într-un singur fișier.
4. **`ConfirmDialog`** și **`PromptDialog`** care înlocuiesc toate `window.confirm` / `window.prompt`.
5. **Toast-uri** (`sonner`, deja instalat) pentru succes/eroare la acțiuni; banerele rămân doar pentru erori de încărcare a paginii.
6. **`Skeleton`** pentru liste și carduri; **`EmptyState`** cu iconiță, titlu, text și acțiune.
7. **`ActionBar`**: o acțiune principală + secundare + meniu `⋯`.
8. **Layout**: sidebar pe desktop (≥1024px) în loc de nav orizontal; tab bar jos pe mobil; `document.title` per pagină.
9. `prefers-reduced-motion` și animații doar la prima randare, nu la fiecare refresh.

---

## 8. Plan pe etape

### Faza 0 — câștiguri rapide (1–2 zile, risc aproape zero)
- [ ] Scos textele de developer (5 locuri).
- [ ] Unificat mesajele contradictorii despre pachet / primul pacient gratuit.
- [ ] Reparat `/operator/profile` (sau scos linkul).
- [ ] `Plată: held` → etichete românești la operator; iconițe corecte (`Wallet` → `CheckCircle`, `MapPin`/`Phone` din `RequestSummary`).
- [ ] „Chat pacient” la operator → link cu `?request=`.
- [ ] „Preluare caz” de pe home-ul operatorului → aceeași confirmare ca pe pagina Pacienți.
- [ ] Title Case → stil normal („Alimentare cont”, „Portofel electronic”, „Confirmare solicitare”).
- [ ] `aria-label` pe butoanele doar cu iconiță.

### Faza 1 — fundația (3–5 zile)
- [ ] Tokeni + fond simplu + eliminare glass/gradient.
- [ ] `PageHeader`, `StatusBadge`, `ConfirmDialog`, `PromptDialog`, `EmptyState`, `Skeleton`, `ActionBar`.
- [ ] Toast-uri cu `sonner`, înlocuirea banerelor de succes.
- [ ] Toate `window.confirm` / `window.prompt` → dialoguri.
- [ ] Layout nou: sidebar desktop + tab bar mobil; navigația pacientului redusă la 5.

### Faza 2 — ecranele cheie (1–2 săptămâni)
1. **Medic — Consultații**: listă + detaliu, acțiuni pe stare, finalizare ca panou lat.
2. **Operator — Vizite**: listă mobil-first, pagină de vizită cu hărți și checklist.
3. **Pacient — Acasă** cu card de stare + **solicitare pe 3 pași**.
4. **Chat** pe 2 niveluri.

### Faza 3 — finisaje
- Pacienții mei pe rute separate, fișă pe taburi.
- Portofel simplificat, recenzii contextuale.
- Medic: comutator de disponibilitate în header, profil pe secțiuni.
- Pagina video full-screen.

---

## 9. Ce NU se schimbă
- Endpoint-urile, payload-urile și ordinea apelurilor API.
- Regulile de status (`new / accepted / rescheduled / completed / …`), cine poate face ce și când.
- Calculul prețurilor, plăților, bonusurilor și refund-urilor (UI-ul doar le afișează mai clar).
- Feature flags — ecranele noi respectă aceleași `isEnabled(...)`.
- Polling-ul și realtime-ul (doar oprim re-animarea cardurilor la refresh).
