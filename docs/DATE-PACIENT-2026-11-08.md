# Datele pacientului — inventar exact al câmpurilor

> Stare la 2026-11-08. Sursa: baza de date (`patient_profiles`, `patient_investigations`, `patient_family_members`, `consultation_objective_data`), validările din backend și formularele din frontend.
> Coloanele „Obligatoriu” și „Valori permise” sunt cele impuse de **backend**. Coloana „În UI” spune dacă formularul îl afișează efectiv.

Structura: **contul** (titularul, rol `patient`, eticheta „Utilizator”) → unul sau mai multe **profiluri de pacient** (el + familia). Toate datele medicale de mai jos sunt **per profil de pacient**.

---

## 1. Contul titularului (`users`)

| Câmp | Etichetă UI | Obligatoriu | Valori / limită |
|---|---|---|---|
| `name` | Nume cont | da | text, max 255 |
| `email` | Email | da (la înregistrare) | email unic; confirmat prin OTP |
| `phone` | Telefon | nu | max 50, validare număr de telefon |
| `password` | Parolă | da | regulile de parolă |
| `telegram_chat_id` | — | nu | se completează la legarea Telegram |

---

## 2. Profilul de pacient — date personale (`patient_profiles`)

Se completează în două locuri:
- **dialogul „Profil pacient nou”** (`pages/patient/ProfilePage.tsx`);
- **fișa medicală → tabul „Date personale”** (`components/PatientMedicalRecord.tsx`), unde se pot edita ulterior.

| Câmp (DB) | Etichetă UI | Obligatoriu la creare | Valori permise / limită | Dialog creare | Fișa „Date personale” |
|---|---|---|---|---|---|
| `first_name` | Prenume | **da** | text, max 255 | da | da |
| `last_name` | Nume | **da** | text, max 255 | da | da |
| `birth_date` | Data nașterii | nu | `YYYY-MM-DD`, cel târziu azi | da | da |
| `gender` | Sex | nu | `M` (Masculin), `F` (Feminin), `Altul`* | da (M/F) | da (M/F) |
| `residential_environment` | Mediul de trai | nu | `rural`, `urban` | da | da |
| `country` | Țară | **da** | text, max 100; implicit „Republica Moldova” | da | da |
| `region_id` | Raion / municipiu | **da** | id din nomenclatorul de regiuni (activ) | da (listă) | da (listă) |
| `locality_id` | Localitate | **da** | id de localitate activă din raionul ales | da (listă) | da (listă) |
| `address` | Adresă (stradă și număr) / Strada și numărul casei | **da** | text, max 255 | da | da |
| `address_details.building` | Bloc | nu | max 50 | nu | da |
| `address_details.entrance` | Scară | nu | max 50 | nu | da |
| `address_details.apartment` | Apartament | nu | max 50 | nu | da |
| `address_details.floor` | Etaj | nu | max 50 | nu | da |
| `emergency_contact` | Contact de urgență | nu | text liber, max 255 | **nu** | da |
| `medical_summary` | Istoricul vieții | nu | text liber, max 4000 | da | da |
| `pseudonymized` | „Folosește numele prescurtat în chat, liste și documente” | nu | da/nu (implicit nu) → afișează „Prenume N.” | nu | da |

\* Backend-ul acceptă `Altul`, dar niciun formular nu îl oferă.

**Câmpuri completate automat (nu le introduce nimeni):**

| Câmp | Ce este |
|---|---|
| `patient_code` | Cod pacient de 15 cifre, generat la creare; afișat în fișă („Cod pacient”); folosit ca identificator în HIGO. |
| `region`, `locality` | Numele text al raionului/localității, copiate din nomenclator. |
| `status` | `active` la creare (implicit DB `inactive`). |
| `active_until` | `null` pentru primul profil (gratuit); pentru următoarele = data expirării cartelei cumpărate. |
| `higo_patient_id`, `higo_general_practitioner_id`, `higo_sync_status`, `higo_synced_at`, `higo_sync_error` | Starea sincronizării cu HIGO. |
| `medical_record` | JSON cu secțiunile din capitolul 3. |
| `life_history` | JSON (listă de `{category, note, added_at, added_by}`) — vezi observațiile. |
| `identity_number` | Coloană veche (IDNP); **interzisă** la scriere și ascunsă în răspunsuri. |

