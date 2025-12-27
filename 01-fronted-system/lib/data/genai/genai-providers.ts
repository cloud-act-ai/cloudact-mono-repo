/**
 * GenAI Providers Data
 * Provider metadata and configuration
 * Derived from pricing data across all categories
 */

export interface GenAIProvider {
  id: string;
  name: string;
  display_name: string;
  provider_type: 'api' | 'cloud_hosted' | 'self_hosted';
  cloud_platform: string | null;
  supports_payg: boolean;
  supports_commitment: boolean;
  supports_infrastructure: boolean;
  supports_fine_tuning: boolean;
  supports_media: boolean;
  api_base_url: string | null;
  docs_url: string;
  status_page_url: string | null;
  default_region: string;
  available_regions: string[];
  auth_type: 'api_key' | 'oauth' | 'service_account' | 'iam';
  credential_fields: string[];
  status: string;
  notes: string;
}

export const GENAI_PROVIDERS: GenAIProvider[] = [
  // Direct API Providers
  {
    id: "openai",
    name: "openai",
    display_name: "OpenAI",
    provider_type: "api",
    cloud_platform: null,
    supports_payg: true,
    supports_commitment: false,
    supports_infrastructure: false,
    supports_fine_tuning: true,
    supports_media: true,
    api_base_url: "https://api.openai.com/v1",
    docs_url: "https://platform.openai.com/docs",
    status_page_url: "https://status.openai.com",
    default_region: "global",
    available_regions: ["global"],
    auth_type: "api_key",
    credential_fields: ["api_key", "organization_id"],
    status: "active",
    notes: "GPT-4o, o1, DALL-E, Whisper"
  },
  {
    id: "anthropic",
    name: "anthropic",
    display_name: "Anthropic",
    provider_type: "api",
    cloud_platform: null,
    supports_payg: true,
    supports_commitment: false,
    supports_infrastructure: false,
    supports_fine_tuning: true,
    supports_media: true,
    api_base_url: "https://api.anthropic.com/v1",
    docs_url: "https://docs.anthropic.com",
    status_page_url: "https://status.anthropic.com",
    default_region: "global",
    available_regions: ["global"],
    auth_type: "api_key",
    credential_fields: ["api_key"],
    status: "active",
    notes: "Claude 3.5, Claude 3"
  },
  {
    id: "gemini",
    name: "gemini",
    display_name: "Google Gemini",
    provider_type: "api",
    cloud_platform: "gcp",
    supports_payg: true,
    supports_commitment: false,
    supports_infrastructure: false,
    supports_fine_tuning: true,
    supports_media: true,
    api_base_url: "https://generativelanguage.googleapis.com/v1",
    docs_url: "https://ai.google.dev/docs",
    status_page_url: "https://status.cloud.google.com",
    default_region: "global",
    available_regions: ["global"],
    auth_type: "api_key",
    credential_fields: ["api_key"],
    status: "active",
    notes: "Gemini 2.5, Gemini 2.0, Imagen"
  },
  {
    id: "deepseek",
    name: "deepseek",
    display_name: "DeepSeek",
    provider_type: "api",
    cloud_platform: null,
    supports_payg: true,
    supports_commitment: false,
    supports_infrastructure: false,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: "https://api.deepseek.com/v1",
    docs_url: "https://platform.deepseek.com/docs",
    status_page_url: null,
    default_region: "global",
    available_regions: ["global"],
    auth_type: "api_key",
    credential_fields: ["api_key"],
    status: "active",
    notes: "DeepSeek V3, DeepSeek Coder"
  },
  // Cloud-Hosted Providers
  {
    id: "azure_openai",
    name: "azure_openai",
    display_name: "Azure OpenAI",
    provider_type: "cloud_hosted",
    cloud_platform: "azure",
    supports_payg: true,
    supports_commitment: true,
    supports_infrastructure: false,
    supports_fine_tuning: true,
    supports_media: true,
    api_base_url: null,
    docs_url: "https://learn.microsoft.com/azure/ai-services/openai",
    status_page_url: "https://status.azure.com",
    default_region: "eastus",
    available_regions: ["eastus", "eastus2", "westus", "westeurope", "northeurope", "southeastasia", "japaneast", "australiaeast"],
    auth_type: "api_key",
    credential_fields: ["endpoint", "api_key", "deployment_name"],
    status: "active",
    notes: "PTU commitment available"
  },
  {
    id: "aws_bedrock",
    name: "aws_bedrock",
    display_name: "AWS Bedrock",
    provider_type: "cloud_hosted",
    cloud_platform: "aws",
    supports_payg: true,
    supports_commitment: true,
    supports_infrastructure: false,
    supports_fine_tuning: true,
    supports_media: true,
    api_base_url: null,
    docs_url: "https://docs.aws.amazon.com/bedrock",
    status_page_url: "https://health.aws.amazon.com",
    default_region: "us-east-1",
    available_regions: ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1", "ap-northeast-1"],
    auth_type: "iam",
    credential_fields: ["access_key_id", "secret_access_key", "region"],
    status: "active",
    notes: "Provisioned throughput available"
  },
  {
    id: "gcp_vertex",
    name: "gcp_vertex",
    display_name: "GCP Vertex AI",
    provider_type: "cloud_hosted",
    cloud_platform: "gcp",
    supports_payg: true,
    supports_commitment: true,
    supports_infrastructure: false,
    supports_fine_tuning: true,
    supports_media: true,
    api_base_url: null,
    docs_url: "https://cloud.google.com/vertex-ai/docs",
    status_page_url: "https://status.cloud.google.com",
    default_region: "us-central1",
    available_regions: ["us-central1", "us-east1", "us-west1", "europe-west1", "europe-west4", "asia-east1", "asia-northeast1"],
    auth_type: "service_account",
    credential_fields: ["project_id", "service_account_key"],
    status: "active",
    notes: "GSU commitment available"
  },
  // Infrastructure Providers (GPU/TPU)
  {
    id: "gcp_gpu",
    name: "gcp_gpu",
    display_name: "GCP GPU Compute",
    provider_type: "cloud_hosted",
    cloud_platform: "gcp",
    supports_payg: false,
    supports_commitment: false,
    supports_infrastructure: true,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "https://cloud.google.com/compute/docs/gpus",
    status_page_url: "https://status.cloud.google.com",
    default_region: "us-central1",
    available_regions: ["us-central1", "us-east1", "us-west1", "europe-west1", "asia-east1"],
    auth_type: "service_account",
    credential_fields: ["project_id", "service_account_key"],
    status: "active",
    notes: "A100, H100, L4 GPUs"
  },
  {
    id: "gcp_tpu",
    name: "gcp_tpu",
    display_name: "GCP TPU",
    provider_type: "cloud_hosted",
    cloud_platform: "gcp",
    supports_payg: false,
    supports_commitment: false,
    supports_infrastructure: true,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "https://cloud.google.com/tpu/docs",
    status_page_url: "https://status.cloud.google.com",
    default_region: "us-central1",
    available_regions: ["us-central1", "europe-west4"],
    auth_type: "service_account",
    credential_fields: ["project_id", "service_account_key"],
    status: "active",
    notes: "TPU v4, v5e, v5p, v6e"
  },
  {
    id: "aws_gpu",
    name: "aws_gpu",
    display_name: "AWS GPU Compute",
    provider_type: "cloud_hosted",
    cloud_platform: "aws",
    supports_payg: false,
    supports_commitment: false,
    supports_infrastructure: true,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html",
    status_page_url: "https://health.aws.amazon.com",
    default_region: "us-east-1",
    available_regions: ["us-east-1", "us-west-2", "eu-west-1"],
    auth_type: "iam",
    credential_fields: ["access_key_id", "secret_access_key", "region"],
    status: "active",
    notes: "P4d, P5, G5, G6 instances"
  },
  {
    id: "aws_inf",
    name: "aws_inf",
    display_name: "AWS Inferentia",
    provider_type: "cloud_hosted",
    cloud_platform: "aws",
    supports_payg: false,
    supports_commitment: false,
    supports_infrastructure: true,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "https://aws.amazon.com/machine-learning/inferentia",
    status_page_url: "https://health.aws.amazon.com",
    default_region: "us-east-1",
    available_regions: ["us-east-1", "us-west-2"],
    auth_type: "iam",
    credential_fields: ["access_key_id", "secret_access_key", "region"],
    status: "active",
    notes: "Inferentia2 for inference"
  },
  {
    id: "aws_trn",
    name: "aws_trn",
    display_name: "AWS Trainium",
    provider_type: "cloud_hosted",
    cloud_platform: "aws",
    supports_payg: false,
    supports_commitment: false,
    supports_infrastructure: true,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "https://aws.amazon.com/machine-learning/trainium",
    status_page_url: "https://health.aws.amazon.com",
    default_region: "us-east-1",
    available_regions: ["us-east-1", "us-west-2"],
    auth_type: "iam",
    credential_fields: ["access_key_id", "secret_access_key", "region"],
    status: "active",
    notes: "Trainium1, Trainium2 for training"
  },
  {
    id: "azure_gpu",
    name: "azure_gpu",
    display_name: "Azure GPU Compute",
    provider_type: "cloud_hosted",
    cloud_platform: "azure",
    supports_payg: false,
    supports_commitment: false,
    supports_infrastructure: true,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "https://learn.microsoft.com/azure/virtual-machines/sizes-gpu",
    status_page_url: "https://status.azure.com",
    default_region: "eastus",
    available_regions: ["eastus", "westus2", "westeurope", "southeastasia"],
    auth_type: "service_account",
    credential_fields: ["subscription_id", "client_id", "client_secret", "tenant_id"],
    status: "active",
    notes: "NC, ND series VMs"
  },
  // Self-hosted
  {
    id: "self_hosted",
    name: "self_hosted",
    display_name: "Self-Hosted",
    provider_type: "self_hosted",
    cloud_platform: null,
    supports_payg: false,
    supports_commitment: false,
    supports_infrastructure: true,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "",
    status_page_url: null,
    default_region: "on-prem",
    available_regions: ["on-prem"],
    auth_type: "api_key",
    credential_fields: [],
    status: "active",
    notes: "RTX 4090, A6000, etc."
  },
  // Commitment-specific providers
  {
    id: "azure_openai_ptu",
    name: "azure_openai_ptu",
    display_name: "Azure OpenAI PTU",
    provider_type: "cloud_hosted",
    cloud_platform: "azure",
    supports_payg: false,
    supports_commitment: true,
    supports_infrastructure: false,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "https://learn.microsoft.com/azure/ai-services/openai/concepts/provisioned-throughput",
    status_page_url: "https://status.azure.com",
    default_region: "eastus",
    available_regions: ["eastus", "westus", "westeurope"],
    auth_type: "api_key",
    credential_fields: ["endpoint", "api_key", "deployment_name"],
    status: "active",
    notes: "Provisioned Throughput Units"
  },
  {
    id: "aws_bedrock_pt",
    name: "aws_bedrock_pt",
    display_name: "AWS Bedrock PT",
    provider_type: "cloud_hosted",
    cloud_platform: "aws",
    supports_payg: false,
    supports_commitment: true,
    supports_infrastructure: false,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html",
    status_page_url: "https://health.aws.amazon.com",
    default_region: "us-east-1",
    available_regions: ["us-east-1", "us-west-2"],
    auth_type: "iam",
    credential_fields: ["access_key_id", "secret_access_key", "region"],
    status: "active",
    notes: "Provisioned Throughput"
  },
  {
    id: "gcp_vertex_pt",
    name: "gcp_vertex_pt",
    display_name: "GCP Vertex GSU",
    provider_type: "cloud_hosted",
    cloud_platform: "gcp",
    supports_payg: false,
    supports_commitment: true,
    supports_infrastructure: false,
    supports_fine_tuning: false,
    supports_media: false,
    api_base_url: null,
    docs_url: "https://cloud.google.com/vertex-ai/docs/quotas",
    status_page_url: "https://status.cloud.google.com",
    default_region: "us-central1",
    available_regions: ["us-central1", "europe-west1"],
    auth_type: "service_account",
    credential_fields: ["project_id", "service_account_key"],
    status: "active",
    notes: "Generative AI Serving Units"
  }
];

