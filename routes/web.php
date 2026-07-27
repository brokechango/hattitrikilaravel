<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::view('/', 'app')->name('app');

Route::view('/{path}', 'app')
    ->where('path', '^(?!.*\.).*$');
