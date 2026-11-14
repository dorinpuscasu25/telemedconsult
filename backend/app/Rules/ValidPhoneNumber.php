<?php

namespace App\Rules;

use App\Models\User;
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
    public function __construct(private readonly bool $unique = false, private readonly ?int $ignoreUserId = null) {}

    /**
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (blank($value)) {
            return;
        }

        $normalized = app(HigoResourceBuilder::class)->normalizePhone((string) $value);
        if ($normalized === null) {
            $fail('Introduceți un număr valid, de exemplu 069123456 sau +37369123456.');
        } elseif ($this->unique && User::where('normalized_phone', $normalized)->when($this->ignoreUserId, fn ($query) => $query->whereKeyNot($this->ignoreUserId))->exists()) {
            $fail('Există deja un cont cu acest număr de telefon. Autentifică-te sau recuperează contul.');
        }
    }
}
