import type { PushPayload } from '../providers/push-provider.js';
import type { PayloadConfig } from '../config.js';

export interface IPayloadTransformer {
  transform(payload: PushPayload): PushPayload;
}

export class ConfigurablePayloadTransformer implements IPayloadTransformer {
  private readonly staticFields: Record<string, string>;
  private readonly categoryMap: Record<string, Record<string, string>>;

  constructor(config: PayloadConfig) {
    this.staticFields = config.static_fields;
    this.categoryMap = config.category_map;
  }

  transform(payload: PushPayload): PushPayload {
    // Merge order: static_fields (lowest) → category_map → original data (highest)
    const categoryFields = this.categoryMap[payload.category] ?? {};
    const mergedData = {
      ...this.staticFields,
      ...categoryFields,
      ...payload.data,
    };

    return {
      ...payload,
      data: mergedData,
    };
  }
}
