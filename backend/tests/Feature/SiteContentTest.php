<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\SiteContent as SiteContentModel;
use App\Models\User;
use App\Services\SiteContent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SiteContentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'patient'] as $name) {
            Role::firstOrCreate(['name' => $name], ['label' => ucfirst($name)]);
        }
    }

    public function test_public_endpoint_returns_defaults_when_nothing_is_customised(): void
    {
        $response = $this->getJson('/api/v1/catalog/site-content')->assertOk();

        $data = $response->json('data');
        $defaults = SiteContent::defaults();

        $this->assertSame($defaults, $data);
        $this->assertSame('Pregătit să începi?', $data['home.cta.title']);
    }

    public function test_admin_can_edit_a_text_and_it_becomes_public(): void
    {
        $this->actingAsAdmin();

        $this->putJson('/api/v1/admin/site-content', [
            'values' => ['home.cta.title' => 'Hai să începem!'],
        ])->assertOk();

        $this->assertSame(
            'Hai să începem!',
            $this->getJson('/api/v1/catalog/site-content')->json('data.home.cta.title'),
        );
    }

    public function test_empty_or_default_value_removes_the_override(): void
    {
        $this->actingAsAdmin();
        $defaults = SiteContent::defaults();

        $this->putJson('/api/v1/admin/site-content', [
            'values' => ['news.title' => 'Ultimele știri'],
        ])->assertOk();
        $this->assertDatabaseHas('site_contents', ['key' => 'news.title']);

        // Text golit -> revine la implicit, fără rând în tabelă.
        $this->putJson('/api/v1/admin/site-content', ['values' => ['news.title' => '']])->assertOk();
        $this->assertDatabaseMissing('site_contents', ['key' => 'news.title']);

        // Valoare identică cu implicitul -> nu se stochează degeaba.
        $this->putJson('/api/v1/admin/site-content', [
            'values' => ['news.title' => $defaults['news.title']],
        ])->assertOk();
        $this->assertDatabaseMissing('site_contents', ['key' => 'news.title']);

        $this->assertSame(
            $defaults['news.title'],
            $this->getJson('/api/v1/catalog/site-content')->json('data.news.title'),
        );
    }

    public function test_unknown_keys_and_too_long_values_are_rejected(): void
    {
        $this->actingAsAdmin();

        $this->putJson('/api/v1/admin/site-content', [
            'values' => ['inexistent.key' => 'ceva'],
        ])->assertUnprocessable();

        $limits = SiteContent::limits();
        $this->putJson('/api/v1/admin/site-content', [
            'values' => ['home.cta.title' => str_repeat('a', $limits['home.cta.title'] + 1)],
        ])->assertUnprocessable();

        $this->assertDatabaseCount('site_contents', 0);
    }

    public function test_reset_restores_a_whole_block(): void
    {
        $this->actingAsAdmin();

        $this->putJson('/api/v1/admin/site-content', [
            'values' => [
                'home.cta.title' => 'Titlu schimbat',
                'home.cta.button' => 'Buton schimbat',
            ],
        ])->assertOk();
        $this->assertDatabaseCount('site_contents', 2);

        $this->postJson('/api/v1/admin/site-content/reset', ['group' => 'home_cta'])->assertOk();

        $this->assertDatabaseCount('site_contents', 0);
        $this->assertSame(
            SiteContent::defaults()['home.cta.title'],
            $this->getJson('/api/v1/catalog/site-content')->json('data.home.cta.title'),
        );
    }

    public function test_non_admins_cannot_read_or_edit_the_admin_endpoints(): void
    {
        $patient = User::factory()->create(['status' => 'active']);
        $patient->roles()->sync([Role::where('name', 'patient')->value('id')]);
        Sanctum::actingAs($patient);

        $this->getJson('/api/v1/admin/site-content')->assertForbidden();
        $this->putJson('/api/v1/admin/site-content', [
            'values' => ['home.cta.title' => 'Hack'],
        ])->assertForbidden();

        $this->assertDatabaseCount('site_contents', 0);
    }

    public function test_admin_groups_expose_every_catalog_field(): void
    {
        $this->actingAsAdmin();

        $groups = $this->getJson('/api/v1/admin/site-content')->assertOk()->json('groups');

        $this->assertSameSize(SiteContent::CATALOG, $groups);

        $keysFromGroups = collect($groups)->flatMap(fn (array $group) => array_column($group['fields'], 'key'))->sort()->values()->all();
        $keysFromCatalog = collect(array_keys(SiteContent::defaults()))->sort()->values()->all();

        $this->assertSame($keysFromCatalog, $keysFromGroups);

        // Fiecare bloc trebuie să aibă un identificator de previzualizare, altfel
        // panoul de administrare nu poate afișa „unde apare textul”.
        foreach ($groups as $group) {
            $this->assertNotEmpty($group['preview'], "Blocul {$group['key']} nu are previzualizare.");
            $this->assertNotEmpty($group['label']);
            $this->assertNotEmpty($group['description']);
        }
    }

    public function test_stale_override_for_removed_key_is_ignored(): void
    {
        // Un text rămas în baza de date după ce cheia a fost scoasă din catalog
        // nu trebuie să apară în răspunsul public.
        SiteContentModel::create(['key' => 'cheie.veche', 'value' => 'text vechi']);

        $data = $this->getJson('/api/v1/catalog/site-content')->assertOk()->json('data');

        $this->assertArrayNotHasKey('cheie.veche', $data);
    }

    /**
     * Frontendul are o copie a textelor implicite împachetată în bundle, ca
     * paginile să nu fie goale înainte de răspunsul API-ului. Dacă cele două
     * liste se desincronizează, utilizatorul vede un text care „sare” la
     * încărcare sau o cheie fără valoare. Testul păzește exact acest caz.
     */
    public function test_frontend_fallback_matches_the_backend_catalog(): void
    {
        $path = base_path('../frontend/src/lib/site-content-defaults.ts');

        if (! is_file($path)) {
            $this->markTestSkipped('Sursele frontendului nu sunt disponibile în acest mediu.');
        }

        $source = file_get_contents($path);

        preg_match_all(
            "/^\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)+)':\s*\n?\s*'((?:[^'\\\\]|\\\\.)*)'/m",
            $source,
            $matches,
            PREG_SET_ORDER,
        );

        $frontend = [];

        foreach ($matches as $match) {
            $frontend[$match[1]] = str_replace("\\'", "'", $match[2]);
        }

        $backend = SiteContent::defaults();

        ksort($frontend);
        ksort($backend);

        $this->assertSame(
            array_keys($backend),
            array_keys($frontend),
            'Cheile din site-content-defaults.ts nu coincid cu cele din SiteContent::CATALOG.',
        );

        foreach ($backend as $key => $value) {
            $this->assertSame(
                $value,
                $frontend[$key],
                "Textul implicit pentru „{$key}” diferă între backend și frontend.",
            );
        }
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->roles()->sync([Role::where('name', 'admin')->value('id')]);
        Sanctum::actingAs($admin);

        return $admin;
    }
}
