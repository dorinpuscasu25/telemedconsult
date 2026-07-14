import React from 'react'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// --- merged from src/Avatar.tsx ---
interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "default" | "sm" | "lg";
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size = "default", ...props }, ref) => (
    <span
      ref={ref}
      data-slot="avatar"
      data-size={size}
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full select-none",
        size === "sm" ? "size-6" : size === "lg" ? "size-10" : "size-8",
        className
      )}
      {...props}
    />
  )
);
Avatar.displayName = "Avatar";

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, ...props }, ref) => (
    <img
      ref={ref}
      data-slot="avatar-image"
      className={cn("aspect-square size-full rounded-full object-cover", className)}
      {...props}
    />
  )
);
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="avatar-fallback"
      className={cn("flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground", className)}
      {...props}
    />
  )
);
AvatarFallback.displayName = "AvatarFallback";

const AvatarBadge = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="avatar-badge"
      className={cn("absolute right-0 bottom-0 z-10 inline-flex size-2.5 items-center justify-center rounded-full bg-primary ring-2 ring-background", className)}
      {...props}
    />
  )
);
AvatarBadge.displayName = "AvatarBadge";

const AvatarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="avatar-group"
      className={cn("flex -space-x-2 [&>[data-slot=avatar]]:ring-2 [&>[data-slot=avatar]]:ring-background", className)}
      {...props}
    />
  )
);
AvatarGroup.displayName = "AvatarGroup";

const AvatarGroupCount = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="avatar-group-count"
      className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background", className)}
      {...props}
    />
  )
);
AvatarGroupCount.displayName = "AvatarGroupCount";

// --- merged from utils.ts ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export { Avatar }

export { AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge }
