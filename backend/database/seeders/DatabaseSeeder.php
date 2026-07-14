<?php

namespace Database\Seeders;

use App\Models\BlogPost;
use App\Models\Partner;
use App\Models\PatientCardPackage;
use App\Models\PlatformSetting;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Services\PlatformConfig;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call(RolesSeeder::class);

        $roles = Role::query()
            ->whereIn('name', array_column(RolesSeeder::ROLES, 'name'))
            ->get()
            ->keyBy('name');

        collect([
            ['name' => 'Medicină de familie', 'slug' => 'medicina-de-familie'],
            ['name' => 'Cardiologie', 'slug' => 'cardiologie'],
            ['name' => 'Pediatrie', 'slug' => 'pediatrie'],
            ['name' => 'Dermatologie', 'slug' => 'dermatologie'],
            ['name' => 'Endocrinologie', 'slug' => 'endocrinologie'],
        ])->each(fn (array $specialty) => Specialty::updateOrCreate(['slug' => $specialty['slug']], $specialty));

        $admin = User::updateOrCreate(
            ['email' => 'admin@doctor.md'],
            [
                'name' => 'Administrator',
                'phone' => null,
                'password' => 'password',
                'status' => 'active',
                'active_role_id' => $roles['admin']->id,
            ],
        );
        $admin->roles()->syncWithoutDetaching([$roles['admin']->id]);

        collect(PlatformConfig::DEFAULTS)->each(fn (array $setting, string $key) => PlatformSetting::updateOrCreate(
            ['key' => $key],
            [
                'value' => $setting['value'],
                'group' => $setting['group'],
                'type' => $setting['type'],
                'effective_from' => now(),
            ],
        ));

        collect([
            ['name' => '1 profil / an', 'description' => 'Deblochează un profil de pacient pentru consultații și examinări timp de un an.', 'profile_slots' => 1, 'price_minor' => 24000],
            ['name' => '2 profiluri / an', 'description' => 'Potrivit pentru două profiluri din familie, fiecare cu fișă medicală separată.', 'profile_slots' => 2, 'price_minor' => 45000],
            ['name' => '6 profiluri / an', 'description' => 'Pachet pentru familie extinsă, cu până la șase profiluri active pe același cont.', 'profile_slots' => 6, 'price_minor' => 60000],
        ])->each(fn (array $package) => PatientCardPackage::updateOrCreate(
            ['profile_slots' => $package['profile_slots']],
            [...$package, 'validity_days' => 365, 'is_active' => true],
        ));

        collect([
            [
                'title' => 'Cum funcționează o consultație online pe telemedconsult.md',
                'slug' => 'cum-functioneaza-consultatia-online',
                'excerpt' => 'De la programare la rețetă: pașii unei consultații de telemedicină, explicați simplu.',
                'body' => "Telemedicina aduce medicul mai aproape de tine, oriunde te-ai afla.\n\nPe telemedconsult.md alegi specialistul, rezervi un interval liber și discuți prin chat sau video. Medicul îți poate recomanda investigații, iar un operator se poate deplasa la tine pentru recoltări sau examinări cu dispozitive medicale.\n\nToate datele tale medicale rămân într-o fișă sigură, accesibilă doar ție și medicilor cu care lucrezi.",
                'author_name' => 'Echipa telemedconsult.md',
            ],
            [
                'title' => 'Ești medic? Iată cum te poți alătura platformei',
                'slug' => 'medici-cum-te-alaturi-platformei',
                'excerpt' => 'Înregistrare rapidă, verificare a licenței și acces la pacienți din toată țara.',
                'body' => "telemedconsult.md caută constant medici dedicați care vor să ofere consultații la distanță.\n\nCreează un cont de medic, adaugă specialitatea și numărul de licență, iar echipa noastră îți verifică profilul. După aprobare, îți setezi disponibilitatea și începi să primești solicitări de la pacienți.",
                'author_name' => 'Echipa telemedconsult.md',
            ],
        ])->each(fn (array $post) => BlogPost::updateOrCreate(
            ['slug' => $post['slug']],
            [...$post, 'is_published' => true, 'published_at' => now()],
        ));

        collect([
            ['name' => 'Farmacia Familiei', 'website_url' => 'https://example.com', 'description' => 'Rețea de farmacii partenere pentru livrarea rețetelor.', 'sort_order' => 1],
            ['name' => 'Laborator Synevo', 'website_url' => 'https://example.com', 'description' => 'Analize de laborator la domiciliu prin operatorii platformei.', 'sort_order' => 2],
            ['name' => 'HIGO Health', 'website_url' => 'https://example.com', 'description' => 'Dispozitive medicale conectate pentru examinări la distanță.', 'sort_order' => 3],
        ])->each(fn (array $partner) => Partner::updateOrCreate(
            ['name' => $partner['name']],
            [...$partner, 'is_active' => true],
        ));

        $this->call(MoldovaRegionsSeeder::class);
        $this->call(InvestigationTypesSeeder::class);
    }
}
