import * as React from 'react'
import { Button, ButtonProps } from './button'
import { Spinner } from './spinner'
import { cn } from '@/lib/utils'

interface LoadingButtonProps extends ButtonProps {
  isLoading?: boolean
  loadingText?: string
  spinnerVariant?: 'teal' | 'coral' | 'default'
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
