<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SiteContent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SiteContentController extends Controller
{
    /** Textele site-ului, pentru orice vizitator. */
    public function index(SiteContent $content): JsonResponse
    {
        return response()->json(['data' => $content->all()]);
    }

    /** Structura pe blocuri pentru panoul de administrare. */
    public function adminIndex(Request $request, SiteContent $content): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['groups' => $content->adminGroups()]);
    }

    public function update(Request $request, SiteContent $content): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'values' => ['required', 'array'],
            'values.*' => ['nullable', 'string'],
        ]);

        $limits = SiteContent::limits();
        $errors = [];

        foreach ($validated['values'] as $key => $value) {
            if (! isset($limits[$key])) {
                $errors['values'][] = "Cheia „{$key}” nu există.";

                continue;
            }

            if (mb_strlen((string) $value) > $limits[$key]) {
                $errors['values'][] = "Textul pentru „{$key}” depășește {$limits[$key]} de caractere.";
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $content->save($validated['values'], $request->user()?->id);

        return response()->json([
            'message' => 'Textele au fost salvate.',
            'groups' => $content->adminGroups(),
        ]);
    }

    /** Readuce un bloc întreg la textele implicite. */
    public function reset(Request $request, SiteContent $content): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'group' => ['required', 'string'],
        ]);

        $group = SiteContent::CATALOG[$validated['group']] ?? null;

        if (! $group) {
            throw ValidationException::withMessages(['group' => ['Blocul nu există.']]);
        }

        $content->save(
            array_fill_keys(array_keys($group['fields']), ''),
            $request->user()?->id,
        );

        return response()->json([
            'message' => 'Blocul a fost readus la textele implicite.',
            'groups' => $content->adminGroups(),
        ]);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403, 'Doar administratorii pot edita textele.');
    }
}