**Condiții**: adresa completă (`region_id` + `locality_id` + `address`) e obligatorie pentru consultațiile cu examinare la domiciliu. Primul profil e gratuit; al doilea și următoarele cer o cartelă (`PatientCardPurchase`) cu locuri libere.

---

## 3. Fișa medicală structurată (`patient_profiles.medical_record`, JSON)

Editabilă doar de **titularul contului** sau de **admin** (`PATCH /patient/profiles/{id}/medical-record`, o secțiune pe rând). Medicul o vede, nu o modifică. Definiții: `backend/app/Services/MedicalRecordSchema.php` și `frontend/src/lib/medical-record.ts`.

Abrevieri: **„text”** = text liber, max 4000 caractere; **„dată”** = `YYYY-MM-DD`, cel târziu azi; **(R)** = secțiune repetabilă (listă de înregistrări, max 200).

### 3.1 Date despre naștere — `birth` (o singură înregistrare)
| Câmp | Etichetă UI | Valori |
|---|---|---|
| `birth_method` | Modul nașterii | `natural` Natural · `cesarean` Operație cezariană · `forceps` Natural cu forceps · `vacuum` Natural cu vacuum extracție |
| `gestational_weeks` | Termenul nașterii | 24–43 săptămâni |
| `birth_weight` | Masa la naștere | număr 1–10000, **g** |
| `head_circumference` | Circumferința craniană la naștere | număr 1–100, **cm** |
| `apgar` | Scor APGAR | 1–10 |
| `feeding` | Alimentație | `natural` Naturală · `artificial` Artificială · `mixed` Mixtă |
| `blood_group` | Grupa sangvină ABO | `A` · `B` · `AB` · `O` |
| `rh` | Rh | `positive` Pozitiv · `negative` Negativ |
| `congenital_conditions` | Boli congenitale depistate la naștere | text |
| `other_details` | Alte date importante | text |
| `development_age` | Vârsta la care se referă descrierea dezvoltării | text |
| `development` | Dezvoltare neuropsihică și motorie | text |

Niciun câmp nu e obligatoriu.

### 3.2 Vaccinări — `vaccinations`
| Câmp | Etichetă UI | Obligatoriu | Valori |
|---|---|---|---|
| `refusal` | Opțiunea privind vaccinarea | nu | `unknown` Nu am precizat · `none` Fără refuz declarat · `temporary` Refuz temporar · `categorical` Refuz categoric |
| `items[]` (R) | listă de vaccinuri: | | |
| `items[].name` | Vaccin | **da** | max 255 |
| `items[].date` | Data (dacă o cunoști) | nu | dată |
| `items[].dose` | Doză / rapel | nu | text |
| `items[].reaction` | Reacții după vaccinare | nu | text |
| `items[].notes` | Alte detalii | nu | text |

### 3.3 Intervenții chirurgicale — `surgeries` (R)
| Câmp | Etichetă UI | Obligatoriu | Valori |
|---|---|---|---|
| `name` | Denumirea operației | **da** | max 255 |
| `date` | Data (dacă o cunoști) | nu | dată |
| `period` | Data aproximativă sau vârsta | nu | text (ex. „la 4 ani”) |
| `complications` | Complicații (dacă au existat) | nu | text |

### 3.4 Alergii — `drug_allergies` (R)
| Câmp | Etichetă UI | Obligatoriu | Valori |
|---|---|---|---|
| `allergy_type` | Tipul alergiei | nu | `drug` Medicament · `food` Aliment · `respiratory` Alergen respirator |
| `name` | Medicament / aliment / alergen respirator | **da** | max 255 |
| `period` | Data aproximativă sau vârsta | nu | text |
| `manifestation` | Cum s-a manifestat alergia | nu | text |
| `resolution` | Cum a fost rezolvată | nu | text |

### 3.5 Boli cronice active — `chronic_conditions` (R)
| Câmp | Etichetă UI | Obligatoriu | Valori |
|---|---|---|---|
| `name` | Diagnostic | **da** | max 255 |
| `date` | Data (dacă o cunoști) | nu | dată |
| `specialist` | Specialistul care a stabilit diagnosticul | nu | text |
| `notes` | Alte detalii | nu | text |

