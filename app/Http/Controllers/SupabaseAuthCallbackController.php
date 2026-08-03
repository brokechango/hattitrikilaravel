<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Supabase\SupabaseSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SupabaseAuthCallbackController extends Controller
{
    public function __invoke(Request $request, SupabaseSession $session): JsonResponse
    {
        $validated = $request->validate([
            'access_token' => ['required', 'string', 'max:8192'],
            'refresh_token' => ['required', 'string', 'max:8192'],
            'type' => ['required', 'string', 'in:invite,recovery'],
        ]);

        $user = $session->import($validated['access_token'], $validated['refresh_token']);

        return response()->json([
            'ok' => true,
            'type' => $validated['type'],
            'user_id' => $user['id'] ?? null,
        ]);
    }
}
