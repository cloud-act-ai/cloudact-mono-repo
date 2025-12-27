"use client"

import { CloudProviderPageTemplate, CloudProviderConfig } from "@/components/cloud/provider-page-template"

const AZURE_CONFIG: CloudProviderConfig = {
  id: "azure",
  backendKey: "AZURE",
  name: "Microsoft Azure",
  description: "Connect your Azure subscription to enable cost management and cloud analytics",
  icon: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.483 21.3H24L14.025 4.013l-3.038 8.347 5.836 6.938L5.483 21.3zM13.23 2.7L6.105 8.677 0 19.253h5.505l7.725-16.553z"/>
    </svg>
  ),
  color: "#0078D4",
  authMethods: [
    {
      id: "service_principal",
      label: "Service Principal",
      type: "multi_field",
      fields: [
        { name: "tenant_id", label: "Tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "text", required: true, helperText: "Azure AD Tenant ID (Directory ID)" },
        { name: "client_id", label: "Client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "text", required: true, helperText: "Application (client) ID" },
        { name: "client_secret", label: "Client Secret", placeholder: "Your client secret", type: "password", required: true },
        { name: "subscription_id", label: "Subscription ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "text", required: true, helperText: "Azure Subscription ID for cost data" },
      ],
    },
  ],
  docsUrl: "https://docs.microsoft.com/azure/cost-management-billing/costs/tutorial-export-acm-data",
  docsSteps: [
    'Go to <a href="https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps">Azure Portal &rarr; App registrations</a>',
    'Click <strong>"New registration"</strong> and name it "CloudAct Integration"',
    'Note the <strong>Application (client) ID</strong> and <strong>Directory (tenant) ID</strong>',
    'Go to <strong>"Certificates & secrets"</strong> &rarr; Create a new client secret',
    'Assign <strong>Cost Management Reader</strong> role at subscription level',
    'Go to <a href="https://portal.azure.com/#blade/Microsoft_Azure_CostManagement/Menu/exports">Cost Management &rarr; Exports</a> to set up automated exports',
  ],
  billingSetupInfo: 'Enable <a href="https://docs.microsoft.com/azure/cost-management-billing/costs/tutorial-export-acm-data">cost export to Azure Storage</a> for detailed billing data.',
}

export default function AzureIntegrationPage() {
  return <CloudProviderPageTemplate config={AZURE_CONFIG} />
}
