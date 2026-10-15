# Analiză și plan — Telemedconsult, 14 octombrie 2026

## Baza analizei și limite

Au fost analizate mesajul actual, cele cinci capturi, transcrierile din fișierul atașat și implementarea locală din `frontend/` și `backend/`. Transcrierile au repetiții și formulări probabil transcrise greșit; acestea nu sunt cerințe suplimentare. Mesajul actual are prioritate față de variantele anterioare din discuție.

Analiza codului confirmă existența unor mecanisme, nu funcționarea lor pe serverul clientului. Problemele raportate de client nu au fost reproduse într-o sesiune reală în această etapă. Nu s-au făcut modificări funcționale și nu s-au rulat teste, deoarece solicitarea este de analiză și planificare.

## Starea implementării web

Actualizare după implementare în proiectul local:

- Implementate: portofel de bază și portofel de bonusuri, procent la alimentare configurabil din admin, creditare numai după verificarea procesatorului, blocarea creditărilor duplicate și rambursarea corectă în portofelul de origine.
- Implementate: banner Telegram comun tuturor rolurilor, confirmarea conectării prin fluxul existent, notificări pentru mesaje cu link la conversația exactă și livrare prin coadă în configurațiile de producție. Telegram primește titlul evenimentului și un mesaj generic, fără conținutul medical al conversației.
- Implementate: submeniu Chat pe pacienți, grupare după titular/medic, contoare necitite separate, chat direct în fișa pacientului și navigare către fișă, consultație și apel. Listele și conversațiile respectă rolul activ; linkurile către consultații selectează fila potrivită.
- Implementate: istoricul bolii actuale separat de acuze, confirmarea lor de către titular înainte de publicare, observații medicale, previzualizare PDF, publicare, rețetă atașată și documente accesibile participanților prin linkuri cu durată limitată.
- Implementate: încărcarea parafei/semnăturii proprii, datele clinicii în antet și păstrarea versiunii publicate a documentului, inclusiv imaginea aplicată. Integrarea unei semnături electronice calificate nu este inclusă în această implementare.
- Implementate: completări gratuite de către medicul asociat, legate de documentul inițial, fără suprascrierea acestuia. Fereastra implicită este de 14 zile de la publicare; limita exactă este exclusivă la expirarea celor 14 zile. Durata este configurabilă în admin și se păstrează în versiunea consultației la publicare.
- Implementate: clasificare imagistică/funcțională, filtre pe specialitate/medic/dată, pseudonim cu codul pacientului și recuperarea parolei prin email pentru interfața principală.
- Implementate: propunere HIGO cu examinări concrete, ofertă calculată pe server și confirmarea titularului înainte de rezervarea suplimentului. Suplimentul se rezervă din portofelul de bază; costul deja rezervat se scade din ofertă. Operatorul este selectat automat și verificat pentru examinările cerute.
- Implementate: comandă de refacere a legăturilor istorice sigure și mutarea atașamentelor medicale vechi recunoscute din stocarea publică în cea privată. Inițializarea Docker o rulează după migrări. Înregistrările fără o asociere sigură nu sunt atribuite arbitrar.

**Configurare:** procentul bonusului la alimentare este implicit **0%**, până când adminul îl setează. Limita existentă de plată din bonusuri și regulile de afiliere sunt setări separate. Regula comercială de afiliere existentă a fost păstrată, fără inventarea unei promoții noi obligatorii.

**Verificare:** 324 de teste backend au trecut (1.550 de aserțiuni), verificarea TypeScript și compilarea interfeței au trecut, iar verificarea stilului fișierelor frontend modificate nu are erori. PDF-ul a fost verificat vizual pentru diacritice și conținut pe mai multe pagini. Interfața a fost verificată pe date demonstrative într-o bază separată: conectare, banner, cele două portofele, exemplul 1.000 + 100 la 10%, meniul pe pacienți, chat în fișă, consultație activă și previzualizare PDF. Testele vechi pentru portofele, verificarea repetată a emailului și cheile textelor publice au fost corectate după confirmarea aceleiași probleme în versiunea inițială.

