// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "billing/index.mdx": () => import("../content/docs/billing/index.mdx?collection=docs"), "billing/invoices.mdx": () => import("../content/docs/billing/invoices.mdx?collection=docs"), "billing/plans.mdx": () => import("../content/docs/billing/plans.mdx?collection=docs"), "account/index.mdx": () => import("../content/docs/account/index.mdx?collection=docs"), "account/profile.mdx": () => import("../content/docs/account/profile.mdx?collection=docs"), "account/security.mdx": () => import("../content/docs/account/security.mdx?collection=docs"), "account/team.mdx": () => import("../content/docs/account/team.mdx?collection=docs"), "getting-started/index.mdx": () => import("../content/docs/getting-started/index.mdx?collection=docs"), "getting-started/quickstart.mdx": () => import("../content/docs/getting-started/quickstart.mdx?collection=docs"), "integrations/anthropic.mdx": () => import("../content/docs/integrations/anthropic.mdx?collection=docs"), "integrations/gcp.mdx": () => import("../content/docs/integrations/gcp.mdx?collection=docs"), "integrations/index.mdx": () => import("../content/docs/integrations/index.mdx?collection=docs"), "integrations/openai.mdx": () => import("../content/docs/integrations/openai.mdx?collection=docs"), }),
};
export default browserCollections;