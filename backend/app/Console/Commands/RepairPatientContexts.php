<?php

namespace App\Console\Commands;

use App\Models\Consultation;
use App\Models\Conversation;
use App\Models\MedicalDocument;
use App\Models\Message;
use App\Models\PatientInvestigation;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class RepairPatientContexts extends Command
{
    protected $signature = 'patients:repair-contexts';

    protected $description = 'Reface legăturile sigure dintre conversațiile/documentele vechi și profilul pacientului.';

    public function handle(): int
    {
        $repaired = 0;
        Conversation::with('consultationRequest')->whereNull('patient_profile_id')->chunkById(200, function ($items) use (&$repaired) {
            foreach ($items as $item) {
                $profile = $item->consultationRequest?->patient_profile_id;
                if ($profile && (int) $item->patient_id === (int) $item->consultationRequest->patient_id) {
                    $item->forceFill(['patient_profile_id' => $profile])->save();
                    $repaired++;
                }
            }
        });
        MedicalDocument::whereNull('patient_profile_id')->whereNotNull('consultation_id')->chunkById(200, function ($items) use (&$repaired) {
            foreach ($items as $item) {
                $consultation = Consultation::find($item->consultation_id);
                if ($consultation?->patient_profile_id && (int) $item->patient_id === (int) $consultation->patient_id) {
                    $item->forceFill(['patient_profile_id' => $consultation->patient_profile_id, 'consultation_request_id' => $consultation->consultation_request_id])->save();
                    $repaired++;
                }
            }
        });
        Message::whereIn('type', ['image', 'file'])->chunkById(200, function ($items) {
            foreach ($items as $item) {
                $metadata = json_decode($item->getRawOriginal('metadata') ?? '{}', true);
                $path = $metadata['path'] ?? '';
                if (($metadata['disk'] ?? null) === 'local' || ! str_starts_with($path, 'chat-attachments/') || ! $this->copyToPrivate($path)) {
                    continue;
                }
                unset($metadata['url']);
                $metadata['disk'] = 'local';
                $item->forceFill(['metadata' => $metadata])->save();
                Storage::disk('public')->delete($path);
            }
        });
        PatientInvestigation::where(function ($query) {
            $query->whereNull('file_disk')->orWhere('file_disk', 'public');
        })->whereNotNull('file_path')->chunkById(200, function ($items) {
            foreach ($items as $item) {
                if (! str_starts_with($item->file_path, 'patient-investigations/') || ! $this->copyToPrivate($item->file_path)) {
                    continue;
                }
                $item->forceFill(['file_disk' => 'local'])->save();
                Storage::disk('public')->delete($item->file_path);
            }
        });
        $this->info('Legături refăcute: '.$repaired);

        return self::SUCCESS;
    }

    private function copyToPrivate(string $path): bool
    {
        $public = Storage::disk('public');
        $private = Storage::disk('local');
        if (! $public->exists($path)) {
            return $private->exists($path);
        }
        $bytes = $public->get($path);
        if ($private->exists($path)) {
            return hash_equals(hash('sha256', $bytes), hash('sha256', $private->get($path)));
        }

        return $private->put($path, $bytes);
    }
}
