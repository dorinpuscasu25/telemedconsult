<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><title>Confirmarea operației cu puncte</title></head>
<body>
<h1>Confirmă operația cu puncte</h1>
<p>Beneficiar: {{ $beneficiaryName }} ({{ $beneficiaryEmail }})</p>
<p>{{ $operation === 'promotion' ? 'Acordare promoție' : ($payload['amount_minor'] > 0 ? 'Adăugare puncte bonus' : 'Scădere puncte bonus') }}: <strong>{{ number_format(abs($payload['amount_minor']) / 100, 2, ',', '.') }} puncte</strong>.</p>
<p>Motiv: {{ $payload['reason'] }}</p>
<p>Cod de confirmare: <strong>{{ $code }}</strong></p>
<p>Valabil până la {{ $expiresAt }}. Operația se execută numai după introducerea codului în panoul administratorului.</p>
<p>Dacă nu ai solicitat această operație, nu comunica acest cod.</p>
</body></html>
