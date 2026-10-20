<!doctype html>
<html lang="ro">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{ $purpose === 'login' ? 'Cod de autentificare' : 'Confirmare email' }} · telemedconsult.md</title></head>
<body style="margin:0;padding:0;background-color:#f5f5ff;color:#17243b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{ $purpose === 'login' ? 'Un pas simplu pentru a intra în contul tău.' : 'Confirmă adresa de email pentru a continua în platformă.' }}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background-color:#f5f5ff;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
<tr><td align="center" style="padding:0 0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" width="36" height="36" style="width:36px;height:36px;background-color:#4f46e5;border-radius:11px;color:#ffffff;font-size:25px;font-weight:bold;line-height:36px;" aria-hidden="true">+</td><td style="padding-left:10px;font-size:20px;font-weight:bold;color:#17243b;">telemedconsult<span style="color:#6154e8;">.md</span></td></tr></table>
</td></tr>
<tr><td style="background-color:#ffffff;border:1px solid #e8e7f4;border-top:4px solid #6354eb;border-radius:16px;padding:32px 28px;">
<p style="margin:0 0 12px;font-size:11px;letter-spacing:1.5px;font-weight:bold;color:#6452de;text-transform:uppercase;">{{ $purpose === 'login' ? 'Acces în siguranță' : 'Bine ai venit' }}</p>
<h1 style="margin:0 0 18px;font-size:26px;line-height:34px;font-weight:bold;color:#17243b;">{{ $purpose === 'login' ? 'Codul tău de autentificare' : 'Confirmă adresa de email' }}</h1>
<p style="margin:0 0 10px;font-size:15px;line-height:24px;">Bună{{ $userName ? ', '.$userName : '' }}!</p>
<p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#58657b;">{{ $purpose === 'login' ? 'Folosește codul de mai jos pentru a finaliza autentificarea în contul tău.' : 'Folosește codul de mai jos pentru a confirma adresa de email și a continua în contul tău.' }}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;"><tr><td align="center" style="padding:22px 8px;background-color:#f1efff;border:1px solid #e3ddff;border-radius:12px;">
<p style="margin:0 0 9px;font-size:11px;letter-spacing:1.5px;font-weight:bold;color:#6b60a3;">CODUL TĂU</p>
<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td dir="ltr" style="font-family:Consolas,Monaco,monospace;font-size:36px;font-weight:bold;letter-spacing:7px;line-height:46px;color:#4935bd;user-select:all;-webkit-user-select:all;">{{ $code }}</td>
@if($copyUrl)
<td style="padding-left:16px;"><a href="{{ $copyUrl }}" title="Deschide în browser pentru a copia codul" style="display:inline-block;padding:10px;border:1px solid #d9d2ff;border-radius:10px;background-color:#ffffff;text-decoration:none;line-height:20px;"><img src="{{ $message->embed(resource_path('images/mail/copy.png')) }}" alt="Copiază codul" width="22" height="22" style="display:block;border:0;width:22px;height:22px;"></a></td>
@endif
</tr></table>
@if($copyUrl)<p style="margin:10px 0 0;font-size:11px;line-height:18px;color:#6b60a3;">Iconița deschide copierea codului în browser.</p>@endif
</td></tr></table>
<p style="margin:14px 0 24px;text-align:center;font-size:13px;line-height:21px;color:#68758c;">Codul expiră în <strong>{{ $expiresMinutes }} {{ $expiresMinutes === 1 ? 'minut' : 'minute' }}</strong> și poate fi folosit o singură dată.</p>
@if($actionUrl)
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;"><tr><td align="center"><a href="{{ $actionUrl }}" style="display:inline-block;padding:14px 24px;background-color:#4f46e5;border-radius:10px;color:#ffffff;font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;">Introdu codul automat</a></td></tr></table>
<p style="margin:12px 0 24px;text-align:center;font-size:12px;line-height:20px;color:#68758c;">Butonul deschide pagina cu codul completat. Tu confirmi {{ $purpose === 'login' ? 'autentificarea' : 'adresa de email' }} în platformă.</p>
@endif
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #eeedf6;"><tr><td style="padding-top:20px;"><p style="margin:0 0 6px;font-size:13px;line-height:21px;font-weight:bold;color:#36435b;">Păstrează codul și linkul doar pentru tine.</p><p style="margin:0;font-size:12px;line-height:20px;color:#68758c;">Nu le comunica altor persoane. Echipa telemedconsult.md nu îți va cere acest cod. Dacă nu ai solicitat {{ $purpose === 'login' ? 'autentificarea' : 'crearea sau confirmarea contului' }}, ignoră acest email.</p></td></tr></table>
</td></tr>
<tr><td align="center" style="padding:24px 18px;font-size:12px;line-height:20px;color:#8790a5;">telemedconsult.md<br>Îngrijire medicală, mai aproape de tine.<br><span style="font-size:11px;">Acesta este un mesaj automat. Nu răspunde la acest email.</span></td></tr>
</table>
</td></tr></table>
</body></html>
