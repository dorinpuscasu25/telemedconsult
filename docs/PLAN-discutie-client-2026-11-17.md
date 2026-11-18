# Telemedconsult — cerințe și plan pe baza discuției cu clientul

Data analizei: **17 noiembrie 2026**. Aceasta este data analizei, nu o datare a înregistrării.

## Progresul implementării — 17–18 noiembrie 2026

Utilizatorul a autorizat ulterior implementarea succesivă a întregului plan.

**Clarificări confirmate direct în această sesiune:**

- Plata se decontează imediat după publicarea rezultatului, fără a aștepta recenzia (Q01).
- Procentul medicului se calculează din partea instituției: 500 MDL × 80% × 30% = 120 MDL (baza din Q02).
- Referalul medicului de 10% în puncte se acordă numai la prima alimentare (partea pentru medic din Q05).
- Profilurile gratuite existente devin și ele permanente; se păstrează un singur profil gratuit per cont (Q10).
- Referalul se afișează separat de performanță. Numai consumul efectiv pentru promovare contribuie la scor: 100 puncte consumate → 10 puncte de performanță (Q04).
- Varianta Android cerută este o PWA instalabilă din browser, folosind platforma actuală (Q14).
- La 18 noiembrie au fost aprobate explicit bibliotecile `setasign/fpdi` și `setasign/fpdf` pentru anexa PDF.
- La 18 noiembrie utilizatorul a amânat lucrul la taxa de drum. Răspunsul nu confirmă baza procentului contractual al operatorului; formulele existente nu au fost modificate în acest lot.

**Lotul de conturi și instituții — implementat local:**

- CT-01: instituția poate fi creată direct cu un utilizator existent ales ca manager sau cu un cont nou. Atribuirea utilizatorului existent păstrează datele de acces, rolurile și rolul activ; conflictele de afiliere anulează întreaga creare a instituției.
- CT-02/CT-03: comutarea între rolurile existente este verificată prin API; selectorul și lista adminului afișează „Manager instituție medicală”.
- CT-04: schimbarea parolei din admin păstrează accesul de manager. A fost corectat defectul prin care salvarea celorlalte roluri elimina rolul de manager.
- AD-01: numărul instituțiilor apare separat în dashboard; managerii au filtru propriu în utilizatori. Filtrarea este făcută pe server, înainte de paginare, iar interfața permite parcurgerea paginilor.
- IN-03: în înregistrarea medicului apare indicația privind contractul cu Clinica Pediatru dacă instituția nu este în listă.
- IN-11: adminul configurează separat cota fiecărei instituții. Câmpul nou `revenue_share_percent` este distinct de procentul medicului; cota se fixează în calculul programării și în suplimentele asociate.
- IN-07: managerul poate aplica procentul comun tuturor medicilor pentru programările noi, înlocuind explicit excepțiile individuale. Programările existente își păstrează procentele, inclusiv prin completarea contextului în înregistrările istorice care nu aveau cota salvată.
- AD-02, parțial: a fost adăugată iconița acțiunii „Trimite mesaj”. Verificarea completă a livrării administrative rămâne în lotul dedicat.

**Compatibilitate:** migrarea cotei instituției păstrează 85% pentru instituțiile existente, egal cu regula anterioară de 15% a platformei. La crearea unei instituții noi, formularul propune exemplul discutat 80% instituție / 30% medic; adminul și managerul pot modifica valorile. Migrarea este pregătită, fără aplicare pe baza aplicației sau pe producție.

**Lotul de publicare, decontare și recenzii — implementat local:**

- RE-01: rezultatul publicat este accesibil imediat în documente, fișă, export și chat, fără recenzie; plata se închide/decontează în tranzacția publicării. Eșecul generării PDF sau al salvării rețetei păstrează cererea nefinalizată și banii rezervați; plata nu este decontată pentru un rezultat incomplet.
- RE-02: prima recenzie eligibilă acordă 10 puncte, separat pentru medic și operator. Editarea, retrimiterea și recrearea unei recenzii șterse nu acordă punctele din nou. Bonusul se vede în portofel și în raportul administrativ de bonusuri.
- RE-03/RE-04: invitația la recenzie este vizibilă pacientului alături de document, fără blocarea lui; se pot evalua prestatorii separat. Textele din rezervare, rezumatul apelului și exemplul public descriu noua regulă.
- Monitorizarea inclusă și reactivarea ei rămân independente de plata închisă și de evaluare.
- Comanda existentă `consultations:settle` recuperează decontările consultațiilor istorice finalizate cu PDF publicat și bani încă rezervați, fără a aștepta recenzia și fără plată dublă.

**Lotul de profil gratuit și statistica pachetelor — implementat local:**

- AD-03: profilul gratuit nou este permanent, fără termen de expirare. Dreptul se consumă atomic o singură dată per cont și nu revine după ștergere. Consultațiile rămân cu plată.
- Profilurile gratuite existente au o migrare de eliminare a expirării; profilurile plătite își păstrează termenele. Activarea consultațiilor tratează gratuitatea permanentă distinct de expirarea unui pachet plătit.
- AD-04/ST-02, parțial: adminul vede gratuitățile folosite versus profilurile gratuite încă păstrate; pentru fiecare pachet vede cumpărări, locuri cumpărate, locuri utilizate și încasări. Profilul gratuit nu este introdus ca pachet cumpărabil repetat.

**Lotul de afiliere, promovare și clasament — implementat local:**

- BO-03: medicul primește 10% în puncte din prima alimentare efectivă eligibilă. Alimentările ulterioare și callbackurile repetate nu produc recompense noi. Operatorul păstrează circuitul separat în bani; pentru conturile cu ambele roluri se păstrează precedența existentă a operatorului.
- BO-04/PE-01: scorul primește 0,1 puncte de performanță pentru fiecare punct consumat efectiv prin afișările promovării. Rezervarea bugetului și returnarea punctelor neconsumate nu cresc scorul. Punctele primite din referal sunt afișate separat și nu sunt adunate direct la scor.
- PE-02: poziția proprie este vizibilă în dashboard, cu acces la lista completă a medicilor și scorurilor. Cabinetul medicului include panoul de referal și promovare.
- Adminul are rata distinctă a referalului medicului; migrarea schimbă vechea valoare a acestei reguli la 10%, cu versiunea anterioară păstrată în istoricul setărilor. Rapoartele nu mai etichetează toate referalele drept 3%.

**Lotul fișei și al datelor paraclinice — implementat local:**

- FI-02: exemplele includ spirometrie, gastroscopie și colonoscopie. Cele trei texte de ajutor sunt editabile în admin, prin mecanismul existent de conținut persistent.
- FI-03: selectarea fotografiilor/fișierelor deschide pregătirea încărcării; fiecare fișier cere denumire clinică și data reală a efectuării. Data nu mai este inventată din ziua încărcării. La eșec parțial, fișierele reușite nu sunt retrimise.
- FI-04–FI-09: naștere prin altă modalitate cu descriere, săptămâni 24–42, Apgar liber ca pereche, perioade distincte pentru alimentația naturală/artificială/mixtă, grupa și Rh vizibile împreună, dezvoltare la 6 luni/1/2/3 ani. Valorile istorice sunt păstrate; o valoare veche de 43 de săptămâni poate rămâne neschimbată când se editează alt câmp.
- FI-10/FI-11: detaliile introduse sunt vizibile pe cardurile alergiilor și bolilor. Salvările sunt ordonate, iar ultima modificare în așteptare este trimisă la închiderea secțiunii. Același mecanism de finalizare a salvării a fost aplicat datelor personale; erorile au mesaj și posibilitate de reîncercare.

**Lotul HIGO, concluzie și program — implementat local:**

- HI-01/HI-02: sincronizarea operatorilor depinde de configurarea tehnică HIGO, independent de ascunderea modulului comercial. Adminul și comanda existentă pot reîncerca/sincroniza operatorii lipsă; sincronizarea celorlalte entități continuă să respecte modulul. Verificarea a folosit răspunsuri externe simulate, nu conturi reale HIGO.
- AP-05/AP-06: formularul folosește „Observațiile medicului”; confirmarea HIGO nu mai cere alegerea unei examinări. Serverul verifică existența datelor asociate consultației și păstrează lista examinărilor confirmate în document. Previzualizarea și completările păstrează evidența corectă.
- PR-03: 00:00 ca oră de sfârșit înseamnă sfârșitul zilei; 00:00–00:00 este o zi completă. Afișarea orelor și acceptarea programării folosesc aceeași limită, inclusiv 23:30–00:00. Un interval invalid este explicat fără ștergerea programului anterior; salvarea programului este atomică.
- DO-05/DO-10/DO-11, parțial: denumire de medicament/substanță activă și încărcare de rețetă, fără al doilea câmp obligatoriu de dozaj/durată. Detaliile din ciornele vechi rămân vizibile pentru transfer în tratament. Mesajul abandonat despre farmacii nu mai este generat; pacientul vede instrucțiuni Ctrl+P/⌘+P și încadrare în pagină. Rețeta rămâne disponibilă separat. Anexarea tuturor paginilor în PDF-ul complet a fost finalizată în lotul din 18 noiembrie, descris mai jos.

**Lotul de geografie — implementat local:**

- GE-01/GE-02: țara de trai se alege din listă, la creare și editare. Moldova folosește catalogul de raioane/localități. Pentru străinătate există regiune/district, oraș și localitate introduse manual; localitatea este obligatorie, iar regiunea și orașul sunt flexibile. Identificatorii moldovenești nu sunt acceptați pentru o adresă străină.
- GE-03/GE-04: adminul vede Moldova / alte țări și distribuția profilurilor pe regiune, oraș și localitate. Raportul numără explicit **profiluri de pacient**, nu conturi. Codurile de țară și normalizarea spațiilor, majusculelor și diacriticelor în gruparea localităților reduc fragmentarea raportului; textul introdus nu este înlocuit în datele pacientului.
- Schimbarea țării cere o locație compatibilă și nu lasă date de catalog moldovenești la o adresă străină sau invers. Profilurile existente sunt păstrate; migrarea adaugă codul de țară și orașul, fără a ghici o adresă pentru profilurile din străinătate.

**Datele contractuale ale operatorilor — implementate local, fără schimbarea formulei de plată:**

- OP-02/OP-04, parțial: adminul gestionează separat persoană fizică/juridică, angajare/prestări servicii/freelancer și numărul contractului, direct din pagina operatorului. Operatorul vede datele în profil și nu le poate modifica prin endpointul administrativ. Modificarea unui operator nu îi afectează pe ceilalți.
- Profilurile existente nu primesc un contract presupus: noile câmpuri sunt nule până la completarea de către admin. Validările resping tipuri necunoscute și schimbarea datelor pentru un utilizator fără rol de operator.
- Combinațiile juridice permise și modelul contractual rămân de verificat pe documentele clientului. Procentul individual și baza remunerării rămân deschise până la răspunsul solicitat; acest lot nu schimbă decontările existente.

**Lotul public și Android — implementat local:**

- CT-07: manifest, iconițe, invitație de instalare oferită când browserul o permite și service worker pentru PWA. Pagina offline este neutră; workerul nu salvează răspunsuri API, documente sau pagini cu date medicale. Instalarea efectivă și apelurile pe un telefon Android rămân de verificat pe dispozitiv după publicarea într-un mediu HTTPS.
- PU-01/PU-02/PU-03: exemplul public folosește numele discutate Igor Pletoșu și Ecaterina Prepeliță, cu „de la 500 MDL”, chat 500, video+chat 600 și vizita operatorului 350. Acestea sunt exemplele de prezentare; nu s-au rescris tarifele medicilor. Asocierea fotografiilor și ortografia cu profilurile reale rămân de confirmat pe datele aplicației.
- PU-05: partenerii apar câte o singură dată, în card complet cu logo, nume, descriere și link direct când URL-ul există. Se respectă filtrul existent al partenerilor activi; nu s-a activat partenerul HIGO.

**Lotul PDF și rețetă — 18 noiembrie, implementat și verificat local:**

