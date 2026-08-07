<?php

namespace App\Rules;

use App\Services\Higo\HigoResourceBuilder;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Translation\PotentiallyTranslatedString;

/**
 * Acceptă doar numere pe care le putem duce mai departe în HIGO.
 *
 * Validarea folosește exact normalizarea din `HigoResourceBuilder`, ca să fie
 * imposibil să treacă la înregistrare un număr care ar fi respins mai târziu, la
 * provizionare — momentul în care eroarea ar fi mult mai greu de explicat.
 */
class ValidPhoneNumber implements ValidationRule
{
    /**
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (blank($value)) {
            return;
        }

        if (app(HigoResourceBuilder::class)->normalizePhone((string) $value) === null) {
            $fail('Introduceți un număr valid, de exemplu 069123456 sau +37369123456.');
        }
    }
}
