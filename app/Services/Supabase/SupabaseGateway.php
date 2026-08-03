<?php

declare(strict_types=1);

namespace App\Services\Supabase;

use App\Exceptions\SupabaseApiException;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use InvalidArgumentException;
use LogicException;

final readonly class SupabaseGateway
{
    public function __construct(
        private Factory $http,
        private SupabaseSession $session,
    ) {}

    public function rpc(string $function, array $parameters = []): mixed
    {
        if (preg_match('/^[a-z][a-z0-9_]*$/', $function) !== 1) {
            throw new InvalidArgumentException('Invalid Supabase RPC function name.');
        }

        $response = $this->request()
            ->withHeader('Prefer', 'return=representation')
            ->post('/rest/v1/rpc/'.$function, $parameters);

        return $this->json($response);
    }

    public function signedAvatarUrls(array $paths, int $expiresIn): array
    {
        if ($paths === []) {
            return [];
        }

        $response = $this->request()->post('/storage/v1/object/sign/avatars', [
            'expiresIn' => $expiresIn,
            'paths' => array_values($paths),
        ]);

        $payload = $this->json($response);

        return is_array($payload) ? $payload : [];
    }

    public function invokeFunction(string $function, array $payload): mixed
    {
        if (preg_match('/^[a-z][a-z0-9-]*$/', $function) !== 1) {
            throw new InvalidArgumentException('Invalid Supabase function name.');
        }

        return $this->json($this->request()->post('/functions/v1/'.$function, $payload));
    }

    public function uploadAvatar(string $path, string $contents, string $mimeType): void
    {
        if (preg_match('#^[0-9a-f-]+/[0-9a-f-]+\.(?:jpg|jpeg|webp)$#i', $path) !== 1) {
            throw new InvalidArgumentException('Invalid avatar path.');
        }

        $response = $this->request(false)
            ->withHeader('x-upsert', 'true')
            ->withBody($contents, $mimeType)
            ->post('/storage/v1/object/avatars/'.$path);

        $this->json($response);
    }

    private function request(bool $json = true): PendingRequest
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $publishableKey = (string) config('services.supabase.publishable_key');

        if ($url === '' || $publishableKey === '') {
            throw new LogicException('Supabase server configuration is incomplete.');
        }

        $request = $this->http
            ->baseUrl($url)
            ->acceptJson()
            ->withHeaders(['apikey' => $publishableKey])
            ->withToken($this->session->accessToken())
            ->timeout(max(1, (int) config('services.supabase.timeout', 15)));

        return $json ? $request->asJson() : $request;
    }

    private function json(Response $response): mixed
    {
        if ($response->successful()) {
            return $response->json();
        }

        $payload = $response->json();
        $message = is_array($payload)
            ? ($payload['message'] ?? $payload['hint'] ?? $payload['details'] ?? null)
            : null;
        $code = is_array($payload) ? ($payload['code'] ?? null) : null;

        throw new SupabaseApiException(
            is_string($message) && $message !== '' ? $message : 'Supabase request failed.',
            $response->status(),
            is_string($code) ? $code : null,
        );
    }
}
