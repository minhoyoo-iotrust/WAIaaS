import type { DeviceRecord } from './registry/device-registry.js';

export interface TopicRoutingResult {
  action: 'skip_base' | 'skip_unknown' | 'skip_no_device' | 'unicast';
  subscriptionToken?: string;
  device?: DeviceRecord;
}

/**
 * Determine routing for an incoming ntfy message based on its topic.
 *
 * - Base topics (waiaas-sign-{wallet}, waiaas-notify-{wallet}) → skip (no broadcast)
 * - Device topics (waiaas-sign-{wallet}-{token}) → unicast to the matching device
 * - Unknown topic format → skip
 */
export function routeByTopic(
  walletName: string,
  topic: string,
  signTopicPrefix: string,
  notifyTopicPrefix: string,
  getDevice: (subscriptionToken: string) => DeviceRecord | null,
): TopicRoutingResult {
  const signBase = `${signTopicPrefix}-${walletName}`;
  const notifyBase = `${notifyTopicPrefix}-${walletName}`;

  // Skip base topics — no broadcast
  if (topic === signBase || topic === notifyBase) {
    return { action: 'skip_base' };
  }

  // Extract subscriptionToken from device topic suffix
  let subscriptionToken: string | undefined;
  if (topic.startsWith(`${signBase}-`)) {
    subscriptionToken = topic.slice(signBase.length + 1);
  } else if (topic.startsWith(`${notifyBase}-`)) {
    subscriptionToken = topic.slice(notifyBase.length + 1);
  }

  if (!subscriptionToken) {
    return { action: 'skip_unknown' };
  }

  const device = getDevice(subscriptionToken);
  if (!device) {
    return { action: 'skip_no_device', subscriptionToken };
  }

  return { action: 'unicast', subscriptionToken, device };
}
