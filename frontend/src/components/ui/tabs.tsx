import React from 'react'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// --- merged from src/Tabs.tsx ---
interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextType>({
  value: "",
  onValueChange: () => {},
});

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, defaultValue = "", value, onValueChange, children, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const controlledValue = value !== undefined ? value : internalValue;

    const handleChange = (newValue: string) => {
      if (value === undefined) setInternalValue(newValue);
      onValueChange?.(newValue);
    };

    return (
      <TabsContext.Provider value={{ value: controlledValue, onValueChange: handleChange }}>
        <div
          ref={ref}
          data-slot="tabs"
          className={cn("flex flex-col gap-2", className)}
          {...props}
        >
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = "Tabs";

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "line";
}

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      data-slot="tabs-list"
      data-variant={variant}
      role="tablist"
      className={cn(
        "inline-flex h-8 w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground",
        variant === "default" ? "bg-muted" : "gap-1 bg-transparent rounded-none",
        className
      )}
      {...props}
    />
  )
);
TabsList.displayName = "TabsList";

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value: tabValue, ...props }, ref) => {
    const { value, onValueChange } = React.useContext(TabsContext);
    const isActive = value === tabValue;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        data-slot="tabs-trigger"
        data-active={isActive || undefined}
        aria-selected={isActive}
        onClick={() => onValueChange(tabValue)}
        className={cn(
          "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          isActive && "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30",
          className
        )}
        {...props}
      />
    );
  }
);
TabsTrigger.displayName = "TabsTrigger";

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value: tabValue, ...props }, ref) => {
    const { value } = React.useContext(TabsContext);
    if (value !== tabValue) return null;

    return (
      <div
        ref={ref}
        data-slot="tabs-content"
        role="tabpanel"
        className={cn("flex-1 text-sm outline-none", className)}
        {...props}
      />
    );
  }
);
TabsContent.displayName = "TabsContent";

// --- merged from utils.ts ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export { Tabs }

export { TabsList, TabsTrigger, TabsContent }
