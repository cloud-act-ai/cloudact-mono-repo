# Progress and Stepper Components

Brand-compliant progress bars and step indicators using Teal (#007A78) as the primary color.

## Progress Component

A smooth, accessible progress bar with Teal fill color.

### Features
- ✅ Teal brand color (#007A78) for progress fill
- ✅ Gray background for incomplete portion
- ✅ Smooth animations (300ms duration)
- ✅ Fully accessible (ARIA attributes)
- ✅ Multiple size variants (sm, md, lg)
- ✅ Optional percentage label
- ✅ Support for Coral variant

### Usage

```tsx
import { Progress } from "@/components/ui/progress"

// Basic usage (Teal by default)
<Progress value={60} />

// With label
<Progress value={75} showLabel />

// Different sizes
<Progress value={40} size="sm" />
<Progress value={60} size="md" />  // default
<Progress value={80} size="lg" />

// Coral variant
<Progress value={50} variant="coral" />

// Custom max value
<Progress value={30} max={50} />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | `0` | Current progress value |
| `max` | `number` | `100` | Maximum value |
| `variant` | `'teal' \| 'coral' \| 'default'` | `'teal'` | Color variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size of progress bar |
| `showLabel` | `boolean` | `false` | Show percentage label |
| `className` | `string` | - | Additional CSS classes |

---

## Stepper Component

Multi-step indicator with completed, current, and upcoming states.

### Features
- ✅ Completed steps: Teal (#007A78) with check icon
- ✅ Current step: Teal ring with scale animation
- ✅ Upcoming steps: Gray (#8E8E93)
- ✅ Smooth transitions and animations
- ✅ Fully accessible (ARIA attributes, keyboard navigation)
- ✅ Horizontal and vertical orientations
- ✅ Optional click navigation
- ✅ Multiple size variants
- ✅ Responsive design

### Variants

#### 1. Full Stepper (default)
Shows circles/numbers with labels and descriptions.

```tsx
import { Stepper } from "@/components/ui/stepper"

const steps = [
  { id: 1, label: "Account", description: "Create your account" },
  { id: 2, label: "Billing", description: "Choose a plan" },
  { id: 3, label: "Setup", description: "Configure settings" },
]

// Basic usage
<Stepper steps={steps} currentStep={1} />

// Vertical orientation
<Stepper steps={steps} currentStep={1} orientation="vertical" />

// Different sizes
<Stepper steps={steps} currentStep={1} size="sm" />
<Stepper steps={steps} currentStep={1} size="lg" />

// Clickable steps (allows navigation to completed steps)
<Stepper
  steps={steps}
  currentStep={2}
  clickableSteps
  onStepClick={(index) => console.log("Navigate to step", index)}
/>

// With custom icons
const stepsWithIcons = [
  { id: 1, label: "Account", icon: <User className="h-5 w-5" /> },
  { id: 2, label: "Billing", icon: <CreditCard className="h-5 w-5" /> },
  { id: 3, label: "Setup", icon: <Settings className="h-5 w-5" /> },
]
<Stepper steps={stepsWithIcons} currentStep={0} />
```

#### 2. Compact Stepper
Horizontal bars for limited space.

```tsx
import { StepperCompact } from "@/components/ui/stepper"

<StepperCompact steps={steps} currentStep={1} />
```

#### 3. Dots Stepper
Minimal dots indicator for very compact spaces.

```tsx
import { StepperDots } from "@/components/ui/stepper"

<StepperDots steps={steps} currentStep={1} />
```

### Props - Stepper

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `steps` | `Step[]` | **required** | Array of step objects |
| `currentStep` | `number` | **required** | Current step index (0-based) |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Layout direction |
| `variant` | `'circles' \| 'numbers'` | `'circles'` | Display style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant |
| `clickableSteps` | `boolean` | `false` | Allow clicking on steps |
| `onStepClick` | `(index: number) => void` | - | Click handler |
| `className` | `string` | - | Additional CSS classes |

### Step Object

```tsx
interface Step {
  id: string | number        // Unique identifier
  label: string              // Step name
  description?: string       // Optional description
  icon?: React.ReactNode     // Optional custom icon
}
```

---

## Complete Example - Onboarding Flow

```tsx
"use client"

import { useState } from "react"
import { Stepper, StepperCompact } from "@/components/ui/stepper"
import { Progress } from "@/components/ui/progress"
import { User, CreditCard, CheckCircle } from "lucide-react"

export default function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    {
      id: "account",
      label: "Create Account",
      description: "Sign up with email",
      icon: <User className="h-5 w-5" />
    },
    {
      id: "billing",
      label: "Select Plan",
      description: "Choose your subscription",
      icon: <CreditCard className="h-5 w-5" />
    },
    {
      id: "complete",
      label: "Get Started",
      description: "You're all set!",
      icon: <CheckCircle className="h-5 w-5" />
    },
  ]

  const progressValue = ((currentStep + 1) / steps.length) * 100

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      {/* Desktop - Full stepper */}
      <div className="hidden md:block">
        <Stepper
          steps={steps}
          currentStep={currentStep}
          clickableSteps
          onStepClick={setCurrentStep}
        />
      </div>

      {/* Mobile - Compact stepper */}
      <div className="md:hidden space-y-2">
        <StepperCompact steps={steps} currentStep={currentStep} />
        <p className="text-sm text-gray-600 text-center">
          Step {currentStep + 1} of {steps.length}: {steps[currentStep].label}
        </p>
      </div>

      {/* Progress bar */}
      <Progress value={progressValue} showLabel />

      {/* Content area */}
      <div className="border rounded-lg p-8 min-h-[400px]">
        <h2 className="text-2xl font-bold mb-4">{steps[currentStep].label}</h2>
        <p className="text-gray-600">{steps[currentStep].description}</p>

        {/* Your form content here */}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="px-4 py-2 border rounded-md disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
          disabled={currentStep === steps.length - 1}
          className="px-4 py-2 bg-[#007A78] text-white rounded-md disabled:opacity-50"
        >
          {currentStep === steps.length - 1 ? "Finish" : "Continue"}
        </button>
      </div>
    </div>
  )
}
```

---

## Design Specifications

### Colors

| State | Color | Hex Code |
|-------|-------|----------|
| Progress Fill | Teal | `#007A78` |
| Completed Step | Teal | `#007A78` |
| Current Step | Teal (with ring) | `#007A78` |
| Current Step Ring | Teal (20% opacity) | `#007A78` with 20% alpha |
| Upcoming Step | Gray | `#8E8E93` or `gray-400` |
| Background | Light Gray | `gray-200` or `muted` |

