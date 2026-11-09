# Fluxul pacientului — analiză și propunere de onboarding

Nov 8, 2026 · @Dorin Puscasu · stare cod: commit `1ec3f15`

## Rezumat

Regulile platformei rămân: pacienții se adaugă doar după cumpărarea unui pachet, programarea se face pentru un pacient ales din cont, iar pentru programare e nevoie de câteva date din fișa pacientului. Problema nu e ordinea, ci faptul că pacientul trebuie să o descopere singur, prin patru zone ale aplicației și, de obicei, două plăți MAIB separate.

Cauzele principale:

- **Nimic nu-l conduce de la un pas la altul.** După cod ajunge pe Acasă. Portofelul, pachetul, pacientul și programarea sunt în locuri diferite.
- **Regula pachetului e aplicată contradictoriu.** Backend-ul creează primul profil fără pachet, bannerul spune „primul pacient e gratuit”, iar cardul de alături spune „ai nevoie de un pachet” și dezactivează „Adaugă”.
- **Pachetul se plătește doar din sold.** Înti alimentare prin MAIB, apoi întoarcere pe Portofel, apoi „Cumpără pachet” găsit separat. Consultația cere apoi o a doua alimentare.
- **Fișa cere ce nu trebuie și nu cere ce trebuie.** Strada e obligatorie la creare chiar și pentru video. Data nașterii e opțională, deși fără ea pacientul nu ajunge în HIGO.
- **Blocajele programării apar la final**: sold insuficient, oră în afara programului, rating restant. Doar text roșu, fără acțiune.

Propunerea: un asistent de pornire care leagă cei trei pași impuși de reguli. **Pachet**: o singură plată MAIB, pachetul se activează automat, opțional cu suma pentru prima consultație. **Pacient**: „Pentru mine” sau „Pentru altcineva”, cu minimul obligatoriu din fișă. **Programare**: cu pacientul deja selectat. Fișa se cere în două trepte: minimul la adăugarea pacientului, restul după trimiterea cererii. Țina: o singură plată și niciun ecran în care pacientul trebuie să ghicească ce urmează.

## Drumul unui pacient nou azi

Scenariul: cont nou, fără bani în portofel, vrea o consultație video pentru el. Fiecare rând e un ecran prin care trece.

| # | Ecran | Ce completează | Ce merge prost | Unde în cod |
| --- | --- | --- | --- | --- |
| 1 | `/register` | tip cont, nume, email, telefon (opțional), parolă, confirmare parolă | Pacientul vede și opțiunile Medic / Operator. Rolul lui se numește „Utilizator”. | `RegisterPage.tsx` |
| 2 | Cod din email | 6 cifre | Merge. Bonusul de bun-venit se acordă aici, dar nu e anunțat. | `AuthController::verifyEmailOtp`, `RegistrationBonus` |
| 3 | `/patient` (Acasă) | — | Card „Primul pas: Adaugă pacientul”, plus bannerul Telegram, care nu se poate închide. | `PatientHome.tsx`, `TelegramConnectionBanner.tsx` |
| 4 | `/patient/profile` | — | Sus: „Adaugă primul pacient gratuit”. Stânga: „Ai nevoie de un pachet”, cu „Adaugă” dezactivat. | `ProfilePage.tsx` (`patientNextStep`, `availableSlots`) |
| 5 | Dialog „Profil pacient nou” | prenume, nume, țară, raion, localitate, stradă (obligatorii); data nașterii, sex, mediu de trai, istoricul vieții | Adresa e obligatorie și pentru video. Numele din cont se tastează din nou. | `PatientProfileController::validatePatientProfile` |
| 6 | Tot „Pacienții mei” | — | După salvare rămâne aici; trebuie să găsească singur „Programează”. | `ProfilePage.tsx` (`savePatient`) |
| 7 | `/patient/doctors` → pasul 1 | pacient, tip | Tipul implicit e „cu examinare”, cel mai scump și mai complicat. | `DoctorsList.tsx` (`consultationKind`) |
| 8 | Pasul 2 | acuze, istoric, dată și oră | Ora e ghicită într-un `datetime-local` gol; programul medicului nu se vede. | `DoctorsList.tsx` |
| 9 | Pasul 3 | confirmare | Abia acum: „Balanță insuficientă”, „Medicul nu are program…” sau „Ai consultații… care așteaptă rating”. Doar text, fără buton. | `WorkflowController::storeRequest`, `reservePatientWallet`, `ensureSchedulable` |
| 10 | Portofel → MAIB → înapoi | sumă, date card | Revine pe `/patient/wallet?payment=ok`. Parametrul e ignorat, deci niciun mesaj. Programarea se reia de la pasul 7. | `WalletController::ok` (redirect), `WalletPage.tsx` |

Total: 12 câmpuri obligatorii (18 cu cele opționale) și 9 ecrane fără alimentare. Cu alimentare se adaugă portofelul, MAIB și întoarcerea, apoi programarea se completează a doua oară: încă circa 8 ecrane.

Drumul de mai sus e cel pe care îl permite codul azi, fără pachet, pentru că backend-ul dă primul profil gratuit. Cu regula „pachet obligatoriu” se adaugă înaintea pasului 4: Portofel → Alimentează → MAIB → întoarcere → „Pacienții mei” → „Cumpără pachet”. Asta înseamnă încă circa 6 ecrane și o plată în plus.

## Problemele găsite, pe priorități

Toate sunt citite în cod la commitul `1ec3f15`, nu verificate rulând aplicația.

### Bug-uri care blochează sau induc în eroare

1. **Regula pachetului nu e aplicată consecvent.** Backend-ul creează primul profil fără pachet (`storePatientProfile`, comentariul „Primul profil al unui cont este gratuit”). Bannerul din „Pacienții mei” spune același lucru. Cardul de alături spune „Ai nevoie de un pachet” și dezactivează „Adaugă”, pentru că `availableSlots` e 0.
2. **Cu `patient_cards` sau `payments` oprit, nimeni nu mai poate adăuga un pacient.** Cumpărarea e blocată (`buyCardPackage` întoarce 403), butonul e dezactivat, iar bannerul trimite la „Datele contului”.
3. **Data nașterii e opțională, dar HIGO nu primește pacientul fără ea.** `HigoProvisioner::notReadyReason` oprește sincronizarea cu „lipsește data nașterii”. Pentru acești pacienți nu funcționează atribuirea examinărilor după `higo_patient_id`. PDF-ul consultației afișează „-” la data nașterii.
4. **„Examinare la domiciliu” (`OperatorsList.tsx`) promite ce nu face.** „Telefon de contact” al pacientului e precompletat cu telefonul operatorului (`setPhone(operator.phone)`). Adresa se cere din nou, ca text liber în `triage_notes`. Operatorul ales e ignorat: `storeRequest` îl reatribuie automat (`assignOperatorOrFail`).
5. **Rezultatul plății MAIB nu e arătat.** `WalletController::ok` redirecționează la `/patient/wallet?payment=ok|pending|fail`, dar `WalletPage.tsx` citește doar `topup`.

### Fricțiune mare

6. **Pachetul se plătește doar din sold.** `buyCardPackage` debitează portofelul real. Pacientul alimentează, revine pe Portofel (pentru că MAIB întoarce mereu acolo), apoi găsește singur fila „Cumpără pachet”.
7. **Nicio legătură între pași.** După cumpărare nu se deschide „Adaugă pacient”. După adăugarea pacientului nu se ajunge la medici.
8. **Strada e obligatorie la creare.** `region_id`, `locality_id` și `address` sunt `required` la `POST /patient/profiles`, deși strada e necesară doar pentru examinare. Garda pentru examinare există deja separat (`previewRequest`, `ensureWithExamAddress`). Regula e acoperită de test (`RegionsAndAddressGatingTest`), deci a fost o decizie.
9. **Soldul pentru consultație se află la final.** `previewRequest` întoarce costul, dar nu soldul și nici diferența. Eroarea 422 din `reservePatientWallet` e doar text. La cartele există deja modelul bun: `insufficient_wallet_balance` + `missing_amount`. După MAIB, draftul programării e pierdut.
10. **Ora e ghicită.** Nu există un endpoint de intervale libere; `ensureSchedulable` respinge la trimitere.
11. **Ratingul obligatoriu e ascuns.** Orice cerere nouă e blocată cât există o consultație `completed` fără `closed_at`. Ratingul se dă din „Reclamații și recenzii”, iar programarea află abia la pasul 3.
12. **Titularul nu e pacient.** Nu există „Pentru mine”; numele din cont se tastează din nou.
13. **Tipul implicit e `with_exam`** în `DoctorsList.tsx`: cere adresă, operator în zonă și costă mai mult.
14. **Cod pe email la fiecare autentificare** (`auth.email_2fa_enabled`, implicit `true`).

