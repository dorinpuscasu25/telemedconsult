<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['title', 'type', 'content', 'status', 'updated_by'])]
class ContractTemplate extends Model {}