- DO-03: procesul-verbal și decizia au blocuri distincte și numere proprii în același PDF. Diagnosticul rămâne în procesul-verbal; tratamentul, recomandările, investigațiile și mențiunea rețetei intră în decizie. Decizia începe pe pagină nouă. Modelul juridic final rămâne de validat pe documentele clientului.
- DO-07: cu atașament real, decizia conține „Rețeta scanată pentru … este atașată în anexa nr. 1 la decizie.” Fără fișier, nu se generează o anexă sau o trimitere fictivă, inclusiv dacă un client vechi trimite doar indicatorul `has_prescription`.
- DO-08: toate paginile PDF-ului rețetei sunt adăugate după întreaga parte medicală, cu dimensiunile și orientarea lor. O fotografie PNG/JPEG devine o pagină potrivită proporțional, fără tăiere. Orientările uzuale EXIF ale fotografiilor din telefon sunt respectate; dacă orientarea nu poate fi păstrată, se cere un format compatibil.
- DO-09: descărcarea separată livrează fișierul original, identic octet cu octet, inclusiv pentru rețete PDF. Completările ulterioare nu repetă anexa și nu modifică originalul documentului de bază.
- Previzualizarea primește fișierul efectiv încărcat și include aceeași anexă ca publicarea, fără a salva documente ori a deconta plata. Fișierele invalide au mesaj vizibil, atât la selecția din formular, cât și la validarea serverului.
- PDF-urile protejate, incompatibile, cu formulare/adnotări sau peste 100 de pagini sunt respinse cu indicație de export static ori folosire JPG/PNG; nu se elimină tacit conținutul lor din anexă. Limitele sunt 10 MB per fișier și 16 megapixeli pentru fotografie. Originalul nu este modificat pentru a forța compatibilitatea.
- Eșecul pregătirii/salvării rețetei sau al salvării PDF-ului combinat nu finalizează cererea și nu decontează plata. Fișierele scrise în timpul unei salvări eșuate sunt curățate în serviciul de publicare.
- Au fost instalate doar cele două pachete aprobate: FPDI 2.6.10 și FPDF 1.9.0, fixate în `composer.lock`. Nu s-au schimbat alte versiuni de pachete.
- Verificare vizuală prin randare PNG: proces-verbal, decizie, rețetă PDF în două pagini de dimensiuni/orientări diferite și fotografie. Exemplul de revizuire este `output/pdf/consultatie-demo-anexa.pdf`, cu date exclusiv demonstrative. Testul unei consultații lungi confirmă că anexa urmează toate paginile medicale, fără poziție fixă „pagina 3”.

**Lotul de programare, apel și administrare — 18 noiembrie, implementat local:**

- PR-01/PR-04: un program salvat cu toate zilele oprite nu mai cade pe orele implicite. Orele libere, limita zilei și suprapunerile respectă durata serviciului ales. Durata deja rezervată rămâne cea din programare, chiar dacă medicul modifică ulterior serviciul. Intervalele adiacente sunt permise; suprapunerile sunt comparate până la secundă.
- PR-05: o consultație veche fără recenzie nu mai blochează crearea alteia. Selectorul explică lipsa orelor și eșecul încărcării și recere orele la schimbarea serviciului.
- PR-06, parțial: crearea programării revalidează disponibilitatea sub blocarea prestatorului, înainte de debitare. Acceptarea orei propuse folosește aceeași blocare și recitește propunerea curentă. Acțiunile de propunere, retragere, păstrare și cerere de alte ore sunt serializate pe cerere, astfel încât o copie veche din pagină nu redeschide o consultație anulată. Retragerea reprogramării unei consultații confirmate nu reactivează termenul inițial de răspuns. Testele simulează ocuparea/starea schimbată între citiri; proba SQL cu cereri simultane și auditul celorlalte fluxuri de atribuire/transfer rămân în acceptanța integrată.
- AP-07, parțial: pacientul și medicul folosesc același cronometru calculat de la începutul apelului înregistrat de server, inclusiv după reconectare și la trecerea peste miezul nopții. După expirare se afișează explicit „Depășire +00:31”, fără cronometru negativ sau taxare nouă. Închiderea efectivă pe două dispozitive rămâne probă reală de apel.
- AD-02: inboxul se actualizează și când inițial nu există conversații. După confirmarea trimiterii, un eșec al reîncărcării nu mai produce mesaj fals de trimitere eșuată sau retrimiterea ciornei. Răspunsurile întârziate ale altei conversații/pagini nu înlocuiesc selecția curentă. Ciorna rămâne la trimitere neconfirmată; formularul este blocat cât timp se trimite. API-ul are răspunsuri private fără cache și teste de comunicare admin ↔ medic/operator/manager, notificare internă și necitite.
- AD-10, parțial: setările pentru medici noi, reclamații și cereri de plată controlează notificările administrative interne și Telegram, păstrând înregistrările în liste. Sunt vizați adminii activi și categoria potrivită. Cererile operaționale de schimbare a instituției păstrează notificarea existentă. Livrarea externă Telegram rămâne de probat pe conturile reale.
- AD-08/AD-09: perioada cererilor de plată către platformă folosește zilele configurate și data Chișinăului, atât în API, cât și în interfața medicului. Setările resping zile fracționare, în afara lunii și intervale inversate înainte de scrierea altor valori. Plățile instituției către propriii medici rămân independente. Setările explică separat monitorizarea și cererile de plată.
- AD-09: valoarea implicită video este 600 lei pentru profil nou/fără valoare explicită. Tarifele existente, inclusiv 500 lei sau zero, și setările particulare ale platformei nu sunt rescrise.
- PU-04: cabinetul medicului folosește prezentarea comună cu fotografii, păstrând audiența pentru medici și marcajele de noutate. Adresele vechi ale coperților din stocarea locală, inclusiv cele cu localhost, sunt rezolvate la adresa publică actuală la citire; nu se rescriu datele salvate și nu se schimbă adresele externe.
- A fost reprodus și reparat un defect al buildului: configurația `runtime-env.js` era încărcată după modulul principal, care rămânea cu adresa API din build. Configurația se execută acum înaintea aplicației. Verificarea locală folosește adresa API din configurarea mediului.

**Lotul de raportare financiară — 18 noiembrie, implementat local, parțial:**

- ST-01/ST-04/ST-06: alimentările confirmate sunt separate de cele în așteptare, vânzările pachetelor, soldurile portofelelor, leii rezervați, sumele decontate, sumele cuvenite prestatorilor și transferurile efectuate. Alimentările și vânzările nu se adună ca două venituri pentru aceeași sumă.
- Totalurile consultațiilor provin din toate cererile decontate, nu doar din ultimele 200 de tranzacții afișate. Lista arată explicit numărul operațiunilor din previzualizare și faptul că filtrele ei sunt locale listei. Cererile de plată ale instituției către medic nu intră din nou la plățile platformei.
- ST-09: fila Servicii include serviciile configurate de medici după identitatea păstrată la programare, cu frecvență, tarif nominal, lei, puncte, promoție, prestatori și partea rămasă platformei. Redenumirea, schimbarea prețului sau ștergerea serviciului nu șterg și nu dublează istoricul. Sunt vizibile denumirile folosite în trecut, iar servicii distincte cu același nume nu sunt comasate. Există filtru pe serviciu. Filtrele pe perioadă/instituție au fost completate în lotul următor; verificarea integrată a tuturor cabinetelor rămâne deschisă.
- Serviciile suplimentare ale operatorului și reactivările chatului sunt raportate separat, din tranzacțiile lor efective, și incluse o singură dată în totalurile medicale. Tranzacțiile în puncte nu sunt afișate ca MDL.
- Istoricul fără clasificare completă este semnalat; nu se ghicește dacă era numerar sau puncte. Partea rămasă platformei nu este prezentată ca profit net după bancă/rezervă. Ratele, durata și eliberarea rezervei bancare rămân neconfirmate și neimplementate în acest lot.
- Eșecul încărcării raportului are mesaj și reîncercare. Validarea unei plăți păstrează formularul și explicația, iar salvarea repetată este blocată în timpul procesării.

**Lotul filtrelor financiare, instituțiilor și circuitului punctelor — 18 noiembrie, implementat local:**

- ST-03/ST-04/ST-09: raportul adminului are filtre de început/sfârșit și instituție, validate pe server și păstrate în adresă. Se aplică înainte de totalizare și paginare, inclusiv pentru serviciile suplimentare, bonusurile asociabile, tranzacții și cereri de plată. Un capăt al perioadei poate lipsi. Zilele sunt interpretate în Chișinău, cu limita superioară exclusivă la începutul zilei următoare.
- Decontările folosesc data ledgerului instituției sau data tranzacției de decontare a prestatorului. Pentru istoricul fără aceste rânduri se folosește data finalizării, apoi data creării. O consultație creată/programată în altă lună și decontată ulterior intră în perioada decontării. Lista recentă este ordonată după această dată, cu ID drept departajare.
- IN-06/ST-03: fila Instituții arată totalul de plată către instituție, partea medicilor, partea proprie a instituției și contribuția consultațiilor de bază la suma rămasă platformei. Ledgerul istoric are prioritate la atribuire; transferul medicului nu mută venitul vechi, iar snapshotul cu instituție explicit nulă rămâne independent. Pentru aceeași instituție/perioadă, testele compară sumele direct cu API-ul managerului.
- Soldul instituției și cererile curente sunt calculate din întreaga evidență și etichetate distinct de rulajul perioadei. O instituție selectată fără decontări în perioada aleasă își păstrează soldul curent în tabel. Veniturile zero ale prestatorului sunt păstrate în raport, inclusiv suplimentele operatorului cu cotă zero. Diferențele dintre cereri și ledger sunt semnalate, fără rescrierea evidenței.
- Alimentările și vânzările de pachete nu sunt atribuite unei instituții prin afilierea actuală a unui cont. În selecția unei instituții aceste valori sunt inaplicabile și ascunse, iar API-ul le întoarce nule. Soldurile personale sunt identificate ca stocuri curente ale întregii platforme. Bonusurile unei instituții includ numai operațiunile legate explicit de consultațiile ei; promovarea nu primește o afiliere presupusă.
- ST-04: plățile efectuate se filtrează după data transferului (cu data procesării/creării drept compatibilitate istorică); cererile neplătite se filtrează după data depunerii. O valoare aprobată explicit zero nu mai este înlocuită vizual cu suma cerută.
- Istoricul financiar are paginare de 200 de tranzacții, cu ordine stabilă după dată și ID. Pot fi parcurse și operațiunile mai vechi, păstrând perioada și instituția; totalurile rămân pentru întreaga selecție. Căutarea și tipul din listă sunt etichetate ca filtre ale paginii curente.
- ST-07/ST-08: raportul punctelor separă emiterile identificate pe surse, transferurile pacient → medic, restituirile din servicii/promovare, consumul pentru servicii, consumul efectiv al afișărilor și rezervele curente. Emiterile și mișcările includ numai operațiuni confirmate din portofelele efective de puncte/promoție. Un marcaj istoric greșit al tipului portofelului nu transformă punctele în lei.
- Distribuția soldurilor curente numără fiecare cont o singură dată: pacient fără rol medical, medic fără rol de operator, operator fără rol de medic, cont medic și operator și alte conturi. Numărul de conturi este distinct de numărul portofelelor. Rolul activ din interfață nu schimbă grupa, iar însumarea grupelor reproduce soldurile globale de puncte și promoție.
- Transferurile și restituirile nu sunt contorizate ca emisii noi. Mișcările pozitive/negative cu tip istoric necunoscut au tabel separat și nu sunt clasificate automat drept bonus nou sau consum cunoscut. Testul circuitului reconciliază emiterile și ajustările necunoscute cu soldurile, rezervele și consumul, fără a scădea din nou punctele transferate medicului.
- UI: aplicarea/resetarea filtrelor, paginarea și navigarea Înapoi păstrează selecția corectă; răspunsurile întârziate ale selecției anterioare sunt ignorate. Un eșec al reîncărcării păstrează eticheta selecției afișate și blochează procesarea plăților până la recuperare. Filtrele invalide din adresă pot fi resetate chiar dacă încărcarea inițială a eșuat. Datele sunt afișate în Chișinău și pe un dispozitiv configurat într-un alt fus orar.
- A fost corectată explicația veche din raportul managerului: decontarea urmează publicării rezultatului, cu recenzie opțională.

**Dovezi de interfață:** mesageria administrativă a fost probată în browser pe desktop/mobil, inclusiv inbox inițial gol, răspuns confirmat urmat de eșec la reîncărcare și recuperare. Imaginile noutăților pentru medic au fost probate în Chrome și Edge. Raportul financiar a fost probat pe desktop/mobil: filtru de serviciu, nume istorice, unități pentru puncte, validare de plată și reîncercarea încărcării. Eșecul citirii inițiale nu mai afișează solduri fictive de zero. Filtrele, navigarea între pagini, recuperarea erorilor și circuitul punctelor au fost verificate vizual în browser; există capturi suplimentare `financiar-filtre-institutii-*` și `financiar-circuit-puncte-*` în același director. Probele folosesc date demonstrative și API local simulat, cu cererile externe blocate; nu reprezintă verificare pe producție sau livrare reală de notificări. Capturi în `output/qa/`. Fonturile externe au fost blocate în această probă izolată.

**Validare:** ultima suită completă backend a trecut cu **642 teste / 4.526 aserțiuni**. Au trecut Pint, TypeScript, ESLint fără erori și buildul Vite, plus **8 teste frontend** (PWA și cronometru). ESLint păstrează avertismente despre Fast Refresh, dependențe de hook și aserțiuni non-null; buildul avertizează despre Browserslist și dimensiunea pachetelor JavaScript. PDF-ul demonstrativ a fost verificat vizual în lotul precedent. Verificarea vizuală integrală pe toate rolurile și integrările reale HIGO/MAIB/Telegram/apel rămân deschise.