### Fricțiune mică

15. Formularul de înregistrare e comun cu medicii și operatorii: trei tipuri de cont, confirmare de parolă, eticheta „Utilizator”.
16. Bannerul Telegram apare din prima secundă și nu se poate amâna.
17. Bonusul de bun-venit, acordat la confirmarea emailului, nu e anunțat.
18. Pachetul nu explică ce e un profil: „un profil = o persoană din familie, cu fișa ei, activ un an”.
19. Catalogul de medici e public în API (`/catalog/doctors`), dar site-ul public nu îl arată: pacientul plătește pachetul înainte să vadă medicii și prețurile.

## Principiul: ce cerem acum, ce cerem la nevoie, ce cerem mai târziu

Pacientul e **gata** când are un pachet activ și un pacient cu datele obligatorii din fișă. Ordinea e impusă de reguli: pachet → pacient → programare. Putem însă lega cei trei pași într-un singur drum și cere din fișă doar minimul de care programarea are nevoie.

Ce cere codul azi, concret: `canRequestConsultation` vrea profil activ, prenume și nume. HIGO vrea și data nașterii. PDF-ul afișează data nașterii și localitatea. Examinarea la domiciliu vrea raion, localitate și stradă.

| Dată | Când o cerem | De ce atunci |
| --- | --- | --- |
| Nume, email, parolă | Înregistrare | Identitate și notificări. Numele devine și numele pacientului „Pentru mine”. |
| Cod din email | Imediat după | Confirmă emailul; există deja. |
| Pachetul (alegere + plată) | Pasul 1 al asistentului, imediat după cod | Regulă: fără pachet nu se adaugă pacienți. O singură plată MAIB, pachet activat automat. |
| Suma pentru prima consultație | Opțional, bifat în aceeași plată cu pachetul | Evită a doua plată MAIB la programare. |
| Pentru cine, prenume, nume | Pasul 2 al asistentului | Consultația se face pe un profil. „Pentru mine” precompletează din cont. |
| Data nașterii | Pasul 2, obligatorie | HIGO nu primește pacientul fără ea; apare în PDF; vârsta contează clinic. |
| Sex | Pasul 2, obligatoriu | Clinic relevant; HIGO îl acceptă și ca necunoscut, deci e decizie de business. |
| Raion, localitate | Pasul 2, obligatorii | Apar în PDF; decid dacă există operator în zonă. Două liste, fără tastare. |
| Alergii, boli cronice, medicamente luate des | Pasul 2, dacă clientul le vrea înainte de programare (decizie) | Trei întrebări Nu / Da + text, nu secțiunile complete ale fișei. |
| Stradă, telefon | La programare, doar dacă alege „cu examinare” | Operatorul vine acasă și sună. Se salvează în profil pentru data viitoare. |
| Pacientul ales, acuze, oră | La programare | Pacientul e deja selectat când vine din asistent. |
| Diferența de sold | La confirmare, doar dacă lipsește | Pacientul știe deja cât costă și pentru ce plătește. |
| Restul fișei, analize | După trimiterea cererii sau oricând | Nu blochează nimic; medicul le poate cere în chat. |
| Telegram | După trimiterea cererii | Are un motiv clar: „afli imediat când răspunde medicul”. |
| Alți pacienți, afiliere | Oricând | Nu blochează nimic. |

Regula pentru blocaje: orice condiție care poate opri cererea (fără pachet, date lipsă din fișă, rating restant, adresă lipsă, sold mic, oră indisponibilă) se verifică în pasul în care pacientul o poate rezolva și vine cu butonul care o rezolvă pe loc.

## Fluxul propus

&#91;embedded content: fluxul propus · pachet → pacient → programare, 2 ocoliri doar la nevoie\]

Pașii 3 și 4 sunt asistentul de pornire: pachetul și pacientul, în ordinea cerută de reguli, fără ca pacientul să caute singur pagina următoare. Dacă bifează și suma pentru prima consultație, ocolirea „Sold insuficient” nu mai apare. Adresa și telefonul se cer doar pentru examinare, în programare. Vizitatorul din catalogul public ajunge, după asistent, la programarea medicului ales.

