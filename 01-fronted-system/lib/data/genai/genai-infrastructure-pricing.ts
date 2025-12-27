/**
 * GenAI Infrastructure Pricing Data
 * GPU/TPU/Inferentia hourly pricing for self-hosted and cloud
 * Source: ZZ-PRE-ANALLISYS/data/pricing/genai_infrastructure_pricing.csv
 */

export interface GenAIInfrastructurePricing {
  provider: string;
  resource_type: string;
  instance_type: string;
  gpu_type: string;
  gpu_count: number;
  gpu_memory_gb: number;
  hourly_rate: number;
  spot_discount_pct: number;
  reserved_1yr_discount_pct: number;
  reserved_3yr_discount_pct: number;
  region: string;
  cloud_provider: string;
  status: string;
  last_updated: string;
}

export const GENAI_INFRASTRUCTURE_PRICING: GenAIInfrastructurePricing[] = [
  // GCP GPU Instances
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a2-highgpu-1g",
    gpu_type: "A100-40GB",
    gpu_count: 1,
    gpu_memory_gb: 40,
    hourly_rate: 3.67,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a2-highgpu-2g",
    gpu_type: "A100-40GB",
    gpu_count: 2,
    gpu_memory_gb: 80,
    hourly_rate: 7.35,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a2-highgpu-4g",
    gpu_type: "A100-40GB",
    gpu_count: 4,
    gpu_memory_gb: 160,
    hourly_rate: 14.69,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a2-highgpu-8g",
    gpu_type: "A100-40GB",
    gpu_count: 8,
    gpu_memory_gb: 320,
    hourly_rate: 29.39,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a2-ultragpu-1g",
    gpu_type: "A100-80GB",
    gpu_count: 1,
    gpu_memory_gb: 80,
    hourly_rate: 5.07,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a2-ultragpu-2g",
    gpu_type: "A100-80GB",
    gpu_count: 2,
    gpu_memory_gb: 160,
    hourly_rate: 10.14,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a2-ultragpu-4g",
    gpu_type: "A100-80GB",
    gpu_count: 4,
    gpu_memory_gb: 320,
    hourly_rate: 20.28,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a2-ultragpu-8g",
    gpu_type: "A100-80GB",
    gpu_count: 8,
    gpu_memory_gb: 640,
    hourly_rate: 40.56,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a3-highgpu-1g",
    gpu_type: "H100-80GB",
    gpu_count: 1,
    gpu_memory_gb: 80,
    hourly_rate: 10.20,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "a3-highgpu-8g",
    gpu_type: "H100-80GB",
    gpu_count: 8,
    gpu_memory_gb: 640,
    hourly_rate: 88.49,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "g2-standard-4",
    gpu_type: "L4",
    gpu_count: 1,
    gpu_memory_gb: 24,
    hourly_rate: 0.70,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "g2-standard-8",
    gpu_type: "L4",
    gpu_count: 1,
    gpu_memory_gb: 24,
    hourly_rate: 0.98,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_gpu",
    resource_type: "gpu",
    instance_type: "g2-standard-24",
    gpu_type: "L4",
    gpu_count: 2,
    gpu_memory_gb: 48,
    hourly_rate: 2.45,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  // GCP TPU Instances
  {
    provider: "gcp_tpu",
    resource_type: "tpu",
    instance_type: "v4-8",
    gpu_type: "TPU-v4",
    gpu_count: 4,
    gpu_memory_gb: 128,
    hourly_rate: 12.88,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_tpu",
    resource_type: "tpu",
    instance_type: "v5e-4",
    gpu_type: "TPU-v5e",
    gpu_count: 4,
    gpu_memory_gb: 64,
    hourly_rate: 4.80,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_tpu",
    resource_type: "tpu",
    instance_type: "v5e-8",
    gpu_type: "TPU-v5e",
    gpu_count: 8,
    gpu_memory_gb: 128,
    hourly_rate: 9.60,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_tpu",
    resource_type: "tpu",
    instance_type: "v5p-8",
    gpu_type: "TPU-v5p",
    gpu_count: 8,
    gpu_memory_gb: 192,
    hourly_rate: 33.60,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "gcp_tpu",
    resource_type: "tpu",
    instance_type: "v6e-4",
    gpu_type: "TPU-v6e",
    gpu_count: 4,
    gpu_memory_gb: 128,
    hourly_rate: 5.50,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 28,
    reserved_3yr_discount_pct: 45,
    region: "us-central1",
    cloud_provider: "gcp",
    status: "active",
    last_updated: "2025-12-01"
  },
  // AWS GPU Instances
  {
    provider: "aws_gpu",
    resource_type: "gpu",
    instance_type: "p4d.24xlarge",
    gpu_type: "A100-40GB",
    gpu_count: 8,
    gpu_memory_gb: 320,
    hourly_rate: 32.77,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_gpu",
    resource_type: "gpu",
    instance_type: "p4de.24xlarge",
    gpu_type: "A100-80GB",
    gpu_count: 8,
    gpu_memory_gb: 640,
    hourly_rate: 40.97,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_gpu",
    resource_type: "gpu",
    instance_type: "p5.48xlarge",
    gpu_type: "H100-80GB",
    gpu_count: 8,
    gpu_memory_gb: 640,
    hourly_rate: 98.32,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_gpu",
    resource_type: "gpu",
    instance_type: "p5en.48xlarge",
    gpu_type: "H100-80GB",
    gpu_count: 8,
    gpu_memory_gb: 640,
    hourly_rate: 85.00,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_gpu",
    resource_type: "gpu",
    instance_type: "g5.xlarge",
    gpu_type: "A10G",
    gpu_count: 1,
    gpu_memory_gb: 24,
    hourly_rate: 1.01,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_gpu",
    resource_type: "gpu",
    instance_type: "g5.2xlarge",
    gpu_type: "A10G",
    gpu_count: 1,
    gpu_memory_gb: 24,
    hourly_rate: 1.21,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_gpu",
    resource_type: "gpu",
    instance_type: "g5.12xlarge",
    gpu_type: "A10G",
    gpu_count: 4,
    gpu_memory_gb: 96,
    hourly_rate: 5.67,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_gpu",
    resource_type: "gpu",
    instance_type: "g6.xlarge",
    gpu_type: "L4",
    gpu_count: 1,
    gpu_memory_gb: 24,
    hourly_rate: 0.80,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_gpu",
    resource_type: "gpu",
    instance_type: "g6.12xlarge",
    gpu_type: "L4",
    gpu_count: 4,
    gpu_memory_gb: 96,
    hourly_rate: 4.60,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  // AWS Inferentia
  {
    provider: "aws_inf",
    resource_type: "inferentia",
    instance_type: "inf2.xlarge",
    gpu_type: "Inferentia2",
    gpu_count: 1,
    gpu_memory_gb: 32,
    hourly_rate: 0.76,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_inf",
    resource_type: "inferentia",
    instance_type: "inf2.8xlarge",
    gpu_type: "Inferentia2",
    gpu_count: 1,
    gpu_memory_gb: 32,
    hourly_rate: 1.97,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_inf",
    resource_type: "inferentia",
    instance_type: "inf2.24xlarge",
    gpu_type: "Inferentia2",
    gpu_count: 6,
    gpu_memory_gb: 192,
    hourly_rate: 6.49,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_inf",
    resource_type: "inferentia",
    instance_type: "inf2.48xlarge",
    gpu_type: "Inferentia2",
    gpu_count: 12,
    gpu_memory_gb: 384,
    hourly_rate: 12.98,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  // AWS Trainium
  {
    provider: "aws_trn",
    resource_type: "trainium",
    instance_type: "trn1.2xlarge",
    gpu_type: "Trainium1",
    gpu_count: 1,
    gpu_memory_gb: 32,
    hourly_rate: 1.34,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_trn",
    resource_type: "trainium",
    instance_type: "trn1.32xlarge",
    gpu_type: "Trainium1",
    gpu_count: 16,
    gpu_memory_gb: 512,
    hourly_rate: 21.50,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "aws_trn",
    resource_type: "trainium",
    instance_type: "trn2.48xlarge",
    gpu_type: "Trainium2",
    gpu_count: 16,
    gpu_memory_gb: 512,
    hourly_rate: 24.78,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 35,
    reserved_3yr_discount_pct: 55,
    region: "us-east-1",
    cloud_provider: "aws",
    status: "active",
    last_updated: "2025-12-01"
  },
  // Azure GPU Instances
  {
    provider: "azure_gpu",
    resource_type: "gpu",
    instance_type: "NC24ads_A100_v4",
    gpu_type: "A100-80GB",
    gpu_count: 1,
    gpu_memory_gb: 80,
    hourly_rate: 3.67,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 40,
    reserved_3yr_discount_pct: 60,
    region: "eastus",
    cloud_provider: "azure",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "azure_gpu",
    resource_type: "gpu",
    instance_type: "NC48ads_A100_v4",
    gpu_type: "A100-80GB",
    gpu_count: 2,
    gpu_memory_gb: 160,
    hourly_rate: 7.35,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 40,
    reserved_3yr_discount_pct: 60,
    region: "eastus",
    cloud_provider: "azure",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "azure_gpu",
    resource_type: "gpu",
    instance_type: "NC96ads_A100_v4",
    gpu_type: "A100-80GB",
    gpu_count: 4,
    gpu_memory_gb: 320,
    hourly_rate: 14.69,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 40,
    reserved_3yr_discount_pct: 60,
    region: "eastus",
    cloud_provider: "azure",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "azure_gpu",
    resource_type: "gpu",
    instance_type: "ND96isr_H100_v5",
    gpu_type: "H100-80GB",
    gpu_count: 8,
    gpu_memory_gb: 640,
    hourly_rate: 98.32,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 40,
    reserved_3yr_discount_pct: 60,
    region: "eastus",
    cloud_provider: "azure",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "azure_gpu",
    resource_type: "gpu",
    instance_type: "NC6s_v3",
    gpu_type: "V100",
    gpu_count: 1,
    gpu_memory_gb: 16,
    hourly_rate: 3.06,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 40,
    reserved_3yr_discount_pct: 60,
    region: "eastus",
    cloud_provider: "azure",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "azure_gpu",
    resource_type: "gpu",
    instance_type: "NC12s_v3",
    gpu_type: "V100",
    gpu_count: 2,
    gpu_memory_gb: 32,
    hourly_rate: 6.12,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 40,
    reserved_3yr_discount_pct: 60,
    region: "eastus",
    cloud_provider: "azure",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "azure_gpu",
    resource_type: "gpu",
    instance_type: "NC24s_v3",
    gpu_type: "V100",
    gpu_count: 4,
    gpu_memory_gb: 64,
    hourly_rate: 12.24,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 40,
    reserved_3yr_discount_pct: 60,
    region: "eastus",
    cloud_provider: "azure",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "azure_gpu",
    resource_type: "gpu",
    instance_type: "NV36ads_A10_v5",
    gpu_type: "A10",
    gpu_count: 1,
    gpu_memory_gb: 24,
    hourly_rate: 1.80,
    spot_discount_pct: 70,
    reserved_1yr_discount_pct: 40,
    reserved_3yr_discount_pct: 60,
    region: "eastus",
    cloud_provider: "azure",
    status: "active",
    last_updated: "2025-12-01"
  },
  // Self-hosted GPUs
  {
    provider: "self_hosted",
    resource_type: "gpu",
    instance_type: "local",
    gpu_type: "RTX4090",
    gpu_count: 1,
    gpu_memory_gb: 24,
    hourly_rate: 0.50,
    spot_discount_pct: 0,
    reserved_1yr_discount_pct: 0,
    reserved_3yr_discount_pct: 0,
    region: "on-prem",
    cloud_provider: "local",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "self_hosted",
    resource_type: "gpu",
    instance_type: "local",
    gpu_type: "RTX3090",
    gpu_count: 1,
    gpu_memory_gb: 24,
    hourly_rate: 0.30,
    spot_discount_pct: 0,
    reserved_1yr_discount_pct: 0,
    reserved_3yr_discount_pct: 0,
    region: "on-prem",
    cloud_provider: "local",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "self_hosted",
    resource_type: "gpu",
    instance_type: "local",
    gpu_type: "RTX4080",
    gpu_count: 1,
    gpu_memory_gb: 16,
    hourly_rate: 0.35,
    spot_discount_pct: 0,
    reserved_1yr_discount_pct: 0,
    reserved_3yr_discount_pct: 0,
    region: "on-prem",
    cloud_provider: "local",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "self_hosted",
    resource_type: "gpu",
    instance_type: "local",
    gpu_type: "RTX3080",
    gpu_count: 1,
    gpu_memory_gb: 10,
    hourly_rate: 0.20,
    spot_discount_pct: 0,
    reserved_1yr_discount_pct: 0,
    reserved_3yr_discount_pct: 0,
    region: "on-prem",
    cloud_provider: "local",
    status: "active",
    last_updated: "2025-12-01"
  },
  {
    provider: "self_hosted",
    resource_type: "gpu",
    instance_type: "local",
    gpu_type: "A6000",
    gpu_count: 1,
    gpu_memory_gb: 48,
    hourly_rate: 0.80,
    spot_discount_pct: 0,
    reserved_1yr_discount_pct: 0,
    reserved_3yr_discount_pct: 0,
    region: "on-prem",
    cloud_provider: "local",
    status: "active",
    last_updated: "2025-12-01"
  }
];

// Helper functions
export function getInfraPricingByProvider(provider: string): GenAIInfrastructurePricing[] {
  return GENAI_INFRASTRUCTURE_PRICING.filter(p => p.provider === provider);
}

export function getInfraPricingByGpuType(gpuType: string): GenAIInfrastructurePricing[] {
  return GENAI_INFRASTRUCTURE_PRICING.filter(p => p.gpu_type === gpuType);
}

export function getInfraPricingByResourceType(resourceType: string): GenAIInfrastructurePricing[] {
  return GENAI_INFRASTRUCTURE_PRICING.filter(p => p.resource_type === resourceType);
}

export function getInfraPricingByCloudProvider(cloudProvider: string): GenAIInfrastructurePricing[] {
  return GENAI_INFRASTRUCTURE_PRICING.filter(p => p.cloud_provider === cloudProvider);
}

export function getActiveInfraPricing(): GenAIInfrastructurePricing[] {
  return GENAI_INFRASTRUCTURE_PRICING.filter(p => p.status === 'active');
}

export function getInfraProviders(): string[] {
  return [...new Set(GENAI_INFRASTRUCTURE_PRICING.map(p => p.provider))];
}

export function getGpuTypes(): string[] {
  return [...new Set(GENAI_INFRASTRUCTURE_PRICING.map(p => p.gpu_type))];
}

export function calculateHourlyCost(
  pricing: GenAIInfrastructurePricing,
  hours: number,
  pricingType: 'on_demand' | 'spot' | 'reserved_1yr' | 'reserved_3yr' = 'on_demand'
): number {
  let rate = pricing.hourly_rate;

  switch (pricingType) {
    case 'spot':
      rate = rate * (1 - pricing.spot_discount_pct / 100);
      break;
    case 'reserved_1yr':
      rate = rate * (1 - pricing.reserved_1yr_discount_pct / 100);
      break;
    case 'reserved_3yr':
      rate = rate * (1 - pricing.reserved_3yr_discount_pct / 100);
      break;
  }

  return hours * rate;
}

export function calculateMonthlyCost(
  pricing: GenAIInfrastructurePricing,
  hoursPerDay: number = 24,
  pricingType: 'on_demand' | 'spot' | 'reserved_1yr' | 'reserved_3yr' = 'on_demand'
): number {
  const monthlyHours = hoursPerDay * 30;
  return calculateHourlyCost(pricing, monthlyHours, pricingType);
}
