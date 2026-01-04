// @ts-nocheck
import { default as __fd_glob_35 } from "../content/docs/personal-settings/meta.json?collection=meta"
import { default as __fd_glob_34 } from "../content/docs/org-settings/meta.json?collection=meta"
import { default as __fd_glob_33 } from "../content/docs/pipelines/meta.json?collection=meta"
import { default as __fd_glob_32 } from "../content/docs/notifications/meta.json?collection=meta"
import { default as __fd_glob_31 } from "../content/docs/integrations/meta.json?collection=meta"
import { default as __fd_glob_30 } from "../content/docs/getting-started/meta.json?collection=meta"
import { default as __fd_glob_29 } from "../content/docs/cost-analytics/meta.json?collection=meta"
import { default as __fd_glob_28 } from "../content/docs/dashboard/meta.json?collection=meta"
import { default as __fd_glob_27 } from "../content/docs/meta.json?collection=meta"
import * as __fd_glob_26 from "../content/docs/pipelines/subscription-runs.mdx?collection=docs"
import * as __fd_glob_25 from "../content/docs/pipelines/index.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/pipelines/genai-runs.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/pipelines/cloud-runs.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/personal-settings/security.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/personal-settings/profile.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/personal-settings/index.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/org-settings/team-members.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/org-settings/quota-usage.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/org-settings/organization.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/org-settings/index.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/org-settings/hierarchy.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/org-settings/billing.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/notifications/index.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/integrations/subscriptions.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/integrations/index.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/integrations/genai-providers.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/integrations/cloud-providers.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/getting-started/quickstart.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/getting-started/index.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/getting-started/account-setup.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/dashboard/index.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/cost-analytics/subscription-costs.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/cost-analytics/index.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/cost-analytics/genai-costs.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/cost-analytics/cloud-costs.mdx?collection=docs"
import * as __fd_glob_0 from "../content/docs/index.mdx?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.doc("docs", "content/docs", {"index.mdx": __fd_glob_0, "cost-analytics/cloud-costs.mdx": __fd_glob_1, "cost-analytics/genai-costs.mdx": __fd_glob_2, "cost-analytics/index.mdx": __fd_glob_3, "cost-analytics/subscription-costs.mdx": __fd_glob_4, "dashboard/index.mdx": __fd_glob_5, "getting-started/account-setup.mdx": __fd_glob_6, "getting-started/index.mdx": __fd_glob_7, "getting-started/quickstart.mdx": __fd_glob_8, "integrations/cloud-providers.mdx": __fd_glob_9, "integrations/genai-providers.mdx": __fd_glob_10, "integrations/index.mdx": __fd_glob_11, "integrations/subscriptions.mdx": __fd_glob_12, "notifications/index.mdx": __fd_glob_13, "org-settings/billing.mdx": __fd_glob_14, "org-settings/hierarchy.mdx": __fd_glob_15, "org-settings/index.mdx": __fd_glob_16, "org-settings/organization.mdx": __fd_glob_17, "org-settings/quota-usage.mdx": __fd_glob_18, "org-settings/team-members.mdx": __fd_glob_19, "personal-settings/index.mdx": __fd_glob_20, "personal-settings/profile.mdx": __fd_glob_21, "personal-settings/security.mdx": __fd_glob_22, "pipelines/cloud-runs.mdx": __fd_glob_23, "pipelines/genai-runs.mdx": __fd_glob_24, "pipelines/index.mdx": __fd_glob_25, "pipelines/subscription-runs.mdx": __fd_glob_26, });

export const meta = await create.meta("meta", "content/docs", {"meta.json": __fd_glob_27, "dashboard/meta.json": __fd_glob_28, "cost-analytics/meta.json": __fd_glob_29, "getting-started/meta.json": __fd_glob_30, "integrations/meta.json": __fd_glob_31, "notifications/meta.json": __fd_glob_32, "pipelines/meta.json": __fd_glob_33, "org-settings/meta.json": __fd_glob_34, "personal-settings/meta.json": __fd_glob_35, });