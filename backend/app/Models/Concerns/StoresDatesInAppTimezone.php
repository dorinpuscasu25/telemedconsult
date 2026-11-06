<?php

namespace App\Models\Concerns;

/**
 * Eloquent scrie o dată cu ora așa cum o primește, fără să schimbe fusul orar.
 * Browserul trimite ore în UTC („…T12:00:00Z”), iar dacă aplicația rulează pe
 * Europe/Chisinau, ora ar fi salvată ca 12:00 locală și afișată cu 2 ore decalaj.
 * Convertim întâi la fusul aplicației, ca baza să conțină mereu ora corectă.
 */
trait StoresDatesInAppTimezone
{
    public function fromDateTime($value)
    {
        return empty($value) ? $value : $this->asDateTime($value)
            ->setTimezone(config('app.timezone'))
            ->format($this->getDateFormat());
    }
}
