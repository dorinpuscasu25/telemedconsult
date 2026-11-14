<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAdministrativeMessageRequest;
use App\Models\AdministrativeConversation;
use App\Models\AdministrativeMessage;
use App\Models\User;
use App\Notifications\AppEventNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AdministrativeMessageController extends Controller
{
    private function authorize(User $user, ?AdministrativeConversation $conversation = null): void
    {
        abort_unless($user->status === 'active' && ($user->hasRole('admin') || $user->hasRole('doctor') || $user->hasRole('operator') || $user->hasRole('institution')), 403);
        if ($conversation) {
            abort_unless($user->hasRole('admin') || $conversation->target_id === $user->id, 404);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorize($user);
        $admin = $user->hasRole('admin');
        $rows = AdministrativeConversation::with('target:id,name')->when(! $admin, fn ($q) => $q->where('target_id', $user->id))->withCount(['messages as unread_count' => fn ($q) => $q->where('sender_is_admin', ! $admin)->whereNull('read_at')])->latest('updated_at')->paginate(30);

        return response()->json($rows);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        $input = $request->validate(['target_id' => ['required', 'integer', 'exists:users,id']]);
        $target = User::findOrFail($input['target_id']);
        $this->authorize($target);
        abort_if($target->hasRole('admin'), 422, 'Alege un medic, operator sau manager de instituție.');
        $conversation = DB::transaction(function () use ($target, $request) {
            User::whereKey($target->id)->lockForUpdate()->firstOrFail();

            return AdministrativeConversation::firstOrCreate(['target_id' => $target->id], ['created_by' => $request->user()->id]);
        });

        return response()->json(['id' => $conversation->id], 201);
    }

    public function show(Request $request, AdministrativeConversation $conversation): JsonResponse
    {
        $user = $request->user();
        $this->authorize($user, $conversation);
        $messages = $conversation->messages()->with('sender:id,name')->latest('id')->paginate(30);
        AdministrativeMessage::whereIn('id', $messages->getCollection()->pluck('id'))->where('sender_is_admin', ! $user->hasRole('admin'))->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['conversation' => ['id' => $conversation->id, 'target' => $conversation->target()->first(['id', 'name'])], 'messages' => $messages->through(fn ($message) => $this->serialize($message, $user))]);
    }

    public function send(StoreAdministrativeMessageRequest $request, AdministrativeConversation $conversation): JsonResponse
    {
        $user = $request->user();
        $this->authorize($user, $conversation);
        $paths = [];
        try {
            foreach ($request->file('attachments', []) as $file) {
                $path = $file->store('administrative-messages', 'local');
                abort_unless(is_string($path), 500, 'Fișierul nu a putut fi salvat.');
                $paths[] = ['path' => $path, 'name' => basename($file->getClientOriginalName()), 'mime' => $file->getMimeType(), 'size' => $file->getSize()];
            }
            $message = DB::transaction(function () use ($request, $conversation, $user, $paths) {
                $conversation = AdministrativeConversation::whereKey($conversation->id)->lockForUpdate()->firstOrFail();
                $message = $conversation->messages()->create(['sender_id' => $user->id, 'sender_is_admin' => $user->hasRole('admin'), 'body' => $request->validated('body'), 'attachments' => $paths]);
                $conversation->touch();
                DB::afterCommit(function () use ($user, $conversation) {
                    $to = $user->hasRole('admin') ? collect([$conversation->target]) : User::whereHas('roles', fn ($q) => $q->where('name', 'admin'))->where('status', 'active')->get();
                    foreach ($to as $recipient) {
                        $role = $recipient->hasRole('admin') ? 'admin' : ($recipient->hasRole('institution') ? 'institution' : ($recipient->hasRole('doctor') ? 'doctor' : 'operator'));
                        rescue(fn () => $recipient->notify(new AppEventNotification('Mesaj administrativ nou', 'Ai primit un mesaj în corespondența administrativă.', "/{$role}/admin-messages?conversation={$conversation->id}")), report: true);
                    }
                });

                return $message;
            });
        } catch (\Throwable $exception) {
            foreach ($paths as $file) {
                Storage::disk('local')->delete($file['path']);
            }throw $exception;
        }

        return response()->json(['message' => $this->serialize($message->load('sender:id,name'), $user)], 201);
    }

    private function serialize(AdministrativeMessage $message, User $viewer): array
    {
        return ['id' => $message->id, 'sender' => ['id' => $message->sender_id, 'name' => $message->sender?->name], 'sender_is_admin' => $message->sender_is_admin, 'body' => $message->body, 'created_at' => $message->created_at, 'read_at' => $message->read_at, 'attachments' => collect($message->attachments ?? [])->map(fn ($file, $index) => ['name' => $file['name'], 'size' => $file['size'], 'url' => URL::temporarySignedRoute('administrative-message.file', now()->addMinutes(5), ['message' => $message->id, 'index' => $index, 'viewer' => $viewer->id])])->values()];
    }

    public function file(Request $request, AdministrativeMessage $message, int $index): BinaryFileResponse
    {
        $viewer = User::findOrFail($request->integer('viewer'));
        $this->authorize($viewer, $message->conversation);
        $file = $message->attachments[$index] ?? null;
        abort_unless($file && Storage::disk('local')->exists($file['path']), 404);

        return response()->download(Storage::disk('local')->path($file['path']), $file['name'], ['Content-Type' => $file['mime'], 'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, no-store'])->setPrivate();
    }
}