**La lansare:** se instalează noua versiune și se rulează migrările, se setează procentul dorit în admin, iar medicii completează datele clinicii și încarcă parafa. Docker include biblioteca PDF și suportul pentru imaginile parafelor. Integrarea live cu MAIB, Telegram, HIGO și LiveKit trebuie verificată pe configurația serverului; testarea locală nu a efectuat plăți reale sau apeluri pe infrastructura de producție.

**Materiale și etape care rămân separate:** documentele juridice și decizia internă a clinicii trebuie furnizate/validate de client și jurist; tabelul exact de vaccinări menționat în discuție nu a fost primit; aplicația mobilă nativă rămâne etapa separată din plan. Documentele istorice fără PDF publicat nu sunt transformate automat în documente medicale oficiale cu o parafă aplicată retroactiv. Nu a fost adăugat un buton universal de copiere direct în email.

Analiza de mai jos descrie situația inițială și raționamentul planului.

## 1. Modelul de produs care rezultă din discuție

- **Utilizatorul** deține contul, primește notificările și gestionează unul sau mai mulți pacienți.
- **Pacientul** are propriul cod, fișa medicală, investigațiile, consultațiile și conversațiile asociate.
- **Chatul** servește la clarificări, coordonare și discutarea programării. Autorul unui mesaj este utilizatorul sau medicul; contextul conversației este pacientul.
- **Consultația online** înseamnă apel video în clarificarea clientului. Chatul nu încheie automat consultația.
- **Concluzia medicală** se completează în rubrica Consultație și este publicată ca document PDF, accesibil din istoricul pacientului.
- **Antecedentele / istoricul vieții** aparțin fișei pacientului și se actualizează în timp. Nu se reproduc integral în fiecare consultație.
- **Completarea consultației** este un document asociat consultației inițiale în fereastra de 14 zile; după expirare se creează o consultație nouă. Punctul de pornire și condițiile acestei ferestre trebuie stabilite.
- **Telegram** este recomandat, conform cererii actuale; utilizarea platformei rămâne posibilă fără conectare.

## 2. Ce există deja și ce lipsește

| Domeniu | Constatare în cod | Lucru necesar |
|---|---|---|
| Legătura chat–pacient | `Conversation` păstrează `patient_id` pentru cont, `patient_profile_id` pentru pacient și `consultation_request_id` pentru solicitare. | Organizare vizuală pe pacienți, navigare și verificarea conversațiilor vechi. |
| Chat în fișa pacientului | Istoricul consultațiilor oferă deja link spre conversația consultației. | Acces coerent la toate conversațiile pacientului și deschiderea lor în contextul fișei. |
| Identitatea din chat | `ChatView` afișează interlocutorul pornind de la cont; tipul local al conversației nu descrie profilul pacientului. | Numele pacientului și titularul contului trebuie afișate distinct. |
| Telegram | Există stare, link personal cu token, confirmare prin bot, preferințe, deconectare și mesaj de test. Paginile există pentru toate rolurile. | Banner comun inclusiv pentru administrator, folosirea fluxului existent și verificarea livrării. |
| Notificări interne | Evenimentele creează notificări în baza de date și încearcă Telegram. `AppEventNotification::via()` nu include emailul. | Nu promitem email ca rezervă până nu este implementat; verificăm separat actualizarea în timp real. |
| Fișă medicală | Există secțiuni structurate pentru naștere, alimentație, vaccinări, intervenții, alergii, boli, familie și stil de viață. | Ajustarea denumirilor, verificarea salvării și completarea clasificărilor cerute. |
| Cod pacient | Se generează un cod de șase cifre. | Afișare consecventă și opțiune explicită de pseudonimizare, care nu a fost identificată. |
| Conținut consultație | Solicitarea folosește `symptoms`; concluzia are și `current_illness_history`, dar formularul de finalizare nu îl editează. | Separarea istoricului bolii de acuze în formular, salvare, vizualizare și PDF. |
| Document medical | Finalizarea creează `MedicalDocument`, cu stare `ready_for_signature`. Există câmpuri pentru fișiere PDF. | Flux complet de generare, previzualizare, publicare și descărcare PDF. |
| 14 zile | Există limite pentru scriere/reactivare chat. | Completări medicale distincte; limita chatului nu le înlocuiește. |
| Programare și video | Există propunere de oră, acceptarea ei, pornirea consultației și integrare video. | Navigare reciprocă chat–fișă–consultație–apel și verificarea listelor/stărilor. |
| HIGO | Există examinări, fișiere, date obiective și solicitare de investigație suplimentară. | Stabilirea conversiei video → examinare HIGO, selecția examinărilor și coordonarea operatorului. |
| Bonus și afiliere | Există portofele, bonus de înregistrare și comision din alimentările invitaților; comisionul poate fi limitat la prima alimentare. | Reguli comerciale finale și extinderea mecanismelor existente unde este necesar. |

