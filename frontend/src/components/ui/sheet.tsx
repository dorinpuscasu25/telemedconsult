import React from 'react'
import { X } from 'lucide-react'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// --- merged from src/Sheet.tsx ---
interface SheetContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SheetContext = React.createContext<SheetContextType>({
  open: false,
  setOpen: () => {},
});

interface SheetProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const Sheet: React.FC<SheetProps> = ({ children, open, defaultOpen = false, onOpenChange }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const controlledOpen = open !== undefined ? open : isOpen;

  const handleOpenChange = (newOpen: boolean) => {
    if (open === undefined) setIsOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  return (
    <SheetContext.Provider value={{ open: controlledOpen, setOpen: handleOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
};

const SheetTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ onClick, ...props }, ref) => {
    const { setOpen } = React.useContext(SheetContext);
    return (
      <button ref={ref} type="button" data-slot="sheet-trigger" onClick={(e) => { setOpen(true); onClick?.(e); }} {...props} />
    );
  }
);
SheetTrigger.displayName = "SheetTrigger";

const SheetClose = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ onClick, ...props }, ref) => {
/* deduped destructure: const { setOpen } = React.useContext(SheetContext); */
    return (
      <button ref={ref} type="button" data-slot="sheet-close" onClick={(e) => { setOpen(false); onClick?.(e); }} {...props} />
    );
  }
);
SheetClose.displayName = "SheetClose";

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}

const sideStyles = {
  right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
  left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
  top: "inset-x-0 top-0 h-auto border-b",
  bottom: "inset-x-0 bottom-0 h-auto border-t",
};

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, children, side = "right", showCloseButton = true, ...props }, ref) => {
    const { open, setOpen } = React.useContext(SheetContext);
    if (!open) return null;

    return (
      <>
        <div className="fixed inset-0 z-50 bg-black/10 supports-[backdrop-filter]:backdrop-blur-[2px]" onClick={() => setOpen(false)} />
        <div
          ref={ref}
          data-slot="sheet-content"
          data-side={side}
          className={cn(
            "fixed z-50 flex flex-col gap-4 bg-background text-sm shadow-lg",
            sideStyles[side],
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </button>
          )}
        </div>
      </>
    );
  }
);
SheetContent.displayName = "SheetContent";

const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="sheet-header" className={cn("flex flex-col gap-0.5 p-4", className)} {...props} />
  )
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
  )
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} data-slot="sheet-title" className={cn("text-base font-medium text-foreground", className)} {...props} />
  )
);
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
SheetDescription.displayName = "SheetDescription";

// --- merged from utils.ts ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export { Sheet }

export { SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter }
