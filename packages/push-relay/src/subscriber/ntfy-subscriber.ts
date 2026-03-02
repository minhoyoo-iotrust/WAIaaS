import type { PushPayload, ParsedNtfyMessage } from './message-parser.js';
import { buildPushPayload, determineMessageType } from './message-parser.js';
import type { IPayloadTransformer } from '../transformer/payload-transformer.js';

const MAX_RECONNECT_DELAY_MS = 60_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

export interface NtfySubscriberOpts {
  ntfyServer: string;
  signTopicPrefix: string;
  notifyTopicPrefix: string;
  walletNames: string[];
  onMessage: (walletName: string, payload: PushPayload, topic: string) => Promise<void>;
  onError?: (error: Error) => void;
  transformer?: IPayloadTransformer;
  /** Per-wallet topic overrides (key: walletName). When set, uses these topics instead of prefix pattern. */
  topicOverrides?: Map<string, { signTopic: string; notifyTopic: string }>;
}

export class NtfySubscriber {
  private readonly opts: NtfySubscriberOpts;
  private readonly abortControllers = new Map<string, AbortController>();
  /** Reverse mapping: topic → walletName */
  private readonly topicWalletMap = new Map<string, string>();
  private readonly transformer?: IPayloadTransformer;
  private _connected = false;
  private _topicCount = 0;

  constructor(opts: NtfySubscriberOpts) {
    this.opts = opts;
    this.transformer = opts.transformer;
  }

  get connected(): boolean {
    return this._connected;
  }

  get topicCount(): number {
    return this._topicCount;
  }

  start(): void {
    for (const walletName of this.opts.walletNames) {
      const override = this.opts.topicOverrides?.get(walletName);
      const signTopic = override?.signTopic ?? `${this.opts.signTopicPrefix}-${walletName}`;
      const notifyTopic = override?.notifyTopic ?? `${this.opts.notifyTopicPrefix}-${walletName}`;

      this.subscribeTopic(signTopic, walletName);
      this.subscribeTopic(notifyTopic, walletName);
    }
    this._topicCount = this.opts.walletNames.length * 2;
    this._connected = true;
  }

  /** Dynamically add topics for a wallet (e.g. on device registration). */
  addTopics(walletName: string, signTopic: string, notifyTopic: string): void {
    if (!this.abortControllers.has(signTopic)) {
      this.subscribeTopic(signTopic, walletName);
      this._topicCount++;
    }
    if (!this.abortControllers.has(notifyTopic)) {
      this.subscribeTopic(notifyTopic, walletName);
      this._topicCount++;
    }
  }

  /** Dynamically remove topics (e.g. on device unregistration). */
  removeTopics(signTopic: string, notifyTopic: string): void {
    if (this.abortControllers.has(signTopic)) {
      this.abortControllers.get(signTopic)!.abort();
      this.abortControllers.delete(signTopic);
      this.topicWalletMap.delete(signTopic);
      this._topicCount--;
    }
    if (this.abortControllers.has(notifyTopic)) {
      this.abortControllers.get(notifyTopic)!.abort();
      this.abortControllers.delete(notifyTopic);
      this.topicWalletMap.delete(notifyTopic);
      this._topicCount--;
    }
  }

  async stop(): Promise<void> {
    this._connected = false;
    for (const [, controller] of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.topicWalletMap.clear();
  }

  private subscribeTopic(topic: string, walletName: string): void {
    const controller = new AbortController();
    this.abortControllers.set(topic, controller);
    this.topicWalletMap.set(topic, walletName);
    void this.connectSse(topic, walletName, controller, INITIAL_RECONNECT_DELAY_MS);
  }

  private async connectSse(
    topic: string,
    walletName: string,
    controller: AbortController,
    reconnectDelay: number,
  ): Promise<void> {
    if (controller.signal.aborted) return;

    try {
      const url = `${this.opts.ntfyServer}/${topic}/sse`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'text/event-stream' },
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed for ${topic}: HTTP ${String(res.status)}`);
      }

      // Reset reconnect delay on successful connection
      const nextDelay = INITIAL_RECONNECT_DELAY_MS;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          try {
            const ntfyMsg = JSON.parse(dataStr) as ParsedNtfyMessage;
            if (!ntfyMsg.message) continue;

            const effectiveTopic = ntfyMsg.topic ?? topic;
            const type = determineMessageType(
              effectiveTopic,
              this.opts.signTopicPrefix,
              this.opts.notifyTopicPrefix,
            );
            if (!type) continue;

            let payload = buildPushPayload(ntfyMsg, type);
            if (this.transformer) {
              payload = this.transformer.transform(payload);
            }
            void this.opts.onMessage(walletName, payload, effectiveTopic);
          } catch (err) {
            this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        }
      }

      // Stream ended normally — reconnect
      if (!controller.signal.aborted) {
        await this.delay(nextDelay);
        return this.connectSse(topic, walletName, controller, nextDelay);
      }
    } catch (_err) {
      if (controller.signal.aborted) return;

      this.opts.onError?.(
        _err instanceof Error ? _err : new Error(String(_err)),
      );

      // Exponential backoff reconnect
      const nextDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      await this.delay(reconnectDelay);
      return this.connectSse(topic, walletName, controller, nextDelay);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }
    });
  }
}
