<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['period', 'status', 'prizes', 'results', 'ranking_snapshot', 'updated_by', 'published_at'])]
class PerformanceAward extends Model
{
    protected $attributes = ['status' => 'draft'];

    protected function casts(): array
    {
        return ['prizes' => 'array', 'results' => 'array', 'ranking_snapshot' => 'array', 'published_at' => 'datetime'];
    }
}
