<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class RolesSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * @var list<array{name: string, label: string}>
     */
    public const ROLES = [
        ['name' => 'admin', 'label' => 'Administrator'],
        ['name' => 'patient', 'label' => 'Pacient'],
        ['name' => 'doctor', 'label' => 'Medic'],
        ['name' => 'operator', 'label' => 'Operator'],
        ['name' => 'coordinator', 'label' => 'Coordonator'],
    ];

    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        foreach (self::ROLES as $role) {
            Role::query()->updateOrCreate(['name' => $role['name']], $role);
        }
    }
}