**Starea datelor și a lansării:** cele cinci migrări sunt pregătite și verificate în baza izolată de teste; baza aplicației și producția nu au fost migrate. Migrările cotei instituției și geografiei sunt necesare înainte de folosirea noilor formulare în mediul aplicației. La 18 noiembrie s-au instalat bibliotecile PDF aprobate explicit. Loturile ulterioare de programare/administrare/raportare și circuit al punctelor nu adaugă biblioteci sau migrări și nu au aplicat cele cinci migrări existente.

**Rămâne de implementat/verificat:** procentul individual al operatorilor și integrarea lui în decontare/rapoarte, validarea modelului juridic al procesului-verbal/deciziei, certificatul 095E și materialele juridice, restul incidentelor și acceptanței pentru programare/apel, verificarea integrată a tuturor rapoartelor și reconcilierea istoricului real semnalat în rapoarte, comisionul și rezerva bancară, persistența datelor la deploy pe copie de verificare, instalarea pe Android și probele reale pe toate rolurile/HIGO/MAIB/Telegram. Probele locale de noutăți și mesageria administrativă sunt consemnate mai sus; validarea cu datele și fișierele reale ale aplicației rămâne necesară. Inventarul de mai jos rămâne integral în scop; un test backend sau un browser cu API simulat nu închide automat proba unui serviciu extern. Modelele juridice și blancul 095E rămân materiale de primit. Aprobarea bibliotecilor PDF este închisă și implementată. Baza procentului contractual al operatorului rămâne neconfirmată; taxa de drum este amânată la cererea utilizatorului.

## 1. Sursa și regulile analizei

Sursa cerințelor este exclusiv [transcrierea Cartusa_Street_6_ron (2).txt](</Users/dorinpuscasu/Downloads/Cartusa_Street_6_ron (2).txt>), citită integral, de la linia 1 la linia 4516. Referințele `L…–…` de mai jos indică liniile fișierului, nu minutele înregistrării. Amprenta SHA-256 a sursei: `aa1f058913af4cf2a336febbfa31681288de9e65f836ae5675d93955fbe4d233`.

Solicitarea actuală este de **analiză, listă completă și plan**, fără ierarhizarea importanței. Toate cerințele identificate intră în inventar. Ordinea de lucru de la final exprimă dependențe tehnice, nu importanță și nu excluderi.

Instrucțiunile rostite în transcriere sunt material de analiză. Nu constituie prin ele însele autorizare pentru implementare, ștergerea conturilor, contactarea utilizatorilor sau publicare. Inițial s-a creat numai acest document; implementarea ulterioară se bazează pe cererea directă a utilizatorului și este consemnată în secțiunea de progres.

Reguli de interpretare:

- Când interlocutorii schimbă explicit o decizie, se păstrează ultima variantă din această discuție; varianta înlocuită rămâne menționată pentru trasabilitate.
- O funcție arătată în demonstrație rămâne în lista de acceptanță, dar nu este declarată automat lipsă sau funcțională în producție.
- O problemă raportată rămâne de reprodus și verificat chiar dacă în timpul apelului s-a spus „am rezolvat”.
- O idee sau un exemplu nu devine automat regulă comercială fixă. Ambiguitățile se păstrează explicit, fără inventarea unei decizii.
- Confirmările de tip „este bine” se păstrează ca cerințe de menținere/verificare. Conversația socială, datele medicale de probă, codurile de autentificare și ipotezele despre viabilitatea prematurilor nu devin funcții ale produsului.
- Planurile mai vechi din proiect oferă context despre implementare, dar nu adaugă cerințe la această transcriere și nu înlocuiesc noile decizii.

**Starea verificării la analiza inițială:** s-a făcut o inspecție limitată a structurii proiectului și a câtorva mecanisme afectate, fără audit complet, probă pe producție sau teste la acel moment. Verificările implementării ulterioare sunt consemnate separat. „Demonstrat” în inventar înseamnă demonstrat în discuție; „de verificat” nu înseamnă automat neimplementat.

## 2. Deciziile și diferențele care trebuie reflectate în implementare

| Subiect | Concluzia acestei discuții | Ce înlocuiește sau ce rămâne de stabilit |
|---|---|---|
| Recenzie și rezultat | Recenzia este **opțională**; pacientul vede imediat rezultatul publicat. Primește **10 puncte** pentru recenzie, separat pentru medic și operator când ambele servicii există. | Înlocuiește condiționarea rezultatului de recenzie. Variantele inițiale „obligatoriu” și „30 de puncte” sunt abandonate în aceeași discuție. L1265–1439, L2648–2651. |
| Decontare | Scoaterea obligativității recenziei afectează și plata, deoarece codul actual le leagă. | Momentul exact al decontării fără recenzie nu este stabilit explicit în această discuție. Trebuie decis și testat; nu este suficientă schimbarea butonului. |
| Platformă → instituție | Adminul setează procentul **pentru fiecare instituție**. Exemplul final este 80% instituției și 20% platformei. | 75% este discutat anterior, apoi 80%; esența cerinței este configurabilitatea, nu un procent global fix. L245–257, L3293–3365. |
| Instituție → medici | Managerul setează procentul medicilor; în această discuție se cere aceeași setare pentru toți medicii instituției. Exemplu: 30%. | Nu se confundă cu procentul acordat instituției de platformă. Baza exactă a celor 30% și efectul schimbării asupra excepțiilor existente trebuie clarificate. L344–365, L3335–3365. |
| Operatori | Adminul configurează relația contractuală și procentul **fiecărui operator**; operatorul le vede în cabinet. | Exemple: 30% angajat, 40%/50% prestator. Referalul de 3% este mecanism separat. L4343–4469. |
| Profil gratuit | Profil de 0 lei, vizibil în admin și statistică, cu **valabilitate permanentă**. | Înlocuiește durata de un an din implementarea inspectată. Numărul de acordări gratuite per cont nu este renegociat aici. L3680–3725. |
| Examen HIGO în concluzie | Alegere explicită: examinarea nu a fost efectuată / a fost efectuată și medicul a consultat datele. | În formularul concluziei nu se mai cere selectarea fiecărei examinări. Asocierea tehnică la pacient și date rămâne necesară. L1958–1991. |
| Rețetă | Fișier scanat/fotografiat, inclus ca anexă în PDF-ul consultației și disponibil separat pentru descărcare/printare. | Nu se repetă tratamentul într-un al doilea text de rețetă. Se elimină mesajul vechi despre transmiterea rețetei printr-o rețea de farmacii. L2804–3023. |
| AI pentru rețete | Ideea este discutată, apoi se optează pentru încărcarea rețetei de către medic și instruirea medicilor. | Integrarea Gemini/AI nu este o cerință confirmată de implementare în această discuție. L2006–2096, L2174–2186. |
| Program până la 00:00 | Este raportat că setarea marchează ziua ca liberă și blochează programarea. | Trebuie definită și afișată semnificația sfârșitului de zi; nu se consideră rezolvat prin explicația verbală. L1679–1748. |
| Fereastra de completări | În admin este menționată/setată durata de 10 zile; fereastra inclusă după consultație este menționată ca 72 h. | Chatul inclus, reactivarea, completările documentului, accesul la fișă și decontarea sunt reguli distincte. L1382, L3998–4028. |
| Clasament | Medicii văd poziția proprie, punctele și **lista completă** cu numele colegilor. Clientul rămâne și el în top. | Cererea de a-l ascunde este retrasă. Transferul premiului către locul 4 este descris ca gest al clientului, nu automatizare cerută. L4052–4127. |
| Parteneri | Card complet din prima: logo, text și buton de site; fără dublarea afișării. | Varianta cu selecție și panou secundar este abandonată în favoarea prezentării directe. HIGO rămâne ascuns conform setării clientului. L3635–3638, L3851–3893. |

### Constatări punctuale în codul actual

Aceste constatări ajută la localizarea schimbărilor; nu constituie o verificare completă a funcționării:

- `backend/app/Services/ConsultationResultAccess.php` condiționează accesul de închidere și recenzii complete. `ConsultationSettlement.php` condiționează decontarea de recenzii. `ConsultationResultGateTest.php` verifică tocmai regula veche. Trebuie schimbate coerent accesul, stările, plata și testele.
- `backend/app/Services/FinancialBreakdown.php` folosește în ramura instituției 15% fix pentru platformă; `InstitutionLedger.php` aplică procentul medicului sumei prestatorului. Noua configurare și baza salariului necesită tratare explicită.
- `backend/app/Http/Controllers/Api/PatientProfileController.php` expune `validity_years: 1` pentru profilul gratuit. Permanentizarea trebuie verificată și în calculul expirării, validările de programare și interfață.
- Există module pentru instituții, transferuri, mesaje administrative, HIGO, promovare, clasamente și documente. Planul cere verificarea/adaptarea lor, nu reconstruirea automată de la zero.
- Documentul anterior `docs/PLAN-discutie-client-2026-11-13.md` folosește altă transcriere și consemnează reguli diferite. Se păstrează ca istoric; acest plan descrie ținta rezultată din fișierul actual.

## 3. Inventarul complet al cerințelor

Identificatorii sunt folosiți și în planul de lucru și în acceptanță. Fiecare rând are aceeași importanță în scopul cerut. Un rând poate reprezenta o schimbare, un defect de investigat sau o funcție demonstrată care trebuie păstrată și verificată.

Inventarul conține **129 de puncte în 16 domenii**. Planul le acoperă prin **12 pachete de lucru**, iar **17 clarificări/materiale** sunt consemnate separat. Cele 129 de puncte nu înseamnă 129 de funcții lipsă: includ și menținerea/verificarea funcțiilor demonstrate.

### CT — Conturi, roluri și acces

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| CT-01 | La atribuirea managerului se caută și selectează un utilizator existent; dacă nu există, se poate crea din același flux. Demonstrat. | Căutarea găsește contul, iar atribuirea nu creează un duplicat. Crearea unui cont nou funcționează. | L47–83, L146–158. |
| CT-02 | Un cont poate avea roluri de pacient, medic și manager, cu același email și comutare între cabinete. Demonstrat. | Schimbarea rolului deschide cabinetul corect și aplică permisiunile acelui rol. | L65–89, L155–194. |
| CT-03 | Denumirea rolului în selector: „Manager instituție medicală”. | Textul exprimă funcția persoanei; instituția rămâne entitate separată de utilizator. | L164–176, L3182–3197. |
| CT-04 | Adminul poate schimba parola managerului. Confirmat verbal. | Acțiunea există pentru contul corect și noua parolă permite accesul. | L128–140. |
| CT-05 | Numărul de telefon este unic la nivel de cont; duplicatele istorice trebuie tratate. Problemă discutată în timpul deployului. | Normalizarea și unicitatea sunt coerente la creare/editare. Conturile reale nu se șterg automat; conflictele sunt inventariate pentru rezolvare controlată. | L1514–1535. |
| CT-06 | Autentificarea prin cod email și opțiunea „Ține minte acest dispozitiv 30 de zile” trebuie să funcționeze. Demonstrat/aprobat. | Codul este trimis contului corect; opțiunea persistă conform duratei afișate. | L275–308, L794–803. |
| CT-07 | Instalarea/utilizarea ca aplicație pe Android este o solicitare deschisă. | Se stabilește forma livrabilului: PWA instalabilă sau aplicație dedicată; apoi se verifică instalarea și deschiderea. Nu se declară cererea eliminată. | L410–431. |

