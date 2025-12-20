import { type DocsLayoutProps, DocsLayout } from "fumadocs-ui/layouts/docs"
import { RootProvider } from "fumadocs-ui/provider/next"
import type { ReactNode } from "react"
import { baseOptions } from "@/app/layout.config"
import { source } from "@/lib/source"
import "fumadocs-ui/style.css"

export default function Layout({ children }: { children: ReactNode }) {
  const layoutProps: DocsLayoutProps & { children: ReactNode } = {
    tree: source.pageTree,
    ...baseOptions,
    children,
  }
  return (
    <RootProvider>
      <DocsLayout {...layoutProps} />
    </RootProvider>
  )
}
