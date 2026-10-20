<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><style>
@page { margin: 40px 48px 52px; }
body { font-family: "DejaVu Sans", sans-serif; color: #182638; font-size: 10px; line-height: 1.55; }
h1 { text-align:center; font-size: 17px; margin: 12px 0 4px; } h2 { font-size: 11px; margin: 15px 0 4px; color: #174c72; page-break-after: avoid; }
.clinic-logo { max-width: 460px; max-height: 75px; } .doctor-header { text-align: right; margin: 12px 0; } .document-date { text-align: center; margin-bottom: 8px; }
.header { text-align:center; border-bottom: 2px solid #174c72; padding-bottom: 12px; } .brand { font-size: 17px; font-weight: bold; color: #174c72; }
.meta { padding: 12px; background: #ffffff; margin-bottom: 15px; } .text { white-space: pre-wrap; overflow-wrap: break-word; word-wrap: break-word; }
.signature { margin-top: 25px; page-break-inside: avoid; } .signature img { max-height: 95px; max-width: 220px; }
.footer { position: fixed; bottom: -30px; font-size: 8px; color: #64748b; } .label { font-weight: bold; }
</style></head><body>

<div class="header">@if(!empty($record['clinic_logo_image']))<img class="clinic-logo" src="{{ $record['clinic_logo_image'] }}" alt="Sigla clinicii"><br>@endif<div class="brand">{{ $record['clinic'] ?? 'telemedconsult.md' }}</div><div class="text">{{ $record['clinic_details'] ?? '' }}</div></div>
<h1>{{ $record['title'] }}</h1>
<div class="document-date"><span class="label">Data consultației:</span> {{ $record['published_at'] }} · Nr. {{ $record['consultation_id'] }}</div>
<div class="doctor-header"><strong>Medic {{ $record['specialty'] ?? '' }}<br>{{ $record['doctor_name'] }}</strong>@if(!empty($record['doctor_phone']))<br>Telefon: {{ $record['doctor_phone'] }}@endif @if(!empty($record['doctor_contacts']))<br>{{ $record['doctor_contacts'] }}@endif</div>
<div class="meta"><span class="label">Pacient:</span> {{ $record['patient_name'] }} · Cod {{ $record['patient_code'] }}<br>
<span class="label">Data nașterii:</span> {{ $record['birth_date'] ?? '-' }} · <span class="label">Localitate:</span> {{ $record['locality'] ?? '-' }}<br>

@if(!empty($record['parent_document_id']))<br>Completare la documentul #{{ $record['parent_document_id'] }}@endif</div>
@foreach($record['sections'] as $title => $content)
@if(filled($content))<h2>{{ $title }}</h2><div class="text">{{ $content }}</div>@endif
@endforeach
@if(!empty($record['has_prescription']))<h2>Rețetă scanată atașată</h2><div class="text">{{ $record['prescription_instructions'] }}</div>@endif
<div class="signature"><div class="label">{{ $record['doctor_name'] }}</div>
@if(!empty($record['signature_image']))<table style="width:100%;border-collapse:collapse"><tr><td style="width:230px"><img src="{{ $record['signature_image'] }}" alt="Parafă și semnătură"></td><td><span class="label">Parafă și semnătură aplicate la</span><br>{{ $record['published_at'] }}</td></tr></table>@endif
</div>

</body></html>