### 3.6 Antecedente familiale — `family_history` (R)
| Câmp | Etichetă UI | Obligatoriu | Valori |
|---|---|---|---|
| `relationship` | Gradul de rudenie | **da** | max 255, text liber (ex. „Mamă”, „bunică maternă”) |
| `name` | Boală cronică / genetică | **da** | max 255 |
| `notes` | Alte detalii | nu | text |

### 3.7 Stil de viață și factori de risc — `lifestyle` (o singură înregistrare)
| Câmp | Etichetă UI | Valori |
|---|---|---|
| `activity` | Nivel de activitate | `sedentary` Sedentar · `active` Activ · `regular_sport` Sport regulat |
| `workplace` | Activitate profesională | text |
| `exposures` | Expunere la substanțe nocive / toxice | text |
| `smoking` | Fumat | text |
| `alcohol` | Alcool | text |
| `long_term_medication` | Medicamente administrate îndelungat | text |
| `notes` | Alte detalii | text |

### 3.8 Boli, accidente și traumatisme — `disease_history` (R)
| Câmp | Etichetă UI | Obligatoriu | Valori |
|---|---|---|---|
| `name` | Boală / accident / traumatism | **da** | max 255 |
| `date` | Data (dacă o cunoști) | nu | dată |
| `period` | Data aproximativă sau vârsta | nu | text |
| `notes` | Alte detalii | nu | text |

---

## 4. Documente încărcate (`patient_investigations`)

Tabelele din fișă: **Analize de laborator**, **Investigații imagistice**, **Investigații funcționale**, **Alte investigații** și **Date obiective clinice** (fotografii). Endpoint: `POST /patient/profiles/{id}/investigations`.

| Câmp | Etichetă UI | Obligatoriu | Valori |
|---|---|---|---|
| `type` | (tabul ales) / „Ce fotografie adaugi?” | nu (implicit `investigation`) | `analysis` Analize de laborator · `imaging` Investigații imagistice · `functional` Investigații funcționale · `investigation` Alte investigații · `nasal_left` Mucoasă nazală stângă · `nasal_right` Mucoasă nazală dreaptă · `eye_left` Conjunctivă ochi stâng · `eye_right` Conjunctivă ochi drept |
| `title` | Denumire | **da** | max 255 |
| `performed_at` | Data efectuării | **da** | dată, cel târziu azi |
| `notes` | Observații | nu | max 2000 |
| `file` | Fișier | **da** | max 20 MB; `jpg, jpeg, png, webp, pdf, doc, docx` |
| `consultation_request_id` | Consultația | nu; **da** pentru fotografii | consultație a acestui profil |

Reguli pentru fotografii (`nasal_*`, `eye_*`): fișierul trebuie să fie imagine și legat de o consultație încă deschisă (`new`/`accepted`, fără concluzie).

Completate automat: `uploaded_by`, `file_path`, `file_disk` (`local`, privat), `mime_type`, `file_size`. Fișierele se deschid prin link semnat.

---

## 5. Date colectate per consultație (legate de profil)

Nu stau în profil, dar apar în fișă la tabul „Consultații” / „Date obiective clinice”.

### 5.1 La crearea solicitării (pacientul)
| Câmp | Obligatoriu | Limită |
|---|---|---|
| `symptoms` (acuze) | **da** | max 4000 |
| `current_illness_history` (istoricul bolii actuale) | nu | max 4000 |
| `triage_notes` | nu | max 4000 |
| `scheduled_at` | nu | dată/oră în viitor |

### 5.2 Date obiective (`consultation_objective_data.payload`) — operator, aparat HIGO sau pacient
Vocabularul canonic (`ObjectiveDataSchema`). Valorile numerice sunt validate pe intervalul de mai jos; chei necunoscute trimise de aparat se păstrează nevalidate.