## 3. Etapa 1 — Probleme care împiedică utilizarea

### Consultații care nu apar la medic

Reproducere cu două conturi și cu un utilizator care gestionează doi pacienți. Urmărim aceeași solicitare în lista medicului, chat, fișă și apel. Verificăm medicul asociat, profilul pacientului, rolul activ, filtrele pe stări și actualizarea după acceptare/răspuns. Nu presupunem că un răspuns în chat este echivalent cu acceptarea: regula trebuie afișată și aplicată explicit.

**Acceptare:** solicitarea apare în lista potrivită înainte și după acceptare; chatul, fișa și apelul indică același pacient; reîncărcarea paginii păstrează situația corectă.

### Profil medic care nu se salvează

Verificăm salvarea descrierii problemelor tratate și a serviciilor oferite, cu textele folosite de client. În cod, profilul validează `bio` și `service_catalog`; captura arată o eroare de validare, fără suficiente detalii pentru stabilirea cauzei. Verificăm și câmpurile numerice/obligatorii care pot bloca salvarea întregului formular.

**Acceptare:** modificările persistă după reîncărcare și apar în catalog; erorile sunt în română și indică exact câmpul problematic.

### Acces și notificări

Verificăm pagina concretă folosită pentru „am uitat parola”: în API-ul interfeței principale nu a fost identificat un flux de resetare, deși backendul are Fortify și teste pentru resetare. Separăm accesul prin parolă de accesul prin cod email. Pentru Telegram verificăm conectarea contului corect, preferințele, configurarea botului, webhookul și evenimentele declanșate.

Observația despre butonul „Salvează secțiunea” a fost corectată ulterior chiar de client: nu modificase date. Nu o tratăm automat ca defect; îmbunătățim explicația stării inactive dacă este necesar.

## 4. Etapa 2 — Banner Telegram pentru orice utilizator

Un component comun, reutilizat în interfața tuturor rolurilor, inclusiv administrator. Condiția se bazează pe contul autentificat, nu pe pacientul selectat.

Text propus: **„Nu ai conectat Telegram. Pentru a primi notificări despre mesaje și consultații și a nu rata actualizările, îți recomandăm să îl conectezi.”** Buton: **„Conectează Telegram”**.

Butonul solicită linkul personal prin mecanismul existent și deschide botul. Conectarea se confirmă după acțiunea utilizatorului în Telegram, nu doar după deschiderea linkului. După revenire se actualizează starea și dispare bannerul. La deconectare reapare. Schimbarea rolului nu cere o conectare nouă.

Dacă botul este neconfigurat, nu afișăm un buton care nu poate funcționa. Dacă utilizatorul este conectat, dar are notificările dezactivate, afișăm o stare distinctă. Verificăm token expirat și bot blocat. Bannerul de conectare rămâne vizibil până la conectare, fără blocarea acțiunilor.

Notificările trebuie să deschidă conversația/consultația exactă. Propunere: Telegram primește mesaje scurte despre actualizare și link spre platformă; conținutul medical se consultă în cont.

## 5. Etapa 3 — Chat organizat pe pacient

### Pentru titularul contului

- Meniul „Chat” deschide un submeniu cu pacienții și numărul mesajelor necitite.
- Selectarea pacientului afișează conversațiile cu medicii acestuia.
- Selectarea medicului în lista generală deschide sublista pacienților pentru care există conversații cu el.
- În „Pacienții mei → pacient” se pot vedea conversațiile în secțiunea Consultații/Chat, cu legătură la consultația aferentă.

### Pentru medic

- În lista generală, titularul contului poate grupa conversațiile; apăsarea pe el deschide pacienții acelui cont.
- Canalul afișează pacientul ca subiect și textul „Cont gestionat de …” pentru interlocutor.
- Antetul oferă „Fișa pacientului”, „Consultația asociată” și acces la apel când starea permite.

Exemplu: **Ana → Eva P. · cod 435272 → consultația din 14 octombrie**. Conversația despre al doilea copil nu se amestecă aici.

Recomandare tehnică: păstrăm conversațiile asociate solicitărilor și le grupăm vizual pe pacient și medic. Nu unim toate mesajele într-un singur chat permanent: s-ar pierde contextul consultației și regulile existente de acces/reactivare. În același canal vizual se pot afișa episoadele distincte ale consultațiilor.

API-ul trebuie să permită filtrare după pacient și să furnizeze identitatea pacientului, titularul contului, medicul, consultația și starea. Aplicăm aceeași structură și în evenimentele în timp real. Pentru istoricul existent, asocierea se recuperează din solicitare când este sigură; cazurile fără o legătură sigură rămân de verificat, fără atribuiri arbitrare.

**Acceptare:** două profiluri sub același cont au mesaje și contoare separate; URL-ul și revenirea din fișă/video păstrează pacientul selectat; alt cont nu poate accesa conversația.

## 6. Etapa 4 — Consultația și PDF-ul final

Separăm formularul pacientului în **Istoricul bolii actuale** și **Acuze / simptome**. Medicul vede aceste rubrici separat și completează observațiile/examenul obiectiv, diagnosticul, tratamentul, recomandările, investigațiile recomandate și notele de rețetă.

Antecedentele se consultă din fișa pacientului; nu le copiem integral în documentul consultației. În document pot apărea observații relevante introduse explicit de medic.

Flux propus: **completare → previzualizare → confirmare/publicare → PDF în istoricul pacientului → notificare**. Prevenim publicarea dublă și debitarea repetată dacă utilizatorul reîncearcă după o eroare. Eșecul generării PDF trebuie să fie vizibil și recuperabil.

PDF-ul folosește modelul trimis ca referință de structură: antetul clinicii, medicul, data, identificarea pacientului, rubricile distincte și zona de parafă/semnătură. Nu copiem exemplele de examen normal ca valori implicite; conținutul trebuie confirmat de medic. Nu aplicăm automat siglele, ștampilele și semnăturile lui Igor altor medici.

În profilul medicului se încarcă imaginea proprie de parafă/semnătură, cu previzualizare. La publicare se păstrează versiunea imaginii și momentul aplicării pentru documentul respectiv. Schimbarea imaginii în profil nu schimbă PDF-urile deja publicate. Cerința privind valoarea oficială a documentului și tipul semnăturii trebuie verificată cu juristul clientului; aceasta nu este stabilită de simpla inserare a unei imagini.

Fișierele se servesc doar utilizatorilor autorizați. Datele publicate se păstrează ca versiune a consultației; editarea ulterioară a profilului nu rescrie documentul.

La rețetă adăugăm încărcare **PDF/JPG/PNG**, vizualizare și asociere cu consultația, plus mesaj standard despre comunicarea rețelei de farmacii pentru transmiterea originalului. Textul exact trebuie furnizat/confirmat de client.

