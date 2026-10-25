import { cn } from '../ui/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className
}: {
  icon?: React.ElementType;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center', compact ? 'px-4 py-6' : 'px-6 py-12', className)}>
      {Icon && (
        <span className={cn('mb-3 grid place-items-center rounded-2xl bg-slate-100 text-slate-500', compact ? 'h-10 w-10' : 'h-12 w-12')}>
          <Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
        </span>
      )}
      <p className="font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
