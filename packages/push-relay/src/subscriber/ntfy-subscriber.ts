import type { PushPayload, ParsedNtfyMessage } from './message-parser.js';
import { buildPushPayload, determineMessageType } from './message-parser.js';

const MAX_RECONNECT_DELAY_MS = 60_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

export interface NtfySubscriberOpts {
  ntfyServer: string;
  signTopicPrefix: string;
  notifyTopicPrefix: string;
  walletNames: string[];
  onMessage: (walletName: string, payload: PushPayload) => Promise<void>;
  onError?: (error: Error) => void;
}

export class NtfySubscriber {
  private readonly opts: NtfySubscriberOpts;
  private readonly abortControllers = new Map<string, AbortController>();
  private _connected = false;
  private _topicCount = 0;

  constructor(opts: NtfySubscriberOpts) {
    this.opts = opts;
  }

  get connected(): boolean {
    return this._connected;
  }

  get topicCount(): number {
    return this._topicCount;
  }

  start(): void {
    for (const walletName of this.opts.walletNames) {
      const signTopic = `${this.opts.signTopicPrefix}-${walletName}`;
      const notifyTopic = `${this.opts.notifyTopicPrefix}-${walletName}`;

      this.subscribeTopic(signTopic, walletName);
      this.subscribeTopic(notifyTopic, walletName);
    }
    this._topicCount = this.opts.walletNames.length * 2;
    this._connected = true;
  }

  async stop(): Promise<void> {
    this._connected = false;
    for (const [, controller] of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
  }

  private subscribeTopic(topic: string, walletName: string): void {
    const controller = new AbortController();
    this.abortControllers.set(topic, controller);
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
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed for ${topic}: HTTP ${res.status}`);
      }

      // Reset reconnect delay on successful connection
      const nextDelay = INITIAL_RECONNECT_DELAY_MS;

      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
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

            const payload = buildPushPayload(ntfyMsg, type);
            await this.opts.onMessage(walletName, payload);
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
