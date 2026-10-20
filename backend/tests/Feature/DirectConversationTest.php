<?php

namespace Tests\Feature;

use App\Events\ConversationUpdated;
use App\Models\Conversation;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DirectConversationTest extends TestCase
{
    use RefreshDatabase;

    public function test_doctor_and_patient_reuse_a_direct_chat_separate_from_patient_channels(): void
    {
        $patient = $this->userWithRole('patient');
        $doctor = $this->userWithRole('doctor');
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Maria']);
        $source = Conversation::create(['patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'status' => 'closed']);
        Event::fake([ConversationUpdated::class]);
        Notification::fake();
        Sanctum::actingAs($doctor);
        $response = $this->postJson('/api/v1/conversations/'.$source->id.'/direct')->assertCreated()
            ->assertJsonPath('data.is_direct', true)->assertJsonPath('data.patient_profile_id', null)
            ->assertJsonPath('data.consultation_request_id', null)->assertJsonPath('data.chat.can_write', true);
        $directId = $response->json('data.id');
        $this->postJson('/api/v1/conversations/'.$source->id.'/direct')->assertOk()->assertJsonPath('data.id', $directId);
        $this->postJson('/api/v1/conversations/'.$directId.'/messages', ['body' => 'Discuție cu titularul'])->assertCreated();
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/conversations/'.$source->id.'/direct')->assertOk()->assertJsonPath('data.id', $directId);
        $this->postJson('/api/v1/conversations/'.$directId.'/messages', ['body' => 'Răspuns direct'])->assertCreated();
        $this->assertSame(2, Conversation::count());
        $this->assertSame(0, $source->messages()->count());
        $this->assertSame(2, Conversation::findOrFail($directId)->messages()->count());
        $this->getJson('/api/v1/conversations?patient_profile='.$profile->id)->assertOk()->assertJsonCount(1, 'data');
        $this->artisan('patients:repair-contexts')->assertSuccessful();
        $this->assertNull(Conversation::findOrFail($directId)->patient_profile_id);
    }

    public function test_operator_direct_chat_excludes_the_doctor_and_cannot_be_read_by_them(): void
    {
        $patient = $this->userWithRole('patient');
        $doctor = $this->userWithRole('doctor');
        $operator = $this->userWithRole('operator');
        $source = Conversation::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'operator_id' => $operator->id, 'status' => 'open']);
        Event::fake([ConversationUpdated::class]);
        Sanctum::actingAs($operator);
        $response = $this->postJson('/api/v1/conversations/'.$source->id.'/direct')->assertCreated()
            ->assertJsonPath('data.operator_id', $operator->id)->assertJsonPath('data.doctor_id', null);
        $operatorDirectId = $response->json('data.id');
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/conversations/'.$operatorDirectId)->assertForbidden();
        $this->postJson('/api/v1/conversations/'.$operatorDirectId.'/messages', ['body' => 'Interzis'])->assertForbidden();
        $this->postJson('/api/v1/conversations/'.$operatorDirectId.'/direct')->assertForbidden();
        $doctorResponse = $this->postJson('/api/v1/conversations/'.$source->id.'/direct')->assertCreated()
            ->assertJsonPath('data.doctor_id', $doctor->id)->assertJsonPath('data.operator_id', null);
        $this->assertNotSame($operatorDirectId, $doctorResponse->json('data.id'));
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/conversations/'.$operatorDirectId.'/direct')->assertOk()->assertJsonPath('data.id', $operatorDirectId);
    }

    public function test_outsider_or_wrong_active_role_cannot_create_a_direct_chat(): void
    {
        $patient = $this->userWithRole('patient');
        $doctor = $this->userWithRole('doctor');
        $source = Conversation::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id]);
        Sanctum::actingAs($this->userWithRole('doctor'));
        $this->postJson('/api/v1/conversations/'.$source->id.'/direct')->assertForbidden();
        $patientRole = Role::where('name', 'patient')->firstOrFail();
        $doctor->roles()->attach($patientRole);
        $doctor->forceFill(['active_role_id' => $patientRole->id])->save();
        Sanctum::actingAs($doctor->fresh());
        $this->postJson('/api/v1/conversations/'.$source->id.'/direct')->assertForbidden();
        $this->assertSame(1, Conversation::count());
    }

    private function userWithRole(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id]);
        $user->roles()->attach($role);

        return $user;
    }
}
