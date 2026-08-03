<?php

declare(strict_types=1);

use App\Http\Controllers\SupabaseAuthCallbackController;
use App\Livewire\AppShell;
use Illuminate\Support\Facades\Route;

Route::post('/auth/supabase/callback', SupabaseAuthCallbackController::class)
    ->middleware('throttle:10,1')
    ->name('auth.supabase.callback');

Route::livewire('/', AppShell::class)->name('app');
Route::livewire('/inicio', AppShell::class)->name('home');
Route::livewire('/partidos', AppShell::class)->name('matches.index');
Route::livewire('/partidos/{match}', AppShell::class)
    ->where('match', '[0-9a-f]+')
    ->name('matches.show');
Route::livewire('/rankings', AppShell::class)->name('rankings.index');
Route::livewire('/rankings/jugador/{player}', AppShell::class)
    ->where('player', '[0-9a-f]+')
    ->name('rankings.player');
Route::livewire('/perfil', AppShell::class)->name('profile');

Route::prefix('mister')->name('manager.')->group(function (): void {
    Route::livewire('/', AppShell::class)->name('index');
    Route::livewire('/partidos', AppShell::class)->name('matches.index');
    Route::livewire('/partidos/nuevo', AppShell::class)->name('matches.create');
    Route::livewire('/partidos/{match}', AppShell::class)
        ->where('match', '[0-9a-f]+')
        ->name('matches.edit');
    Route::livewire('/jugadores', AppShell::class)->name('players.index');
    Route::livewire('/jugadores/nuevo', AppShell::class)->name('players.create');
    Route::livewire('/jugadores/{player}', AppShell::class)
        ->where('player', '[0-9a-f]+')
        ->name('players.edit');
    Route::livewire('/invitacion', AppShell::class)->name('invitation');
    Route::livewire('/equipos', AppShell::class)->name('teams.index');
    Route::livewire('/equipos/resultado', AppShell::class)->name('teams.result');
});
