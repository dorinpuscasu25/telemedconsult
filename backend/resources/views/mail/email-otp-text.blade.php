telemedconsult.md

{{ $purpose === 'login' ? 'Codul tău de autentificare' : 'Confirmă adresa de email' }}

Bună{{ $userName ? ', '.$userName : '' }}!

{{ $purpose === 'login' ? 'Folosește codul pentru a finaliza autentificarea în contul tău.' : 'Folosește codul pentru a confirma adresa de email și a continua în contul tău.' }}

Codul tău: {{ $code }}

Codul expiră în {{ $expiresMinutes }} {{ $expiresMinutes === 1 ? 'minut' : 'minute' }} și poate fi folosit o singură dată.
@if($actionUrl)

Introdu codul automat: {!! $actionUrl !!}

Copiază codul în browser: {!! $copyUrl !!}

Linkul deschide pagina cu codul completat. Tu confirmi {{ $purpose === 'login' ? 'autentificarea' : 'adresa de email' }} în platformă.
@endif

Păstrează codul și linkul doar pentru tine. Nu le comunica altor persoane.
Echipa telemedconsult.md nu îți va cere acest cod.
Dacă nu ai solicitat {{ $purpose === 'login' ? 'autentificarea' : 'crearea sau confirmarea contului' }}, ignoră acest email.

Acesta este un mesaj automat. Nu răspunde la acest email.
