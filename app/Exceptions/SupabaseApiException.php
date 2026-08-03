<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

final class SupabaseApiException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status,
        public readonly ?string $apiCode = null,
    ) {
        parent::__construct($message, $status);
    }
}
