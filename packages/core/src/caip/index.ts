// CAIP-2 (chain ID)
export { Caip2Schema, type Caip2, type Caip2Params, parseCaip2, formatCaip2 } from './caip2.js';

// CAIP-19 (asset type)
export {
  Caip19AssetTypeSchema,
  Caip19Schema,
  type Caip19AssetType,
  type Caip19,
  type Caip19Params,
  parseCaip19,
  formatCaip19,
} from './caip19.js';

// Network map (CAIP-2 <-> NetworkType bidirectional)
export { CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, networkToCaip2, caip2ToNetwork } from './network-map.js';

// Asset helpers (native + token CAIP-19 generation)
export { nativeAssetId, tokenAssetId, isNativeAsset } from './asset-helpers.js';
