<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['doctor_promotion_id', 'doctor_id', 'viewer_id', 'position', 'cost_minor'])]
class DoctorPromotionImpression extends Model {}
