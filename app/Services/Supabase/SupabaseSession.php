<?php

declare(strict_types=1);

namespace App\Services\Supabase;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Session\Store;
use RuntimeException;

final readonly class SupabaseSession
{
    private const SESSION_KEY = 'supabase.auth';

    public function __construct(
        private SupabaseAuthClient $auth,
        private Store $session,
        private Encrypter $encrypter,
    ) {}

    /** @return array<string, mixed> */
    public function signIn(string $email, string $password): array
    {
        $tokens = $this->auth->signInWithPassword($email, $password);
        $user = $this->auth->user($this->requiredString($tokens, 'access_token'));
        $this->persist($tokens, $user);

        return $user;
    }

    /** @return array<string, mixed> */
    public function import(string $accessToken, string $refreshToken): array
    {
        $user = $this->auth->user($accessToken);
        $this->persist([
            'access_token' => $accessToken,
            'refresh_token' => $refreshToken,
            'expires_at' => $this->jwtExpiry($accessToken),
        ], $user);

        return $user;
    }

    public function check(): bool
    {
        return $this->session->has(self::SESSION_KEY);
    }

    /** @return array<string, mixed>|null */
    public function user(): ?array
    {
        $record = $this->record();

        return is_array($record['user'] ?? null) ? $record['user'] : null;
    }

    public function accessToken(): string
    {
        $record = $this->record();
        $expiresAt = (int) ($record['expires_at'] ?? 0);

        if ($expiresAt <= now()->addMinute()->timestamp) {
            $refreshToken = $this->decrypt($record['refresh_token'] ?? null);
            $tokens = $this->auth->refresh($refreshToken);
            $user = is_array($tokens['user'] ?? null)
                ? $tokens['user']
                : $this->auth->user($this->requiredString($tokens, 'access_token'));
            $this->persist($tokens, $user);
            $record = $this->record();
        }

        return $this->decrypt($record['access_token'] ?? null);
    }

    public function updatePassword(string $password): void
    {
        $user = $this->auth->updatePassword($this->accessToken(), $password);
        $record = $this->record();
        $record['user'] = $user;
        $this->session->put(self::SESSION_KEY, $record);
    }

    public function logout(): void
    {
        try {
            if ($this->check()) {
                $this->auth->logout($this->accessToken());
            }
        } finally {
            $this->forget();
            $this->session->invalidate();
            $this->session->regenerateToken();
        }
    }

    public function forget(): void
    {
        $this->session->forget(self::SESSION_KEY);
    }

    /** @param array<string, mixed> $tokens @param array<string, mixed> $user */
    private function persist(array $tokens, array $user): void
    {
        $accessToken = $this->requiredString($tokens, 'access_token');
        $refreshToken = $this->requiredString($tokens, 'refresh_token');
        $expiresAt = (int) ($tokens['expires_at'] ?? 0);

        if ($expiresAt <= 0) {
            $expiresAt = now()->timestamp + max(1, (int) ($tokens['expires_in'] ?? 3600));
        }

        $this->session->put(self::SESSION_KEY, [
            'access_token' => $this->encrypter->encryptString($accessToken),
            'refresh_token' => $this->encrypter->encryptString($refreshToken),
            'expires_at' => $expiresAt,
            'user' => $user,
        ]);
        $this->session->migrate(true);
    }

    /** @return array<string, mixed> */
    private function record(): array
    {
        $record = $this->session->get(self::SESSION_KEY);

        if (! is_array($record)) {
            throw new RuntimeException('Supabase session is not authenticated.');
        }

        return $record;
    }

    private function decrypt(mixed $value): string
    {
        if (! is_string($value) || $value === '') {
            $this->forget();
            throw new RuntimeException('Supabase session is incomplete.');
        }

        try {
            return $this->encrypter->decryptString($value);
        } catch (DecryptException) {
            $this->forget();
            throw new RuntimeException('Supabase session could not be decrypted.');
        }
    }

    /** @param array<string, mixed> $payload */
    private function requiredString(array $payload, string $key): string
    {
        $value = $payload[$key] ?? null;

        if (! is_string($value) || $value === '') {
            throw new RuntimeException("Supabase response is missing [{$key}].");
        }

        return $value;
    }

    private function jwtExpiry(string $token): int
    {
        $segments = explode('.', $token);
        $payload = $segments[1] ?? '';
        $decoded = base64_decode(strtr($payload, '-_', '+/'), true);
        $claims = $decoded === false ? null : json_decode($decoded, true);

        return is_array($claims) ? (int) ($claims['exp'] ?? 0) : 0;
    }
}
