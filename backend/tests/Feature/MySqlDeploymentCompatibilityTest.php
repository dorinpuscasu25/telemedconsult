<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\MySqlConnection;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

class MySqlDeploymentCompatibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_recent_migrations_compile_with_valid_mysql_identifier_lengths(): void
    {
        $connection = new MySqlConnection(null);
        $connection->useDefaultSchemaGrammar();
        $statements = [];
        $compile = function (string $table, \Closure $callback, bool $create) use ($connection, &$statements): void {
            $blueprint = new Blueprint($connection, $table);
            if ($create) {
                $blueprint->create();
            }
            $callback($blueprint);
            array_push($statements, ...$blueprint->toSql());
        };
        Schema::shouldReceive('hasTable')->andReturn(false);
        Schema::shouldReceive('hasIndex')->andReturn(false);
        Schema::shouldReceive('create')->andReturnUsing(fn (string $table, \Closure $callback) => $compile($table, $callback, true));
        Schema::shouldReceive('table')->andReturnUsing(fn (string $table, \Closure $callback) => $compile($table, $callback, false));

        foreach ($this->migrationFiles() as $file) {
            (require database_path('migrations/'.$file))->up();
        }

        $this->assertNotEmpty($statements);
        foreach ($statements as $statement) {
            preg_match_all('/`([^`]+)`/', $statement, $matches);
            foreach ($matches[1] as $identifier) {
                $this->assertLessThanOrEqual(64, strlen($identifier), $statement);
            }
        }
    }

    public function test_promotions_migration_resumes_after_partial_creation_without_losing_data(): void
    {
        $doctor = User::factory()->create();
        $viewer = User::factory()->create();
        $campaignId = DB::table('doctor_promotions')->insertGetId([
            'doctor_id' => $doctor->id, 'budget_minor' => 1000, 'remaining_minor' => 900, 'ends_at' => now()->addDay(),
        ]);
        $impressionId = DB::table('doctor_promotion_impressions')->insertGetId([
            'doctor_promotion_id' => $campaignId, 'doctor_id' => $doctor->id, 'viewer_id' => $viewer->id, 'position' => 1,
        ]);
        $columns = ['doctor_id', 'viewer_id', 'created_at'];
        $this->removeIndex('doctor_promotion_impressions', $columns);

        $migration = require database_path('migrations/'.$this->migrationFiles()[0]);
        $migration->up();
        $migration->up();

        $this->assertTrue(Schema::hasIndex('doctor_promotion_impressions', $columns));
        $this->assertSame(900, DB::table('doctor_promotions')->where('id', $campaignId)->value('remaining_minor'));
        $this->assertTrue(DB::table('doctor_promotion_impressions')->where('id', $impressionId)->exists());
    }

    public function test_administrative_migration_resumes_after_partial_creation_without_losing_messages(): void
    {
        $user = User::factory()->create();
        $conversationId = DB::table('administrative_conversations')->insertGetId(['target_id' => $user->id, 'created_by' => $user->id]);
        $messageId = DB::table('administrative_messages')->insertGetId([
            'administrative_conversation_id' => $conversationId, 'sender_id' => $user->id, 'sender_is_admin' => true, 'body' => 'Mesaj existent',
        ]);
        $columns = ['administrative_conversation_id', 'sender_is_admin', 'read_at'];
        $this->removeIndex('administrative_messages', $columns);

        $migration = require database_path('migrations/'.$this->migrationFiles()[1]);
        $migration->up();
        $migration->up();

        $this->assertTrue(Schema::hasIndex('administrative_messages', $columns));
        $this->assertSame('Mesaj existent', DB::table('administrative_messages')->where('id', $messageId)->value('body'));
    }

    public function test_deployment_stops_when_migrations_fail(): void
    {
        $compose = Yaml::parseFile(base_path('../compose.yaml'));
        $script = $compose['services']['init']['command'][2];
        $process = new Process(['sh', '-c', 'php() { if [ "$2" = migrate ]; then return 37; fi; return 0; }'."\n".$script], env: [
            'RUN_SEEDERS' => 'false', 'TELEGRAM_WEBHOOK_AUTO_SET' => 'false', 'HIGO_SUBSCRIBE_ON_DEPLOY' => 'false',
        ]);
        $process->run();

        $this->assertSame(37, $process->getExitCode(), $process->getErrorOutput());
    }

    /** @return list<string> */
    private function migrationFiles(): array
    {
        return [
            '2026_11_14_140821_create_doctor_promotions_table.php',
            '2026_11_14_141433_create_administrative_conversations_table.php',
        ];
    }

    /** @param list<string> $columns */
    private function removeIndex(string $table, array $columns): void
    {
        $index = collect(Schema::getIndexes($table))->firstWhere('columns', $columns);
        $this->assertNotNull($index);
        Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropIndex($index['name']));
    }
}