### IN — Instituții medicale și manageri

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| IN-01 | Instituția are denumire, date juridice, IDNO, IBAN, bancă, email, telefon, adresă și stare activă. Demonstrat. | Datele se salvează și apar coerent în admin și cabinetul instituției. | L113–119, L3257–3260. |
| IN-02 | Medicul alege instituția la înregistrare, iar managerul acelei instituții aprobă cererea. Demonstrat. | Înainte de aprobare nu poate presta ca medic aprobat; după aprobare are acces în instituția aleasă. | L311–326. |
| IN-03 | Dacă instituția nu este în listă, se afișează indicația de a solicita un contract de la Clinica Pediatru. | Înregistrarea oferă indicația și o cale de contact; nu atribuie automat o afiliere neacceptată. Textul/contactul exact rămân de completat. | L329–338. |
| IN-04 | Managerul poate invita un medic prin email și poate crea manual un cont, conform demonstrației. | Invitația acceptată conduce la instituția corectă; crearea manuală nu dublează conturile existente. | L200–203, L380. |
| IN-05 | Cabinetul instituției include Acasă, Medici, Cereri, Rapoarte, Plăți, Setări, Mesaje, Noutăți și Telegram, cu etichete traduse. | Nu apar chei tehnice precum „file”/„transferuri” în locul meniurilor corecte; datele corespund instituției active. | L191–203, L371–401. |
| IN-06 | Managerul vede venitul instituției, activitatea și rapoartele fiecărui medic. Demonstrat. | Totalurile instituției se reconciliază cu detaliile pe medici și perioada aleasă. | L341–383. |
| IN-07 | Managerul setează procentul comun pentru toți medicii instituției; exemplu 30%. | Setarea are efectul declarat pentru toți medicii vizați; interfața precizează baza și momentul aplicării. | L344–365, L3365. |
| IN-08 | Instituția cere transfer de bani de la platformă/superadmin. Demonstrat. | Soldul disponibil, cererea, aprobarea și plata sunt distincte; la sold zero nu se cere o sumă pozitivă. | L383–395. |
| IN-09 | Managerul poate modifica informațiile instituției în limitele permise. Demonstrat. | Modificările persistă și nu permit acces la altă instituție. | L383–401. |
| IN-10 | Superadminul poate atribui/corecta instituția unui medic în așteptarea aprobării. Demonstrat pentru o cerere existentă. | Cererea ajunge în fluxul instituției corecte; afilierea și aprobarea nu sunt confundate. | L1559–1568, L3242–3248. |
| IN-11 | Adminul setează procentul instituției, separat de procentul medicilor; eticheta trebuie să spună „Procent pentru instituție”. | Două instituții pot avea cote diferite. Exemplul 80%/20% se reflectă în calcule și rapoarte, fără câmp etichetat greșit „implicit pentru medici”. | L3293–3365. |

### PR — Programări și disponibilitate

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| PR-01 | Investigați de ce un medic aprobat, cu profil actualizat și acceptare activă, nu apare disponibil. Remedierea este anunțată în apel, dar necesită confirmare. | Medicul eligibil apare și poate fi rezervat; lipsa programului sau alt impediment are explicație exactă. | L449–479, L1151–1154, L1631–1646. |
| PR-02 | Orele serverului, programul medicului și selecția pacientului trebuie să fie coerente. Fusul orar a fost suspectat, fără confirmarea cauzei. | Aceeași programare are același moment în toate cabinetele; conversia UTC/ora locală și schimbarea zilei nu ascund intervale valide. | L746–779. |
| PR-03 | Sfârșitul programului la 00:00 nu trebuie să transforme neclar ziua în liberă. | Interfața definește dacă este sfârșit de zi sau începutul zilei următoare; respinge/explică intervalele ambigue și salvează corect programul. | L1679–1748. |
| PR-04 | Pacientul poate alege serviciul, data și ora, inclusiv pentru ziua curentă când există un interval valid. | Schimbarea programului se reflectă în disponibilitate; nu sunt propuse intervale trecute, ocupate sau incompatibile cu durata. | L1649–1748. |
| PR-05 | Solicitatea care aparent nu se trimite/nu apare la medic trebuie urmărită integral. În exemplu se discută un cont cu 500 lei. | Fie apare cererea la ambii participanți, fie pacientul primește motivul concret al eșecului: sold, interval ocupat, validare etc. Nu se închide fluxul fără explicație. | L1760–1832. |
| PR-06 | Conflictul pentru un interval ocupat trebuie afișat și tratat corect. | Două cereri simultane nu rezervă același interval; pacientul poate selecta altul după mesaj. | L1784–1802. |
| PR-07 | Consultația confirmată/activă trebuie să conducă ușor la chat, fișă și apel. Se cere și posibilitatea apelului înainte de ora rezervată. | Accesul este vizibil în starea corectă. Pentru pornire anticipată se definește o fereastră explicită, fără a presupune un număr de minute. | L1862–1898. |

### FI — Fișa pacientului și date paraclinice

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| FI-01 | Păstrați cele trei categorii de date paraclinice: laborator, investigații funcționale și imagistice. Aspectul în trei coloane este aprobat. | Categorii distincte, atașamente în categoria corectă și acces atât pentru pacient, cât și pentru medicul autorizat. Denumirile exacte se verifică față de UI, deoarece transcrierea repetă „investigații”. | L563–587. |
| FI-02 | Exemplele de investigații să includă gastroscopie, colonoscopie și spirometrie; se solicită posibilitatea editării lor din admin/textele siteului. | Exemplele potrivite apar lângă încărcare și se poate stabili dacă sunt text de ajutor sau nomenclator editabil; nu se construiește automat un catalog obligatoriu dintr-un text exemplificativ. | L596–656. |
| FI-03 | La încărcarea unei investigații se cere denumirea și data efectuării, cu selector de calendar, înaintea salvării finale. | Fișierul cu nume tehnic poate fi identificat clinic după titlu și data efectuării; data încărcării rămâne distinctă. Se verifică toate cele trei categorii. | L683–740. |
| FI-04 | „Modul nașterii” include și „Altă modalitate”, cu descriere. | Pe lângă naturală, cezariană, forceps și vacuum se poate păstra o valoare personalizată. | L809–815. |
| FI-05 | Săptămânile la naștere au intervalul cerut în decizia finală: 24–42. | Formularul, API-ul și afișarea aplică aceeași regulă pentru date noi. Valorile istorice excepționale nu sunt șterse; modul lor de editare se stabilește. Nu se importă exemplele medicale contradictorii ca valori implicite. | L818–866. |
| FI-06 | Scorul Apgar se introduce liber, ca pereche de valori, de exemplu „8/8” sau „9-9”. | Câmpul nu impune selecția inițial propusă; valoarea completă persistă și apare la medic. | L872–947. |
| FI-07 | Alimentația naturală, artificială și mixtă au fiecare câmp descriptiv pentru perioadă. | Se pot completa toate variantele succesive, fără obligarea la alegerea uneia singure. | L947–968. |
| FI-08 | Grupa sanguină și Rh se compun într-un rezultat vizibil, cu roșu, lângă etichetă. | Alegerea A și Rh pozitiv afișează clar rezultatul A+; rezultatul se actualizează la schimbarea alegerii. | L971–980. |
| FI-09 | Dezvoltarea neuropsihică are descrieri pentru 6 luni, 1 an, 2 ani, 3 ani și alte particularități. | Toate rubricile se pot completa independent și sunt vizibile în fișa consultată de medic. | L980–992. |
| FI-10 | Alergiile afișează toate detaliile: alergen/categorie, moment aproximativ, manifestări și rezolvare; aceeași informație este vizibilă pacientului și medicului. | Exemplul cu vârsta aproximativă nu este forțat într-o dată exactă; revenirea în fișă păstrează toate textele. | L1013–1103. |
| FI-11 | Salvarea automată a antecedentelor trebuie să fie fiabilă și ușor de înțeles. Se semnalează culori neclare pentru „nimic de raportat” față de secțiuni completate. | Se disting „necompletat”, „nimic de raportat” și „completat”; pacientul înțelege dacă datele au fost salvate și o eroare este vizibilă. Afișarea exactă este propunere de UX, nu text dictat de client. | L1049–1079, L1121–1139. |
| FI-12 | Mențineți/verificați rubricile aprobate: date de naștere și măsurători, boli congenitale, vaccinări/refuz temporar, intervenții cu denumire și dată, boli cronice/acute, traumatisme, familie, stil de viață, medicamente și activitate. | Datele persistă și se citesc integral la medic în consultația autorizată. Cazul vechi al medicului șters/recreat se investighează separat de accesul normal la istoric. | L872, L995–1007, L1082–1148. |

### AP — Apelul și redactarea consultației

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| AP-01 | Remediați eroarea „Secțiunea nu a putut fi afișată” la apel și verificați reintrarea după refresh. | Ambii participanți intră în aceeași consultație; o eroare de apel poate fi recuperată și nu blochează restul aplicației. | L1871–1898. |
| AP-02 | Video principal + imagine proprie mică; la navigarea în platformă apelul rămâne într-un colț, fără scroll neașteptat. | Medicul poate deschide fișa/chatul fără pierderea apelului; fereastra nu se ascunde sub conținut. | L1904–1916, L2987–2996. |
| AP-03 | Sunetul de apel trebuie să se oprească după conectare/acceptare. | Nu continuă soneria în apelul activ; anularea și închiderea o opresc de asemenea. | L1919–1931. |
| AP-04 | Medicul poate redacta concluzia în panoul lateral în timpul apelului. Demonstrat. | Video și formularul coexistă, iar textul redactat nu se pierde la navigarea permisă. | L1934–1955. |
| AP-05 | Eticheta pentru examen/observații trebuie să exprime „Observațiile medicului”; completările la istoricul pacientului se disting. | Textul medicului este identificabil în formular și în document, fără confundarea cu declarația pacientului. | L1958–1961. |
| AP-06 | HIGO în concluzie: alegere explicită efectuat/neefectuat și declarație de consultare a datelor; fără selecția fiecărei examinări. | Alegerea se păstrează în documentul publicat și generează textul corespunzător. Pentru varianta „efectuat” se validează asocierea datelor fără a inventa examinări. | L1964–1991. |
| AP-07 | „Publică și închide apelul” publică documentul și închide apelul. Cronometrul care ajunge negativ este observație de investigat. | Publicarea reușită produce documentul și termină apelul pentru ambii. Depășirea duratei are o afișare definită, fără presupunerea unei taxări suplimentare. | L2186, L2624–2648. |

### DO — Proces-verbal, decizie, PDF și rețetă

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| DO-01 | Titlul documentului include „Proces-verbal nr. …, cu privire la consultația medicală”, înaintea conținutului consultației. | Numărul și titlul sunt afișate coerent și legate de consultația corectă; regula de numerotare se stabilește cu modelul final. | L2750–2774. |
| DO-02 | Data și ora consultației apar cu etichete explicite; se păstrează medicul, contactul, clinica și codul pacientului. | Documentul nu afișează o oră neetichetată; identitățile și momentul corespund consultației. | L2780–2789, L2954–2957. |
| DO-03 | Delimitare proces-verbal/decizie: diagnosticul clinic prezumtiv rămâne în procesul-verbal; tratament, recomandări, investigații și mențiunea rețetei intră în decizie. | Previzualizarea și PDF-ul respectă separarea cerută, după modelul clientului/juristului; nu se presupun obligatoriu două fișiere. | L2789–2795, L2960–2969. |
| DO-04 | Parafa și semnătura medicului, cu data/ora aplicării, în zona corespunzătoare. Încărcarea imaginilor fusese raportată ca reparată. | Medicul încarcă imaginea proprie, o vede în previzualizare, iar documentul publicat o păstrează. Se verifică eroarea inițială. | L2255–2282, L2666, L2714–2717, L2963–2966. |
| DO-05 | În formular: „Medicament eliberat pe rețetă” și „Încarcă rețeta”, cu posibilitatea de a indica medicamentul/substanța activă. | Medicul nu trebuie să rescrie doza și durata deja incluse în tratament; denumirea indicată leagă mențiunea de anexă. | L2804–2861, L2906–2909. |
| DO-06 | Medicul încarcă rețeta scanată sau fotografiată; pacientul o poate vedea și descărca. Demonstrat parțial. | PDF-ul și imaginile acceptate sunt afișate corect și rămân asociate consultației respective. | L2003–2006, L2186, L2699, L2852–2861. |
| DO-07 | În concluzie apare mențiunea „Rețeta scanată pentru … este atașată în anexa nr. 1 la decizie”; nu se repetă blocul textual de rețetă. | Mențiunea apare numai când există atașament; nu apar dubluri ale tratamentului sau trimiteri către o anexă inexistentă. | L2825–2945. |
| DO-08 | Rețeta se include efectiv ca anexă în același PDF, după proces-verbal/decizie. „Pagina 3” este exemplul discutat. | Documentul descărcat conține toate paginile rețetei, lizibile și fără tăiere; anexele urmează conținutul indiferent de lungimea lui. | L2924–2969, L3005. |
| DO-09 | Rețeta rămâne și document separat pentru printare, pe lângă includerea în PDF-ul complet. Decizie finală explicită. | Pacientul are acces la documentul complet și la rețetă separat; variantele conțin aceeași rețetă. | L3008–3023. |
| DO-10 | Instrucțiuni simple de printare lângă rețetă și, dacă este posibil, buton „Printează”; se cere explicit explicația Ctrl+P. | Vizualizarea permite printarea lizibilă, păstrează proporțiile și nu taie rețeta; instrucțiunea este vizibilă la deschidere. Dimensiunea exactă se validează pe modelul primit. | L3029–3134. |
| DO-11 | Eliminați mesajul vechi despre alegerea/transmiterea rețetei prin rețeaua de farmacii; păstrați tratamentul în rubrica sa. | Nici formularul, nici PDF-ul nu mai generează instrucțiunea abandonată. Nu se fac afirmații automate despre acceptarea documentului la farmacie. | L2882–2900. |
| DO-12 | Păstrați completările la consultația inițială și documentul lor PDF; în admin este menționată fereastra de 10 zile. Demonstrat. | Completarea rămâne legată de consultație și se poate vedea/descărca; schimbarea structurii documentului nu pierde completările existente. Punctul de pornire al termenului se confirmă. | L2681–2696, L4016–4028. |

