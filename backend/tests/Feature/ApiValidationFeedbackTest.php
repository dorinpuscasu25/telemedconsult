<?php

namespace Tests\Feature;

use App\Http\Middleware\SetApiLocale;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ApiValidationFeedbackTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['app.locale' => 'en']);
        app()->setLocale('en');
        Route::middleware(SetApiLocale::class)->post('/api/validation-check', function (Request $request) {
            return $request->validate([
                'email' => ['required', 'email'],
                'bio' => ['required', 'string', 'max:10'],
                'platforms' => ['array'],
                'platforms.*.name' => ['required_with:platforms', 'string'],
                'platforms.*.value' => ['required_with:platforms', 'string'],
                'video_duration_minutes' => ['integer', 'min:5'],
            ]);
        });
        Route::middleware(SetApiLocale::class)->post('/api/custom-validation-check', function () {
            throw ValidationException::withMessages(['amount' => 'Sold insuficient. Încarcă portofelul.']);
        });
        Route::middleware('web')->post('/web-validation-check', fn (Request $request) => $request->validate(['email' => ['required']]));
    }

    public function test_api_returns_all_romanian_field_errors_even_when_configured_locale_is_english(): void
    {
        $response = $this->postJson('/api/validation-check', ['email' => 'invalid', 'bio' => str_repeat('a', 11), 'platforms' => [[]], 'video_duration_minutes' => 2])
            ->assertUnprocessable()->assertJsonPath('message', 'Verifică datele completate și corectează câmpurile indicate.')
            ->assertJsonValidationErrors(['email', 'bio', 'platforms.0.name', 'platforms.0.value', 'video_duration_minutes'])
            ->assertJsonPath('errors.email.0', 'Introdu o adresă de email validă.')
            ->assertJsonPath('errors.bio.0', 'Descriere / spectru de probleme poate conține cel mult 10 caractere.')
            ->assertJsonPath('errors.video_duration_minutes.0', 'Durată video (min) trebuie să fie cel puțin 5.');
        $this->assertSame('Completează câmpul Denumirea platformei video.', $response->json('errors')['platforms.0.name'][0]);
        $this->assertStringNotContainsString('validation.', $response->getContent());
        $this->assertStringNotContainsString('more errors', $response->getContent());
        $this->assertSame('en', app()->getLocale());
    }

    public function test_custom_validation_errors_are_preserved(): void
    {
        $this->postJson('/api/custom-validation-check')->assertUnprocessable()->assertJsonPath('errors.amount.0', 'Sold insuficient. Încarcă portofelul.');
    }

    public function test_web_validation_keeps_original_behavior_and_locale(): void
    {
        $this->post('/web-validation-check')->assertRedirect()->assertSessionHasErrors(['email' => 'The email field is required.']);
    }
}