La HIGO, medicul confirmă explicit că a examinat datele înainte de includerea afirmației în document. Imaginile, înregistrările audio și video rămân accesibile din fișă; PDF-ul le poate menționa fără să pretindă că le încorporează integral.

**Acceptare:** diacritice corecte, texte lungi fără suprapuneri, pagini multiple, rubrici goale gestionate, parafă lizibilă, descărcare autorizată, versiune stabilă și pacient corect.

## 7. Etapa 5 — Completări în 14 zile

Adăugăm document de completare cu referință la consultația inițială, autor, dată și PDF propriu. Consultația inițială rămâne păstrată; nu o suprascriem. Completările sunt afișate sub consultația de bază, în ordine cronologică.

Recomandarea de pornire este data publicării concluziei inițiale, dar trebuie confirmată cu clientul. Stabilim limita exactă, fusul orar, cine poate adăuga o completare și dacă are cost. Completarea nu prelungește automat fereastra inițială.

După expirare, interfața propune o consultație nouă. Arhiva rămâne vizibilă chiar dacă scrierea în chat nu mai este permisă. Regula documentelor și regula reactivării chatului se implementează separat.

## 8. Etapa 6 — Organizarea fișei, identitate și HIGO

- Grupăm antecedentele sub denumirea clară „Istoricul vieții / antecedente”. Verificăm structura vaccinărilor față de tabelul clientului, care nu este inclus în materialele analizate.
- Clasificăm documentele în analize de laborator, investigații imagistice și investigații funcționale; verificăm unde încadrăm documentele vechi.
- Adăugăm filtre de specialitate, medic și dată în istoricul consultațiilor. Păstrăm ordonarea cronologică.
- Introducem opțiunea de pseudonimizare, cu previzualizare, de exemplu „Eva P. · 435272”. Stabilim ce persoane și ecrane o aplică, inclusiv PDF-uri, chat, căutare, notificări și HIGO. Codul platformei nu se confundă cu IDNP; nu afirmăm că un prenume și o inițială fac pacientul anonim.
- Definim solicitarea HIGO indicată de medic: examinări concrete, operator, programare, confirmare, eventual cost suplimentar acceptat de titularul contului și întoarcerea datelor în consultație.
- Verificăm dacă ambii participanți pot iniția efectiv apelul în implementarea curentă și stabilim relația cu pornirea consultației de către medic. O înțelegere scrisă în chat nu trebuie să lase stările contradictorii.

## 9. Etapa 7 — Reguli comerciale și pregătirea lansării

### Promoție și afiliere

Sunt două mecanisme diferite: bonusul acordat celui care alimentează și comisionul acordat persoanei care l-a invitat. Nu le amestecăm cu bonusul existent de înregistrare.

**Clarificare confirmată de utilizator:** păstrăm două portofele distincte și afișăm separat soldurile și tranzacțiile:

- **Portofel de bază:** suma depusă efectiv de utilizator. O alimentare confirmată de 1.000 MDL adaugă integral 1.000 MDL aici.
- **Portofel de bonusuri:** bonusul acordat suplimentar pentru alimentare, calculat după procentul configurat în admin. La un procent de 10%, aceeași alimentare adaugă 100 MDL aici, fără să reducă suma din portofelul de bază.

În admin configurăm procentul bonusului la alimentare, cu posibilitate de dezactivare. Procentul de acordare a bonusului este separat de procentul permis pentru plata consultației din bonusuri și de comisionul de afiliere. Modificarea procentului se aplică alimentărilor confirmate ulterior; soldurile și bonusurile deja acordate rămân păstrate.

În ecranul de alimentare afișăm suma care intră în portofelul de bază și bonusul estimat separat. La confirmarea plății păstrăm procentul efectiv aplicat și legătura bonusului cu plata, pentru a preveni acordarea dublă la un callback repetat. În istoricul tranzacțiilor utilizatorul vede distinct alimentarea și bonusul primit.

