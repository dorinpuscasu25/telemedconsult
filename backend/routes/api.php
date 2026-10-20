<?php

use App\Http\Controllers\Api\ActiveConsultationController;
use App\Http\Controllers\Api\AdminBlogPostController;
use App\Http\Controllers\Api\AdminClinicalParameterController;
use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AdminFeatureFlagController;
use App\Http\Controllers\Api\AdminHigoController;
use App\Http\Controllers\Api\AdminInvestigationTypeController;
use App\Http\Controllers\Api\AdminOperationsController;
use App\Http\Controllers\Api\AdminPartnerController;
use App\Http\Controllers\Api\AdminPatientCardPackageController;
use App\Http\Controllers\Api\AdminRegionController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\ConsultationDocumentController;
use App\Http\Controllers\Api\ConsultationVideoController;
use App\Http\Controllers\Api\CoordinatorController;
use App\Http\Controllers\Api\DoctorOperationsController;
use App\Http\Controllers\Api\ExamMediaController;
use App\Http\Controllers\Api\HigoExamController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PatientEngagementController;
use App\Http\Controllers\Api\PatientMedicalRecordController;
use App\Http\Controllers\Api\PatientProfileController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\SiteContentController;
use App\Http\Controllers\Api\TelegramController;
use App\Http\Controllers\Api\WalletController;
use App\Http\Controllers\Api\WorkflowController;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

Broadcast::routes(['middleware' => ['auth:sanctum']]);