### CE — Certificat online pentru grădiniță, formular 095E

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| CE-01 | Serviciu distinct „Certificat pentru grădiniță online”, pe baza blancului numit în discuție „095E”. | Serviciul poate fi solicitat și emis de medic prin platformă; denumirea oficială și modelul se confirmă după primirea blancului. | L2288–2348, L2432–2444. |
| CE-02 | Formular vizual completat de medic, cu generarea PDF-ului final. | Rubricile corespund blancului furnizat, există previzualizare și document descărcabil/printabil. | L2294–2312. |
| CE-03 | Ștampile ale instituției și parafă proprie pentru medicul emitent, în pozițiile din model. | Certificatul folosește instituția și medicul corect, fără aplicarea parafei clientului tuturor medicilor. | L2318–2375. |
| CE-04 | Numerotare de ordine a certificatelor. | Emiterea nu produce numere duplicate; se poate identifica certificatul și emitentul. Formatul și resetarea numerotării rămân de stabilit. | L2387–2393. |
| CE-05 | Certificatul are două jumătăți: partea păstrată în evidența medicului și partea destinată pacientului; datele comune se completează o singură dată. | Numele, prenumele și instituția preșcolară apar identic în ambele părți; arhiva și exemplarul pacientului respectă modelul. | L2393–2399. |
| CE-06 | Pacientul poate descărca și imprima certificatul, iar medicul păstrează evidența emiterii. | Reimprimarea nu emite un certificat nou și nu consumă un număr nou. Tariful nu se deduce din exemplul de venit pe oră. | L2399–2435. |

**Dependență externă CE:** clientul spune că va trimite blancul de la serviciu. Fișierul nu este inclus în atașamentul actual. Putem proiecta fluxul și arhiva, însă nu inventăm rubricile, dimensiunile, numerotarea sau condițiile de emitere. Nu validăm în această analiză afirmațiile despre valoarea juridică ori acceptarea documentelor printate.

### RE — Recenzii și acordarea celor 10 puncte

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| RE-01 | Rezultatul publicat este accesibil imediat, fără obligația recenziei. | Chatul, fișa, API-ul și descărcarea PDF oferă rezultatul fără recenzie; publicarea eșuată nu anunță un rezultat disponibil. | L1301–1352, L2648–2651. |
| RE-02 | O recenzie eligibilă acordă pacientului 10 puncte; medicul și operatorul se evaluează separat când există serviciile respective. | Două evaluări distincte pot produce câte 10 puncte, o singură dată fiecare. Nota mică nu anulează recompensa și accesul la document. | L1325–1370. |
| RE-03 | După publicare, pacientul vede mesajul „Lăsați medicului o recenzie și primiți 10 puncte bonus”, cu acțiune spre recenzie. | Mesajul apare în conversația corectă și este destinat pacientului, fără a fi trimis ca mesaj medical către doctor. Nu depinde de conectarea Telegram. | L1382–1439. |
| RE-04 | Beneficiul celor 10 puncte este explicat și în zona de alegere a medicului/rezultat de pe prima pagină. | Textele publice și din cabinet sunt coerente cu recenzia opțională și valoarea recompensei. | L1265–1274, L1403–1418. |
| RE-05 | Medicul poate vedea dacă a primit recenzie și poate solicita manual una în chat; ratingul continuă să reflecte stelele. | Numărul consultațiilor și numărul recenziilor sunt inteligibile; reamintirea manuală nu devine automat campanie de mesaje. | L1295–1298, L1352–1361, L1436–1439. |

### BO — Bonusuri, afiliere și plata mixtă

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| BO-01 | Medicul alege dacă acceptă o parte a plății în bonusuri și cât: 10/20/30/40/50%; refuzul rămâne posibil. | Procentul medicului limitează plata mixtă și este afișat pacientului înaintea rezervării. | L479–506, L3599, L4184–4193. |
| BO-02 | Text pentru medic: „Accept o parte din plata consultației cu bonusuri”; explicația nu mai promite suma integrală în bani. | Se explică distinct venitul procentual din lei și punctele pentru promovare; setarea se poate salva, fără eroarea „temporar indisponibil”. | L479–506. |
| BO-03 | Pacientul adus pe linkul medicului generează medicului puncte egale cu 0,1 × alimentarea; exemplu 1.000 lei → 100 puncte. | Circuit separat de comisionul în bani al operatorului, cu evidență și protecție la procesarea repetată. Frecvența alimentărilor eligibile se clarifică. | L509–524. |
| BO-04 | Medicul poate cheltui punctele acumulate pentru promovare; noul parametru de performanță este 0,1 × punctele folosite. | 100 puncte efectiv consumate la promovare produc 10 puncte de performanță, fără a transforma simpla rezervare de buget în consum. | L530–554, L3515. |
| BO-05 | Campanie de dublare a alimentării: suma depusă produce un bonus egal. | Banii reali și bonusul sunt distincte; campania poate fi activată pentru alimentări viitoare și are perioadă explicită. Nu se dublează retroactiv tranzacții istorice fără o decizie. | L1493–1496, L3512, L3974–3977. |
| BO-06 | Afilierea pacientului rămâne configurabilă; în discuție se păstrează 3% și prag minim de alimentare 100 lei. | Setările sunt folosite în calcul și raport; varianta „10% o singură dată” rămâne exemplu de configurare, nu noua valoare aleasă. | L3986–3995. |
| BO-07 | Operatorul primește **bani**, nu puncte, pentru referal: 3% din alimentarea eligibilă. | Raportul și soldul operatorului separă referalul de plata examinării; primul/mai multe top-upuri se precizează explicit. | L4418–4424. |
| BO-08 | Medicii își selectează singuri acceptarea bonusurilor; adminul nu trebuie să îi declare eligibili manual într-o listă paralelă contradictorie. | O singură sursă efectivă pentru eligibilitate și procent, cu aceeași valoare în profil, catalog, programare și admin. | L3980–3983. |

**Observație BO-03/BO-04:** clientul spune „să adăugăm doi parametri”. Alimentarea referalului și consumul pentru promovare trebuie să fie vizibile separat. Nu este suficient să existe un sold de puncte; modul în care fiecare contribuie la totalul de performanță trebuie stabilit fără dublarea aceleiași valori.

### ST — Tranzacții, contabilizare și statistici financiare

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| ST-01 | Separați venitul platformei din servicii medicale de venitul din cartele/pachete. | Încasările din alimentarea portofelelor nu sunt confundate cu venit deja câștigat; rapoartele arată separat sursele cerute. | L3398–3407, L3479–3482. |
| ST-02 | Pentru cartele: număr vândut și venit pe fiecare tip, plus total și filtru. | Tipurile provin din pachetele configurate, nu dintr-o listă fixă de prețuri transcrise contradictoriu. | L3404–3413. |
| ST-03 | Rapoarte pe instituție: venit, sold și contribuție la venitul platformei. | Filtrarea unei instituții produce totaluri și tranzacții coerente cu raportul ei de manager. | L3419–3428. |
| ST-04 | Explicați indicatorii: alimentări, solduri wallet, venit platformă, cereri de retragere și plăți efectuate. | Etichetele indică exact ce se însumează și dacă suma este solicitată, aprobată sau plătită. | L3431–3476. |
| ST-05 | Comision bancar și fond de rezervă configurabile și vizibile în statistică; clientul menționează 2% comision și aproximativ 5% rezervă. | Ratele sunt confirmate și configurate separat. Rezerva reținută nu este prezentată automat ca o cheltuială definitivă; raportul distinge brut, comision, rezervă și net disponibil. | L3452–3458, L3539–3557. |
| ST-06 | Evidență separată pentru lei reali și puncte: plătit, rezervat, câștigat, rămas platformei. | Totalurile în lei nu includ punctele ca numerar; fiecare rezultat se explică din tranzacțiile componente. | L3275–3278, L3491–3500. |
| ST-07 | Bonusuri generate în total și defalcate după sursă: recenzii, alimentări, pachete/cartele și afiliere. | Fiecare emitere are sursă și beneficiar identificabile; totalul se reconciliază cu tranzacțiile de puncte. | L3503–3536. |
| ST-08 | Bonusuri în circulație, la pacienți, la medici, consumate pentru servicii și consumate pentru promovare. | Soldurile și fluxurile sunt distincte. Transferul pacient → medic nu se numără din nou ca emitere. Anulările/corecțiile sunt explicabile. | L3515–3533. |
| ST-09 | Filtre/statistici pentru toate tipurile de servicii, inclusiv cele adăugate de medici; apariția unui serviciu nou îl face disponibil în raport. | Se poate vedea frecvența și venitul, de exemplu pentru interpretare analize sau întrebare în chat, fără modificare de cod pentru fiecare serviciu. | L3569–3587. |
| ST-10 | Exemplul „o întrebare în chat” trebuie reprezentabil ca serviciu cu preț și regulă de închidere proprii. | Se poate configura un astfel de serviciu; 50 lei și 15 minute/1 oră sunt exemple de discutat, nu durate simultan obligatorii pentru toate chaturile. | L3587–3596. |
| ST-11 | Păstrați raportarea afilierii pe operatori, medici și pacienți, cu luna curentă, tot timpul și interval ales. | Conturile aduse, alimentările și cheltuielile sunt vizibile și se leagă de sursa corectă; noul referal al medicului intră coerent în raport. | L3602–3614, L4253. |
| ST-12 | Păstrați statistica ultimelor consultații finalizate și detaliile despre prestator/beneficiar. | Noile reguli de recenzie și decontare nu fac consultațiile finalizate să dispară sau să fie numărate greșit. | L3560. |

### PE — Performanță, clasament și premii

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| PE-01 | Adăugați separat parametrii discutați pentru referali/alimentări și puncte cheltuite pe promovare. | Fiecare parametru are valoare, formulă și perioadă vizibile; totalul este același în admin și la medic. | L518–542, L4133. |
| PE-02 | Acasă la medic: puncte de performanță, poziție și număr total de participanți, de exemplu locul 3 din 17. | Medicul își vede situația curentă fără să caute exclusiv în pagina de statistici. | L4058–4070. |
| PE-03 | „Vezi topul integral” deschide lista tuturor medicilor, cu nume, poziție și puncte, nu doar primele trei locuri. | Clasamentul întreg este accesibil medicilor și este coerent cu poziția proprie. | L4070–4082, L4118–4127. |
| PE-04 | Adminul configurează premii, vizibile medicilor; clientul rămâne în clasament. | Premiile și perioada lor sunt vizibile; nu se implementează excluderea retrasă și nici plata automată către locul 4 pe baza unei intenții personale. | L4052–4055, L4094–4112. |

### OP — Relația platformei cu operatorii

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| OP-01 | În admin există o zonă clară pentru relațiile cu operatorii și lista lor pe raioane/zone. | Adminul deschide operatorul și vede contractul, procentul, activitatea și plățile sale; nu este amestecat cu instituțiile medicale. | L4385–4415, L4445. |
| OP-02 | Operatorul are tip persoană fizică/juridică și relație contractuală: angajare/prestări servicii; se acoperă și cazul freelancerului. | Tipul persoanei și tipul contractului sunt câmpuri distincte și inteligibile; combinațiile permise se stabilesc pe documentele clientului. | L4433–4460. |
| OP-03 | Adminul setează procentul fiecărui operator, în funcție de contract; exemple 30%, 40%, 50%. | Modificarea unui operator nu îi schimbă pe ceilalți; procentul folosit la decontare este cel aplicabil serviciului respectiv. | L4352–4358, L4430–4448. |
| OP-04 | Operatorul vede în cabinet tipul contractului, procentul și baza remunerării. | Datele coincid cu setarea adminului și nu pot fi modificate de operator ca să-și schimbe remunerația. | L4466–4469. |
| OP-05 | Venituri, solduri, cereri de plată și istoric pentru operator, similar fluxului medicului. | Plata serviciilor și comisionul de referal sunt distincte; cererile și plățile nu se dublează și sunt reflectate în admin. | L4352–4376, L4418–4424. |
| OP-06 | Operatorul poate stabili taxa de drum pentru deplasări mai îndepărtate, în comunicarea cu pacientul. | Taxa are valoare, beneficiar și confirmare vizibile înainte de debitare. Includerea ei în baza procentului și circuitul de plată rămân de stabilit. | L4472–4475. |
| OP-07 | Se vede volumul serviciilor fiecărui operator, inclusiv pe pacient și pe examinare efectuată. | Lista examinărilor realizate se reflectă în rapoarte și poate fi urmărită până la solicitarea/pacientul corect. | L4481–4490. |
| OP-08 | Operatorul marchează examinările realizate, de exemplu pulsoximetrie și termometrie; celelalte denumiri se verifică față de catalog. | Se pot selecta examinările reale, fără inventarea numelor neclare din transcriere; marcajele se corelează cu datele HIGO unde există. | L4484–4490. |
| OP-09 | Păstrați statistica operatorului pentru pacienți aduși, alimentări și cheltuieli. Criteriul de aparat garantat este menționat: 120 pacienți cu minimum 500 lei. | Indicatorii permit verificarea țintei; acordarea aparatului rămâne proces comercial, dacă nu se cere explicit automatizare. | L4253, L4331–4337. |
| OP-10 | Clarificați și păstrați distinct butoanele de distribuire a linkului referal și cele de contact/geolocație pentru vizita la domiciliu. | Distribuirea referalului nu este confundată cu trimiterea locației; pacientul și operatorul pot coordona adresa. WhatsApp/Viber/Telegram nu înlocuiesc automat mesageria internă. | L4256–4310. |