Varianta anterioară de promoție specială la prima alimentare rămâne o posibilă regulă suplimentară, neconfirmată. Nu presupunem că mecanismul procentual cerut acum este limitat la prima alimentare sau la un singur medic. Condițiile de eligibilitate și limita de consum din bonusuri se stabilesc separat.

Pentru afiliere există variante încă nehotărâte: 10% la prima alimentare sau 3% la fiecare alimentare. Recomandarea este o regulă globală simplă pentru lansare, fără alegere per pacient până când clientul confirmă această complexitate. Corectăm exemplul din transcriere: 3% din 600 MDL este 18 MDL.

Testăm acordarea o singură dată, callback de plată repetat, medic neeligibil, sold insuficient, anulare și restituire. Confirmăm datele bancare și efectuăm plata de probă cerută de client înainte de lansare.

### Autentificare și documente de lansare

Pentru codul email, pregătim cod lizibil, introducere/lipire comodă și testarea mesajului în clienții folosiți. Un buton care copiază direct din email trebuie validat înainte de a fi promis; nu este criteriu obligatoriu de lansare.

Termenii, confidențialitatea și documentele interne ale clinicii trebuie aliniate la fluxul final și validate de juristul clientului. Discuția clientului despre legislație este o cerință de verificare, nu o concluzie juridică confirmată în această analiză.

Aplicația mobilă este o etapă separată după stabilizarea webului, conform ultimei orientări din capturi. Pentru estimare trebuie stabilite platformele, funcțiile, notificările push, apelurile și distribuția. Nu estimăm acum un termen ferm și nu concluzionăm compatibilitatea plăților cu regulile magazinelor fără verificare la momentul planificării.

## 10. Ordinea recomandată și validarea finală

1. Reproducerea și repararea problemelor de acces, salvare și vizibilitate a consultațiilor.
2. Banner Telegram pentru toate rolurile și verificarea notificărilor.
3. Chat pe pacienți și navigarea completă între chat, fișă, consultație și apel.
4. Rubrici separate, rețete și publicarea PDF-ului final.
5. Completări asociate consultației în 14 zile.
6. Clasificarea fișei, pseudonimizare și completarea fluxului HIGO.
7. Reguli comerciale confirmate, test de plată, documente de lansare și verificarea integrală.
8. Plan separat pentru aplicația mobilă.

Scenariul final de acceptare: un titular gestionează doi pacienți, solicită video pentru unul, discută cu medicul fără amestecarea mesajelor, confirmă ora, intră în apel, primește PDF-ul și o completare, vede corect istoricul și notificările; pentru celălalt pacient se verifică traseul cu HIGO/operator. Repetăm cazurile fără Telegram, cu Telegram conectat și cu notificări dezactivate. Verificăm și limita de 14 zile, accesul neautorizat și evitarea debitărilor duplicate.

## Decizii necesare înaintea etapelor dependente

1. Cele 14 zile pornesc de la apel, programare sau publicarea concluziei? Completările sunt gratuite și cine le poate emite?
2. Imagine de parafă/semnătură sau integrare de semnătură electronică validată pentru documentul final?
3. Unde se aplică pseudonimizarea și ce identificare rămâne obligatorie în documentul medical?
4. Valoarea inițială a procentului de bonus configurabil în admin, eventualele condiții de eligibilitate și limita de consum din bonus. Cele două portofele și acordarea procentuală suplimentară la alimentare sunt confirmate.
5. Afiliere 3% recurent sau 10% o singură dată; regulă globală sau alegere individuală?
6. Cine poate iniția apelul și care este pasul explicit de acceptare/programare?
7. Textul rețetei, tabelul vaccinărilor și materialele finale pentru antetul documentelor.

Aceste decizii nu împiedică investigarea problemelor existente, bannerul Telegram și organizarea chatului pe pacient.
