import { useNow } from '../../lib/use-now';
import { cn } from '../ui/utils';

const timeZone = 'Europe/Chisinau';
const timeFormatter = new Intl.DateTimeFormat('ro-RO', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});
const dateFormatter = new Intl.DateTimeFormat('ro-RO', {
  timeZone,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

/** Același reper de timp pentru toate conturile, inclusiv din alte fusuri orare. */
export function CurrentTimeCard({ className }: { className?: string }) {
  const now = useNow(1000);
  const parts = timeFormatter.formatToParts(now);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  const second = parts.find((part) => part.type === 'second')?.value ?? '00';

  return (
    <section aria-label="Ora curentă în Chișinău" className={cn('relative isolate overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-indigo-50 p-5 shadow-sm', className)}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 -z-10 h-40 w-40 rounded-full bg-blue-100/50" />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold text-blue-700">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            Ora Chișinăului
          </p>
          <time dateTime={new Date(now).toISOString()} aria-label={timeFormatter.format(now)} aria-live="off" className="mt-2 flex items-baseline font-mono tabular-nums tracking-tight text-slate-950">
            <span className="text-4xl font-semibold">{hour}:{minute}</span>
            <span className="ml-1 text-xl font-medium text-blue-500">:{second}</span>
          </time>
        </div>
        <svg aria-hidden="true" viewBox="0 0 64 64" className="h-16 w-16 shrink-0 drop-shadow-sm">
          <circle cx="32" cy="32" r="30" fill="white" stroke="#bfdbfe" />
          {Array.from({ length: 12 }, (_, index) => (
            <line key={index} x1="32" y1="7" x2="32" y2={index % 3 === 0 ? '12' : '10'} stroke={index % 3 === 0 ? '#60a5fa' : '#cbd5e1'} strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${index * 30} 32 32)`} />
          ))}
          <line x1="32" y1="32" x2="32" y2="18" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" transform={`rotate(${Number(hour) * 30 + Number(minute) / 2} 32 32)`} />
          <line x1="32" y1="32" x2="32" y2="12" stroke="#334155" strokeWidth="2" strokeLinecap="round" transform={`rotate(${Number(minute) * 6 + Number(second) / 10} 32 32)`} />
          <line x1="32" y1="36" x2="32" y2="10" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round" transform={`rotate(${Number(second) * 6} 32 32)`} />
          <circle cx="32" cy="32" r="2.5" fill="#2563eb" />
        </svg>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500 first-letter:uppercase">{dateFormatter.format(now)}</p>
    </section>
  );
}
