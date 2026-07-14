import React from "react";
import { cn } from "../utils";

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  size?: "sm" | "default";
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, size = "default", checked, defaultChecked, onCheckedChange, onChange, ...props }, ref) => {
    const [isChecked, setIsChecked] = React.useState(defaultChecked ?? false);
    const controlledChecked = checked !== undefined ? checked : isChecked;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = e.target.checked;
      if (checked === undefined) setIsChecked(newChecked);
      onChange?.(e);
      onCheckedChange?.(newChecked);
    };

    return (
      <label
        data-slot="switch"
        data-size={size}
        data-checked={controlledChecked || undefined}
        data-unchecked={!controlledChecked || undefined}
        className={cn(
          "peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all outline-none",
          size === "default" ? "h-[18.4px] w-[32px]" : "h-[14px] w-[24px]",
          controlledChecked ? "bg-primary" : "bg-input dark:bg-input/80",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
          className
        )}>
        
        <input
          ref={ref}
          type="checkbox"
          checked={controlledChecked}
          onChange={handleChange}
          className="sr-only"
          {...props} />
        
        <span
          data-slot="switch-thumb"
          className={cn(
            "pointer-events-none block rounded-full bg-background ring-0 transition-transform",
            size === "default" ? "size-4" : "size-3",
            controlledChecked ?
            "translate-x-[calc(100%-2px)]" :
            "translate-x-0"
          )} />
        
      </label>);

  }
);
Switch.displayName = "Switch";

export { Switch };