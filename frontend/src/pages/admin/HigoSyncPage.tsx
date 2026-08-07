import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Eye, RefreshCw, Loader2, XCircle, CircleDashed } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { apiRequest } from '../../lib/api';

type SyncStatus = 'synced' | 'failed' | 'skipped' | 'never';

interface SyncEntity {
  kind: 'patient' | 'doctor' | 'operator';
  id: number;
  name: string;
  email: string | null;
  higo_id: string | null;
  status: SyncStatus;
  synced_at: string | null;
  error: string | null;
  higo_username: string | null;
  higo_password: string | null;
  can_reset_password: boolean;
}

interface SyncLog {
  id: number;
  operation: string | null;
  status: string | null;
  method: string | null;
  http_status: number | null;
  error_message: string | null;
  created_at: string;
}

interface ExamPayload {
  id: string;
  external_id: string | null;
  higo_patient_id: string | null;
  device_serial: string | null;
  consultation_request_id: string | null;
  status: 'mapped' | 'unmatched' | 'failed' | 'received';
  error: string | null;
  measurement_keys: string[];
  media_count: number;
  received_at: string;
}

/** O observație din aparat, cu tot lanțul: ce a venit → în ce a intrat. */
interface MappingRow {
  observation_id: string | null;
  exam_type: string | null;
  loinc: string | null;
  raw_value: unknown;
  raw_unit: string | null;
  key: string;
  label: string;
  value: unknown;
  unit: string | null;
  converted: boolean;
  rule: 'loinc' | 'exam_type' | 'field' | 'unmapped';
  known: boolean;
}

interface ExamMedia {
  id: string;
  exam_type: string | null;
  kind: 'image' | 'audio' | 'video';
  content_type: string | null;
  sequence: number | null;
  size_bytes: number | null;
  error: string | null;
  url: string | null;
}

interface ExamDetail {
  id: string;
  external_id: string | null;
  status: ExamPayload['status'];
  error: string | null;
  higo_patient_id: string | null;
  device_serial: string | null;
  received_at: string | null;
  mapped_at: string | null;
  consultation_request_id: string | null;
  patient_profile: string | null;
  measurements: Record<string, unknown>;
  mapping: MappingRow[];
  media: ExamMedia[];
  raw: unknown;
}

type MappingKind = 'exam_type' | 'loinc' | 'field';

interface MappingRule {
  source: string;
  target: string | null;
  default: string | null;
  overridden: boolean;
  known_target: boolean;
}

interface CanonicalField {
  key: string;
  label: string;
  unit: string | null;
  group_label: string;
  device_only: boolean;
}

interface MappingResponse {
  data: Record<MappingKind, MappingRule[]>;
  fields: CanonicalField[];
  unmapped: { exam_type: string[]; loinc: string[] };
}

interface SyncResponse {
  data: SyncEntity[];
  exams: ExamPayload[];
  exam_summary: { mapped: number; unmatched: number; failed: number };
  summary: {
    enabled: boolean;
    base_url_configured: boolean;
    credentials_configured: boolean;
    synced: number;
    failed: number;
    never: number;
  };
  recent_logs: SyncLog[];
}

const KIND_LABELS: Record<SyncEntity['kind'], string> = {
  patient: 'Pacient',
  doctor: 'Medic',
  operator: 'Operator'
};

const STATUS_META: Record<SyncStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  synced: { label: 'Sincronizat', className: 'text-emerald-700 bg-emerald-50 border-emerald-200', Icon: CheckCircle2 },
  failed: { label: 'Eșuat', className: 'text-red-700 bg-red-50 border-red-200', Icon: XCircle },
  skipped: { label: 'Ignorat', className: 'text-slate-600 bg-slate-50 border-slate-200', Icon: CircleDashed },
  never: { label: 'Netrimis', className: 'text-amber-700 bg-amber-50 border-amber-200', Icon: CircleDashed }
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Regulile existente, plus denumirile văzute în examinări care nu au încă
 * regulă — acestea din urmă sunt exact ce trebuie rezolvat, deci apar sus.
 */
function mappingRows(mapping: MappingResponse, kind: MappingKind): MappingRule[] {
  const pending = (kind === 'field' ? [] : mapping.unmapped[kind]).map((source) => ({
    source,
    target: null,
    default: null,
    overridden: false,
    known_target: false
  }));

  return [...pending, ...mapping.data[kind]];
}

const RULE_LABELS: Record<MappingRow['rule'], string> = {
  loinc: 'după cod LOINC',
  exam_type: 'după denumirea examinării',
  field: 'după numele câmpului',
  unmapped: 'nemapat'
};

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Ce a trimis aparatul lângă ce am înțeles noi. Fără ecranul ăsta, o mapare
 * greșită se vede abia în fișa medicului, unde arată ca o măsurătoare lipsă.
 */
