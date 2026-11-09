<?php

namespace App\Services;

use RuntimeException;

/**
 * Soldul real nu acoperă suma cerută. Poartă sumele în bani, ca apelantul să poată
 * răspunde cu diferența exactă de alimentat.
 */
class InsufficientWalletBalance extends RuntimeException
{
    public function __construct(
        public readonly int $requiredMinor,
        public readonly int $balanceMinor,
    ) {
        parent::__construct('Balanță insuficientă.');
    }

    public function missingMinor(): int
    {
        return max(0, $this->requiredMinor - $this->balanceMinor);
    }
}
