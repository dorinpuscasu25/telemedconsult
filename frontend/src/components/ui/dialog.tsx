import React from 'react'
import { X } from 'lucide-react'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// --- merged from src/Dialog.tsx ---
interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextType>({
  open: false,
  setOpen: () => {},
});

interface DialogProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const Dialog: React.FC<DialogProps> = ({ children, open, defaultOpen = false, onOpenChange }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const controlledOpen = open !== undefined ? open : isOpen;

  const handleOpenChange = (newOpen: boolean) => {
    if (open === undefined) setIsOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  return (
    <DialogContext.Provider value={{ open: controlledOpen, setOpen: handleOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
};

interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ onClick, ...props }, ref) => {
    const { setOpen } = React.useContext(DialogContext);

    return (
      <button
        ref={ref}
        type="button"
        data-slot="dialog-trigger"
        onClick={(e) => {
          setOpen(true);
          onClick?.(e);
        }}
        {...props}
      />
    );
  }
);
DialogTrigger.displayName = "DialogTrigger";

interface DialogCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const DialogClose = React.forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ onClick, ...props }, ref) => {
/* deduped destructure: const { setOpen } = React.useContext(DialogContext); */

    return (
      <button
        ref={ref}
        type="button"
        data-slot="dialog-close"
        onClick={(e) => {
          setOpen(false);
          onClick?.(e);
        }}
        {...props}
      />
    );
  }
);
DialogClose.displayName = "DialogClose";

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  showCloseButton?: boolean;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, showCloseButton = true, ...props }, ref) => {
    const { open, setOpen } = React.useContext(DialogContext);
    if (!open) return null;

    return (
      <>
        <div
          className="fixed inset-0 z-50 bg-black/10 supports-[backdrop-filter]:backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
        <div
          ref={ref}
          data-slot="dialog-content"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-background p-4 text-sm shadow-2xl outline-none sm:max-w-sm",
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md hover:bg-muted"
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
DialogContent.displayName = "DialogContent";

const DialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
  )
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} data-slot="dialog-title" className={cn("text-base leading-none font-medium", className)} {...props} />
  )
);
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
DialogDescription.displayName = "DialogDescription";

// --- merged from utils.ts ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export { Dialog }

export { DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
