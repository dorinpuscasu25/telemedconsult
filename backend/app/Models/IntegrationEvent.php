<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'medical_document_id', 'provider', 'event_type', 'status', 'request_payload', 'response_payload', 'error_message', 'attempts', 'next_retry_at'])]
class IntegrationEvent extends Model
{
    protected function casts(): array
    {
        return [
            'request_payload' => 'array',
            'response_payload' => 'array',
            'next_retry_at' => 'datetime',
        ];
    }
}
