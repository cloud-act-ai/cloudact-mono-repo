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
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByText("Toggle Content")

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
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByText("Toggle Content")
    expect(trigger).toHaveClass("hover:bg-slate-50")
    expect(trigger).toHaveClass("hover:text-cloudact-teal")
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
    expect(svg).toHaveClass("duration-300")
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
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByText("Toggle Content")

    // Trigger should have the rotation class
    expect(trigger).toHaveClass("[&[data-state=open]>svg]:rotate-180")

    // Open the collapsible
    await user.click(trigger)
    expect(trigger).toHaveAttribute("data-state", "open")
  })

  it("has accessible focus states", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByText("Toggle Content")
    expect(trigger).toHaveClass("focus-visible:outline-none")
    expect(trigger).toHaveClass("focus-visible:ring-2")
    expect(trigger).toHaveClass("focus-visible:ring-cloudact-teal")
  })

  it("supports disabled state", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger disabled>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByText("Toggle Content")
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveClass("disabled:pointer-events-none")
    expect(trigger).toHaveClass("disabled:opacity-50")
  })

  it("has smooth height animation", () => {
    const { container } = render(
      <Collapsible>
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const content = container.querySelector('[data-state]')
    expect(content).toHaveClass("data-[state=closed]:animate-collapsible-up")
    expect(content).toHaveClass("data-[state=open]:animate-collapsible-down")
  })

  it("has proper content padding", () => {
    const { container } = render(
      <Collapsible>
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const contentWrapper = container.querySelector('[data-state] > div')
    expect(contentWrapper).toHaveClass("pb-4")
    expect(contentWrapper).toHaveClass("pt-2")
    expect(contentWrapper).toHaveClass("px-1")
  })

  it("accepts custom className", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger className="custom-trigger">Toggle Content</CollapsibleTrigger>
        <CollapsibleContent className="custom-content">Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByText("Toggle Content")
    expect(trigger).toHaveClass("custom-trigger")
  })

  it("has proper typography styling", () => {
    const { container } = render(
      <Collapsible>
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByText("Toggle Content")
    expect(trigger).toHaveClass("font-medium")
    expect(trigger).toHaveClass("text-base")

    const contentWrapper = container.querySelector('[data-state] > div')
    expect(contentWrapper).toHaveClass("text-sm")
  })

  it("handles keyboard navigation", async () => {
    const user = userEvent.setup()

    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    )

    const trigger = screen.getByText("Toggle Content")

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