### HI — Integrarea HIGO și activarea modulului

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| HI-01 | Înregistrarea operatorului trebuie să îl creeze/sincronizeze și în HIGO chiar când afișarea serviciului pe site este oprită. | Oprirea vizibilității comerciale nu oprește automat crearea operatorului în sistemul extern. | L1610–1628. |
| HI-02 | Operatorii creați când modulul a fost oprit trebuie verificați și sincronizați cu HIGO. | Se pot identifica operatorii lipsă și sincroniza fără duplicate; eroarea externă este vizibilă și poate fi reîncercată. | L1610–1625. |
| HI-03 | Test complet cu date reale de probă ale aceluiași pacient: înregistrare în HIGO, vizualizare ca pacient și ca medic. | Examinările, fișierele și identitatea pacientului coincid în toate cele trei sisteme/vizualizări. | L1586–1610, L4223. |
| HI-04 | Când modulul este oprit, operatorul vede statistica de referal, dar nu solicitările HIGO; la activare solicitările reapar. | Vizibilitatea și accesul API reflectă starea modulului; activarea nu cere recrearea operatorilor. | L4316–4334. |

### GE — Pacienți din străinătate și statistica geografică

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| GE-01 | La înregistrare/completarea profilului se poate selecta Moldova sau altă țară, după locul de trai actual. | Utilizatorul din străinătate nu este obligat să aleagă un raion moldovenesc; datele pot fi actualizate. | L3737–3788. |
| GE-02 | Țara se alege din listă; regiunea/districtul, orașul și localitatea se introduc manual pentru străinătate. | Câmpuri flexibile pentru țări cu structuri administrative diferite; nu se impune o integrare Google Maps discutată și abandonată. | L3746–3830. |
| GE-03 | În admin, regiuni/localități: separare Moldova / alte țări; la alte țări se listează țările cu pacienți înregistrați. | Selectarea țării arată distribuția în orașele/localitățile efectiv introduse. | L3773, L3833–3839. |
| GE-04 | Păstrați logica geografică a Moldovei și localitățile completabile; rapoartele internaționale trebuie să evite fragmentarea denumirilor. | Totalurile pe țări și localități corespund pacienților; se definește dacă raportul numără conturi sau profiluri. Normalizarea textului este măsură tehnică propusă. | L3761–3773, L3818–3839. |

### PU — Pagina publică, noutăți și parteneri

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| PU-01 | Exemplele de medici de pe prima pagină folosesc medici reali: Igor Pletoșu și Ecaterina Prepeliță, cu ortografia confirmată în profiluri. | Nu mai apar exemplele generice Leon/Maria în blocul indicat; numele, imaginile și serviciile coincid cu datele aprobate. | L1202–1214. |
| PU-02 | Prețuri în exemplul public: chat 500 lei, video + chat 600 lei, vizita operatorului 350 lei; „de la 500 lei” pentru cei doi medici. | Exemplul nu contrazice serviciile active. Se stabilește dacă acestea sunt valori de prezentare sau tarife de modificat în catalog; nu se rescriu prețurile tuturor medicilor. | L1220–1232. |
| PU-03 | Denumirea este „Vizita operatorului la domiciliu”, ca să nu se creadă că vine medicul. Se poate selecta unul sau mai multe servicii. | Homepage-ul explică selecția „serviciului/serviciilor” și combinația consultație + operator; fluxul disponibil este coerent cu explicația. | L1235–1256. |
| PU-04 | Noutățile au fotografii și prezentare standardizată în toate cabinetele și în pagina publică. Defect raportat diferit între browsere. | Aceleași articole au imagini și structură coerentă pe desktop/mobil și după refresh; se verifică și cache-ul/încărcarea fișierelor. | L1166–1190, L4232–4241. |
| PU-05 | Partenerii nu se afișează dublu; cardul arată direct textul și butonul „Vezi site-ul” când există URL. | Fiscal Partner și Clinica Pediatru au buton dacă URL-ul este configurat; nu mai trebuie selectare pentru a descoperi al doilea exemplar al cardului. | L1196–1202, L3635–3638, L3872–3893. |
| PU-06 | Respectați setarea de ascundere a partenerului HIGO; restul partenerilor vizibili trebuie să apară. | HIGO rămâne ascuns până la schimbarea setării, fără a afecta integrarea tehnică. | L3851–3875. |
| PU-07 | Modificările textelor făcute de admin trebuie să reziste deployului; în apel se constată resetarea lor. | Deployul/migrările nu suprascriu textele personalizate și nu resetează baza cu date reale. Clientul poate continua editarea conținutului. | L1451–1484, L3902. |
| PU-08 | Articolele publice nu afișează neintenționat identitatea personală a adminului ca autor. | Se aplică o regulă explicită de autor public, de exemplu echipa/platforma; textul final se confirmă. | L3845–3848. |

### AD — Admin, pachete, mesaje, setări și documente contractuale

| ID | Cerință / observație | Criteriu de acceptare | Sursă |
|---|---|---|---|
| AD-01 | Dashboardul adminului include numărul instituțiilor medicale; lista utilizatorilor are categorie/filtru „Manageri instituții medicale”. | Instituțiile sunt numărate ca entități, managerii ca utilizatori; conturile cu mai multe roluri se regăsesc corect în filtre. | L3149–3203. |
| AD-02 | Mesajele administrative funcționează separat de consultații; acțiunea „Trimite mesaj” are iconiță. Defectul de livrare este raportat, apoi un mesaj este observat. | Adminul poate trimite medicului/operatorului/managerului, destinatarul îl vede în inboxul administrativ și poate răspunde conform fluxului existent. Se verifică livrarea, nu doar butonul. | L371–377, L1499–1511, L3206–3239, L4136–4139. |
| AD-03 | Pachet/profil gratuit în admin: 0 lei, un profil, valabilitate permanentă și statistică de utilizare. | Tipul gratuit este distinct de pachetele plătite, fără expirare artificială sau încasare fictivă. | L3680–3725. |
| AD-04 | Statisticile pachetelor disting numărul de pachete activate și numărul de profiluri aferente. | Raportul afișează separat cumpărări și capacitate/profiluri efectiv create; nu preia drept regulă exemplul aritmetic inconsistent „5 pachete = 30 profiluri”. | L3704–3728. |
| AD-05 | Termenii și condițiile sunt accesibile public; încărcați versiunea clientului destinată lui Ștefan și ulterior documentele finale. Politica de confidențialitate trebuie de asemenea găsită. | Există linkuri vizibile și versiuni corecte ale documentelor. Descrierea stocării/HIGO se bazează pe configurație și documente verificate, fără afirmații inventate de conformitate. | L3617–3671. |
| AD-06 | Contractele cu instituțiile preiau datele instituției; modelele vor fi furnizate de client/jurist. | Datele salvate se completează în modelul corect, fără copiere manuală repetată; lipsa modelelor rămâne dependență explicită. | L3257–3260, L3617. |
| AD-07 | Banca și IBAN-ul medicului se completează în profil și sunt disponibile instituției care îl plătește. | Managerul autorizat le poate folosi în plata medicului; circuitul nu transformă automat platforma în plătitorul salariului. | L4145–4178. |
| AD-08 | Reorganizați setările generale pentru noul model: separați platforma/instituțiile/operatorii, eliminați ambiguitățile și explicați fiecare setare. | Nu există două setări contradictorii pentru aceeași regulă; reorganizarea păstrează configurările încă relevante și migrează valorile folosite. | L3938–3998, L4016–4040. |
| AD-09 | Păstrați/verificați regulile afișate: restituire dacă consultația nu are loc, 72 h incluse, reactivare 50 lei/24 h, fereastră de 10 zile; video implicit 600 lei. | Setările au etichete clare și efectul corect. Termenul exact al restituirii și câmpurile „zi început/sfârșit cereri” se clarifică înaintea schimbării lor. Prețul particular al medicului are regula de prevalență definită. | L3956–3959, L3998–4028. |
| AD-10 | Notificările Telegram ale adminului includ evenimente precum cereri și reclamații; se verifică și notificările pentru consultații/mesaje ale celorlalte roluri. | Conectarea contului Telegram corect și preferințele sunt reflectate în livrare; lipsa Telegram nu blochează utilizarea platformei. Lista exactă a evenimentelor admin se confirmă. | L1841–1859, L3902–3932, L4031–4040. |
| AD-11 | Mențineți administrarea specialităților, modulelor și reclamațiilor deja revizuite. | Specialitățile se pot adăuga, modulele au stări coerente, reclamațiile pot fi consultate; schimbările noi nu rup aceste funcții. | L3251–3257, L3614, L3842. |
| AD-12 | Înainte de lansare se cere o variantă stabilă, verificată pe toate rolurile și cu HIGO, urmată de o nouă ședință. | Cerințele au dovezi de acceptanță; configurația și datele nu sunt resetate între demonstrații. Testarea completă nu este înlocuită de afirmația „merge la mine”. | L4214–4244, L4499–4502. |

## 4. Clarificări și materiale necesare, fără eliminarea cerințelor

Aceste puncte nu scot nimic din scop. Se pot implementa independent părțile care nu depind de răspuns. Pentru fiecare decizie se păstrează răspunsul și exemplul numeric/de interfață acceptat.

| Ref. | Ce trebuie stabilit | De ce schimbă implementarea | Cerințe |
|---|---|---|---|
| Q01 | După publicare, când se închide/decontează financiar consultația fără recenzie: imediat, după o perioadă sau prin alt mecanism? | Codul actual leagă plata de recenzie; eliminarea blocării rezultatului trebuie să lase un ciclu financiar complet. | RE-01, ST-12, AP-07. |
| Q02 | Procentul medicului este din prețul plătit în lei, din partea instituției sau din altă bază? Ce se întâmplă cu excepțiile individuale la setarea comună? | 30% din 500 = 150 lei; 30% din partea de 80% a instituției = 120 lei. Discuția distinge cotele, dar nu închide fără echivoc baza. | IN-07, IN-11. |
| Q03 | Cum se aplică procentele instituției/operatorului la plată mixtă, comisioane bancare și taxă de drum? | Nu se pot însuma arbitrar reduceri, taxe, fond de rezervă și salarii. | IN-11, BO-01, OP-03, OP-06, ST-05. |
| Q04 — confirmat | Referalul se afișează separat. Numai consumul pentru promovare produce scor: 100 puncte → 10 puncte de performanță. | Evită dublarea 100 puncte primite + 10 la consum fără o regulă explicită pentru primul indicator. | BO-03, BO-04, PE-01. |
| Q05 | Pentru medic, pacient și operator: referalul se acordă la prima alimentare sau repetat? Ce rată se aplică unui cont cu mai multe roluri? | Transcrierea actuală nu stabilește complet frecvența și precedența rolurilor. | BO-03, BO-06, BO-07. |
| Q06 | Calendarul campaniei de dublare: început, sfârșit, eligibilitate, eventual plafon și modul de activare. | „O lună sau până la Anul Nou” nu dă o perioadă unică; data înregistrării nu este cunoscută. | BO-05. |
| Q07 | Când și unde se afișează reamintirea recenziei; se ascunde după recenzie? Ce moment produce cele 10 puncte și cum se tratează editarea/ștergerea evaluării? | Recompensa și mesajul nu trebuie acordate/afișate repetat accidental. Momentul publicării este cerut; reamintirile ulterioare sunt de definit. | RE-02, RE-03. |
| Q08 | Blancul 095E, rubricile, partea pacientului, numerotarea și modelul proces-verbal/decizie; documentele contractuale și termenii clientului. | Machetele și textele finale nu sunt atașate. Se păstrează fluxurile în plan până la furnizare. | CE-01–CE-06, DO-01–DO-03, AD-05–AD-06. |
| Q09 | Dimensiunea/proporția rețetei la imprimare și textul final al anexei. | „10×15”, „sfert de A4” și „pagina 3” sunt aproximații ale exemplului. | DO-07–DO-10. |
| Q10 | Permanentizarea profilului gratuit include profilurile deja expirate? Se păstrează acordarea o singură dată per cont? | Durata este schimbată explicit; acordarea repetată și migrarea trecutului nu sunt decise. | AD-03. |
| Q11 | Fereastra de pornire anticipată, semnificația orei 00:00, punctul de pornire al celor 10 zile și termenul exact al rambursării. | Elimină ambiguități de timp în programare, completări, chat și bani. | PR-03, PR-07, DO-12, AD-09. |
| Q12 | Serviciul „o întrebare”: preț/durată configurabile, eveniment de închidere și ce înseamnă întrebarea suplimentară. | Exemplul de 15 minute/maxim o oră nu este încă o regulă unică. | ST-10. |
| Q13 | Ratele și baza comisionului bancar/fondului de rezervă; durata/eliberarea rezervei și sursa reconcilierii cu banca. | Rezerva nu poate fi tratată ca venit sau cheltuială fără evidență. | ST-05. |
| Q14 — confirmat | PWA instalabilă din browser, folosind platforma actuală. | Implementată local; instalarea pe dispozitiv rămâne în acceptanță. | CT-07. |
| Q15 | Geolocația se trimite în mesageria internă sau prin butoane către Telegram/Viber/WhatsApp? Cine primește taxa de drum și cum o acceptă pacientul? | Discuția oscilează între contact, distribuire referal și locație. | OP-06, OP-10. |
| Q16 | Prețurile și numele publice se sincronizează din serviciile reale sau sunt exemple editoriale aprobate? Ce identitate apare ca autor al noutăților? | Evită contradicții de preț și expunerea neintenționată a numelui adminului. | PU-01–PU-02, PU-08. |
| Q17 | Statistica geografică și a pachetelor numără conturi, profiluri create, capacitate cumpărată sau activări? | Aceste valori diferă și trebuie etichetate separat. | GE-03–GE-04, AD-04. |