### Animations

- **Duration**: 300ms (progress), 300-500ms (stepper)
- **Easing**: `ease-in-out`
- **Transitions**: width, transform, scale, colors
- **Current Step Scale**: 110% (1.1x)
- **Hover Scale**: 105% (1.05x) for clickable steps

### Accessibility

Both components include:
- ✅ ARIA attributes (`role`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`, `aria-current`)
- ✅ Keyboard navigation (Enter/Space for clickable steps)
- ✅ Focus indicators (ring for current step)
- ✅ Semantic HTML
- ✅ Screen reader friendly labels

---

## Responsive Behavior

### Stepper Recommendations

- **Desktop (≥768px)**: Use full `Stepper` with horizontal orientation
- **Tablet (640px-768px)**: Use `StepperCompact` with labels
- **Mobile (<640px)**: Use `StepperDots` or `StepperCompact`

### Example Responsive Implementation

```tsx
<div className="space-y-4">
  {/* Desktop */}
  <div className="hidden lg:block">
    <Stepper steps={steps} currentStep={currentStep} />
  </div>

  {/* Tablet */}
  <div className="hidden md:block lg:hidden">
    <StepperCompact steps={steps} currentStep={currentStep} />
  </div>

  {/* Mobile */}
  <div className="md:hidden">
    <StepperDots steps={steps} currentStep={currentStep} />
    <p className="text-sm text-center mt-2">
      {steps[currentStep].label}
    </p>
  </div>
</div>
```

---

## Common Use Cases

### 1. Signup Flow
Account Creation → Plan Selection → Payment → Success

### 2. Multi-Step Form
Personal Info → Company Details → Preferences → Review

### 3. Onboarding Wizard
Welcome → Setup → Configuration → Complete

### 4. Checkout Process
Cart → Shipping → Payment → Confirmation

### 5. Progress Tracking
File upload, data processing, or any task with measurable progress

---

**Last Updated**: 2025-12-13
