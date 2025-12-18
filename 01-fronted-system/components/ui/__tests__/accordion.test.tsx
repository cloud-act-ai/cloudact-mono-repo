import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../accordion"

describe("Accordion Component", () => {
  it("renders accordion items correctly", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Question 2</AccordionTrigger>
          <AccordionContent>Answer 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    expect(screen.getByText("Question 1")).toBeInTheDocument()
    expect(screen.getByText("Question 2")).toBeInTheDocument()
  })

  it("expands and collapses on click", async () => {
    const user = userEvent.setup()

    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    const trigger = screen.getByText("Question 1")

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
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    const trigger = screen.getByText("Question 1")
    expect(trigger).toHaveClass("hover:bg-slate-50")
    expect(trigger).toHaveClass("hover:text-cloudact-teal")
  })

  it("has proper border styling", () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    // The AccordionItem has value attribute and border classes
    const item = container.querySelector('[data-state][data-orientation]')
    expect(item).toHaveClass("border-b")
    expect(item).toHaveClass("border-slate-200")
  })

  it("shows chevron icon that rotates", () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveClass("transition-transform")
    expect(svg).toHaveClass("duration-200")
  })

  it("has accessible focus states", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    const trigger = screen.getByText("Question 1")
    expect(trigger).toHaveClass("focus-visible:outline-none")
    expect(trigger).toHaveClass("focus-visible:ring-2")
    expect(trigger).toHaveClass("focus-visible:ring-cloudact-teal")
  })

  it("supports disabled state", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger disabled>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    const trigger = screen.getByText("Question 1")
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveClass("disabled:pointer-events-none")
    expect(trigger).toHaveClass("disabled:opacity-50")
  })

  it("supports single collapsible mode", async () => {
    const user = userEvent.setup()

    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Question 2</AccordionTrigger>
          <AccordionContent>Answer 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    const trigger1 = screen.getByText("Question 1")
    const trigger2 = screen.getByText("Question 2")

    // Open first item
    await user.click(trigger1)
    expect(trigger1).toHaveAttribute("data-state", "open")

    // Open second item (should close first)
    await user.click(trigger2)
    expect(trigger1).toHaveAttribute("data-state", "closed")
    expect(trigger2).toHaveAttribute("data-state", "open")
  })

  it("supports multiple open mode", async () => {
    const user = userEvent.setup()

    render(
      <Accordion type="multiple">
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Question 2</AccordionTrigger>
          <AccordionContent>Answer 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    const trigger1 = screen.getByText("Question 1")
    const trigger2 = screen.getByText("Question 2")

    // Open both items
    await user.click(trigger1)
    await user.click(trigger2)

    // Both should be open
    expect(trigger1).toHaveAttribute("data-state", "open")
    expect(trigger2).toHaveAttribute("data-state", "open")
  })

  it("has smooth height animation", () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    // The content element with radix id has the animation classes
    const content = container.querySelector('[id^="radix"][role="region"]')
    expect(content).toHaveClass("data-[state=closed]:animate-accordion-up")
    expect(content).toHaveClass("data-[state=open]:animate-accordion-down")
  })

  it("has proper content padding", async () => {
    const user = userEvent.setup()

    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question 1</AccordionTrigger>
          <AccordionContent>Answer 1</AccordionContent>
        </AccordionItem>
      </Accordion>
    )

    // Open the accordion first so content is rendered
    const trigger = screen.getByText("Question 1")
    await user.click(trigger)

    // The inner div inside AccordionContent has the padding classes
    const contentWrapper = container.querySelector('[id^="radix"][role="region"] > div')
    expect(contentWrapper).toHaveClass("pb-4")
    expect(contentWrapper).toHaveClass("pt-2")
  })
})