### Exemple financiare de fixat înainte de cod

Exemplele sunt teste de decizie, nu reguli adăugate în numele clientului:

1. **Serviciu 500 lei, instituție 80%:** 400 lei instituției și 100 lei platformei, înainte de a defini comisioanele bancare și baza medicului.
2. **Aceeași consultație, medic 30%:** fie 150 lei din baza de 500, fie 120 lei din baza de 400. Trebuie aleasă o singură formulă și explicată în UI.
3. **Plată 250 lei + 250 puncte:** se fixează ce bază se împarte, cine primește punctele și când. Punctele nu devin 250 lei disponibili în bancă.
4. **Referal medic, alimentare 1.000 lei:** 100 puncte pentru medic conform discuției. Consum de 100 puncte pe promovare: 10 puncte de performanță. Se stabilește separat contribuția primului parametru.
5. **Referal operator, alimentare 1.000 lei:** 30 lei la rata de 3%, distinct de venitul din examinare. La examinare de 300 lei și cotă de 30%, rezultatul ar fi 90 lei; afirmația orală „100 lei/33%” nu se poate impune simultan ca formulă.
6. **Recenzie:** +10 puncte o singură dată pentru medic și, dacă există, încă +10 pentru operator; consultația publicată este accesibilă și înainte de aceste acțiuni.

Procentele de 45% pentru impozite, exemplele de salarii și estimările de câștig exprimate în conversație sunt raționamente comerciale. Nu rezultă cererea unui motor fiscal sau confirmarea unui tratament fiscal/legal.

### Acțiuni ale clientului și obiective comerciale din discuție

Acestea însoțesc implementarea și rămân consemnate; nu se transformă automat în funcții noi ale aplicației:

- **Verificarea cabinetului instituției de către client**, anunțată pentru ziua următoare înregistrării, fără a putea atribui o dată calendaristică din fișier. L3149.
- **Furnizarea blancului 095E, a contractelor și a modelului juridic al documentului**, inclusiv revizuirea cu Ștefan și transmiterea variantei pentru confirmare. L2342–2348, L2753–2756, L3617–3647.
- **Instruirea medicilor pentru pregătirea și încărcarea rețetelor**, asumată de client; reamintirea manuală a recenziei rămâne parte din instruirea lor. L2093–2096, L2174, L1352–1439.
- **Verificarea/completarea specialităților și a textelor publice** de către client, după stabilizarea versiunii, cu păstrarea editărilor la deploy. L3251–3257, L3902.
- **Articol/anunț pentru campania de dublare a alimentării**, de pregătit de client după fixarea perioadei și regulilor campaniei. L1493.
- **Obiectiv de adopție:** aproximativ 10.000–20.000 de înregistrări și aproximativ 1.000 de conturi alimentate, exprimat și ca circa 10%. Este obiectiv comercial; transcrierea nu stabilește o cerință de infrastructură pentru 20.000 de utilizatori simultani. L1487–1493.
- **Contactarea și pregătirea celor peste 20 de candidați operatori**, după stabilizarea platformei; indicatorul comercial de 120 de pacienți cu minimum 500 lei alimentați rămâne vizibil în statistica operatorului. L4214–4223, L4337.
- **O nouă ședință după aplicarea schimbărilor și testarea completă**, cu aceeași versiune stabilă pentru demonstrație. L4223–4244, L4499–4502.

## 5. Planul de implementare, după dependențe

Toate pachetele de mai jos fac parte din plan. Nu există niveluri P0/P1, funcții „neimportante” sau excluderi tacite. Mai multe pachete pot avansa independent, dar verificarea finală le acoperă pe toate.

### Pachet A — Matricea existent / de modificat / de reparat

**Acoperire:** toate ID-urile CT, IN, PR, FI, AP, DO, CE, RE, BO, ST, PE, OP, HI, GE, PU, AD.

1. Pentru fiecare rând, identificați UI-ul, endpointul, modelul, testele existente și starea observată: existent verificat / existent de adaptat / defect reprodus / nou / dependent de material.
2. Reproduceți incidentele cu conturi de probă: disponibilitate medic, solicitare netrimisă, program 00:00, apel/sonerie, poze noutăți, parteneri și salvarea setării bonusurilor.
3. Înregistrați deciziile Q01–Q17 cu exemple acceptate; continuați independent lucrările care nu depind de ele.
4. Pregătiți set de date de acceptanță cu pacient, medic, manager, operator, admin și cont cu mai multe roluri.

**Livrabil:** matrice pe fiecare ID, pași de reproducere și contract de reguli comerciale. Faptul că un modul există nu închide rândul fără verificare.

### Pachet B — Conturi și instituții

**Acoperire:** CT-01–CT-06, IN-01–IN-11, AD-01, AD-06–AD-07.

1. Completați selecția/crearea managerului și comutarea rolurilor, inclusiv denumiri și filtre în admin.
2. Verificați înscrierea medicului, invitația/manual, alegerea instituției, corectarea de către admin și aprobarea de manager.
3. Adăugați explicația pentru instituția absentă din listă.
4. Separați setarea cotei instituției de setarea comună a medicilor; conectați fiecare setare la regula numerică decisă în Q02/Q03.
5. Verificați rapoartele, datele bancare, cererile de transfer și documentele contractuale populate din instituție.
6. Rezolvați conturile istorice cu telefon duplicat prin inventar și intervenție controlată, fără ștergere automată.

**Dependențe:** formulele Q02/Q03 pentru partea financiară; modelele Q08 pentru contracte.

**Acceptanță:** două instituții cu cote diferite, manageri diferiți și conturi cu roluri multiple; izolarea accesului, înscriere/aprobare, actualizare procent și transfer cerut/plătit.

### Pachet C — Modelul financiar, operatorii și evidența punctelor

**Acoperire:** BO-01–BO-08, OP-01–OP-06, IN-07–IN-08, IN-11, ST-04–ST-08, AD-08.

1. Modelați separat cota instituției, baza medicului, relația/procentul operatorului, referalul în bani și referalul în puncte.
2. Păstrați rata și baza aplicabile pe fiecare operație; schimbarea setărilor nu rescrie tranzacțiile decontate.
3. Introduceți tipurile contractuale ale operatorilor, configurarea adminului și oglindirea în cabinetul operatorului.
4. Uniformizați plata mixtă după procentul ales de medic și explicați venitul în bani versus puncte.
5. Implementați/ajustați referalii medic/pacient/operator și campania de dublare, fără recompense duble la callback repetat.
6. Înregistrați originea și utilizarea punctelor pentru recenzii, alimentări, pachete, referali, servicii și promovare.
7. Adăugați comisionul bancar și rezerva ca valori distincte de soldul utilizatorilor și venitul platformei, după Q13.

**Dependențe:** Q02–Q06, Q13 și partea financiară Q15. Structura adminului/operatorului poate avansa înaintea formulelor finale.

**Acceptanță:** exemplele numerice din secțiunea 4, plată mixtă, anulare/rambursare în soldurile de origine, retrimitere/callback repetat, modificarea procentului și reconcilierea soldurilor.

### Pachet D — Publicare, rezultat imediat și recenzie recompensată

**Acoperire:** RE-01–RE-05, AP-07, ST-12, AD-09 parțial.

1. Separați publicarea documentului, accesul pacientului, decontarea și monitorizarea prin chat.
2. Înlăturați condiția recenziei din toate căile de acces la rezultat, inclusiv API și linkurile fișierelor.
3. Implementați momentul de decontare stabilit la Q01 și adaptați comenzile/joburile care încă așteaptă recenzia.
4. Acordați atomic 10 puncte pentru evaluarea eligibilă a fiecărui prestator; protejați împotriva dublei acordări la dublu click și cereri simultane.
5. Afișați invitația la recenzie pentru pacient imediat după publicare, cu acțiunea corectă; păstrați solicitarea manuală a medicului.
6. Înlocuiți textele și testele care descriu recenzia obligatorie. Mențineți limitele chatului și completărilor ca reguli distincte.

**Dependențe:** Q01/Q07 și infrastructura de puncte din C. Accesul imediat la document poate fi verificat separat, dar schimbarea nu este completă fără decontare.

**Acceptanță:** pacient care nu lasă niciodată recenzie, evaluare cu notă mică, medic + operator, reîncărcare, două dispozitive și operații repetate; document disponibil și sume decontate o singură dată.

### Pachet E — Programare, apel și formularul consultației

**Acoperire:** PR-01–PR-07, AP-01–AP-07, ST-10, AD-09 parțial.

1. Urmăriți disponibilitatea de la aprobarea medicului și program până la lista pacientului; eliminați cauza reproducerii PR-01.
2. Corectați selecția pentru azi, fusul orar și intervalele de la miezul nopții; definiți fereastra apelului anticipat.
3. Faceți trimiterea solicitării observabilă: succes confirmat sau motiv explicit, inclusiv sold insuficient și interval ocupat.
4. Reparați eroarea de randare a apelului, reintrarea și soneria persistentă.
5. Asigurați video principal/imagine mică, apel în colț la navigare și redactarea laterală.
6. Ajustați etichetele observațiilor și alegerea HIGO efectuat/neefectuat.
7. Definiți afișarea depășirii duratei și, după Q12, serviciul cu o întrebare în chat.

**Dependențe:** Q11/Q12; formulele din C numai pentru verificarea rezervării/plății.

**Acceptanță:** programare chat și video în aceeași zi, la schimbarea zilei și în fusuri diferite; două conturi/dispozitive, acceptare, reconectare, navigare în fișă, concluzie și închidere de apel.

### Pachet F — Fișă și investigații

**Acoperire:** FI-01–FI-12.

1. Completați metadatele de încărcare: nume și data efectuării prin calendar în toate categoriile.
2. Ajustați exemplele și mecanismul de editare a textelor/nomenclatorului, conform naturii lor.
3. Adăugați câmpurile de naștere, Apgar, alimentație și dezvoltare, cu afișarea grupei sanguine.
4. Păstrați toate detaliile alergiilor și antecedentelor; faceți clară salvarea automată și starea fiecărei secțiuni.
5. Verificați perechea introducere pacient → citire medic, inclusiv accesul legitim la istoricul vechi.

**Dependențe:** fără dependență de noile formule financiare; poate avansa independent.

**Acceptanță:** încărcare PDF/imagine cu nume de fișier tehnic, data efectuării diferită de încărcare, text lung, vârstă aproximativă la alergie, revenire după refresh și toate rubricile vizibile medicului autorizat.

### Pachet G — PDF-ul consultației și rețeta

**Acoperire:** DO-01–DO-12, AP-05–AP-06.

