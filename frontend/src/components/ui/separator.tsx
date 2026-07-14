import React from 'react'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// --- merged from src/Separator.tsx ---
interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="separator"
        data-orientation={orientation}
        role={decorative ? "none" : "separator"}
        aria-orientation={!decorative ? orientation : undefined}
        className={cn(
          "shrink-0 bg-border",
          orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
          className
        )}
        {...props}
      />
    );
  }
);
Separator.displayName = "Separator";

// --- merged from utils.ts ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export { Separator }