Ce nu mai e pe drum: afilierea, fișa completă, Telegram și datele contului. Toate rămân accesibile din meniu.

## Ce se schimbă în cod, pe etape

Etapele se pot livra pe rând. Etapa 1 pornește de la regulile confirmate (pachet → pacient → programare); etapele 2–4 depind și de răspunsurile din secțiunea Decizii.

### Etapa 1 — Reparații pe regulile confirmate

- [ ] Regula pachetului, aceeași peste tot. `storePatientProfile` nu mai creează profil fără pachet (decizia 3). Bannerul „primul pacient gratuit” dispare. Contul fără pachet vede un singur mesaj, „Alege un pachet ca să adaugi pacienți”, cu un singur buton.
- [ ] Data nașterii devine obligatorie la `POST /patient/profiles`, pentru că HIGO o cere. Profilurile existente fără ea apar „Necesită date” și sunt completate la următoarea programare.
- [ ] Legături între pași: după cumpărarea pachetului se deschide direct „Adaugă pacient”; după crearea pacientului, redirecționare la `/patient/doctors?patient_profile=<id>`.
- [ ] `WalletPage.tsx`: citește `?payment=ok|pending|fail`. „ok” → mesaj + sold reîncărcat; „pending” → reîncarcă de câteva ori la 3 s; „fail” → mesaj + „Încearcă din nou”.
- [ ] `OperatorsList.tsx`: nu mai precompleta telefonul cu cel al operatorului; folosește adresa din profil. Soarta paginii e decizia 9.
- [ ] Acasă: o stare nouă în cardul de sus, „Ai de evaluat consultația cu Dr. X”, cu stele direct în card.
- [ ] Programare: ratingul restant se verifică la deschiderea dialogului, nu la trimitere.
- [ ] Bannerul Telegram: buton „Mai târziu” (ascuns 7 zile, în `localStorage`); nu apare până la prima cerere trimisă.
- [ ] Tipul implicit în programare: video (sau ultimul folosit de acest cont).

**Acceptare:** un cont nou fără pachet vede un singur mesaj și un singur buton spre pachet. După cumpărare ajunge direct la adăugarea pacientului, apoi la medici, cu pacientul selectat. Un profil nu se mai poate crea fără pachet și fără data nașterii.

### Etapa 2 — Asistentul de pornire

- [ ] `/register` devine formularul pacientului: nume, email, parolă, cu „arată parola” în loc de confirmare. Telefonul iese de aici. Medicii și operatorii au link spre `/register/specialist`, același endpoint. `RegisterRequest` rămâne neschimbat; frontend-ul trimite `password_confirmation` = `password`.
- [ ] Asistent nou `/patient/start`, cu bara „Pachet → Pacient → Programare”. Apare după cod și ori de câte ori contul nu are pachet activ sau niciun pacient. Se poate închide, dar Acasă îl reia din pasul rămas.
- [ ] Pasul **Pachet**: cardurile din `card_packages` (în seeder: 240 / 450 / 600 MDL pe an, pentru 1 / 2 / 6 profiluri). Explicație scurtă: „un profil = o persoană din familie, cu fișa ei, activ un an”. Opțiune bifabilă: „adaugă și X MDL pentru prima consultație”, cu X setat din admin.
- [ ] Plata într-un singur pas: `POST /patient/card-purchases/checkout` creează un `Payment` cu `purpose = wallet_top_up` (ca să rămână bonusul la alimentare și comisionul de afiliere) și `metadata.buy_package_id`. `markPaymentPaid` creditează portofelul și, în aceeași tranzacție, cumpără pachetul. Logica din `buyCardPackage` se mută într-un serviciu folosit în ambele locuri. MAIB întoarce la `/patient/start?step=patient`. Dacă soldul acoperă deja pachetul, cumpărarea e directă, fără MAIB.
- [ ] Pasul **Pacient**: „Pentru mine” (prenume și nume precompletate din cont, editabile) sau „Pentru altcineva”. Câmpurile obligatorii sunt cele hotărâte la decizia 1. Propunerea: prenume, nume, data nașterii, sex, raion, localitate. Dacă decizia 2 e „da”, tot aici apar cele trei întrebări: alergii, boli cronice, medicamente, salvate în `drug_allergies`, `chronic_conditions` și `lifestyle.long_term_medication`.
- [ ] Pasul **Programare**: „Continuă” duce la `/patient/doctors?patient_profile=<id>`.
- [ ] Backend, `validatePatientProfile`: `birth_date` obligatoriu; `address` (strada) devine `nullable` la creare; `country` primește implicit „Republica Moldova”. Garda pentru examinare rămâne în `previewRequest` și `storeRequest`.
- [ ] Teste: profil fără pachet respins; profil fără stradă acceptat, dar `with_exam` respins; checkout care cumpără pachetul o singură dată chiar dacă MAIB trimite callback-ul de două ori. `RegionsAndAddressGatingTest` se actualizează pentru stradă.
- [ ] Ecranul de după cod anunță bonusul de bun-venit, dacă s-a acordat.