| Cheie | Etichetă | Unitate | Interval | Grup |
|---|---|---|---|---|
| `blood_pressure_systolic` | Tensiune sistolică | mmHg | 40–300 | Semne vitale |
| `blood_pressure_diastolic` | Tensiune diastolică | mmHg | 20–200 | Semne vitale |
| `heart_rate` | Puls | bpm | 20–250 | Semne vitale |
| `pulse_oximeter` | Puls măsurat cu pulsoximetrul | bpm | 20–250 | Semne vitale |
| `spo2` | SpO₂ | % | 50–100 | Semne vitale |
| `temperature` | Temperatură | °C | 30–45 | Semne vitale |
| `respiratory_rate` | Frecvență respiratorie | rpm | 4–80 | Semne vitale |
| `glucose` | Glicemie | mmol/L | 1–40 | Semne vitale |
| `weight` | Greutate | kg | 1–400 | Măsurători |
| `height` | Înălțime | cm | 30–250 | Măsurători |
| `grip_strength_right` | Dinamometrie mâna dreaptă | kg | 0–150 | Măsurători |
| `grip_strength_left` | Dinamometrie mâna stângă | kg | 0–150 | Măsurători |
| `abdominal_circumference` | Circumferință abdominală | cm | 1–300 | Măsurători |
| `ecg` | EKG | — | text | Examinare |
| `auscultation` | Auscultație | — | text | Examinare |
| `throat` | Examinare gât | — | text | Examinare |
| `ear` | Otoscopie | — | text | Examinare |
| `skin` | Tegumente | — | text | Examinare |
| `notes` | Observații | — | text | Examinare |
| `ear_left` / `ear_right` | Otoscopie ureche stângă / dreaptă | — | doar din aparat | Examinare |
| `auscultation_heart` / `_lungs` / `_abdomen` | Auscultație cardiacă / pulmonară / abdominală | — | doar din aparat | Examinare |
| `cough` | Tuse | — | doar din aparat | Examinare |

Media din aparatul HIGO (imagini/sunete) apare cu etichetele: Dermatoscopie, Orofaringoscopie, Otoscopie dreapta/stânga, Auscultația inimii, Auscultația plămânilor, Auscultație abdominală, Sunetul tusei.

Tabela `clinical_parameters` (parametri clinici configurabili din admin) există, dar **este goală** în baza locală.

### 5.3 Concluzia medicului (`consultations`)
`diagnosis` (**obligatoriu**), `treatment_plan`, `recommendations`, `investigation_recommendations`, `prescription_notes`, `current_illness_history`, `objective_exam`, `higo_reviewed` (da/nu), `prescription` (fișier pdf/jpg/png, max 10 MB) — toate text max 4000.

---

## 6. Nepotriviri găsite (de decis)

1. **Sex `Altul`**: backend-ul îl acceptă, formularele oferă doar Masculin/Feminin.
2. **Două câmpuri numite „Istoricul vieții”**: `medical_summary` (text liber din formular) și `life_history` (listă cu categorie + notă, endpoint `POST /patient/profiles/{id}/life-history`). Frontend-ul **nu apelează** endpoint-ul de `life_history`; doar afișează intrările vechi, dacă există.
3. **`patient_family_members`** (nume, tip, vârstă, relație) are endpoint-uri (`/patient/family-members`), dar **niciun ecran nu le folosește** — familia se gestionează acum ca profiluri de pacient separate. Tabel moștenit.
4. **`identity_number` (IDNP)** încă există în DB, deși nu se mai poate scrie. Rămâne de decis dacă se șterge sau dacă IDNP trebuie reintrodus.
5. **Contactul de urgență, detaliile adresei (bloc/scară/apartament/etaj) și pseudonimizarea** nu apar în dialogul de creare, ci doar ulterior în fișă.
6. **`PUT /patient/profile`** (setările contului) poate scrie și `birth_date`, `gender`, `address`, `emergency_contact`, `medical_summary` pe un profil de pacient al titularului — o a treia cale de a modifica aceleași câmpuri.
7. **Medicul nu poate completa fișa medicală** (doar titularul sau adminul). Dacă vrei ca medicul să adauge diagnostice cronice sau alergii descoperite la consultație, trebuie schimbat.
8. **Lipsesc câmpuri des întâlnite în fișele medicale**: IDNP/număr poliță CNAM, medicul de familie, greutate/înălțime de bază (există doar per consultație), medicamente curente separat de „Medicamente administrate îndelungat”, sarcină/alăptare, dizabilitate/grad de invaliditate.
