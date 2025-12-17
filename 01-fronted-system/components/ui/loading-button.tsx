import * as React from 'react'
import { Button, buttonVariants } from './button'
import { Spinner } from './spinner'
import { cn } from '@/lib/utils'
import { VariantProps } from 'class-variance-authority'

interface LoadingButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
  loadingText?: string
  spinnerVariant?: 'teal' | 'coral' | 'default'
  asChild?: boolean
}

const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  (
    {
      children,
      isLoading = false,
      loadingText,
      disabled,
      spinnerVariant = 'default',
      className,
      ...props
    },
    ref
  ) => {
    return (
      <Button
        ref={ref}
        disabled={isLoading || disabled}
        className={cn(className)}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading && (
          <Spinner
            size="sm"
            variant={spinnerVariant}
            className="mr-2"
          />
        )}
        {isLoading && loadingText ? loadingText : children}
      </Button>
    )
  }
)

LoadingButton.displayName = 'LoadingButton'

export { LoadingButton }
