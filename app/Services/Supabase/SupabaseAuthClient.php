<?php

declare(strict_types=1);

namespace App\Services\Supabase;

use App\Exceptions\SupabaseApiException;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use LogicException;

final readonly class SupabaseAuthClient
{
    public function __construct(private Factory $http) {}

    /** @return array<string, mixed> */
    public function signInWithPassword(string $email, string $password): array
    {
        return $this->json($this->request()->post('/auth/v1/token?grant_type=password', [
            'email' => $email,
            'password' => $password,
        ]));
    }

    /** @return array<string, mixed> */
    public function refresh(string $refreshToken): array
    {
        return $this->json($this->request()->post('/auth/v1/token?grant_type=refresh_token', [
            'refresh_token' => $refreshToken,
        ]));
    }

    /** @return array<string, mixed> */
    public function user(string $accessToken): array
    {
        return $this->json($this->request($accessToken)->get('/auth/v1/user'));
    }

    public function sendPasswordRecovery(string $email, string $redirectTo): void
    {
        $this->json($this->request()->post(
            '/auth/v1/recover?redirect_to='.rawurlencode($redirectTo),
            ['email' => $email],
        ));
    }

    /** @return array<string, mixed> */
    public function updatePassword(string $accessToken, string $password): array
    {
        return $this->json($this->request($accessToken)->put('/auth/v1/user', [
            'password' => $password,
        ]));
    }

    public function logout(string $accessToken): void
    {
        $response = $this->request($accessToken)->post('/auth/v1/logout?scope=local');

        if (! $response->successful() && $response->status() !== 401) {
            $this->throwForResponse($response);
        }
    }

    private function request(?string $accessToken = null): PendingRequest
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $publishableKey = (string) config('services.supabase.publishable_key');

        if ($url === '' || $publishableKey === '') {
            throw new LogicException('Supabase server configuration is incomplete.');
        }

        $request = $this->http
            ->baseUrl($url)
            ->acceptJson()
            ->asJson()
            ->withHeaders(['apikey' => $publishableKey])
            ->timeout(max(1, (int) config('services.supabase.timeout', 15)));

        return $accessToken === null ? $request : $request->withToken($accessToken);
    }

    /** @return array<string, mixed> */
    private function json(Response $response): array
    {
        if (! $response->successful()) {
            $this->throwForResponse($response);
        }

        $payload = $response->json();

        return is_array($payload) ? $payload : [];
    }

    private function throwForResponse(Response $response): never
    {
        $payload = $response->json();
        $message = is_array($payload)
            ? ($payload['msg'] ?? $payload['message'] ?? $payload['error_description'] ?? $payload['error'] ?? null)
            : null;
        $code = is_array($payload) ? ($payload['code'] ?? $payload['error_code'] ?? null) : null;

        throw new SupabaseApiException(
            is_string($message) && $message !== '' ? $message : 'Supabase request failed.',
            $response->status(),
            is_string($code) ? $code : null,
        );
    }
}
