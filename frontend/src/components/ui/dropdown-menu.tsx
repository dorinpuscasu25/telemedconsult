import React from 'react'
import { createPortal } from 'react-dom'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// --- merged from src/DropdownMenu.tsx ---
interface DropdownMenuContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextType>({
  open: false,
  setOpen: () => {},
  triggerRef: { current: null },
});

interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ children, open, defaultOpen = false, onOpenChange }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const controlledOpen = open !== undefined ? open : isOpen;

  const handleOpenChange = (newOpen: boolean) => {
    if (open === undefined) setIsOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  return (
    <DropdownMenuContext.Provider value={{ open: controlledOpen, setOpen: handleOpenChange, triggerRef }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  );
};

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ onClick, ...props }, ref) => {
    const { open, setOpen, triggerRef } = React.useContext(DropdownMenuContext);
    return (
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        type="button"
        data-slot="dropdown-menu-trigger"
        aria-expanded={open}
        onClick={(e) => { setOpen(!open); onClick?.(e); }}
        {...props}
      />
    );
  }
);
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end";
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ align = "start", className, style, ...props }, ref) => {
    const { open, triggerRef } = React.useContext(DropdownMenuContext);
    if (!open) return null;

    const rect = triggerRef.current?.getBoundingClientRect();
    const contentStyle: React.CSSProperties = rect
      ? {
          position: 'fixed',
          top: rect.bottom + 6,
          left: align === 'end' ? rect.right : rect.left,
          transform: align === 'end' ? 'translateX(-100%)' : undefined,
          ...style,
        }
      : style;

    const content = (
      <div
        ref={ref}
        data-slot="dropdown-menu-content"
        className={cn(
          "z-[100] min-w-32 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10",
          className
        )}
        style={contentStyle}
        {...props}
      />
    );

    return createPortal(content, document.body);
  }
);
DropdownMenuContent.displayName = "DropdownMenuContent";

interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  variant?: "default" | "destructive";
}

const DropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, inset, variant = "default", onClick, ...props }, ref) => {
    const { setOpen } = React.useContext(DropdownMenuContext);
    return (
      <div
        ref={ref}
        role="menuitem"
        data-slot="dropdown-menu-item"
        data-variant={variant}
        onClick={(event) => {
          setOpen(false);
          onClick?.(event);
        }}
        className={cn(
          "relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          inset && "pl-7",
          variant === "destructive" && "text-destructive hover:bg-destructive/10 hover:text-destructive",
          className
        )}
        {...props}
      />
    );
  }
);
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }>(
  ({ className, inset, ...props }, ref) => (
    <div ref={ref} data-slot="dropdown-menu-label" className={cn("px-1.5 py-1 text-xs font-medium text-muted-foreground", inset && "pl-7", className)} {...props} />
  )
);
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="dropdown-menu-separator" className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
  )
);
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

const DropdownMenuShortcut = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} data-slot="dropdown-menu-shortcut" className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />
  )
);
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

const DropdownMenuGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} data-slot="dropdown-menu-group" role="group" {...props} />
);
DropdownMenuGroup.displayName = "DropdownMenuGroup";

// --- merged from utils.ts ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export { DropdownMenu }

export { DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut }
