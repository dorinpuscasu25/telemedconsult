<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><style>
@page { margin: 40px 48px 52px; }
body { font-family: "DejaVu Sans", sans-serif; color: #182638; font-size: 10px; line-height: 1.55; }
h1 { font-size: 19px; margin: 18px 0 8px; } h2 { font-size: 11px; margin: 15px 0 4px; color: #174c72; page-break-after: avoid; }
.header { border-bottom: 2px solid #174c72; padding-bottom: 12px; } .brand { font-size: 17px; font-weight: bold; color: #174c72; }
.meta { padding: 12px; background: #f1f5f9; margin-bottom: 15px; } .text { white-space: pre-wrap; overflow-wrap: break-word; word-wrap: break-word; }
.signature { margin-top: 25px; page-break-inside: avoid; } .signature img { max-height: 95px; max-width: 220px; }
.footer { position: fixed; bottom: -30px; font-size: 8px; color: #64748b; } .label { font-weight: bold; }
</style></head><body>

<div class="header"><div class="brand">{{ $record['clinic'] ?? 'telemedconsult.md' }}</div><div>{{ $record['clinic_details'] ?? '' }}</div></div>
<h1>{{ $record['title'] }}</h1>
<div class="meta"><span class="label">Pacient:</span> {{ $record['patient_name'] }} · Cod {{ $record['patient_code'] }}<br>
<span class="label">Data nașterii:</span> {{ $record['birth_date'] ?? '-' }} · <span class="label">Localitate:</span> {{ $record['locality'] ?? '-' }}<br>
<span class="label">Medic:</span> {{ $record['doctor_name'] }} · {{ $record['specialty'] ?? '' }}<br>
<span class="label">Data:</span> {{ $record['published_at'] }} · Consultație #{{ $record['consultation_id'] }}
@if(!empty($record['parent_document_id']))<br>Completare la documentul #{{ $record['parent_document_id'] }}@endif</div>
@foreach($record['sections'] as $title => $content)
@if(filled($content))<h2>{{ $title }}</h2><div class="text">{{ $content }}</div>@endif
@endforeach
<div class="signature"><div class="label">{{ $record['doctor_name'] }}</div>
@if(!empty($record['signature_image']))<img src="{{ $record['signature_image'] }}" alt="Parafă și semnătură"><br><span>Imagine aplicată la {{ $record['published_at'] }}</span>@endif
</div>

</body></html>
