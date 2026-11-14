Confirmă operația cu puncte
Beneficiar: {{ $beneficiaryName }} ({{ $beneficiaryEmail }})
{{ $operation === 'promotion' ? 'Acordare promoție' : ($payload['amount_minor'] > 0 ? 'Adăugare puncte bonus' : 'Scădere puncte bonus') }}: {{ number_format(abs($payload['amount_minor']) / 100, 2, ',', '.') }} puncte.
Motiv: {{ $payload['reason'] }}
Cod de confirmare: {{ $code }}
Valabil până la {{ $expiresAt }}. Operația se execută numai după introducerea codului în panoul administratorului.
Dacă nu ai solicitat această operație, nu comunica acest cod.