function ExamDetailDialog({ exam, onClose }: { exam: ExamDetail; onClose: () => void }) {
  // Prin portal, altfel bara laterală (flex item cu z-index propriu) se
  // desenează peste dialog: `z-50` contează doar în contextul de stivuire al
  // conținutului, nu față de frații layout-ului.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4" onClick={onClose}>
      <div
        className="my-4 w-full max-w-4xl space-y-4 rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Examinare {exam.external_id ?? `#${exam.id}`}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {exam.patient_profile ?? 'pacient nelegat'} · aparat {exam.device_serial ?? '—'} ·{' '}
              {formatDate(exam.received_at)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <XCircle className="size-5" />
          </button>
        </div>

        {exam.error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{exam.error}</p>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cum s-a mapat</p>
          {exam.mapping.length === 0 ? (
            <p className="text-sm text-slate-400">Examinarea nu conține măsurători — doar fișiere.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-1.5 text-left font-medium">Din aparat</th>
                    <th className="py-1.5 text-left font-medium">LOINC</th>
                    <th className="py-1.5 text-left font-medium">Valoare primită</th>
                    <th className="py-1.5 text-left font-medium">În fișă</th>
                    <th className="py-1.5 text-left font-medium">Regulă</th>
                  </tr>
                </thead>
                <tbody>
                  {exam.mapping.map((row, index) => (
                    <tr key={`${row.observation_id ?? row.key}-${index}`} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 font-mono text-slate-700">{row.exam_type ?? '—'}</td>
                      <td className="py-1.5 font-mono text-slate-500">{row.loinc ?? '—'}</td>
                      <td className="py-1.5 text-slate-600">
                        {renderValue(row.raw_value)} {row.raw_unit}
                      </td>
                      <td className="py-1.5">
                        <span className={row.known ? 'text-slate-900' : 'text-amber-700'}>
                          {row.label}: {renderValue(row.value)} {row.unit}
                        </span>
                        {row.converted && <span className="ml-1 text-sky-600">(convertit)</span>}
                      </td>
                      <td className="py-1.5 text-slate-500">{RULE_LABELS[row.rule]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {exam.media.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fișiere ({exam.media.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {exam.media.map((media) => (
                <div key={media.id} className="rounded-xl border border-slate-200 p-2">
                  <p className="mb-1 truncate text-xs text-slate-500" title={media.exam_type ?? ''}>
                    {media.exam_type ?? 'Fișier'} {media.sequence != null && `#${media.sequence}`}
                  </p>
                  {!media.url ? (
                    <p className="text-xs text-red-600">{media.error ?? 'Nedescărcat.'}</p>
                  ) : media.kind === 'image' ? (
                    <a href={media.url} target="_blank" rel="noreferrer">
                      <img src={media.url} alt={media.exam_type ?? ''} className="aspect-square w-full rounded-lg object-cover" />
                    </a>
                  ) : media.kind === 'video' ? (
                    <video controls preload="metadata" src={media.url} className="w-full rounded-lg bg-black" />
                  ) : (
                    <audio controls preload="none" src={media.url} className="h-9 w-full" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
            Payload brut de la HIGO
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
            {JSON.stringify(exam.raw, null, 2)}
          </pre>
        </details>
      </div>
    </div>,
    document.body
  );
}

export function HigoSyncPage() {
  const [response, setResponse] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [mapping, setMapping] = useState<MappingResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<MappingKind>('exam_type');

  const load = () => {
    apiRequest<SyncResponse>('/admin/higo/sync')
      .then(setResponse)
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca starea sincronizării.'))
      .finally(() => setLoading(false));
  };

  const loadMapping = () => {
    apiRequest<MappingResponse>('/admin/higo/mapping')
      .then((data) => {
        setMapping(data);
        setDrafts({});
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca regulile de mapare.'));
  };

  useEffect(() => {
    load();
    loadMapping();
  }, []);

  const openExam = async (id: string) => {
    setError('');

    try {
      const detail = await apiRequest<{ data: ExamDetail }>(`/admin/higo/exams/${id}`);
      setExam(detail.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca examinarea.');
    }
  };

  /**
   * Trimitem toate regulile care diferă de implicit — backend-ul înlocuiește
   * suprascrierile în bloc, deci o regulă readusă la implicit dispare de la
   * sine. `remap` reaplică maparea peste examinările deja primite: o regulă
   * corectată care nu repară fișele existente nu ajută la nimic.
   */
  const saveMapping = async () => {
    if (!mapping) return;

    setRetrying('mapping');
    setMessage('');
    setError('');

    const rules: Record<string, string> = {};

    mapping.data[kind].forEach((rule) => {
      const value = drafts[`${kind}:${rule.source}`] ?? rule.target ?? '';
      if (value && value !== rule.default) rules[rule.source] = value;
    });

    Object.entries(drafts).forEach(([key, value]) => {
      const [draftKind, source] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      if (draftKind === kind && value) rules[source] = value;
    });

    try {
      const result = await apiRequest<{ message: string }>('/admin/higo/mapping', {
        method: 'PUT',
        body: JSON.stringify({ kind, rules, remap: true })
      });
      setMessage(result.message);
      loadMapping();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvarea regulilor a eșuat.');
    } finally {
      setRetrying(null);
    }
  };

  const remapAll = async () => {
    setRetrying('remap-all');
    setMessage('');
    setError('');

    try {
      const result = await apiRequest<{ message: string }>('/admin/higo/exams/remap', { method: 'POST' });
      setMessage(result.message);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remaparea a eșuat.');
    } finally {
      setRetrying(null);
    }
  };

  const resetPassword = async (entity: SyncEntity) => {
    const key = `pwd-${entity.kind}-${entity.id}`;
    setRetrying(key);
    setMessage('');
    setError('');

    try {
      const result = await apiRequest<{ message: string }>(`/admin/higo/credentials/${entity.kind}/${entity.id}/reset`, {
        method: 'POST'
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resetarea parolei a eșuat.');
    } finally {
      setRetrying(null);
      load();
    }
  };

  const remapExam = async (exam: ExamPayload) => {
    setRetrying(`exam-${exam.id}`);
    setMessage('');
    setError('');

    try {
      const result = await apiRequest<{ message: string }>(`/admin/higo/exams/${exam.id}/remap`, { method: 'POST' });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remaparea a eșuat.');
    } finally {
      setRetrying(null);
      load();
    }
  };

  const retry = async (entity: SyncEntity) => {
    const key = `${entity.kind}-${entity.id}`;
    setRetrying(key);
    setMessage('');
    setError('');

    try {
      const result = await apiRequest<{ message: string }>(`/admin/higo/sync/${entity.kind}/${entity.id}`, {
        method: 'POST'
      });
      setMessage(result.message);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retrimiterea a eșuat.');
      load();
    } finally {
      setRetrying(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" />
        Se încarcă…
      </div>
    );
  }

  const summary = response?.summary;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sincronizare HIGO</h1>
          <p className="mt-1 text-sm text-slate-500">
            Conturile create în platformă sunt trimise automat în sistemul HIGO. Aici vezi ce a ajuns și ce trebuie reluat.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="size-4" />
          Reîmprospătează
        </Button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
      )}

      {summary && !summary.enabled && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Sincronizarea este oprită — nimic nu pleacă spre HIGO.</p>
            <p className="mt-1">
              {!summary.base_url_configured && 'Lipsește HIGO_BASE_URL. '}
              {!summary.credentials_configured && 'Lipsesc credențialele (HIGO_CLIENT_ID / HIGO_USERNAME). '}
              Verifică și modulul „Aparate &amp; integrare HIGO” din Funcționalități.
            </p>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Sincronizate', value: summary.synced, className: 'text-emerald-600' },
            { label: 'Eșuate', value: summary.failed, className: 'text-red-600' },
            { label: 'Netrimise', value: summary.never, className: 'text-amber-600' }
          ].map((item) => (
            <Card key={item.label} size="sm">
              <CardContent className="px-4">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className={`text-2xl font-semibold ${item.className}`}>{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conturi</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tip</TableHead>
                <TableHead>Nume</TableHead>
                <TableHead>ID HIGO</TableHead>
                <TableHead>Stare</TableHead>
                <TableHead>Ultima sincronizare</TableHead>
                <TableHead className="text-right">Acțiune</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(response?.data ?? []).map((entity) => {
                const meta = STATUS_META[entity.status] ?? STATUS_META.never;
                const key = `${entity.kind}-${entity.id}`;

                return (
                  <TableRow key={key}>
                    <TableCell className="text-slate-600">{KIND_LABELS[entity.kind]}</TableCell>
                    <TableCell>
                      <p className="font-medium text-slate-900">{entity.name}</p>
                      {entity.email && <p className="text-xs text-slate-500">{entity.email}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{entity.higo_id ?? '—'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium ${meta.className}`}>
                        <meta.Icon className="size-3.5" />
                        {meta.label}
                      </span>
                      {entity.error && (
                        <p className="mt-1 max-w-72 truncate text-xs text-red-600" title={entity.error}>
                          {entity.error}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {formatDate(entity.synced_at)}
                      {entity.higo_password && (
                        <div className="mt-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-sky-900">
                          <p className="font-medium">Autentificare în aplicația HIGO</p>
                          <p className="font-mono">{entity.higo_username}</p>
                          <p className="font-mono">{entity.higo_password}</p>
                        </div>
                      )}
                      {entity.can_reset_password && (
                        <button
                          type="button"
                          onClick={() => resetPassword(entity)}
                          disabled={retrying === `pwd-${entity.kind}-${entity.id}`}
                          className="mt-1 text-xs text-primary underline underline-offset-2 disabled:opacity-50">
                          {entity.higo_password ? 'Generează parolă nouă' : 'Obține parolă'}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => retry(entity)}
                        disabled={retrying === key || !summary?.enabled}>
                        {retrying === key ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                        {entity.status === 'synced' ? 'Retrimite' : 'Trimite'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(response?.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    Niciun profil de sincronizat.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(response?.exams ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Examinări primite din aparat
              {response?.exam_summary && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {response.exam_summary.mapped} atașate · {response.exam_summary.unmatched} nelegate ·{' '}
                  {response.exam_summary.failed} eșuate
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(response?.exams ?? []).map((exam) => (
              <div key={exam.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs">
                <span
                  className={`rounded-md border px-1.5 py-0.5 font-medium ${
                    exam.status === 'mapped'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : exam.status === 'unmatched'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                  }`}>
                  {exam.status === 'mapped' ? 'Atașată' : exam.status === 'unmatched' ? 'Nelegată' : 'Eșuată'}
                </span>
                <span className="font-mono text-slate-600">{exam.external_id ?? `#${exam.id}`}</span>
                {exam.higo_patient_id && <span className="text-slate-500">pacient {exam.higo_patient_id}</span>}
                {exam.device_serial && <span className="text-slate-500">aparat {exam.device_serial}</span>}
                {exam.measurement_keys.length > 0 && (
                  <span className="text-slate-500">{exam.measurement_keys.length} măsurători</span>
                )}
                {exam.media_count > 0 && <span className="text-slate-500">{exam.media_count} fișiere</span>}
                <span className="text-slate-400">{formatDate(exam.received_at)}</span>
                {exam.error && <span className="w-full text-red-600">{exam.error}</span>}
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => openExam(exam.id)}>
                  <Eye className="size-3.5" />
                  Vezi datele
                </Button>
                {exam.status !== 'mapped' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => remapExam(exam)}
                    disabled={retrying === `exam-${exam.id}`}>
                    {retrying === `exam-${exam.id}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    Remapează
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {mapping && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Mapare date din aparat</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Ce trimite aparatul → în ce câmp din fișa medicului intră. Modificările se aplică imediat și se reaplică
                peste examinările deja primite.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 p-0.5">
                {(
                  [
                    ['exam_type', 'Denumiri examinări'],
                    ['loinc', 'Coduri LOINC'],
                    ['field', 'Câmpuri brute']
                  ] as Array<[MappingKind, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind(value)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      kind === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={remapAll} disabled={retrying === 'remap-all'}>
                {retrying === 'remap-all' ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Remapează tot
              </Button>
              <Button size="sm" onClick={saveMapping} disabled={retrying === 'mapping'}>
                {retrying === 'mapping' && <Loader2 className="size-3.5 animate-spin" />}
                Salvează și reaplică
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {mappingRows(mapping, kind).map((rule) => {
              const draftKey = `${kind}:${rule.source}`;
              const value = drafts[draftKey] ?? rule.target ?? '';

              return (
                <div key={rule.source} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-1.5 text-xs last:border-0">
                  <span className="min-w-56 font-mono text-slate-700">{rule.source}</span>
                  <span className="text-slate-400">→</span>
                  <select
                    value={value}
                    onChange={(event) => setDrafts((current) => ({ ...current, [draftKey]: event.target.value }))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                    <option value="">— nemapat (rămâne cu numele aparatului) —</option>
                    {mapping.fields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                        {field.unit ? ` (${field.unit})` : ''}
                      </option>
                    ))}
                  </select>
                  {!rule.target && <span className="text-amber-600">nou, văzut în examinări</span>}
                  {rule.overridden && <span className="text-sky-600">modificat (implicit: {rule.default})</span>}
                  {value && !mapping.fields.some((field) => field.key === value) && (
                    <span className="text-slate-400">cheie liberă: {value}</span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {exam && <ExamDetailDialog exam={exam} onClose={() => setExam(null)} />}

      {(response?.recent_logs ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Apeluri recente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {(response?.recent_logs ?? []).map((log) => (
              <div key={log.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                <span className="font-mono text-slate-500">{formatDate(log.created_at)}</span>
                <span className="font-medium text-slate-800">{log.operation ?? '—'}</span>
                <span className="text-slate-500">
                  {log.method} → {log.http_status ?? '—'}
                </span>
                {log.error_message && <span className="text-red-600">{log.error_message}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
