<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifications = $request->user()
            ->notifications()
            ->latest()
            ->limit(30)
            ->get()
            ->map(fn ($notification) => [
                'id' => $notification->id,
                'title' => $notification->data['title'] ?? 'Notificare',
                'body' => $notification->data['body'] ?? '',
                'url' => $notification->data['url'] ?? null,
                'level' => $notification->data['level'] ?? 'info',
                'read_at' => $notification->read_at,
                'created_at' => $notification->created_at,
            ]);

        return response()->json([
            'data' => $notifications,
            'unread_count' => $request->user()->unreadNotifications()->count(),
        ]);
    }

    public function markRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->json(['message' => 'Notificări marcate ca citite.']);
    }
}
