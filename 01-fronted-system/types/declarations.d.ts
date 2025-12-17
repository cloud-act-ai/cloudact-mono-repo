/**
 * Type declarations for external modules without built-in TypeScript support
 */

// Vitest config - augment vite's UserConfig to include test property
declare module 'vite' {
  interface UserConfig {
    test?: import('vitest/node').UserConfig
  }
}

// Testing library types
declare module '@testing-library/react' {
  import * as React from 'react'

  export interface RenderOptions {
    container?: HTMLElement
    baseElement?: HTMLElement
    hydrate?: boolean
    wrapper?: React.ComponentType<{ children: React.ReactNode }>
  }

  export interface RenderResult {
    container: HTMLElement
    baseElement: HTMLElement
    debug: (element?: HTMLElement) => void
    rerender: (ui: React.ReactElement) => void
    unmount: () => void
    asFragment: () => DocumentFragment
  }

  export function render(
    ui: React.ReactElement,
    options?: RenderOptions
  ): RenderResult

  export const screen: {
    getByText: (text: string | RegExp) => HTMLElement
    getByRole: (role: string, options?: any) => HTMLElement
    getByLabelText: (text: string | RegExp) => HTMLElement
    getByPlaceholderText: (text: string | RegExp) => HTMLElement
    getByTestId: (testId: string) => HTMLElement
    queryByText: (text: string | RegExp) => HTMLElement | null
    queryByRole: (role: string, options?: any) => HTMLElement | null
    findByText: (text: string | RegExp) => Promise<HTMLElement>
    findByRole: (role: string, options?: any) => Promise<HTMLElement>
    [key: string]: any
  }

  export function waitFor<T>(
    callback: () => T | Promise<T>,
    options?: { timeout?: number; interval?: number }
  ): Promise<T>

  export function fireEvent(element: HTMLElement, event: Event): boolean
  export namespace fireEvent {
    export function click(element: HTMLElement): boolean
    export function change(element: HTMLElement, options: { target: { value: any } }): boolean
    export function submit(element: HTMLElement): boolean
  }
}

// Radix UI icons
declare module '@radix-ui/react-icons' {
  import * as React from 'react'
  export const CheckIcon: React.FC<React.SVGProps<SVGSVGElement>>
  export const Cross2Icon: React.FC<React.SVGProps<SVGSVGElement>>
  export const ChevronDownIcon: React.FC<React.SVGProps<SVGSVGElement>>
  export const ChevronUpIcon: React.FC<React.SVGProps<SVGSVGElement>>
  export const DotsHorizontalIcon: React.FC<React.SVGProps<SVGSVGElement>>
  export const MagnifyingGlassIcon: React.FC<React.SVGProps<SVGSVGElement>>
  export const CaretSortIcon: React.FC<React.SVGProps<SVGSVGElement>>
  export const DotFilledIcon: React.FC<React.SVGProps<SVGSVGElement>>
  export const ExclamationTriangleIcon: React.FC<React.SVGProps<SVGSVGElement>>
  // Add more icons as needed
  const icons: Record<string, React.FC<React.SVGProps<SVGSVGElement>>>
  export default icons
}

// Node fetch (for scripts using node-fetch in Node.js context)
declare module 'node-fetch' {
  export interface RequestInit {
    method?: string
    headers?: Record<string, string> | Headers
    body?: string | Buffer | ReadableStream
    redirect?: 'follow' | 'error' | 'manual'
    signal?: AbortSignal
  }

  export interface Response {
    ok: boolean
    status: number
    statusText: string
    headers: Headers
    url: string
    json(): Promise<any>
    text(): Promise<string>
    blob(): Promise<Blob>
    arrayBuffer(): Promise<ArrayBuffer>
  }

  export interface Headers {
    get(name: string): string | null
    set(name: string, value: string): void
    append(name: string, value: string): void
    delete(name: string): void
    has(name: string): boolean
  }

  function fetch(url: string, init?: RequestInit): Promise<Response>
  export default fetch
}
