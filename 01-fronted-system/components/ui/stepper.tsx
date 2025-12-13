"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Step {
  id: string | number
  label: string
  description?: string
  icon?: React.ReactNode
}

interface StepperProps {
  steps: Step[]
  currentStep: number
  orientation?: "horizontal" | "vertical"
  variant?: "circles" | "numbers"
  size?: "sm" | "md" | "lg"
  className?: string
  onStepClick?: (stepIndex: number) => void
  clickableSteps?: boolean
}

const sizeClasses = {
  sm: {
    circle: "h-8 w-8",
    text: "text-xs",
    label: "text-xs",
    description: "text-xs",
    connector: "h-0.5",
  },
  md: {
    circle: "h-10 w-10",
    text: "text-sm",
    label: "text-sm",
    description: "text-xs",
    connector: "h-0.5",
  },
  lg: {
    circle: "h-12 w-12",
    text: "text-base",
    label: "text-base",
    description: "text-sm",
    connector: "h-1",
  },
}

export function Stepper({
  steps,
  currentStep,
  orientation = "horizontal",
  variant = "circles",
  size = "md",
  className,
  onStepClick,
  clickableSteps = false,
}: StepperProps) {
  const sizes = sizeClasses[size]

  const getStepStatus = (index: number): "completed" | "current" | "upcoming" => {
    if (index < currentStep) return "completed"
    if (index === currentStep) return "current"
    return "upcoming"
  }

  const handleStepClick = (index: number) => {
    if (clickableSteps && onStepClick && index <= currentStep) {
      onStepClick(index)
    }
  }

  return (
    <div
      className={cn(
        "w-full",
        orientation === "horizontal" ? "flex items-center" : "flex flex-col",
        className
      )}
      role="navigation"
      aria-label="Progress steps"
    >
      {steps.map((step, index) => {
        const status = getStepStatus(index)
        const isCompleted = status === "completed"
        const isCurrent = status === "current"
        const isUpcoming = status === "upcoming"
        const isLast = index === steps.length - 1
        const isClickable = clickableSteps && index <= currentStep

        return (
          <React.Fragment key={step.id}>
            <div
              className={cn(
                "flex items-center",
                orientation === "vertical" ? "w-full" : "flex-col",
                isClickable && "cursor-pointer"
              )}
              onClick={() => handleStepClick(index)}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={(e) => {
                if (isClickable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault()
                  handleStepClick(index)
                }
              }}
              aria-label={`${step.label}${isCurrent ? " (current step)" : ""}${isCompleted ? " (completed)" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {/* Step indicator circle/number */}
              <div
                className={cn(
                  "relative flex items-center justify-center rounded-full border-2 font-semibold transition-all duration-300",
                  sizes.circle,
                  sizes.text,
                  isCompleted &&
                    "border-[#007A78] bg-[#007A78] text-white shadow-md",
                  isCurrent &&
                    "border-[#007A78] bg-white text-[#007A78] ring-4 ring-[#007A78]/20 shadow-lg scale-110",
                  isUpcoming &&
                    "border-gray-300 bg-white text-gray-400",
                  isClickable && "hover:scale-105 hover:shadow-md"
                )}
              >
                {isCompleted ? (
                  <Check
                    className={cn(
                      "transition-transform duration-300",
                      size === "sm" && "h-4 w-4",
                      size === "md" && "h-5 w-5",
                      size === "lg" && "h-6 w-6"
                    )}
                    aria-hidden="true"
                  />
                ) : step.icon ? (
                  <span aria-hidden="true">{step.icon}</span>
                ) : (
                  <span aria-hidden="true">{index + 1}</span>
                )}
              </div>

              {/* Step label and description */}
              <div
                className={cn(
                  "transition-all duration-300",
                  orientation === "horizontal"
                    ? "mt-2 text-center"
                    : "ml-3 flex-1"
                )}
              >
                <div
                  className={cn(
                    "font-medium transition-colors duration-300",
                    sizes.label,
                    isCompleted && "text-[#007A78]",
                    isCurrent && "text-[#007A78] font-semibold",
                    isUpcoming && "text-gray-400"
                  )}
                >
                  {step.label}
                </div>
                {step.description && (
                  <div
                    className={cn(
                      "mt-0.5 transition-colors duration-300",
                      sizes.description,
                      isCompleted && "text-gray-600",
                      isCurrent && "text-gray-700",
                      isUpcoming && "text-gray-400"
                    )}
                  >
                    {step.description}
                  </div>
                )}
              </div>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className={cn(
                  "transition-all duration-500",
                  orientation === "horizontal"
                    ? cn("flex-1 mx-3", sizes.connector)
                    : cn("w-0.5 ml-5 my-2", "min-h-[2rem]"),
                  index < currentStep
                    ? "bg-[#007A78]"
                    : "bg-gray-300"
                )}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// Simplified version for small spaces
export function StepperCompact({
  steps,
  currentStep,
  className,
}: {
  steps: Step[]
  currentStep: number
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2", className)} role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={steps.length}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep

        return (
          <React.Fragment key={step.id}>
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                isCurrent && "flex-[2]",
                !isCurrent && "flex-1",
                isCompleted && "bg-[#007A78]",
                isCurrent && "bg-[#007A78]",
                index > currentStep && "bg-gray-300"
              )}
              aria-label={`${step.label}${isCurrent ? " (current)" : ""}${isCompleted ? " (completed)" : ""}`}
            />
          </React.Fragment>
        )
      })}
    </div>
  )
}

// Dots variant for very compact spaces
export function StepperDots({
  steps,
  currentStep,
  className,
}: {
  steps: Step[]
  currentStep: number
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2", className)} role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={steps.length}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep

        return (
          <div
            key={step.id}
            className={cn(
              "h-2 w-2 rounded-full transition-all duration-300",
              isCompleted && "bg-[#007A78] scale-100",
              isCurrent && "bg-[#007A78] scale-150 ring-2 ring-[#007A78]/30",
              index > currentStep && "bg-gray-300 scale-75"
            )}
            aria-label={`${step.label}${isCurrent ? " (current)" : ""}${isCompleted ? " (completed)" : ""}`}
          />
        )
      })}
    </div>
  )
}
