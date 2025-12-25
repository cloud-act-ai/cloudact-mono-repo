/**
 * ScrollArea Component Usage Examples
 *
 * This file demonstrates how to use the ScrollArea component
 * with CloudAct brand colors and best practices.
 */

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

// Example 1: Vertical Scrolling (Common use case)
export function VerticalScrollExample() {
  return (
    <ScrollArea className="h-[400px] w-full rounded-lg border">
      <div className="p-4">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="py-2 border-b">
            Item {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

// Example 2: Horizontal Scrolling (Tables, wide content)
export function HorizontalScrollExample() {
  return (
    <ScrollArea className="w-full whitespace-nowrap rounded-lg border">
      <div className="flex p-4 gap-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="inline-block w-[200px] h-[100px] bg-slate-100 rounded-lg p-4"
          >
            Card {i + 1}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

// Example 3: Both Vertical and Horizontal Scrolling
export function BothDirectionsExample() {
  return (
    <ScrollArea className="h-[400px] w-full rounded-lg border">
      <div className="w-[800px] p-4">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="py-2 border-b">
            Wide content that needs horizontal scrolling - Item {i + 1}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

// Example 4: Sidebar Menu (Common pattern)
export function SidebarMenuExample() {
  return (
    <ScrollArea className="h-screen w-64 border-r">
      <div className="p-4 space-y-2">
        <h2 className="text-lg font-semibold mb-4">Menu</h2>
        {Array.from({ length: 30 }).map((_, i) => (
          <button
            key={i}
            className="w-full text-left px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Menu Item {i + 1}
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

// Example 5: Code Block / Pre-formatted Text
export function CodeBlockExample() {
  return (
    <ScrollArea className="h-[300px] w-full rounded-lg border bg-slate-50 dark:bg-slate-900">
      <pre className="p-4 text-sm">
        <code>{`
const example = {
  scrollbar: {
    thumb: "#CBD5E1",
    thumbHover: "#90FCA6",
    track: "#F1F5F9",
    width: "8px",
    borderRadius: "4px"
  },
  dark: {
    thumb: "#475569",
    thumbHover: "#14B8A6",
    track: "#1E293B"
  }
}
        `.trim()}</code>
      </pre>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

// Example 6: Modal/Dialog Content
export function DialogContentExample() {
  return (
    <ScrollArea className="max-h-[60vh] w-full">
      <div className="space-y-4 p-4">
        <h3 className="text-xl font-semibold">Terms and Conditions</h3>
        {Array.from({ length: 20 }).map((_, i) => (
          <p key={i} className="text-sm text-slate-600 dark:text-slate-400">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua.
          </p>
        ))}
      </div>
    </ScrollArea>
  )
}

// Example 7: Data Table with Fixed Header
export function DataTableExample() {
  return (
    <div className="rounded-lg border">
      <div className="bg-slate-50 dark:bg-slate-900 p-4 font-semibold border-b">
        Table Header (Fixed)
      </div>
      <ScrollArea className="h-[400px]">
        <table className="w-full">
          <tbody>
            {Array.from({ length: 50 }).map((_, i) => (
              <tr key={i} className="border-b hover:bg-slate-50">
                <td className="p-4">Row {i + 1}</td>
                <td className="p-4">Data Column 1</td>
                <td className="p-4">Data Column 2</td>
                <td className="p-4">Data Column 3</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  )
}
