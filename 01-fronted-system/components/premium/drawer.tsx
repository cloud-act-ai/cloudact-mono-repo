"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, ChevronLeft, LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================================================
// Premium Drawer Context
// ============================================================================

interface PremiumDrawerContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const PremiumDrawerContext = React.createContext<PremiumDrawerContextValue | null>(null)

function usePremiumDrawer() {
  const context = React.useContext(PremiumDrawerContext)
  if (!context) {
    throw new Error("usePremiumDrawer must be used within a PremiumDrawer")
  }
  return context
}

// ============================================================================
// Premium Drawer Root
// ============================================================================

interface PremiumDrawerProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function PremiumDrawer({ children, open: controlledOpen, onOpenChange }: PremiumDrawerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  return (
    <PremiumDrawerContext.Provider value={{ open, setOpen }}>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        {children}
      </DialogPrimitive.Root>
    </PremiumDrawerContext.Provider>
  )
}

// ============================================================================
// Premium Drawer Trigger
// ============================================================================

const PremiumDrawerTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Trigger
    ref={ref}
    className={cn(className)}
    {...props}
  />
))
PremiumDrawerTrigger.displayName = "PremiumDrawerTrigger"

// ============================================================================
// Premium Drawer Close
// ============================================================================

const PremiumDrawerClose = DialogPrimitive.Close

// ============================================================================
// Premium Drawer Content
// ============================================================================

interface PremiumDrawerContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "right" | "left"
  size?: "sm" | "md" | "lg" | "xl" | "half"
}

const PremiumDrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  PremiumDrawerContentProps
>(({ className, children, side = "right", size = "half", ...props }, ref) => {
  const sizeClasses = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-2xl",
    half: "sm:max-w-[50vw] lg:max-w-[45vw]",
  }

  const slideClasses = side === "right"
    ? "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0"
    : "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0"

  return (
    <DialogPrimitive.Portal>
      {/* Backdrop with blur */}
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50",
          "bg-[var(--text-primary)]/20 backdrop-blur-[3px]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "duration-300"
        )}
      />

      {/* Drawer Panel */}
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Base positioning
          "fixed z-50 h-full w-full flex flex-col",
          sizeClasses[size],
          slideClasses,

          // Premium background with glassmorphism
          "bg-white/[0.98] backdrop-blur-xl",
          "border-l border-[var(--border-subtle)]/80",

          // Premium shadow
          "shadow-[-20px_0_60px_-15px_rgba(0,0,0,0.1)]",

          // Animation
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:duration-300 data-[state=closed]:duration-200",
          "ease-out",

          className
        )}
        {...props}
      >
        {/* Top gradient accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[var(--cloudact-mint)] via-[var(--cloudact-mint-light)] to-transparent" />

        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})
PremiumDrawerContent.displayName = "PremiumDrawerContent"

// ============================================================================
// Premium Drawer Header
// ============================================================================

interface PremiumDrawerHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon
  iconColor?: string
  showBackButton?: boolean
  onBack?: () => void
}

function PremiumDrawerHeader({
  className,
  children,
  icon: Icon,
  iconColor = "var(--cloudact-mint)",
  showBackButton = false,
  onBack,
  ...props
}: PremiumDrawerHeaderProps) {
  return (
    <div
      className={cn(
        "relative flex-shrink-0 px-6 pt-6 pb-4",
        "border-b border-[var(--border-subtle)]",
        "bg-gradient-to-b from-white to-[var(--surface-secondary)]/50",
        className
      )}
      {...props}
    >
      {/* Close button */}
      <DialogPrimitive.Close
        className={cn(
          "absolute top-4 right-4 z-10",
          "h-9 w-9 rounded-xl",
          "flex items-center justify-center",
          "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
          "bg-[var(--surface-secondary)] hover:bg-[var(--surface-secondary)]",
          "border border-[var(--border-subtle)]/50",
          "transition-all duration-200",
          "hover:shadow-sm hover:scale-105",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cloudact-mint)] focus-visible:ring-offset-2"
        )}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>

      {/* Header content */}
      <div className="flex items-start gap-4 pr-12">
        {showBackButton && (
          <button
            onClick={onBack}
            className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
              "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              "bg-white hover:bg-[var(--surface-secondary)]",
              "border border-[var(--border-subtle)]",
              "transition-all duration-200 hover:shadow-sm"
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {Icon && (
          <div
            className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0",
              "shadow-sm"
            )}
            style={{ backgroundColor: `${iconColor}15` }}
          >
            <Icon className="h-6 w-6" style={{ color: iconColor }} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Premium Drawer Title
// ============================================================================

const PremiumDrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-[18px] sm:text-[20px] font-bold text-[var(--text-primary)] tracking-tight leading-tight",
      className
    )}
    {...props}
  />
))
PremiumDrawerTitle.displayName = "PremiumDrawerTitle"

