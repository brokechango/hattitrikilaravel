<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::view('/', 'app')->name('app');
Route::view('/inicio', 'app')->name('home');
Route::view('/partidos', 'app')->name('matches.index');
Route::view('/partidos/{match}', 'app')
    ->where('match', '[0-9a-f]+')
    ->name('matches.show');
Route::view('/rankings', 'app')->name('rankings.index');
Route::view('/rankings/jugador/{player}', 'app')
    ->where('player', '[0-9a-f]+')
    ->name('rankings.player');
Route::view('/perfil', 'app')->name('profile');

Route::prefix('mister')->name('manager.')->group(function (): void {
    Route::view('/', 'app')->name('index');
    Route::view('/partidos', 'app')->name('matches.index');
    Route::view('/partidos/nuevo', 'app')->name('matches.create');
    Route::view('/partidos/{match}', 'app')
        ->where('match', '[0-9a-f]+')
        ->name('matches.edit');
    Route::view('/jugadores', 'app')->name('players.index');
    Route::view('/jugadores/nuevo', 'app')->name('players.create');
    Route::view('/jugadores/{player}', 'app')
        ->where('player', '[0-9a-f]+')
        ->name('players.edit');
    Route::view('/invitacion', 'app')->name('invitation');
    Route::view('/equipos', 'app')->name('teams.index');
    Route::view('/equipos/resultado', 'app')->name('teams.result');
});
