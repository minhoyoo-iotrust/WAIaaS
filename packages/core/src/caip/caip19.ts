import { z } from 'zod';

// CAIP-19 asset type: chainId/assetNamespace:assetReference
// chainId = CAIP-2 (namespace:reference)
// assetNamespace = [-a-z0-9]{3,8}
// assetReference = [-.%a-zA-Z0-9]{1,128}
// Source: standards.chainagnostic.org/CAIPs/caip-19
export const Caip19AssetTypeSchema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/,
  'Invalid CAIP-19 asset type format (expected chainId/namespace:reference)',
);
export type Caip19AssetType = z.infer<typeof Caip19AssetTypeSchema>;

// Convenience alias: WAIaaS only handles fungible tokens -> AssetType is sufficient
export const Caip19Schema = Caip19AssetTypeSchema;
export type Caip19 = Caip19AssetType;

export interface Caip19Params {
  chainId: string;        // CAIP-2 chain ID
  assetNamespace: string; // e.g., "slip44", "erc20", "token"
  assetReference: string; // e.g., "60", "0xa0b8...", "EPjF..."
}

export function parseCaip19(assetType: string): Caip19Params {
  Caip19AssetTypeSchema.parse(assetType);
  const slashIdx = assetType.indexOf('/');
  const chainId = assetType.slice(0, slashIdx);
  const assetPart = assetType.slice(slashIdx + 1);
  const colonIdx = assetPart.indexOf(':');
  return {
    chainId,
    assetNamespace: assetPart.slice(0, colonIdx),
    assetReference: assetPart.slice(colonIdx + 1),
  };
}

export function formatCaip19(
  chainId: string,
  assetNamespace: string,
  assetReference: string,
): string {
  const result = `${chainId}/${assetNamespace}:${assetReference}`;
  Caip19AssetTypeSchema.parse(result);
  return result;
}