1. Aplicați structura proces-verbal/decizie, numerotarea, data/ora și datele de identificare pe modelul final.
2. Păstrați diagnosticul și mutați blocurile terapeutice în zona deciziei, cu parafa și momentul aplicării.
3. Schimbați rubrica rețetei în identificare medicament + încărcare fișier, fără duplicarea tratamentului.
4. Includeți rețeta PDF sau imagine în anexa documentului complet și oferiți separat fișierul pentru printare.
5. Adăugați instrucțiunea de printare și un format care nu decupează sau deformează imaginea.
6. Eliminați textele abandonate și verificați completările în noua structură.

**Dependențe:** modelul/textul Q08, formatul Q09 și termenul Q11. Mecanismul de anexare poate fi pregătit înaintea formei finale.

**Acceptanță:** document fără rețetă, rețetă imagine, rețetă PDF cu mai multe pagini, consultație lungă, diacritice, anexă descărcată separat, printare și completare ulterioară. Fără forțarea întregii consultații în exact trei pagini.

### Pachet H — Certificatul pentru grădiniță

**Acoperire:** CE-01–CE-06.

1. Primiți și inventariați modelul 095E, rubricile și exemplarele.
2. Adăugați serviciul în catalog și fluxul de solicitare potrivit.
3. Implementați formularul, completarea comună a ambelor jumătăți, numerotarea și parafele corecte.
4. Generați PDF-ul, exemplarul pacientului și evidența medicului.
5. Verificați descărcarea, imprimarea și reimprimarea fără emitere nouă.

**Dependențe:** blancul și regulile Q08; componentele PDF/parafă din G se reutilizează unde se potrivesc.

**Acceptanță:** emitere pentru doi pacienți, medici diferiți, numere distincte, date comune identice în ambele părți și reimprimare din istoric.

### Pachet I — HIGO și operațiunile operatorului

**Acoperire:** HI-01–HI-04, OP-07–OP-10.

1. Separați vizibilitatea comercială a modulului de sincronizarea identităților cu HIGO.
2. Verificați operatorii creați când modulul era oprit și sincronizați-i fără duplicate.
3. Verificați meniul solicitărilor la modul oprit/pornit și statistica referalului în ambele stări.
4. Implementați/verificați marcarea examinărilor efectuate și rapoartele de volum pe operator/pacient.
5. Separați distribuirea referalului de contact/geolocație; conectați taxa de drum la fluxul acceptat în Q15.
6. Faceți proba completă dispozitiv/operator → pacient → medic cu același context de pacient.

**Dependențe:** acces/configurație HIGO pentru proba reală; contractele și plata din C pentru verificarea financiară; Q15 pentru locație.

**Acceptanță:** creare operator cu modul oprit, activare ulterioară, sincronizare eșuată/reîncercată, examinare reală de probă, citire în ambele cabinete și raport de servicii.

### Pachet J — Pachete, profil permanent și geografie

**Acoperire:** AD-03–AD-04, GE-01–GE-04.

1. Introduceți/reprezentați profilul gratuit de 0 lei ca permanent în model, API, UI și regulile de programare.
2. Migrați profilurile existente conform Q10, fără a acorda implicit profile gratuite suplimentare.
3. Separați în rapoarte pachete cumpărate, capacitate de profiluri și profiluri efectiv create, inclusiv gratuitatea.
4. Adăugați țara și câmpurile internaționale flexibile; păstrați fluxul pentru Moldova.
5. Creați filtrele Moldova/alte țări și distribuția pe localitățile existente.

**Dependențe:** Q10/Q17; poate avansa în paralel cu fișa și conținutul public.

**Acceptanță:** profil gratuit vechi/nou, profil plătit, pachet cu mai multe locuri, utilizator din Moldova și din străinătate, schimbare de țară și totaluri geografice reconciliate.

### Pachet K — Rapoarte și performanță

**Acoperire:** ST-01–ST-12, PE-01–PE-04, IN-06, OP-05, OP-09.

1. Construiți rapoartele financiare din evidența definită în C/D, cu indicatori separați pentru numerar, puncte, comisioane și rezerve.
2. Adăugați venituri din cartele pe tip/total, venituri medicale, instituții, operatori și servicii noi în filtre.
3. Adăugați circuitul complet al bonusurilor: emis pe sursă, sold pe rol și consum pe destinație.
4. Conectați parametrii noi de performanță, cardul de Acasă, topul integral și premiile configurate.
5. Verificați consistența tuturor totalurilor între admin, manager, medic și operator.

**Dependențe:** C/D pentru semnificația tranzacțiilor, Q04/Q17 pentru performanță și numărători. Structura interfeței poate fi pregătită independent.

**Acceptanță:** fiecare indicator poate fi explicat prin lista operațiilor; filtrele schimbă coerent totalurile; modificarea numelui/prețului unui serviciu nu șterge istoricul și nu îl dublează.

### Pachet L — Conținut public, mesaje, setări și stabilizare

**Acoperire:** PU-01–PU-08, AD-02, AD-05, AD-08–AD-12, IN-05, CT-07.

1. Actualizați exemplele reale, prețurile aprobate, numele vizitei operatorului și explicația recenziei recompensate.
2. Standardizați noutățile, imaginile și autorul public; simplificați partenerii fără duplicare și respectați vizibilitatea HIGO.
3. Verificați mesageria administrativă și adăugați iconița cerută; verificați livrarea notificărilor Telegram pe rol.
4. Reorganizați setările și descrierile după regulile finale și eliminați câmpurile contradictorii fără pierderea datelor utile.
5. Publicați în mediul de verificare termenii/politica și contractele furnizate, cu linkuri vizibile; pregătiți pentru lansare versiunile aprobate de client.
6. Corectați procedura de deploy astfel încât textele și datele reale să persiste. Testați explicit acest lucru pe o copie de verificare.
7. Livrați forma Android aleasă la Q14 și verificați instalarea/utilizarea.
8. Executați matricea de acceptanță și pregătiți noua ședință pe o versiune stabilă, cu lista exactă a cerințelor închise și a dependențelor externe rămase.

**Dependențe:** Q14/Q16 și materialele Q08; stabilizarea finală depinde de toate pachetele, nu numai de aspectul public.

**Acceptanță:** verificare pe desktop și telefon, două browsere, toate rolurile, texte editate păstrate după deploy, noutăți/parteneri corecte, mesaj administrativ și notificare livrate.

## 6. Zone tehnice de pornire în proiect

Fișierele au fost identificate în proiect; lista este un punct de pornire, nu lista exhaustivă a modificărilor. La implementare se citesc instrucțiunile locale aplicabile și se urmăresc toate utilizările mecanismului schimbat.

| Pachete | Backend | Frontend |
|---|---|---|
| B — conturi/instituții | `AdminInstitutionController`, `InstitutionController`, `InstitutionMembership`, `InstitutionReports`, `InstitutionTransferService`, `MedicalInstitution` | `InstitutionsPage`, `InstitutionDoctorsPage`, `InstitutionSettingsPage`, `InstitutionReportsPage`, `InstitutionPayoutsPage`, `DoctorRegistrationSteps` |
| C/D — finanțe/recenzii | `FinancialBreakdown`, `InstitutionLedger`, `ConsultationSettlement`, `ConsultationResultAccess`, `ReferralProgram`, `WalletLedger`, `WalletController`, `SettleConsultations` | `WalletPage`, `DoctorProfilePage`, `PatientChatView`, `ConsultationDocuments`, `SettingsPage`, `OperatorAdminPage` |
| E — programare/apel | `DoctorSchedule`, `ConsultationStateMachine`, `ConsultationVideoController`, `ActiveConsultationController` | `PatientConsultationsPage`, `VideoConsultationPage`, `PatientCallContext`, `PatientCallOverlay`, `FinalizeConsultationDialog` |
| F/G/H — fișă/documente | `PatientMedicalRecordController`, `PatientProfileController`, `ConsultationDocumentController`, `MedicalDocumentPublisher`, `ConsultationPdf`, `MedicalDocument` | `PatientMedicalRecord`, `PatientRecordPage`, `DoctorSignature`, `ConsultationDocuments`, `FinalizeConsultationDialog` |
| I — HIGO/operator | `HigoProvisioner`, `SyncHigoEntity`, `HigoExamController`, `HigoExamIngestor`, `AdminOperatorController`, `OperatorTravelFee` | `HigoSyncPage`, `OperatorHome`, `OperatorProfilePage`, `OperatorChatPage`, `OperatorAdminPage` |
| J — pachete/geografie | `PatientProfileController`, `PatientCardPackage`, `AdminPatientCardPackageController`, `AdminRegionController`, `Region` | `PatientCardPackagesPage`, `RegionsPage`, `PatientBasicsFields` și formularele de înscriere/profil |
| K — rapoarte/top | `DoctorPerformance`, `DoctorPromotions`, `PerformanceAwardController`, `ReferralReport`, `InstitutionReports`, rutele rapoartelor financiare | `TransactionsPage`, `ReferralStatsPage`, `DoctorPerformanceCard`, `PerformanceAwards`, `DoctorHome` |
| L — public/admin | `AdministrativeMessageController`, `AdminPartnerController`, `PlatformSetting`, rutele de noutăți/texte/documente | `HomePage`, `PartnersPage`, `NewsRoutes`, `AdministrativeMessagesPage`, `ContractsPage`, `SettingsPage` |

## 7. Migrare și verificare

### Date existente

- **Nu se resetează baza** pentru a aplica schimbări de interfață, texte sau setări. Incidentele relatate cu resetarea sunt probleme de corectat, nu pași de urmat.
- Pentru telefon duplicat se produce raport de conflicte și se stabilește rezolvarea conturilor; nu se execută îndemnul din transcriere de a le șterge.
- Procentele, afilierea și regulile noi se aplică începând cu momentul stabilit; tranzacțiile decontate și documentele publicate nu se recalculează/rescriu automat.
- Pentru consultațiile publicate deja, dar blocate după regula veche, se stabilește migrarea accesului și decontării; procesarea repetată nu plătește de două ori și nu acordă puncte pentru recenzii vechi fără o decizie.
- Profilurile gratuite existente primesc tratamentul decis la Q10; nu se pierde evidența acordării lor.
- Documentele paraclinice fără titlu/data efectuării rămân accesibile și sunt marcate ca având metadate incomplete; data încărcării nu este prezentată ca dată medicală certă.
- Operatorii nesincronizați HIGO sunt reconciliați după identitatea corectă, fără creare în buclă sau atribuirea datelor altui pacient.
- Statisticile istorice pot avea surse insuficiente pentru noile defalcări. Se marchează explicit „istoric fără clasificare” unde este cazul, fără inventarea originii punctelor sau a cotei folosite.

### Verificări necesare la implementare

1. **Reguli financiare:** formule și rotunjiri, numerar/puncte, rate pe instituție/operator, referal, recompensă recenzie, rezervă bancară, anulare și cereri repetate/concurente.
2. **Stări și acces:** publicare fără recenzie, decontare fără blocaj, expirare chat/completări, acces la fișă, roluri multiple, manager al altei instituții și identificarea pacientului corect.
3. **Timp:** aceeași zi, miezul nopții, fusuri orare, schimbarea zilei și termene exacte ale regulilor configurate.
4. **Documente:** randare vizuală a PDF-urilor, diacritice, texte lungi, multipagină, parafă, rețetă anexată și separată, tipărire și certificat cu două părți.
5. **Interfață:** desktop/mobil, două browsere, imagini, parteneri, traduceri, mesaje administrative, formulare și salvare automată.
6. **Integrări reale de probă:** apel între două dispozitive, HIGO, Telegram și procesatorul de plată în mediul/configurația potrivită. Testele cu servicii simulate nu demonstrează singure livrarea externă.
7. **Deploy:** migrare pe copie de verificare, textele editate păstrate, conturile și soldurile păstrate, configurarea cozilor/schedulerului/realtime verificată.

Testele existente se adaptează la noile decizii; de exemplu, un test care cere blocarea rezultatului până la recenzie trebuie înlocuit cu verificarea accesului imediat și a decontării corecte, nu păstrat ca adevăr de produs. Modificările exclusiv editoriale pot fi verificate vizual și prin build, fără teste artificiale care repetă textul implementării.

## 8. Condiția de închidere a lucrării

Pentru fiecare ID din inventar se consemnează implementarea sau verificarea funcției existente, dovada acceptanței și eventual materialul/decizia externă încă necesară. Niciun rând nu se închide prin eticheta „mai puțin important”.

Lucrarea este completă când toate cerințele sunt verificate împreună pe fluxurile pacient, medic, manager, operator și admin; documentele și formulele reflectă deciziile finale; iar lipsa unei recenzii, schimbarea rolului, oprirea afișării HIGO sau un deploy nu lasă rezultate inaccesibile, solduri neexplicate ori date pierdute.

Planul de față nu fixează un termen calendaristic fără evaluarea diferențelor reale și primirea materialelor lipsă. Estimarea se poate face per pachet după matricea A, păstrând toate cerințele în scop.
