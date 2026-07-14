<?php

use Illuminate\Support\Facades\Broadcast;
use App\Models\Conversation;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('conversation.{conversationId}', function ($user, int $conversationId) {
    $conversation = Conversation::query()->find($conversationId);

    if (! $conversation) {
        return false;
    }

    return in_array((int) $user->id, array_filter([
        (int) $conversation->patient_id,
        $conversation->doctor_id ? (int) $conversation->doctor_id : null,
        $conversation->operator_id ? (int) $conversation->operator_id : null,
    ]), true);
});
