import { cn } from '../ui/utils';
import {
  TONE_CLASSES,
  consultationStatusKey,
  consultationStatusLabel,
  consultationStatusTone,
  type Perspective,
  type StatusTone
} from '../../lib/status';

export function StatusBadge({
  request,
  perspective,
  className
}: {
  request: { status: string; doctor_started_at?: string | null };
  perspective: Perspective;
  className?: string;
}) {
  const key = consultationStatusKey(request);
  return <ToneBadge tone={consultationStatusTone(key)} pulse={key === 'in_progress'} className={className}>{consultationStatusLabel(key, perspective)}</ToneBadge>;
}

export function ToneBadge({
  tone,
  children,
  pulse = false,
  dot = true,
  className
}: {
  tone: StatusTone;
  children: React.ReactNode;
  pulse?: boolean;
  dot?: boolean;
  className?: string;
}) {
  const classes = TONE_CLASSES[tone];
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold', classes.badge, className)}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', classes.dot)} />}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', classes.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}
