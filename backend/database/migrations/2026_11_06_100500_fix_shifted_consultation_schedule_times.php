<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Până la StoresDatesInAppTimezone, orele trimise din browser în UTC (pacientul
 * la creare, medicul la propunerea unei ore noi) erau salvate fără conversie,
 * deci cu 2–3 ore mai devreme pe un server Europe/Chisinau. Operatorul trimitea
 * ora locală, deci propunerile lui au fost salvate corect.
 *
 * Regula: o oră care coincide cu un mesaj de sistem „A fost propus un nou
 * interval: d.m.Y H:i” (scris mereu corect, în ora Moldovei) e lăsată în pace;
 * celelalte sunt reinterpretate ca UTC și convertite la fusul aplicației.
 */
return new class extends Migration
{
    private const PREFIX = 'A fost propus un nou interval: ';

    public function up(): void
    {
        $timezone = config('app.timezone');
        if (! $timezone || $timezone === 'UTC') {
            return;
        }

        DB::table('consultation_requests')
            ->where(fn ($query) => $query->whereNotNull('scheduled_at')->orWhereNotNull('proposed_scheduled_at'))
            ->orderBy('id')
            ->each(function ($row) use ($timezone) {
                $proposals = DB::table('messages')
                    ->join('conversations', 'conversations.id', '=', 'messages.conversation_id')
                    ->where('conversations.consultation_request_id', $row->id)
                    ->where('messages.body', 'like', self::PREFIX.'%')
                    ->pluck('messages.body')
                    ->map(fn (string $body) => trim(substr($body, strlen(self::PREFIX))))
                    ->all();

                $changes = [];
                foreach (['scheduled_at', 'proposed_scheduled_at'] as $column) {
                    if (! $row->{$column}) {
                        continue;
                    }
                    $stored = Carbon::parse($row->{$column}, $timezone);
                    if (in_array($stored->format('d.m.Y H:i'), $proposals, true)) {
                        continue;
                    }
                    $changes[$column] = Carbon::parse($row->{$column}, 'UTC')->setTimezone($timezone)->format('Y-m-d H:i:s');
                }

                if ($changes) {
                    DB::table('consultation_requests')->where('id', $row->id)->update($changes);
                }
            });
    }

    public function down(): void {}
};