// ============================================================================
// Premium Drawer Description
// ============================================================================

const PremiumDrawerDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(
      "text-[12px] sm:text-[13px] text-[var(--text-tertiary)] mt-1.5 leading-relaxed",
      className
    )}
    {...props}
  />
))
PremiumDrawerDescription.displayName = "PremiumDrawerDescription"

// ============================================================================
// Premium Drawer Body
// ============================================================================

type PremiumDrawerBodyProps = React.HTMLAttributes<HTMLDivElement>

function PremiumDrawerBody({ className, children, ...props }: PremiumDrawerBodyProps) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto",
        "px-6 py-5",
        "scrollbar-thin scrollbar-thumb-[var(--border-subtle)] scrollbar-track-transparent",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// ============================================================================
// Premium Drawer Footer
// ============================================================================

type PremiumDrawerFooterProps = React.HTMLAttributes<HTMLDivElement>

function PremiumDrawerFooter({ className, children, ...props }: PremiumDrawerFooterProps) {
  return (
    <div
      className={cn(
        "flex-shrink-0 px-6 py-4",
        "border-t border-[var(--border-subtle)]",
        "bg-gradient-to-t from-[var(--surface-secondary)]/80 to-white",
        "flex items-center justify-end gap-3",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// ============================================================================
// Premium Drawer Section
// ============================================================================

interface PremiumDrawerSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
}

function PremiumDrawerSection({
  className,
  title,
  description,
  children,
  ...props
}: PremiumDrawerSectionProps) {
  return (
    <div className={cn("space-y-3", className)} {...props}>
      {(title || description) && (
        <div className="space-y-0.5">
          {title && (
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
          )}
          {description && (
            <p className="text-[11px] text-[var(--text-tertiary)]">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

// ============================================================================
// Premium Form Field
// ============================================================================

interface PremiumFormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  required?: boolean
  error?: string
  hint?: string
}

function PremiumFormField({
  className,
  label,
  required = false,
  error,
  hint,
  children,
  ...props
}: PremiumFormFieldProps) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      <label className="flex items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)]">
        {label}
        {required && <span className="text-[var(--cloudact-coral)]">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[11px] text-[var(--text-tertiary)]">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-[var(--cloudact-coral)] font-medium">{error}</p>
      )}
    </div>
  )
}

// ============================================================================
// Premium Input
// ============================================================================

interface PremiumInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

const PremiumInput = React.forwardRef<HTMLInputElement, PremiumInputProps>(
  ({ className, hasError, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full h-11 sm:h-12 px-4 text-[13px] rounded-xl",
        "bg-white border border-[var(--border-subtle)]",
        "placeholder:text-[var(--text-muted)] text-[var(--text-primary)]",
        "transition-all duration-200",
        "hover:border-[var(--border-medium)]",
        "focus:outline-none focus:ring-2 focus:ring-[var(--cloudact-mint)]/40 focus:border-[var(--cloudact-mint)]",
        "focus:shadow-[0_0_20px_rgba(144,252,166,0.15)]",
        hasError && "border-[var(--cloudact-coral)] focus:ring-[var(--cloudact-coral)]/40 focus:border-[var(--cloudact-coral)]",
        className
      )}
      {...props}
    />
  )
)
PremiumInput.displayName = "PremiumInput"

// ============================================================================
// Premium Textarea
// ============================================================================

interface PremiumTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean
}

const PremiumTextarea = React.forwardRef<HTMLTextAreaElement, PremiumTextareaProps>(
  ({ className, hasError, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full min-h-[100px] px-4 py-3 text-[13px] rounded-xl resize-none",
        "bg-white border border-[var(--border-subtle)]",
        "placeholder:text-[var(--text-muted)] text-[var(--text-primary)]",
        "transition-all duration-200",
        "hover:border-[var(--border-medium)]",
        "focus:outline-none focus:ring-2 focus:ring-[var(--cloudact-mint)]/40 focus:border-[var(--cloudact-mint)]",
        "focus:shadow-[0_0_20px_rgba(144,252,166,0.15)]",
        hasError && "border-[var(--cloudact-coral)] focus:ring-[var(--cloudact-coral)]/40 focus:border-[var(--cloudact-coral)]",
        className
      )}
      {...props}
    />
  )
)
PremiumTextarea.displayName = "PremiumTextarea"

// ============================================================================
// Premium Select
// ============================================================================

interface PremiumSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean
}

const PremiumSelect = React.forwardRef<HTMLSelectElement, PremiumSelectProps>(
  ({ className, hasError, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full h-11 sm:h-12 px-4 text-[13px] rounded-xl appearance-none cursor-pointer",
        "bg-white border border-[var(--border-subtle)]",
        "text-[var(--text-primary)]",
        "transition-all duration-200",
        "hover:border-[var(--border-medium)]",
        "focus:outline-none focus:ring-2 focus:ring-[var(--cloudact-mint)]/40 focus:border-[var(--cloudact-mint)]",
        "focus:shadow-[0_0_20px_rgba(144,252,166,0.15)]",
        "bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M6%208l4%204%204-4%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center]",
        hasError && "border-[var(--cloudact-coral)] focus:ring-[var(--cloudact-coral)]/40 focus:border-[var(--cloudact-coral)]",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
PremiumSelect.displayName = "PremiumSelect"

// ============================================================================
// Premium Button (for drawer actions)
// ============================================================================

interface PremiumButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md" | "lg"
  loading?: boolean
}

const PremiumButton = React.forwardRef<HTMLButtonElement, PremiumButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: cn(
        "bg-gradient-to-r from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)]",
        "text-[var(--text-primary)] font-semibold",
        "hover:shadow-[0_4px_20px_rgba(144,252,166,0.35)] hover:scale-[1.02]",
        "active:scale-[0.98]",
        "disabled:from-[var(--surface-secondary)] disabled:to-[var(--surface-secondary)] disabled:text-[var(--text-muted)] disabled:shadow-none disabled:scale-100"
      ),
      secondary: cn(
        "bg-white border border-[var(--border-subtle)]",
        "text-[var(--text-secondary)] font-medium",
        "hover:bg-[var(--surface-secondary)] hover:border-[var(--border-medium)]",
        "active:scale-[0.98]",
        "disabled:bg-[var(--surface-secondary)] disabled:text-[var(--text-muted)]"
      ),
      ghost: cn(
        "bg-transparent",
        "text-[var(--text-secondary)] font-medium",
        "hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]",
        "active:scale-[0.98]"
      ),
      danger: cn(
        "bg-[var(--cloudact-coral)]",
        "text-white font-semibold",
        "hover:bg-[#e55a4d] hover:shadow-[0_4px_20px_rgba(255,108,94,0.3)]",
        "active:scale-[0.98]",
        "disabled:bg-[var(--cloudact-coral)]/50 disabled:shadow-none disabled:scale-100"
      ),
    }

    const sizes = {
      sm: "h-9 px-4 text-[12px] rounded-lg",
      md: "h-11 px-5 text-[13px] rounded-xl",
      lg: "h-12 px-6 text-[14px] rounded-xl",
    }

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "transition-all duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          variant === "primary" && "focus-visible:ring-[var(--cloudact-mint)]",
          variant === "danger" && "focus-visible:ring-[var(--cloudact-coral)]",
          (variant === "secondary" || variant === "ghost") && "focus-visible:ring-[var(--text-muted)]",
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        )}
        {children}
      </button>
    )
  }
)
PremiumButton.displayName = "PremiumButton"

// ============================================================================
// Exports
// ============================================================================

export {
  PremiumDrawer,
  PremiumDrawerTrigger,
  PremiumDrawerClose,
  PremiumDrawerContent,
  PremiumDrawerHeader,
  PremiumDrawerTitle,
  PremiumDrawerDescription,
  PremiumDrawerBody,
  PremiumDrawerFooter,
  PremiumDrawerSection,
  PremiumFormField,
  PremiumInput,
  PremiumTextarea,
  PremiumSelect,
  PremiumButton,
  usePremiumDrawer,
}
