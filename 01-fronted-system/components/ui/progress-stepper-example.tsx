"use client"

/**
 * Progress and Stepper Components Example
 *
 * This file demonstrates the usage of both Progress and Stepper components
 * with the Mint brand color (#90FCA6). Use this as a reference for implementing
 * multi-step forms and progress indicators throughout the application.
 *
 * To use this example:
 * 1. Import into any page: import { ProgressStepperExample } from "@/components/ui/progress-stepper-example"
 * 2. Use: <ProgressStepperExample />
 */

import { useState } from "react"
import { User, CreditCard, CheckCircle, ArrowLeft, ArrowRight } from "lucide-react"
import { Stepper, StepperCompact, StepperDots } from "./stepper"
import { Progress } from "./progress"
import { Button } from "./button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card"

export function ProgressStepperExample() {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    {
      id: "account",
      label: "Create Account",
      description: "Sign up with email and password",
      icon: <User className="h-5 w-5" />,
    },
    {
      id: "billing",
      label: "Select Plan",
      description: "Choose your subscription tier",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      id: "complete",
      label: "Get Started",
      description: "You're all set to go!",
      icon: <CheckCircle className="h-5 w-5" />,
    },
  ]

  const progressValue = ((currentStep + 1) / steps.length) * 100

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Progress & Stepper Components</h1>
          <p className="text-gray-600">Brand-compliant UI components with Mint (#90FCA6)</p>
        </div>

        {/* Main Content Card */}
        <Card className="border-2 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">Interactive Demo</CardTitle>
            <CardDescription>
              Try navigating through the steps to see the components in action
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Section 1: Full Stepper (Desktop) */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Full Stepper (Horizontal)</h3>
              <p className="text-sm text-gray-600 mb-4">
                Best for desktop views with ample space. Shows icons, labels, and descriptions.
              </p>
              <div className="hidden md:block">
                <Stepper
                  steps={steps}
                  currentStep={currentStep}
                  clickableSteps
                  onStepClick={setCurrentStep}
                  size="md"
                />
              </div>
              <div className="md:hidden text-sm text-gray-500 italic text-center py-4">
                View on desktop to see the full stepper
              </div>
            </div>

            {/* Section 2: Vertical Stepper */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold text-gray-900">Vertical Stepper</h3>
              <p className="text-sm text-gray-600 mb-4">
                Ideal for sidebar navigation or narrow layouts.
              </p>
              <div className="max-w-sm">
                <Stepper
                  steps={steps}
                  currentStep={currentStep}
                  orientation="vertical"
                  clickableSteps
                  onStepClick={setCurrentStep}
                  size="sm"
                />
              </div>
            </div>

            {/* Section 3: Compact Stepper */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold text-gray-900">Compact Stepper</h3>
              <p className="text-sm text-gray-600 mb-4">
                Perfect for tablet and mobile views with limited vertical space.
              </p>
              <StepperCompact steps={steps} currentStep={currentStep} />
              <p className="text-sm text-gray-700 text-center font-medium">
                Step {currentStep + 1} of {steps.length}: {steps[currentStep].label}
              </p>
            </div>

            {/* Section 4: Dots Stepper */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold text-gray-900">Dots Stepper</h3>
              <p className="text-sm text-gray-600 mb-4">
                Minimal indicator for very compact spaces like modals or cards.
              </p>
              <div className="flex flex-col items-center gap-3">
                <StepperDots steps={steps} currentStep={currentStep} />
                <p className="text-xs text-gray-600">{steps[currentStep].label}</p>
              </div>
            </div>

            {/* Section 5: Progress Bar */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold text-gray-900">Progress Bar</h3>
              <p className="text-sm text-gray-600 mb-4">
                Shows completion percentage with smooth Teal fill.
              </p>

              {/* Different sizes */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 mb-2">Small (h-1)</p>
                  <Progress value={progressValue} size="sm" showLabel />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Medium (h-2) - Default</p>
                  <Progress value={progressValue} size="md" showLabel />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Large (h-3)</p>
                  <Progress value={progressValue} size="lg" showLabel />
                </div>
              </div>

              {/* Coral variant */}
              <div className="mt-6">
                <p className="text-xs text-gray-500 mb-2">Coral Variant</p>
                <Progress value={progressValue} variant="coral" showLabel />
              </div>
            </div>

            {/* Current Step Content */}
            <div className="pt-4 border-t">
              <div className="bg-[#F0FDFA] border border-[#90FCA6]/20 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#90FCA6] text-white">
                    {steps[currentStep].icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-[#90FCA6]">
                      {steps[currentStep].label}
                    </h3>
                    <p className="text-sm text-gray-700 mt-1">
                      {steps[currentStep].description}
                    </p>
                    <div className="mt-4 p-4 bg-white rounded border border-[#90FCA6]/10">
                      <p className="text-sm text-gray-600">
                        This is where your step content would go. Forms, information, or
                        interactive elements would be displayed here.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              <Button
                onClick={handleNext}
                disabled={currentStep === steps.length - 1}
                className="flex items-center gap-2 bg-[#90FCA6] hover:bg-[#6EE890] text-black"
              >
                {currentStep === steps.length - 1 ? "Finish" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Component Code Examples */}
        <Card className="border shadow-lg">
          <CardHeader>
            <CardTitle>Usage Examples</CardTitle>
            <CardDescription>Copy these snippets to use in your components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Progress Example */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Progress Bar</h4>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
{`import { Progress } from "@/components/ui/progress"

<Progress value={60} />
<Progress value={75} showLabel />
<Progress value={50} variant="coral" size="lg" />`}
              </pre>
            </div>

            {/* Stepper Example */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Stepper</h4>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
{`import { Stepper } from "@/components/ui/stepper"

const steps = [
  { id: 1, label: "Account", description: "Create account" },
  { id: 2, label: "Billing", description: "Choose plan" },
  { id: 3, label: "Setup", description: "Configure" },
]

<Stepper steps={steps} currentStep={1} />
<Stepper steps={steps} currentStep={1} orientation="vertical" />
<StepperCompact steps={steps} currentStep={1} />
<StepperDots steps={steps} currentStep={1} />`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Design Specs */}
        <Card className="border shadow-lg">
          <CardHeader>
            <CardTitle>Design Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-900">Colors</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-[#90FCA6] border" />
                    <span className="text-gray-700">Teal: #90FCA6 (Primary)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-[#FF6E50] border" />
                    <span className="text-gray-700">Coral: #FF6E50 (Accent)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-gray-300 border" />
                    <span className="text-gray-700">Gray: Upcoming steps</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-900">Features</h4>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#90FCA6] shrink-0 mt-0.5" />
                    <span>Fully accessible (ARIA)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#90FCA6] shrink-0 mt-0.5" />
                    <span>Smooth animations (300ms)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#90FCA6] shrink-0 mt-0.5" />
                    <span>Keyboard navigation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#90FCA6] shrink-0 mt-0.5" />
                    <span>Responsive design</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#90FCA6] shrink-0 mt-0.5" />
                    <span>Multiple size variants</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
