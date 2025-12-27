"use client"

import { CloudProviderPageTemplate, CloudProviderConfig } from "@/components/cloud/provider-page-template"

const OCI_CONFIG: CloudProviderConfig = {
  id: "oci",
  backendKey: "OCI",
  name: "Oracle Cloud Infrastructure",
  description: "Connect your OCI tenancy to enable cost analysis and cloud analytics",
  icon: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm0 21.6c-5.292 0-9.6-4.308-9.6-9.6S6.708 2.4 12 2.4s9.6 4.308 9.6 9.6-4.308 9.6-9.6 9.6zm0-16.8c-3.972 0-7.2 3.228-7.2 7.2s3.228 7.2 7.2 7.2 7.2-3.228 7.2-7.2-3.228-7.2-7.2-7.2zm0 12c-2.652 0-4.8-2.148-4.8-4.8s2.148-4.8 4.8-4.8 4.8 2.148 4.8 4.8-2.148 4.8-4.8 4.8z"/>
    </svg>
  ),
  color: "#F80000",
  authMethods: [
    {
      id: "api_key",
      label: "API Key Authentication",
      type: "multi_field",
      fields: [
        { name: "tenancy_ocid", label: "Tenancy OCID", placeholder: "ocid1.tenancy.oc1..aaaa...", type: "text", required: true, helperText: "Your OCI Tenancy OCID" },
        { name: "user_ocid", label: "User OCID", placeholder: "ocid1.user.oc1..aaaa...", type: "text", required: true, helperText: "Your OCI User OCID" },
        { name: "fingerprint", label: "API Key Fingerprint", placeholder: "xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx", type: "text", required: true },
        { name: "private_key", label: "Private Key (PEM)", placeholder: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----", type: "textarea", required: true, helperText: "Paste your PEM private key" },
        { name: "region", label: "Home Region", placeholder: "us-ashburn-1", type: "text", required: true, helperText: "Your OCI home region identifier" },
      ],
    },
  ],
  docsUrl: "https://docs.oracle.com/iaas/Content/Billing/Concepts/costanalysisoverview.htm",
  docsSteps: [
    'Go to <a href="https://cloud.oracle.com/identity/users">OCI Console → Identity → Users</a>',
    'Select your user and go to <strong>"API Keys"</strong>',
    'Click <strong>"Add API Key"</strong> and generate a key pair',
    'Download the <strong>private key</strong> and note the <strong>fingerprint</strong>',
    'Copy your <strong>Tenancy OCID</strong> from the Tenancy Details page',
    'Copy your <strong>User OCID</strong> from your user profile',
    'Add IAM policy: <code>Allow user to read cost-reports in tenancy</code>',
  ],
  billingSetupInfo: 'Enable <a href="https://docs.oracle.com/iaas/Content/Billing/Concepts/costanalysisoverview.htm">Cost Analysis</a> in your OCI Console for detailed cost data.',
}

export default function OCIIntegrationPage() {
  return <CloudProviderPageTemplate config={OCI_CONFIG} />
}
