// @ts-nocheck
import { default as __fd_glob_18 } from "../content/docs/integrations/meta.json?collection=meta"
import { default as __fd_glob_17 } from "../content/docs/getting-started/meta.json?collection=meta"
import { default as __fd_glob_16 } from "../content/docs/account/meta.json?collection=meta"
import { default as __fd_glob_15 } from "../content/docs/billing/meta.json?collection=meta"
import { default as __fd_glob_14 } from "../content/docs/meta.json?collection=meta"
import * as __fd_glob_13 from "../content/docs/integrations/openai.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/integrations/index.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/integrations/gcp.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/integrations/anthropic.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/getting-started/quickstart.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/getting-started/index.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/billing/plans.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/billing/invoices.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/billing/index.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/account/team.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/account/security.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/account/profile.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/account/index.mdx?collection=docs"
import * as __fd_glob_0 from "../content/docs/index.mdx?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.doc("docs", "content/docs", {"index.mdx": __fd_glob_0, "account/index.mdx": __fd_glob_1, "account/profile.mdx": __fd_glob_2, "account/security.mdx": __fd_glob_3, "account/team.mdx": __fd_glob_4, "billing/index.mdx": __fd_glob_5, "billing/invoices.mdx": __fd_glob_6, "billing/plans.mdx": __fd_glob_7, "getting-started/index.mdx": __fd_glob_8, "getting-started/quickstart.mdx": __fd_glob_9, "integrations/anthropic.mdx": __fd_glob_10, "integrations/gcp.mdx": __fd_glob_11, "integrations/index.mdx": __fd_glob_12, "integrations/openai.mdx": __fd_glob_13, });

export const meta = await create.meta("meta", "content/docs", {"meta.json": __fd_glob_14, "billing/meta.json": __fd_glob_15, "account/meta.json": __fd_glob_16, "getting-started/meta.json": __fd_glob_17, "integrations/meta.json": __fd_glob_18, });