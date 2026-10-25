import { Fragment } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button, type ButtonProps } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { cn } from '../ui/utils';

export type MoreMenuItem = {
  label: string;
  icon?: React.ElementType;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

/** Acțiunile secundare ale unui ecran, ascunse sub „⋯” ca să nu concureze cu cea principală. */
export function MoreMenu({ items, label = 'Mai multe acțiuni', size = 'icon' }: { items: MoreMenuItem[]; label?: string; size?: ButtonProps['size'] }) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={size} aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn('cursor-pointer gap-2', item.danger && 'text-red-600 focus:bg-red-50 focus:text-red-700')}>
              {item.icon && <item.icon className="h-4 w-4" />}
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
