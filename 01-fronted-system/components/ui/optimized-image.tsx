"use client"

import * as React from "react"
import Image, { type ImageProps } from "next/image"
import { cn } from "@/lib/utils"

export interface OptimizedImageProps extends Omit<ImageProps, "onLoadingComplete"> {
  /**
   * Image border radius - consistent with card design system
   * @default "12px"
   */
  borderRadius?: "none" | "sm" | "md" | "lg" | "xl" | "full"
  /**
   * Show loading placeholder with shimmer effect
   * @default true
   */
  showPlaceholder?: boolean
  /**
   * Fallback image URL if the main image fails to load
   */
  fallbackSrc?: string
  /**
   * Custom error component to display on image load failure
   */
  errorComponent?: React.ReactNode
  /**
   * Container className for wrapper div
   */
  containerClassName?: string
}

const borderRadiusMap = {
  none: "rounded-none",
  sm: "rounded-sm",   // 6px
  md: "rounded-md",   // 8px
  lg: "rounded-lg",   // 10px
  xl: "rounded-xl",   // 14px
  full: "rounded-full",
}

/**
 * OptimizedImage Component
 *
 * Wrapper around Next.js Image with:
 * - Consistent border radius (matches card design: 12px default)
 * - Loading placeholder with shimmer effect
 * - Error state handling with fallback
 * - Automatic lazy loading
 * - Responsive sizing
 * - Dark mode support
 * - Alt text enforcement
 *
 * Brand styling:
 * - Border: Light gray (#E2E8F0) or none
 * - Border radius: 12px (cards) or 16px (xl)
 * - Placeholder: Light gray shimmer effect
 *
 * @example
 * ```tsx
 * <OptimizedImage
 *   src="/logo.png"
 *   alt="Company logo"
 *   width={200}
 *   height={100}
 *   borderRadius="lg"
 * />
 * ```
 */
export function OptimizedImage({
  src,
  alt,
  borderRadius = "lg",
  showPlaceholder = true,
  fallbackSrc,
  errorComponent,
  containerClassName,
  className,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = React.useState(true)
  const [hasError, setHasError] = React.useState(false)
  const [imageSrc, setImageSrc] = React.useState(src)

  // Reset state when src changes
  React.useEffect(() => {
    setImageSrc(src)
    setHasError(false)
    setIsLoading(true)
  }, [src])

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setIsLoading(false)
    if (fallbackSrc && imageSrc !== fallbackSrc) {
      setImageSrc(fallbackSrc)
    } else {
      setHasError(true)
    }
  }

  const radiusClass = borderRadiusMap[borderRadius]

  // Error state
  if (hasError && errorComponent) {
    return <div className={cn("relative overflow-hidden", radiusClass, containerClassName)}>{errorComponent}</div>
  }

  if (hasError) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center bg-slate-100 dark:bg-slate-800",
          radiusClass,
          containerClassName
        )}
        style={{ width: props.width, height: props.height }}
      >
        <div className="text-center p-4">
          <svg
            className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Image failed to load</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("relative overflow-hidden", radiusClass, containerClassName)}>
      {/* Loading shimmer placeholder */}
      {isLoading && showPlaceholder && (
        <div
          className={cn(
            "absolute inset-0 bg-slate-100 dark:bg-slate-800",
            radiusClass
          )}
          aria-hidden="true"
        >
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800" />
        </div>
      )}

      {/* Actual image */}
      <Image
        src={imageSrc}
        alt={alt}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          radiusClass,
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
        {...props}
      />
    </div>
  )
}

/**
 * LogoImage Component
 *
 * Specialized image component for logos with:
 * - Fixed aspect ratio (16:9 or custom)
 * - Consistent sizing (sm: 32px, md: 48px, lg: 64px, xl: 96px)
 * - Object-fit contain to preserve logo aspect
 * - Light background for transparent logos
 *
 * @example
 * ```tsx
 * <LogoImage
 *   src="/providers/openai.svg"
 *   alt="OpenAI logo"
 *   size="md"
 * />
 * ```
 */