Route::prefix('v1')->group(function () {
    Route::get('/patient-investigations/{investigation}/file', [PatientMedicalRecordController::class, 'file'])->middleware('signed')->name('patient-investigation.file');
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
    Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
    Route::post('/auth/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
    Route::post('/auth/verify-email-otp', [AuthController::class, 'verifyEmailOtp'])->middleware('throttle:10,1');
    Route::post('/auth/resend-email-otp', [AuthController::class, 'resendEmailOtp'])->middleware('throttle:5,1');
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
    Route::get('/catalog/objective-fields', [CatalogController::class, 'objectiveFields']);
    Route::get('/catalog/features', [CatalogController::class, 'features']);
    Route::get('/catalog/blog', [CatalogController::class, 'blog']);
    Route::get('/catalog/blog/{slug}', [CatalogController::class, 'blogPost']);
    Route::get('/catalog/partners', [CatalogController::class, 'partners']);
    Route::get('/catalog/site-content', [SiteContentController::class, 'index']);
    Route::get('/integrations/status', [IntegrationController::class, 'status']);
    Route::post('/payments/callback/maib', [WalletController::class, 'callback']);
    Route::get('/payments/maib/ok', [WalletController::class, 'ok']);
    Route::get('/payments/maib/fail', [WalletController::class, 'fail']);

    // Aparatul HIGO livrează examinările fără sesiune; secretul din URL e paza.
    Route::post('/higo/exams/webhook/{secret}', [HigoExamController::class, 'store'])
        ->middleware('throttle:240,1');

    // Imaginile și înregistrările examinării: `<img>` și `<audio>` nu pot trimite
    // antetul de autentificare, deci paza e semnătura cu viață scurtă pusă în
    // fișa consultației, care ajunge doar la participanții ei.
    Route::get('/exam-media/{media}', [ExamMediaController::class, 'show'])
        ->whereNumber('media')
        ->middleware('signed')
        ->name('exam-media.show');

    // Telegram apelează webhook-ul fără sesiune: secretul din URL + antetul
    // `X-Telegram-Bot-Api-Secret-Token` sunt autentificarea.
    Route::post('/telegram/webhook/{secret}', [TelegramController::class, 'webhook'])
        ->middleware('throttle:120,1');

    Route::get('/chat-attachments/{message}', [WorkflowController::class, 'attachmentFile'])->middleware('signed')->name('chat-attachment.file');
    Route::get('/medical-documents/{document}/file', [ConsultationDocumentController::class, 'file'])->middleware('signed')->name('medical-document.file');
    Route::get('/medical-documents/{document}/prescription', [ConsultationDocumentController::class, 'prescriptionFile'])->middleware('signed')->name('medical-document.prescription');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/requests/{consultationRequest}/context', [WorkflowController::class, 'requestContext']);
        Route::post('/requests/{consultationRequest}/higo-proposal', [WorkflowController::class, 'proposeHigo']);
        Route::get('/requests/{consultationRequest}/higo-quote', [WorkflowController::class, 'higoQuote']);
        Route::post('/requests/{consultationRequest}/higo-confirm', [WorkflowController::class, 'confirmHigo']);
        Route::get('/requests/{consultationRequest}/documents', [ConsultationDocumentController::class, 'index']);
        Route::post('/requests/{consultationRequest}/documents/preview', [ConsultationDocumentController::class, 'preview']);
        Route::post('/requests/{consultationRequest}/documents/addendum', [ConsultationDocumentController::class, 'addendum']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/switch-role', [AuthController::class, 'switchRole']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        Route::get('/video-calls/incoming', [ConsultationVideoController::class, 'incoming']);
        Route::post('/video-calls/{videoCallInvitation}/respond', [ConsultationVideoController::class, 'respondCall'])->middleware('throttle:30,1');
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/read', [NotificationController::class, 'markRead']);

        Route::get('/telegram/status', [TelegramController::class, 'status']);
        Route::post('/telegram/link', [TelegramController::class, 'link'])->middleware('throttle:20,1');
        Route::post('/telegram/unlink', [TelegramController::class, 'unlink']);
        Route::post('/telegram/preferences', [TelegramController::class, 'preferences']);
        Route::post('/telegram/test', [TelegramController::class, 'test'])->middleware('throttle:5,1');

        Route::get('/patient/profiles/{patientProfile}/medical-record', [PatientMedicalRecordController::class, 'show']);
        Route::patch('/patient/profiles/{patientProfile}/medical-record', [PatientMedicalRecordController::class, 'update']);
        Route::delete('/patient/profiles/{patientProfile}/investigations/{investigation}', [PatientMedicalRecordController::class, 'destroyDocument']);
        Route::get('/admin/clinical-parameters', [AdminClinicalParameterController::class, 'index']);
        Route::post('/admin/clinical-parameters', [AdminClinicalParameterController::class, 'store']);
        Route::put('/admin/clinical-parameters/{clinicalParameter}', [AdminClinicalParameterController::class, 'update']);

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
        Route::get('/admin/users/{user}/wallet', [AdminOperationsController::class, 'userWallet']);
        Route::post('/admin/users/{user}/wallet', [AdminOperationsController::class, 'adjustUserWallet']);
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
        Route::get('/admin/blog-posts/{blogPost}', [AdminBlogPostController::class, 'show']);
        Route::post('/admin/blog-posts', [AdminBlogPostController::class, 'store']);
        Route::put('/admin/blog-posts/{blogPost}', [AdminBlogPostController::class, 'update']);
        Route::delete('/admin/blog-posts/{blogPost}', [AdminBlogPostController::class, 'destroy']);
        Route::get('/admin/site-content', [SiteContentController::class, 'adminIndex']);
        Route::put('/admin/site-content', [SiteContentController::class, 'update']);
        Route::post('/admin/site-content/reset', [SiteContentController::class, 'reset']);

        Route::get('/admin/partners', [AdminPartnerController::class, 'index']);
        Route::post('/admin/partners', [AdminPartnerController::class, 'store']);
        Route::put('/admin/partners/{partner}', [AdminPartnerController::class, 'update']);
        Route::delete('/admin/partners/{partner}', [AdminPartnerController::class, 'destroy']);

        Route::get('/requests', [WorkflowController::class, 'requests']);
        Route::get('/requests/active', [ActiveConsultationController::class, 'index']);
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
        Route::post('/requests/{consultationRequest}/examination-done', [WorkflowController::class, 'completeExamination']);
        Route::post('/requests/{consultationRequest}/start', [WorkflowController::class, 'startConsultation']);
        Route::post('/requests/{consultationRequest}/add-on-service', [WorkflowController::class, 'addOnService']);
        Route::get('/requests/{consultationRequest}/video/call', [ConsultationVideoController::class, 'currentCall']);
        Route::get('/requests/{consultationRequest}/video', [ConsultationVideoController::class, 'status']);
        Route::post('/requests/{consultationRequest}/video/invite', [ConsultationVideoController::class, 'invite'])->middleware('throttle:6,1');
        Route::post('/requests/{consultationRequest}/video/token', [ConsultationVideoController::class, 'token'])->middleware('throttle:30,1');
        Route::post('/requests/{consultationRequest}/meet-link', [WorkflowController::class, 'storeMeetLink']);
        Route::post('/requests/{consultationRequest}/additional-investigation', [WorkflowController::class, 'requestAdditionalInvestigation']);
        Route::post('/requests/{consultationRequest}/reactivate-chat', [WorkflowController::class, 'reactivateChat']);
        Route::post('/requests/{consultationRequest}/complete', [WorkflowController::class, 'complete']);

        Route::post('/conversations/{conversation}/read', [WorkflowController::class, 'readConversation']);
        Route::get('/conversations', [WorkflowController::class, 'conversations']);
        Route::post('/conversations/{conversation}/direct', [WorkflowController::class, 'directConversation']);
        Route::get('/conversations/{conversation}', [WorkflowController::class, 'conversation']);
        Route::post('/conversations/{conversation}/messages', [WorkflowController::class, 'sendMessage']);
        Route::post('/conversations/{conversation}/attachments', [WorkflowController::class, 'sendAttachment']);

        Route::get('/wallet', [WalletController::class, 'show']);
        Route::post('/wallet/top-up', [WalletController::class, 'topUp']);

        Route::get('/patient/profile', [PatientProfileController::class, 'show']);
        Route::get('/patient/referrals', [ReferralController::class, 'show']);
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

        Route::post('/doctor/clinic-logo', [DoctorOperationsController::class, 'uploadClinicLogo']);
        Route::get('/doctor/clinic-logo', [DoctorOperationsController::class, 'clinicLogo']);
        Route::post('/doctor/signature', [DoctorOperationsController::class, 'uploadSignature']);
        Route::get('/doctor/signature', [DoctorOperationsController::class, 'signature']);
        Route::get('/doctor/profile', [DoctorOperationsController::class, 'profile']);
        Route::put('/doctor/profile', [DoctorOperationsController::class, 'updateProfile']);
        Route::put('/doctor/availability', [DoctorOperationsController::class, 'updateAvailability']);
        Route::post('/doctor/vacations', [DoctorOperationsController::class, 'storeVacation']);
        Route::delete('/doctor/vacations/{doctorVacation}', [DoctorOperationsController::class, 'destroyVacation']);
        Route::get('/doctor/dashboard', [DoctorOperationsController::class, 'dashboard']);
        Route::get('/doctor/stats', [DoctorOperationsController::class, 'stats']);
        Route::post('/doctor/withdrawals', [DoctorOperationsController::class, 'storeWithdrawal']);

        Route::get('/admin/higo/sync', [AdminHigoController::class, 'index']);
        Route::post('/admin/higo/sync/{kind}/{id}', [AdminHigoController::class, 'retry'])->whereNumber('id');
        Route::get('/admin/higo/exams/{exam}', [AdminHigoController::class, 'showExam'])->whereNumber('exam');
        Route::post('/admin/higo/exams/{exam}/remap', [AdminHigoController::class, 'remapExam']);
        Route::post('/admin/higo/exams/remap', [AdminHigoController::class, 'remapAll']);
        Route::get('/admin/higo/mapping', [AdminHigoController::class, 'mapping']);
        Route::put('/admin/higo/mapping', [AdminHigoController::class, 'updateMapping']);
        Route::post('/admin/higo/credentials/{kind}/{id}/reset', [AdminHigoController::class, 'resetPassword'])->whereNumber('id');

        Route::get('/integrations/events', [IntegrationController::class, 'events']);
        Route::post('/integrations/documents/{medicalDocument}/queue', [IntegrationController::class, 'queueDocument']);
    });
});
