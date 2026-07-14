import React, { forwardRef } from 'react'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// --- merged from src/Card.tsx ---
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'default' | 'sm'
}
const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, size = 'default', ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card"
      data-size={size}
      className={cn(
        'flex flex-col gap-5 overflow-hidden rounded-2xl border border-slate-200 bg-white py-5 text-sm text-card-foreground shadow-sm data-[size=sm]:gap-3 data-[size=sm]:rounded-xl data-[size=sm]:py-3',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'
const CardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-header"
    className={cn('grid auto-rows-min items-start gap-1.5 px-5 data-[size=sm]:px-4', className)}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'
const CardTitle = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-title"
    className={cn('text-lg leading-snug font-semibold text-slate-950', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'
const CardDescription = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-description"
    className={cn('text-sm leading-5 text-slate-500', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'
const CardAction = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-action"
    className={cn(
      'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
      className,
    )}
    {...props}
  />
))
CardAction.displayName = 'CardAction'
const CardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-content"
    className={cn('px-5', className)}
    {...props}
  />
))
CardContent.displayName = 'CardContent'
const CardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-footer"
    className={cn(
      'flex items-center rounded-b-xl border-t bg-muted/50 p-4',
      className,
    )}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

// --- merged from utils.ts ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export { Card }

export { CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