**Acceptare:** cont nou, sold 0: de la `/register` la programarea deschisă, cu pacientul selectat, printr-o singură plată MAIB. Un callback MAIB dublat nu cumpără două pachete.

### Etapa 3 — Totul se rezolvă din programare

- [ ] Pasul 1, tip „cu examinare”, profil fără adresă: formular inline (stradă și telefon; raion și localitate doar la profilurile vechi care nu le au). Se salvează prin `PUT /patient/profiles/{id}` și `PUT /patient/profile`, fără trimitere la „Pacienții mei”.
- [ ] `previewRequest` întoarce și soldurile și `shortfall` (diferența de plătit din portofelul real). Pasul 3 arată „Îți lipsesc X MDL”, iar butonul devine „Alimentează X MDL și trimite cererea”.
- [ ] `reservePatientWallet`: eroarea 422 primește `code: insufficient_wallet_balance` și `missing_amount`, ca la cartele.
- [ ] Draftul programării (medic, pacient, tip, acuze, oră, investigații, bonusuri) se păstrează în `sessionStorage`. `POST /wallet/top-up` acceptă `return_to`, doar căi interne `/patient/...`, validate pe server. `WalletController::ok` redirecționează acolo. `DoctorsList.tsx` redeschide dialogul la pasul 3.
- [ ] Intervale libere: `GET /catalog/doctors/{id}/slots?days=7`, construit pe aceeași logică ca `ensureSchedulable` (program, concedii, suprapuneri, `Europe/Chisinau`). Pasul 2 arată intervalele ca butoane, plus „altă oră”.
- [ ] `DoctorsList.tsx` acceptă `?doctor=<id>` și deschide direct programarea (necesar pentru catalogul public din etapa 4).

**Acceptare:** cont nou, sold 0: cererea video ajunge trimisă cu o singură alimentare, fără să reia programarea după MAIB, și fără nicio eroare la pasul 3 care să nu ofere o acțiune.

### Etapa 4 — Profil progresiv și revenire ușoară

- [ ] După trimiterea cererii (ecranul de succes și chatul în așteptare): cardul „Ajută medicul să se pregătească”. Dacă nu au fost cerute la adăugarea pacientului (decizia 2), trei întrebări: alergii, boli cronice, medicamente luate des, fiecare cu Nu / Da + text. Se salvează în secțiunile existente din fișă: `drug_allergies`, `chronic_conditions`, `lifestyle.long_term_medication`. Plus „încarcă analize recente”.
- [ ] Tot acolo, Telegram: „află imediat când medicul confirmă”.
- [ ] „Pacienții mei” și Acasă: „Fișa lui X: 3 din 8 secțiuni”, cu următoarea secțiune sugerată. Nu blochează nimic.
- [ ] Autentificare: „Ține-mă minte pe acest dispozitiv 30 de zile” pentru pacienți, după ce `/auth/login` și `/auth/verify-login-otp` primesc `throttle` (punctul 12 din auditul platformei).
- [ ] Site public: pagina `/medici` din `/catalog/doctors`. „Programează” duce la `/register?next=/patient/doctors?doctor=<id>`, iar după „Pentru cine?” pacientul ajunge direct la programarea cu acel medic.

**Acceptare:** pacientul care revine pe același dispozitiv nu mai primește cod; un vizitator ajunge din catalogul public la programarea medicului ales, cu doctorul păstrat după înregistrare.

## Decizii de luat cu clientul

Regulile de bază sunt confirmate: pachet obligatoriu pentru a adăuga pacienți, programarea se face pentru un pacient ales, iar programarea cere date din fișă. Rămân zece întrebări, fiecare cu recomandarea mea. Etapa 1 depinde de 3; etapa 2 de 1, 2, 4, 5 și 6; etapa 3 de 8; etapa 4 de 6 și 10.

| # | Decizia | Azi | Recomandare |
| --- | --- | --- | --- |
| 1 | Ce date din fișă sunt obligatorii înainte de programare? | Doar prenume și nume; plus raion, localitate, stradă la creare | Prenume, nume, data nașterii, sex, raion, localitate. Strada și telefonul doar la programarea cu examinare. |
| 2 | Alergiile, bolile cronice și medicamentele se cer înainte de programare? | Nu se cer nicăieri în flux; sunt secțiuni opționale în fișă | Dacă medicii le vor înainte: trei întrebări Nu / Da + text la adăugarea pacientului. Altfel, după trimiterea cererii. |
| 3 | Primul profil rămâne gratuit? | Backend-ul îl dă gratuit; UI-ul se contrazice | Nu, conform regulii „pachet obligatoriu”. Dacă a fost o promoție cerută de client, o arătăm explicit ca pachet gratuit. |
| 4 | Ce înseamnă flag-ul `patient_cards` oprit? | Nimeni nu mai poate adăuga pacienți | Oprit = profilurile se adaugă fără pachet. Sau scoatem flag-ul. |
| 5 | Pachetul și suma pentru prima consultație într-o singură plată? | Două alimentări separate | Da, ca opțiune bifată implicit, cu suma setată din admin. |
| 6 | Parolă sau doar cod pe email? | Parolă + cod la înregistrare și la fiecare autentificare | Păstrăm parola, adăugăm „ține-mă minte 30 de zile”. |
| 7 | Ratingul blochează cererile noi? | Da, orice cerere, pentru orice membru al familiei | Cerut la începutul următoarei programări, cu „Mai târziu” permis o dată. Sau blocare doar pentru același profil. |
| 8 | Cerere video „cât mai curând”, fără oră aleasă? | Backend-ul o permite (`scheduled_at` nullable); UI-ul cere ora | Da, lângă intervalele libere, dacă medicii acceptă. |
| 9 | „Examinare la domiciliu” fără medic e un produs real? | Pagină separată; operatorul ales e ignorat | Dacă nu: o scoatem din meniu. Dacă da: fără alegerea operatorului și cu adresa din profil. |
| 10 | Medicii și prețurile sunt vizibile fără cont? | API-ul e public; site-ul nu le arată | Da: pacientul vede ce primește înainte să plătească pachetul. |

## Cum măsurăm dacă a mers

Pâlnia se poate calcula retroactiv din tabelele existente, deci putem avea valoarea de azi înainte de prima schimbare. Ce lipsește e doar abandonul din dialogul de programare, care cere un eveniment din frontend.

| Pas | Sursă | Ce urmărim |
| --- | --- | --- |
| Cont creat | `users.created_at`, rol `patient` | baza pâlniei |
| Email confirmat | `users.email_verified_at` | % din conturi |
| Pachet cumpărat | primul `patient_card_purchases.created_at` per `user_id` | % și timpul de la confirmare; aici se pierd cei mai mulți, probabil |
| Primul pacient creat | primul `patient_profiles.created_at` per `user_id` | % și timpul de la pachet |
| Prima cerere trimisă | primul `consultation_requests.created_at` per `patient_id` | % și timpul median de la înregistrare |
| Cereri precedate de alimentare | `payments` cu `purpose = wallet_top_up`, `status = paid`, în ora dinaintea primei cereri | câți plătesc a doua oară ca să poată cere |
| Abandon în asistent și la pasul 3 | evenimente noi în frontend: pas atins, eroare primită | unde se opresc și din ce motiv |

Țintă de verificat după etapele 1–3: timpul median de la înregistrare la prima cerere scade, iar ponderea celor care confirmă emailul dar nu trimit nicio cerere în 7 zile scade. Valorile de pornire nu le am; se scot cu un query pe producție.
