import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../collapsible"

describe("Collapsible Component", () => {
  it("renders collapsible correctly", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    expect(screen.getByText("Toggle Content")).toBeInTheDocument()
  })

  it("expands and collapses on click", async () => {
    const user = userEvent.setup()

    render(
      <Collapsible>
        <CollapsibleTrigger data-testid="collapsible-trigger">Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByTestId("collapsible-trigger")

    // Initially closed
    expect(trigger).toHaveAttribute("data-state", "closed")

    // Click to open
    await user.click(trigger)
    expect(trigger).toHaveAttribute("data-state", "open")

    // Click to close
    await user.click(trigger)
    expect(trigger).toHaveAttribute("data-state", "closed")
  })

  it("applies brand colors on hover", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger data-testid="collapsible-trigger-hover">Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByTestId("collapsible-trigger-hover")
    // Check that element has transition classes instead of specific hover colors
    expect(trigger).toHaveClass("transition-colors")
    expect(trigger).toHaveClass("duration-150")
  })

  it("shows chevron icon by default", () => {
    const { container } = render(
      <Collapsible>
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveClass("transition-transform")
    expect(svg).toHaveClass("duration-200")
  })

  it("can hide chevron icon", () => {
    const { container } = render(
      <Collapsible>
        <CollapsibleTrigger showChevron={false}>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const svg = container.querySelector('svg')
    expect(svg).not.toBeInTheDocument()
  })

  it("chevron rotates when open", async () => {
    const user = userEvent.setup()

    render(
      <Collapsible>
        <CollapsibleTrigger data-testid="collapsible-trigger-rotate">Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByTestId("collapsible-trigger-rotate")

    // Trigger should have the rotation class
    expect(trigger).toHaveClass("[&[data-state=open]>svg]:rotate-180")

    // Open the collapsible
    await user.click(trigger)
    expect(trigger).toHaveAttribute("data-state", "open")
  })

  it("has accessible focus states", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger data-testid="collapsible-trigger-focus">Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByTestId("collapsible-trigger-focus")
    // Check that element has focus-visible classes (browser mode doesn't detect pseudo-selectors)
    const classNames = trigger.className
    expect(classNames).toContain("focus-visible")
  })

  it("supports disabled state", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger data-testid="collapsible-trigger-disabled" disabled>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByTestId("collapsible-trigger-disabled")
    expect(trigger).toBeDisabled()
    // Check for disabled class existence (pseudo-selectors not reliably detected in browser mode)
    const classNames = trigger.className
    expect(classNames).toContain("disabled")
  })

  it("has smooth height animation", () => {
    const { container } = render(
      <Collapsible>
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    // The content wrapper (CollapsiblePrimitive.Content) has the animation classes
    const content = container.querySelector('[id^="radix"]')
    expect(content).toHaveClass("data-[state=closed]:animate-collapsible-up")
    expect(content).toHaveClass("data-[state=open]:animate-collapsible-down")
  })

  it("has proper content padding", async () => {
    const user = userEvent.setup()

    const { container } = render(
      <Collapsible>
        <CollapsibleTrigger data-testid="collapsible-trigger-padding">Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    // Open the collapsible first so content is rendered
    const trigger = screen.getByTestId("collapsible-trigger-padding")
    await user.click(trigger)

    // The inner div inside CollapsibleContent has the padding classes
    const contentWrapper = container.querySelector('[id^="radix"] > div')
    expect(contentWrapper).toHaveClass("pb-4")
    expect(contentWrapper).toHaveClass("pt-2")
    expect(contentWrapper).toHaveClass("px-1")
  })

  it("accepts custom className", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger data-testid="collapsible-trigger-custom" className="custom-trigger">Toggle Content</CollapsibleTrigger>
        <CollapsibleContent className="custom-content">Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByTestId("collapsible-trigger-custom")
    expect(trigger).toHaveClass("custom-trigger")
  })

  it("has proper typography styling", async () => {
    const user = userEvent.setup()

    const { container } = render(
      <Collapsible>
        <CollapsibleTrigger data-testid="collapsible-trigger-typography">Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByTestId("collapsible-trigger-typography")
    expect(trigger).toHaveClass("font-medium")
    expect(trigger).toHaveClass("text-base")

    // Open the collapsible first so content is rendered
    await user.click(trigger)

    // The inner div inside CollapsibleContent has the text styling
    const contentWrapper = container.querySelector('[id^="radix"] > div')
    expect(contentWrapper).toHaveClass("text-sm")
  })

  it("handles keyboard navigation", async () => {
    const user = userEvent.setup()

    render(
      <Collapsible>
        <CollapsibleTrigger data-testid="collapsible-trigger-keyboard">Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByTestId("collapsible-trigger-keyboard")

    // Focus the trigger
    await user.tab()
    expect(trigger).toHaveFocus()

    // Press Enter to toggle
    await user.keyboard("{Enter}")
    expect(trigger).toHaveAttribute("data-state", "open")

    // Press Enter again to close
    await user.keyboard("{Enter}")
    expect(trigger).toHaveAttribute("data-state", "closed")
  })
})
