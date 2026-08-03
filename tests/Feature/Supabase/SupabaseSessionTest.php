<?php

declare(strict_types=1);

namespace Tests\Feature\Supabase;

use App\Exceptions\SupabaseApiException;
use App\Services\Supabase\SupabaseAuthClient;
use App\Services\Supabase\SupabaseGateway;
use App\Services\Supabase\SupabaseSession;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class SupabaseSessionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.supabase.url', 'https://project.supabase.co');
        config()->set('services.supabase.publishable_key', 'sb_publishable_test');
        config()->set('services.supabase.timeout', 5);
    }

    public function test_password_sign_in_validates_the_user_and_encrypts_tokens_in_session(): void
    {
        $accessToken = $this->jwt(now()->addHour()->timestamp);

        Http::fake([
            '*/auth/v1/token?grant_type=password' => Http::response([
                'access_token' => $accessToken,
                'refresh_token' => 'refresh-secret',
                'expires_in' => 3600,
            ]),
            '*/auth/v1/user' => Http::response([
                'id' => 'user-1',
                'email' => 'member@example.com',
            ]),
        ]);

        $user = $this->app->make(SupabaseSession::class)
            ->signIn('member@example.com', 'valid-password');

        $this->assertSame('user-1', $user['id']);
        $record = session('supabase.auth');
        $this->assertIsArray($record);
        $this->assertStringNotContainsString($accessToken, (string) ($record['access_token'] ?? ''));
        $this->assertStringNotContainsString('refresh-secret', (string) ($record['refresh_token'] ?? ''));

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://project.supabase.co/auth/v1/user'
            && $request->hasHeader('Authorization', 'Bearer '.$accessToken)
            && $request->hasHeader('apikey', 'sb_publishable_test'));
    }

    public function test_gateway_refreshes_expiring_tokens_and_preserves_end_user_rls_context(): void
    {
        $oldToken = $this->jwt(now()->addSeconds(30)->timestamp);
        $newToken = $this->jwt(now()->addHour()->timestamp);

        Http::fake(function (Request $request) use ($oldToken, $newToken) {
            return match (true) {
                str_contains($request->url(), 'grant_type=password') => Http::response([
                    'access_token' => $oldToken,
                    'refresh_token' => 'refresh-old',
                    'expires_at' => now()->addSeconds(30)->timestamp,
                ]),
                str_ends_with($request->url(), '/auth/v1/user') => Http::response([
                    'id' => 'user-1',
                    'email' => 'member@example.com',
                ]),
                str_contains($request->url(), 'grant_type=refresh_token') => Http::response([
                    'access_token' => $newToken,
                    'refresh_token' => 'refresh-new',
                    'expires_in' => 3600,
                    'user' => ['id' => 'user-1', 'email' => 'member@example.com'],
                ]),
                str_ends_with($request->url(), '/rest/v1/rpc/get_current_user_access') => Http::response([
                    ['is_member' => true, 'role' => 'member'],
                ]),
                default => Http::response([], 404),
            };
        });

        $this->app->make(SupabaseSession::class)
            ->signIn('member@example.com', 'valid-password');

        $access = $this->app->make(SupabaseGateway::class)
            ->rpc('get_current_user_access');

        $this->assertSame('member', $access[0]['role']);
        Http::assertSent(fn (Request $request): bool => str_ends_with(
            $request->url(),
            '/rest/v1/rpc/get_current_user_access',
        ) && $request->hasHeader('Authorization', 'Bearer '.$newToken)
            && $request->hasHeader('apikey', 'sb_publishable_test'));
    }

    public function test_callback_tokens_are_validated_before_being_imported(): void
    {
        $accessToken = $this->jwt(now()->addHour()->timestamp);

        Http::fake([
            '*/auth/v1/user' => Http::response([
                'id' => 'invited-user',
                'email' => 'invite@example.com',
            ]),
        ]);

        $session = $this->app->make(SupabaseSession::class);
        $user = $session->import($accessToken, 'refresh-callback');

        $this->assertSame('invited-user', $user['id']);
        $this->assertTrue($session->check());
    }

    public function test_auth_errors_are_exposed_without_leaking_credentials(): void
    {
        Http::fake([
            '*/auth/v1/token?grant_type=password' => Http::response([
                'code' => 'invalid_credentials',
                'msg' => 'Invalid login credentials',
            ], 400),
        ]);

        try {
            $this->app->make(SupabaseAuthClient::class)
                ->signInWithPassword('member@example.com', 'secret-value');
            $this->fail('An exception should have been thrown.');
        } catch (SupabaseApiException $exception) {
            $this->assertSame(400, $exception->status);
            $this->assertSame('invalid_credentials', $exception->apiCode);
            $this->assertStringNotContainsString('secret-value', $exception->getMessage());
        }
    }

    public function test_recovery_uses_the_configured_redirect_and_publishable_key(): void
    {
        Http::fake(['*/auth/v1/recover*' => Http::response([])]);

        $this->app->make(SupabaseAuthClient::class)->sendPasswordRecovery(
            'member@example.com',
            'https://hattitrikifc.pro/',
        );

        Http::assertSent(fn (Request $request): bool => str_contains(
            $request->url(),
            'redirect_to=https%3A%2F%2Fhattitrikifc.pro%2F',
        ) && $request->hasHeader('apikey', 'sb_publishable_test'));
    }

    private function jwt(int $expiresAt): string
    {
        $encode = static fn (array $value): string => rtrim(strtr(
            base64_encode((string) json_encode($value, JSON_THROW_ON_ERROR)),
            '+/',
            '-_',
        ), '=');

        return $encode(['alg' => 'HS256', 'typ' => 'JWT']).'.'.$encode(['exp' => $expiresAt]).'.signature';
    }
}
