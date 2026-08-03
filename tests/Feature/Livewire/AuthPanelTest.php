<?php

declare(strict_types=1);

namespace Tests\Feature\Livewire;

use App\Livewire\AuthPanel;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Livewire\Livewire;
use Tests\TestCase;

final class AuthPanelTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.supabase.url', 'https://project.supabase.co');
        config()->set('services.supabase.publishable_key', 'sb_publishable_test');
    }

    public function test_member_can_sign_in_through_livewire(): void
    {
        $token = $this->jwt(now()->addHour()->timestamp);

        Http::fake(function (Request $request) use ($token) {
            return match (true) {
                str_contains($request->url(), 'grant_type=password') => Http::response([
                    'access_token' => $token,
                    'refresh_token' => 'refresh-token',
                    'expires_in' => 3600,
                ]),
                str_ends_with($request->url(), '/auth/v1/user') => Http::response([
                    'id' => 'user-1',
                    'email' => 'member@example.com',
                ]),
                str_ends_with($request->url(), '/rest/v1/rpc/get_current_user_access') => Http::response([
                    ['is_member' => true, 'role' => 'member'],
                ]),
                default => Http::response([], 404),
            };
        });

        Livewire::test(AuthPanel::class)
            ->set('email', 'MEMBER@example.com')
            ->set('password', 'valid-password')
            ->call('submit')
            ->assertHasNoErrors()
            ->assertRedirect('/inicio');

        $this->assertNotNull(session('supabase.auth'));
    }

    public function test_non_member_is_signed_out_and_denied(): void
    {
        $token = $this->jwt(now()->addHour()->timestamp);

        Http::fake(function (Request $request) use ($token) {
            return match (true) {
                str_contains($request->url(), 'grant_type=password') => Http::response([
                    'access_token' => $token,
                    'refresh_token' => 'refresh-token',
                    'expires_in' => 3600,
                ]),
                str_ends_with($request->url(), '/auth/v1/user') => Http::response([
                    'id' => 'user-1',
                    'email' => 'outsider@example.com',
                ]),
                str_ends_with($request->url(), '/rest/v1/rpc/get_current_user_access') => Http::response([
                    ['is_member' => false, 'role' => null],
                ]),
                str_contains($request->url(), '/auth/v1/logout') => Http::response([], 204),
                default => Http::response([], 404),
            };
        });

        Livewire::test(AuthPanel::class)
            ->set('email', 'outsider@example.com')
            ->set('password', 'valid-password')
            ->call('submit')
            ->assertHasErrors('auth')
            ->assertNoRedirect();

        $this->assertNull(session('supabase.auth'));
    }

    public function test_login_validates_email_and_password_before_network_requests(): void
    {
        Http::fake();

        Livewire::test(AuthPanel::class)
            ->set('email', 'not-an-email')
            ->set('password', '')
            ->call('submit')
            ->assertHasErrors(['email', 'password']);

        Http::assertNothingSent();
    }

    public function test_recovery_request_uses_livewire_state_and_hides_account_enumeration(): void
    {
        Http::fake(['*/auth/v1/recover*' => Http::response([])]);

        Livewire::test(AuthPanel::class)
            ->call('setMode', 'forgot')
            ->set('email', 'member@example.com')
            ->call('submit')
            ->assertSet('mode', 'sent')
            ->assertSet('sentTo', 'member@example.com')
            ->assertSee('Revisa tu correo');
    }

    public function test_callback_endpoint_validates_and_imports_invitation_tokens(): void
    {
        $token = $this->jwt(now()->addHour()->timestamp);
        Http::fake([
            '*/auth/v1/user' => Http::response([
                'id' => 'invited-user',
                'email' => 'invite@example.com',
            ]),
        ]);

        $this->postJson('/auth/supabase/callback', [
            'access_token' => $token,
            'refresh_token' => 'refresh-callback',
            'type' => 'invite',
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('type', 'invite')
            ->assertJsonPath('user_id', 'invited-user');

        $this->assertNotNull(session('supabase.auth'));
    }

    private function jwt(int $expiresAt): string
    {
        $encode = static fn (array $value): string => rtrim(strtr(
            base64_encode((string) json_encode($value, JSON_THROW_ON_ERROR)),
            '+/',
            '-_',
        ), '=');

        return $encode(['alg' => 'HS256']).'.'.$encode(['exp' => $expiresAt]).'.signature';
    }
}
