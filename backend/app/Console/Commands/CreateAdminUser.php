<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

#[Signature('admin:create {email : Adresa de email a administratorului} {--name=Administrator : Numele folosit pentru un cont nou}')]
#[Description('Creează un administrator sau acordă rolul de administrator unui cont existent')]
class CreateAdminUser extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $email = Str::lower(trim((string) $this->argument('email')));

        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $this->error('Adresa de email nu este validă.');

            return self::FAILURE;
        }

        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            $password = (string) $this->secret('Parola nouă (minimum 12 caractere)');
            $passwordConfirmation = (string) $this->secret('Confirmă parola');

            if (mb_strlen($password) < 12) {
                $this->error('Parola trebuie să conțină minimum 12 caractere.');

                return self::FAILURE;
            }

            if ($password !== $passwordConfirmation) {
                $this->error('Parolele nu coincid.');

                return self::FAILURE;
            }

            $user = User::query()->create([
                'name' => (string) $this->option('name'),
                'email' => $email,
                'password' => $password,
                'status' => 'active',
            ]);
        }

        $adminRole = Role::query()->updateOrCreate(
            ['name' => 'admin'],
            ['label' => 'Administrator'],
        );

        $user->forceFill([
            'active_role_id' => $adminRole->id,
            'status' => 'active',
            'email_verified_at' => $user->email_verified_at ?? now(),
        ])->save();
        $user->roles()->syncWithoutDetaching([$adminRole->id]);

        $this->info("Contul {$email} are acum acces de administrator.");

        return self::SUCCESS;
    }
}
