import { usePageTitle } from '../../lib/use-page-title';
import { cn } from '../ui/utils';

/**
 * Antetul standard al unei pagini din aplicație. Toate paginile folosesc
 * aceeași ierarhie (eyebrow → titlu → descriere → acțiuni), ca navigarea să nu
 * mai „sară” între dimensiuni și culori diferite de titlu.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  documentTitle,
  className
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  documentTitle?: string;
  className?: string;
}) {
  usePageTitle(documentTitle ?? (typeof title === 'string' ? title : undefined));
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm font-semibold text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem] sm:leading-9">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  className
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
