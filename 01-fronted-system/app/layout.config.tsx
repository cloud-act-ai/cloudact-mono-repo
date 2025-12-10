import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: "CloudAct Docs",
  },
  links: [
    {
      text: "Home",
      url: "/",
    },
    {
      text: "Documentation",
      url: "/user-docs",
      active: "nested-url",
    },
  ],
}