// Helper functions
export function getProviderById(id: string): GenAIProvider | undefined {
  return GENAI_PROVIDERS.find(p => p.id === id);
}

export function getProvidersByType(providerType: 'api' | 'cloud_hosted' | 'self_hosted'): GenAIProvider[] {
  return GENAI_PROVIDERS.filter(p => p.provider_type === providerType);
}

export function getProvidersByCloudPlatform(cloudPlatform: string): GenAIProvider[] {
  return GENAI_PROVIDERS.filter(p => p.cloud_platform === cloudPlatform);
}

export function getPaygProviders(): GenAIProvider[] {
  return GENAI_PROVIDERS.filter(p => p.supports_payg);
}

export function getCommitmentProviders(): GenAIProvider[] {
  return GENAI_PROVIDERS.filter(p => p.supports_commitment);
}

export function getInfrastructureProviders(): GenAIProvider[] {
  return GENAI_PROVIDERS.filter(p => p.supports_infrastructure);
}

export function getActiveProviders(): GenAIProvider[] {
  return GENAI_PROVIDERS.filter(p => p.status === 'active');
}

export function getProviderRegions(providerId: string): string[] {
  const provider = getProviderById(providerId);
  return provider?.available_regions || [];
}

export function getApiProviders(): GenAIProvider[] {
  return GENAI_PROVIDERS.filter(p => p.provider_type === 'api');
}

export function getCloudProviders(): GenAIProvider[] {
  return GENAI_PROVIDERS.filter(p => p.provider_type === 'cloud_hosted');
}
