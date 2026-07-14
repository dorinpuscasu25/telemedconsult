<?php

use App\Http\Controllers\Api\AdminBlogPostController;
use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AdminFeatureFlagController;
use App\Http\Controllers\Api\AdminOperationsController;
use App\Http\Controllers\Api\AdminInvestigationTypeController;
use App\Http\Controllers\Api\AdminPartnerController;
use App\Http\Controllers\Api\AdminPatientCardPackageController;
use App\Http\Controllers\Api\AdminRegionController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\CoordinatorController;
use App\Http\Controllers\Api\DoctorOperationsController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PatientEngagementController;
use App\Http\Controllers\Api\PatientProfileController;
use App\Http\Controllers\Api\WalletController;
use App\Http\Controllers\Api\WorkflowController;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

Broadcast::routes(['middleware' => ['auth:sanctum']]);

Route::prefix('v1')->group(function () {
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/verify-email-otp', [AuthController::class, 'verifyEmailOtp']);
    Route::post('/auth/resend-email-otp', [AuthController::class, 'resendEmailOtp']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/verify-login-otp', [AuthController::class, 'verifyLoginOtp']);

    Route::get('/catalog/specialties', [CatalogController::class, 'specialties']);
    Route::get('/catalog/doctors', [CatalogController::class, 'doctors']);
    Route::get('/catalog/doctors/{doctor}/reviews', [PatientEngagementController::class, 'doctorReviews']);
    Route::post('/catalog/doctors/{doctor}/view', [PatientEngagementController::class, 'storeDoctorProfileView']);
    Route::get('/catalog/operators', [CatalogController::class, 'operators']);
    Route::get('/catalog/pricing', [CatalogController::class, 'pricing']);
    Route::get('/catalog/regions', [CatalogController::class, 'regions']);
    Route::get('/catalog/investigations', [CatalogController::class, 'investigations']);
    Route::get('/catalog/features', [CatalogController::class, 'features']);
    Route::get('/catalog/blog', [CatalogController::class, 'blog']);
    Route::get('/catalog/blog/{slug}', [CatalogController::class, 'blogPost']);
    Route::get('/catalog/partners', [CatalogController::class, 'partners']);
    Route::get('/integrations/status', [IntegrationController::class, 'status']);
    Route::post('/payments/callback/maib', [WalletController::class, 'callback']);
    Route::get('/payments/maib/ok', [WalletController::class, 'ok']);
    Route::get('/payments/maib/fail', [WalletController::class, 'fail']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/switch-role', [AuthController::class, 'switchRole']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/read', [NotificationController::class, 'markRead']);

        Route::get('/admin/summary', [AdminController::class, 'summary']);
        Route::get('/admin/roles', [AdminController::class, 'roles']);
        Route::get('/admin/specialties', [AdminController::class, 'specialties']);
        Route::post('/admin/specialties', [AdminController::class, 'storeSpecialty']);
        Route::put('/admin/specialties/{specialty}', [AdminController::class, 'updateSpecialty']);
        Route::delete('/admin/specialties/{specialty}', [AdminController::class, 'destroySpecialty']);
        Route::get('/admin/users', [AdminController::class, 'users']);
        Route::post('/admin/users', [AdminController::class, 'storeUser']);
        Route::put('/admin/users/{user}', [AdminController::class, 'updateUser']);
        Route::delete('/admin/users/{user}', [AdminController::class, 'destroyUser']);
        Route::get('/admin/registrations', [AdminController::class, 'registrations']);
        Route::post('/admin/users/{user}/approve', [AdminController::class, 'approveUser']);
        Route::post('/admin/users/{user}/reject', [AdminController::class, 'rejectUser']);
        Route::get('/admin/financial', [AdminOperationsController::class, 'financial']);
        Route::put('/admin/withdrawals/{withdrawalRequest}', [AdminOperationsController::class, 'updateWithdrawal']);
        Route::get('/admin/complaints', [AdminOperationsController::class, 'complaints']);
        Route::put('/admin/complaints/{complaint}/resolve', [AdminOperationsController::class, 'resolveComplaint']);
        Route::get('/admin/contracts', [AdminOperationsController::class, 'contracts']);
        Route::post('/admin/contracts', [AdminOperationsController::class, 'storeContract']);
        Route::put('/admin/contracts/{contractTemplate}', [AdminOperationsController::class, 'updateContract']);
        Route::get('/admin/patient-card-packages', [AdminPatientCardPackageController::class, 'index']);
        Route::post('/admin/patient-card-packages', [AdminPatientCardPackageController::class, 'store']);
        Route::put('/admin/patient-card-packages/{patientCardPackage}', [AdminPatientCardPackageController::class, 'update']);
        Route::delete('/admin/patient-card-packages/{patientCardPackage}', [AdminPatientCardPackageController::class, 'destroy']);
        Route::get('/admin/settings', [AdminOperationsController::class, 'settings']);
        Route::put('/admin/settings', [AdminOperationsController::class, 'updateSettings']);
        Route::get('/admin/feature-flags', [AdminFeatureFlagController::class, 'index']);
        Route::put('/admin/feature-flags', [AdminFeatureFlagController::class, 'update']);
        Route::get('/admin/regions', [AdminOperationsController::class, 'regions']);
        Route::put('/admin/regions', [AdminOperationsController::class, 'updateRegions']);
        Route::get('/admin/geo/regions', [AdminRegionController::class, 'index']);
        Route::post('/admin/geo/regions', [AdminRegionController::class, 'store']);
        Route::put('/admin/geo/regions/{region}', [AdminRegionController::class, 'update']);
        Route::post('/admin/geo/regions/{region}/localities', [AdminRegionController::class, 'storeLocality']);
        Route::put('/admin/geo/localities/{locality}', [AdminRegionController::class, 'updateLocality']);
        Route::get('/admin/investigation-types', [AdminInvestigationTypeController::class, 'index']);
        Route::post('/admin/investigation-types', [AdminInvestigationTypeController::class, 'store']);
        Route::put('/admin/investigation-types/{investigationType}', [AdminInvestigationTypeController::class, 'update']);
        Route::delete('/admin/investigation-types/{investigationType}', [AdminInvestigationTypeController::class, 'destroy']);
        Route::get('/admin/top-doctors', [AdminOperationsController::class, 'topDoctors']);

        Route::get('/admin/blog-posts', [AdminBlogPostController::class, 'index']);
        Route::post('/admin/blog-posts', [AdminBlogPostController::class, 'store']);
        Route::put('/admin/blog-posts/{blogPost}', [AdminBlogPostController::class, 'update']);
        Route::delete('/admin/blog-posts/{blogPost}', [AdminBlogPostController::class, 'destroy']);
        Route::get('/admin/partners', [AdminPartnerController::class, 'index']);
        Route::post('/admin/partners', [AdminPartnerController::class, 'store']);
        Route::put('/admin/partners/{partner}', [AdminPartnerController::class, 'update']);
        Route::delete('/admin/partners/{partner}', [AdminPartnerController::class, 'destroy']);

        Route::get('/requests', [WorkflowController::class, 'requests']);
        Route::post('/requests/preview', [WorkflowController::class, 'previewRequest']);
        Route::post('/requests', [WorkflowController::class, 'storeRequest']);
        Route::post('/requests/{consultationRequest}/accept', [WorkflowController::class, 'accept']);
        Route::post('/requests/{consultationRequest}/reject', [WorkflowController::class, 'reject']);
        Route::post('/requests/{consultationRequest}/cancel', [WorkflowController::class, 'cancel']);
        Route::post('/requests/{consultationRequest}/propose-time', [WorkflowController::class, 'proposeTime']);
        Route::post('/requests/{consultationRequest}/accept-proposed-time', [WorkflowController::class, 'acceptProposedTime']);
        Route::post('/requests/{consultationRequest}/forward-to-doctor', [WorkflowController::class, 'forwardToDoctor']);
        Route::post('/requests/{consultationRequest}/anamnesis', [WorkflowController::class, 'completeAnamnesis']);
        Route::post('/requests/{consultationRequest}/objective-data', [WorkflowController::class, 'storeObjectiveData']);
        Route::post('/requests/{consultationRequest}/add-on-service', [WorkflowController::class, 'addOnService']);
        Route::post('/requests/{consultationRequest}/meet-link', [WorkflowController::class, 'storeMeetLink']);
        Route::post('/requests/{consultationRequest}/additional-investigation', [WorkflowController::class, 'requestAdditionalInvestigation']);
        Route::post('/requests/{consultationRequest}/reactivate-chat', [WorkflowController::class, 'reactivateChat']);
        Route::post('/requests/{consultationRequest}/complete', [WorkflowController::class, 'complete']);

        Route::get('/conversations', [WorkflowController::class, 'conversations']);
        Route::post('/conversations/{conversation}/messages', [WorkflowController::class, 'sendMessage']);
        Route::post('/conversations/{conversation}/attachments', [WorkflowController::class, 'sendAttachment']);

        Route::get('/wallet', [WalletController::class, 'show']);
        Route::post('/wallet/top-up', [WalletController::class, 'topUp']);

        Route::get('/patient/profile', [PatientProfileController::class, 'show']);
        Route::put('/patient/profile', [PatientProfileController::class, 'update']);
        Route::post('/patient/card-purchases', [PatientProfileController::class, 'buyCardPackage']);
        Route::post('/patient/profiles', [PatientProfileController::class, 'storePatientProfile']);
        Route::put('/patient/profiles/{patientProfile}', [PatientProfileController::class, 'updatePatientProfile']);
        Route::delete('/patient/profiles/{patientProfile}', [PatientProfileController::class, 'destroyPatientProfile']);
        Route::post('/patient/profiles/{patientProfile}/life-history', [PatientProfileController::class, 'appendLifeHistory']);
        Route::post('/patient/profiles/{patientProfile}/investigations', [PatientProfileController::class, 'storeInvestigation']);
        Route::get('/patient/profiles/{patientProfile}/export', [PatientProfileController::class, 'exportPatientData']);
        Route::post('/patient/family-members', [PatientProfileController::class, 'storeFamilyMember']);
        Route::put('/patient/family-members/{patientFamilyMember}', [PatientProfileController::class, 'updateFamilyMember']);
        Route::delete('/patient/family-members/{patientFamilyMember}', [PatientProfileController::class, 'destroyFamilyMember']);
        Route::get('/patient/complaints', [PatientEngagementController::class, 'complaints']);
        Route::post('/patient/complaints', [PatientEngagementController::class, 'storeComplaint']);
        Route::get('/patient/reviewable-requests', [PatientEngagementController::class, 'reviewableRequests']);
        Route::post('/requests/{consultationRequest}/review', [PatientEngagementController::class, 'storeReview']);

        Route::get('/coordinator/dashboard', [CoordinatorController::class, 'dashboard']);
        Route::post('/coordinator/requests/{consultationRequest}/claim', [CoordinatorController::class, 'claim']);
        Route::post('/coordinator/requests/{consultationRequest}/assign-provider', [CoordinatorController::class, 'assignProvider']);

        Route::get('/doctor/profile', [DoctorOperationsController::class, 'profile']);
        Route::put('/doctor/profile', [DoctorOperationsController::class, 'updateProfile']);
        Route::put('/doctor/availability', [DoctorOperationsController::class, 'updateAvailability']);
        Route::post('/doctor/vacations', [DoctorOperationsController::class, 'storeVacation']);
        Route::delete('/doctor/vacations/{doctorVacation}', [DoctorOperationsController::class, 'destroyVacation']);
        Route::get('/doctor/dashboard', [DoctorOperationsController::class, 'dashboard']);
        Route::get('/doctor/stats', [DoctorOperationsController::class, 'stats']);
        Route::post('/doctor/withdrawals', [DoctorOperationsController::class, 'storeWithdrawal']);

        Route::get('/integrations/events', [IntegrationController::class, 'events']);
        Route::post('/integrations/documents/{medicalDocument}/queue', [IntegrationController::class, 'queueDocument']);
    });
});
