<?php

namespace Database\Seeders;

use App\Models\Locality;
use App\Models\Region;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class MoldovaRegionsSeeder extends Seeder
{
    use WithoutModelEvents;

    private const COUNTRY = 'Republica Moldova';

    /**
     * The 32 raioane of Moldova. The county seat (reședință) shares the raion
     * name, so a single minimal locality is seeded per raion.
     *
     * @var list<string>
     */
    private const RAIOANE = [
        'Anenii Noi', 'Basarabeasca', 'Briceni', 'Cahul', 'Cantemir', 'Călărași',
        'Căușeni', 'Cimișlia', 'Criuleni', 'Dondușeni', 'Drochia', 'Dubăsari',
        'Edineț', 'Fălești', 'Florești', 'Glodeni', 'Hîncești', 'Ialoveni',
        'Leova', 'Nisporeni', 'Ocnița', 'Orhei', 'Rezina', 'Rîșcani',
        'Sîngerei', 'Soroca', 'Strășeni', 'Șoldănești', 'Ștefan Vodă',
        'Taraclia', 'Telenești', 'Ungheni',
    ];

    /**
     * Non-raion administrative units, each with its reședință locality.
     *
     * @var list<array{name: string, type: string, seat: string}>
     */
    private const SPECIAL_UNITS = [
        ['name' => 'Chișinău', 'type' => 'municipiu', 'seat' => 'Chișinău'],
        ['name' => 'Bălți', 'type' => 'municipiu', 'seat' => 'Bălți'],
        ['name' => 'Bender', 'type' => 'municipiu', 'seat' => 'Bender'],
        ['name' => 'UTA Găgăuzia', 'type' => 'uta', 'seat' => 'Comrat'],
        ['name' => 'Stânga Nistrului', 'type' => 'unitate_teritoriala', 'seat' => 'Tiraspol'],
    ];

    public function run(): void
    {
        foreach (self::RAIOANE as $name) {
            $region = Region::updateOrCreate(
                ['country' => self::COUNTRY, 'name' => $name],
                ['type' => 'raion', 'is_active' => true],
            );

            $this->ensureLocality($region, $name, 'oras');
        }

        foreach (self::SPECIAL_UNITS as $unit) {
            $region = Region::updateOrCreate(
                ['country' => self::COUNTRY, 'name' => $unit['name']],
                ['type' => $unit['type'], 'is_active' => true],
            );

            $this->ensureLocality($region, $unit['seat'], $unit['type'] === 'municipiu' ? 'municipiu' : 'oras');
        }
    }

    private function ensureLocality(Region $region, string $name, string $type): void
    {
        Locality::updateOrCreate(
            ['region_id' => $region->id, 'name' => $name],
            ['type' => $type, 'is_active' => true],
        );
    }
}
