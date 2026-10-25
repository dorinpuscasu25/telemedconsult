import { cn } from '../ui/utils';
import { Skeleton } from '../ui/skeleton';

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  loading = false,
  className
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: React.ElementType;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}
      </div>
      {loading ? <Skeleton className="mt-3 h-7 w-20" /> : <p className="tabular mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>}
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