export interface LogoImageProps {
  src: string
  alt: string
  /**
   * Predefined logo sizes
   * sm: 32px, md: 48px, lg: 64px, xl: 96px
   * @default "md"
   */
  size?: "sm" | "md" | "lg" | "xl"
  /**
   * Custom width (overrides size prop)
   */
  width?: number
  /**
   * Custom height (overrides size prop)
   */
  height?: number
  /**
   * Border radius
   * @default "md"
   */
  borderRadius?: "none" | "sm" | "md" | "lg" | "xl" | "full"
  /**
   * Show background container
   * @default true
   */
  showBackground?: boolean
  /**
   * Background color (Tailwind classes)
   * @default "bg-slate-50 dark:bg-slate-900"
   */
  backgroundColor?: string
  className?: string
}

const logoSizeMap = {
  sm: { width: 32, height: 32 },
  md: { width: 48, height: 48 },
  lg: { width: 64, height: 64 },
  xl: { width: 96, height: 96 },
}

export function LogoImage({
  src,
  alt,
  size = "md",
  width,
  height,
  borderRadius = "md",
  showBackground = true,
  backgroundColor = "bg-slate-50 dark:bg-slate-900",
  className,
}: LogoImageProps) {
  const dimensions = width && height
    ? { width, height }
    : logoSizeMap[size]

  const radiusClass = borderRadiusMap[borderRadius]

  return (
    <div
      className={cn(
        "relative flex items-center justify-center shrink-0",
        showBackground && cn("p-2 border border-slate-200 dark:border-slate-700", backgroundColor),
        radiusClass,
        className
      )}
      style={{ width: dimensions.width + (showBackground ? 16 : 0), height: dimensions.height + (showBackground ? 16 : 0) }}
    >
      <OptimizedImage
        src={src}
        alt={alt}
        width={dimensions.width}
        height={dimensions.height}
        borderRadius={borderRadius}
        showPlaceholder={true}
        fallbackSrc="/placeholder-logo.svg"
        className="object-contain"
      />
    </div>
  )
}

/**
 * ProviderLogo Component
 *
 * Specialized component for provider logos (OpenAI, Anthropic, GCP, etc.)
 * with uniform sizing and branding.
 *
 * @example
 * ```tsx
 * <ProviderLogo provider="openai" />
 * <ProviderLogo provider="anthropic" size="lg" />
 * ```
 */
export interface ProviderLogoProps {
  provider: "openai" | "anthropic" | "gcp" | "gemini" | "deepseek" | "slack" | "github" | "custom"
  /**
   * Display name override (for custom providers)
   */
  name?: string
  /**
   * Logo size
   * @default "md"
   */
  size?: "sm" | "md" | "lg" | "xl"
  /**
   * Show provider name label
   * @default false
   */
  showLabel?: boolean
  className?: string
}

const providerConfig: Record<string, { name: string; logo: string; color: string }> = {
  openai: { name: "OpenAI", logo: "/providers/openai.svg", color: "#10A37F" },
  anthropic: { name: "Anthropic", logo: "/providers/anthropic.svg", color: "#D97757" },
  gcp: { name: "Google Cloud", logo: "/providers/gcp.svg", color: "#4285F4" },
  gemini: { name: "Gemini", logo: "/providers/gemini.svg", color: "#8E75FF" },
  deepseek: { name: "DeepSeek", logo: "/providers/deepseek.svg", color: "#1A73E8" },
  slack: { name: "Slack", logo: "/providers/slack.svg", color: "#4A154B" },
  github: { name: "GitHub", logo: "/providers/github.svg", color: "#181717" },
  custom: { name: "Custom", logo: "/placeholder-logo.svg", color: "#64748B" },
}

export function ProviderLogo({
  provider,
  name,
  size = "md",
  showLabel = false,
  className,
}: ProviderLogoProps) {
  const config = providerConfig[provider] || providerConfig.custom
  const displayName = name || config.name

  if (showLabel) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <LogoImage
          src={config.logo}
          alt={`${displayName} logo`}
          size={size}
          borderRadius="md"
          showBackground={true}
        />
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {displayName}
        </span>
      </div>
    )
  }

  return (
    <LogoImage
      src={config.logo}
      alt={`${displayName} logo`}
      size={size}
      borderRadius="md"
      showBackground={true}
      className={className}
    />
  )
}
