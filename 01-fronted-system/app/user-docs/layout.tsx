import { type DocsLayoutProps, DocsLayout } from "fumadocs-ui/layouts/docs"
import type { ReactNode } from "react"
import { baseOptions } from "@/app/layout.config"
import { source } from "@/lib/source"

export default function Layout({ children }: { children: ReactNode }) {
  const layoutProps: DocsLayoutProps & { children: ReactNode } = {
    tree: source.pageTree,
    ...baseOptions,
    children,
  }
  return <DocsLayout {...layoutProps} />
}
