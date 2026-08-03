<?php

declare(strict_types=1);

namespace App\Livewire;

use App\Exceptions\SupabaseApiException;
use App\Services\Supabase\SupabaseAuthClient;
use App\Services\Supabase\SupabaseGateway;
use App\Services\Supabase\SupabaseSession;
use Illuminate\Contracts\View\View;
use Illuminate\Validation\ValidationException;
use Livewire\Attributes\Locked;
use Livewire\Component;
use Throwable;

final class AuthPanel extends Component
{
    public string $email = '';

    public string $password = '';

    public string $passwordConfirmation = '';

    #[Locked]
    public string $mode = 'login';

    #[Locked]
    public string $sentTo = '';

    public function mount(?string $flow = null): void
    {
        $this->mode = in_array($flow, ['invite', 'recovery'], true) ? $flow : 'login';

        if (request()->query('auth_error') === 'callback') {
            $this->addError('auth', 'El enlace de acceso no es válido o ha caducado. Solicita uno nuevo.');
        }
    }

    public function setMode(string $mode): void
    {
        if (! in_array($mode, ['login', 'forgot'], true)) {
            return;
        }

        $this->reset(['password', 'passwordConfirmation']);
        $this->resetValidation();
        $this->mode = $mode;
    }

    public function submit(
        SupabaseSession $session,
        SupabaseGateway $gateway,
        SupabaseAuthClient $auth,
    ): void {
        $this->resetErrorBag('auth');

        try {
            match ($this->mode) {
                'login' => $this->login($session, $gateway),
                'forgot', 'sent' => $this->recover($auth),
                'invite', 'recovery' => $this->changePassword($session),
                default => null,
            };
        } catch (SupabaseApiException $exception) {
            $this->addError('auth', $this->authError($exception));
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);
            $this->addError('auth', 'No se ha podido completar la operación. Inténtalo de nuevo.');
        } finally {
            $this->reset(['password', 'passwordConfirmation']);
        }
    }

    public function cancel(SupabaseSession $session): void
    {
        if ($session->check()) {
            $session->logout();
        }

        $this->redirect('/', navigate: true);
    }

    public function render(): View
    {
        return view('livewire.auth-panel', [
            'flow' => $this->mode !== 'login',
            'title' => $this->title(),
            'description' => $this->description(),
        ]);
    }

    private function login(SupabaseSession $session, SupabaseGateway $gateway): void
    {
        $validated = $this->validate([
            'email' => ['required', 'email:rfc', 'max:254'],
            'password' => ['required', 'string', 'max:1024'],
        ]);

        $session->signIn(mb_strtolower(trim($validated['email'])), $validated['password']);
        $accessRows = $gateway->rpc('get_current_user_access');
        $access = is_array($accessRows) ? ($accessRows[0] ?? null) : null;

        if (! is_array($access) || ! ($access['is_member'] ?? false) || ! is_string($access['role'] ?? null)) {
            $session->logout();
            $this->addError('auth', 'Tu cuenta todavía no tiene acceso activo a esta liga.');

            return;
        }

        $this->redirect('/inicio', navigate: true);
    }

    private function recover(SupabaseAuthClient $auth): void
    {
        if ($this->mode === 'sent' && $this->sentTo !== '') {
            $this->email = $this->sentTo;
        }

        $validated = $this->validate([
            'email' => ['required', 'email:rfc', 'max:254'],
        ]);
        $email = mb_strtolower(trim($validated['email']));

        $auth->sendPasswordRecovery($email, url('/'));
        $this->sentTo = $email;
        $this->mode = 'sent';
    }

    private function changePassword(SupabaseSession $session): void
    {
        $validated = $this->validate([
            'password' => ['required', 'string', 'min:8', 'max:1024', 'same:passwordConfirmation'],
            'passwordConfirmation' => ['required', 'string', 'min:8', 'max:1024'],
        ], [
            'password.same' => 'Las contraseñas no coinciden.',
        ]);

        $session->updatePassword($validated['password']);
        $this->redirect('/inicio', navigate: true);
    }

    private function authError(SupabaseApiException $exception): string
    {
        return match ($exception->apiCode) {
            'invalid_credentials' => 'El correo o la contraseña no son correctos.',
            'over_request_rate_limit', 'over_email_send_rate_limit' => 'Has realizado demasiados intentos. Espera unos minutos.',
            default => 'No se ha podido completar la operación. Revisa los datos e inténtalo de nuevo.',
        };
    }

    private function title(): string
    {
        return match ($this->mode) {
            'forgot' => 'Recupera tu contraseña',
            'sent' => 'Revisa tu correo',
            'invite' => 'Completa tu invitación',
            'recovery' => 'Crea una nueva contraseña',
            default => 'HATTITRIKI FC',
        };
    }

    private function description(): string
    {
        return match ($this->mode) {
            'forgot' => 'Indica el correo con el que accedes a la liga y te enviaremos un enlace seguro.',
            'sent' => "Hemos enviado un enlace para crear una nueva contraseña a {$this->sentTo}.",
            'invite' => 'Elige la contraseña con la que entrarás en Hattitriki.',
            'recovery' => 'Elige una contraseña nueva para volver a entrar en Hattitriki.',
            default => 'Acceso privado para miembros de la liga',
        };
    }
}
