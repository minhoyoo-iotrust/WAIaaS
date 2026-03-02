import type { PushPayload, ParsedNtfyMessage } from './message-parser.js';
import { buildPushPayload, determineMessageType } from './message-parser.js';
import type { IPayloadTransformer } from '../transformer/payload-transformer.js';
import { createUnzip, createBrotliDecompress } from 'node:zlib';
import type { Transform } from 'node:stream';

const MAX_RECONNECT_DELAY_MS = 60_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

/**
 * Detect if a chunk is likely compressed by checking if the first byte
 * is NOT a valid SSE line starter (event, data, id, retry, comment, empty).
 *
 * This is more reliable than checking Content-Encoding headers because
 * Node.js undici may auto-decompress, strip headers, or leave data compressed
 * inconsistently depending on the environment (#222, #235, #236).
 */
export function isLikelyCompressed(chunk: Uint8Array): boolean {
  if (chunk.length === 0) return false;
  const b0 = chunk[0]!;
  // Valid SSE first bytes: e(0x65=event), d(0x64=data), i(0x69=id),
  // r(0x72=retry), :(0x3a=comment), \n(0x0a=empty line), space(0x20)
  return b0 !== 0x65 && b0 !== 0x64 && b0 !== 0x69
    && b0 !== 0x72 && b0 !== 0x3a && b0 !== 0x0a && b0 !== 0x20;
}

/**
 * Select appropriate decompressor based on data content and optional header hint.
 * Returns null if data appears uncompressed.
 */
export function selectDecompressor(
  firstChunk: Uint8Array,
  contentEncoding: string | null,
): Transform | null {
  if (!isLikelyCompressed(firstChunk)) return null;

  // Brotli can only be detected via header (no reliable magic bytes)
  if (contentEncoding === 'br') return createBrotliDecompress();

  // createUnzip auto-detects gzip vs zlib-wrapped deflate
  return createUnzip();
}

export interface NtfySubscriberOpts {
  ntfyServer: string;
  signTopicPrefix: string;
  notifyTopicPrefix: string;
  walletNames: string[];
  onMessage: (walletName: string, payload: PushPayload) => Promise<void>;
  onError?: (error: Error) => void;
  transformer?: IPayloadTransformer;
  /** Per-wallet topic overrides (key: walletName). When set, uses these topics instead of prefix pattern. */
  topicOverrides?: Map<string, { signTopic: string; notifyTopic: string }>;
}

export class NtfySubscriber {
  private readonly opts: NtfySubscriberOpts;
  private readonly abortControllers = new Map<string, AbortController>();
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
      const res = await fetch(url, {
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed for ${topic}: HTTP ${res.status}`);
      }

      // Reset reconnect delay on successful connection
      const nextDelay = INITIAL_RECONNECT_DELAY_MS;

      // Peek first chunk for magic-bytes compression detection (#236).
      // This replaces Content-Encoding header checks which are unreliable
      // because undici may auto-decompress, strip headers, or leave data
      // compressed depending on the CDN/network environment.
      const rawReader = (res.body as ReadableStream<Uint8Array>).getReader();
      const { done: firstDone, value: firstChunk } = await rawReader.read();

      if (firstDone || !firstChunk || firstChunk.length === 0) {
        // Empty response — reconnect
        if (!controller.signal.aborted) {
          await this.delay(nextDelay);
          return this.connectSse(topic, walletName, controller, nextDelay);
        }
        return;
      }

      const contentEncoding = res.headers.get('content-encoding');
      const decompressor = selectDecompressor(firstChunk, contentEncoding);

      let reader: ReadableStreamDefaultReader<Uint8Array>;

      if (decompressor) {
        reader = this.buildDecompressedReader(firstChunk, rawReader, decompressor, controller);
      } else {
        reader = this.buildPassthroughReader(firstChunk, rawReader);
      }

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

  /**
   * Build a decompressed reader by piping raw chunks through a zlib decompressor.
   * Feeds firstChunk immediately, then pumps remaining chunks asynchronously.
   */
  private buildDecompressedReader(
    firstChunk: Uint8Array,
    rawReader: ReadableStreamDefaultReader<Uint8Array>,
    decompressor: Transform,
    controller: AbortController,
  ): ReadableStreamDefaultReader<Uint8Array> {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        decompressor.on('data', (chunk: Buffer) => {
          try { c.enqueue(new Uint8Array(chunk)); } catch { /* closed */ }
        });
        decompressor.on('end', () => {
          try { c.close(); } catch { /* closed */ }
        });
        decompressor.on('error', (err) => {
          try { c.error(err); } catch { /* closed */ }
        });

        // Clean up on abort
        controller.signal.addEventListener('abort', () => {
          decompressor.destroy();
          try { c.close(); } catch { /* closed */ }
        }, { once: true });

        // Feed first chunk
        decompressor.write(Buffer.from(firstChunk));

        // Pump remaining raw chunks into decompressor
        void (async () => {
          try {
            while (!controller.signal.aborted) {
              const { done, value } = await rawReader.read();
              if (done) {
                decompressor.end();
                break;
              }
              decompressor.write(Buffer.from(value));
            }
          } catch {
            decompressor.destroy();
          }
        })();
      },
    });
    return stream.getReader();
  }

  /**
   * Build a pass-through reader that yields firstChunk first, then remaining chunks.
   */
  private buildPassthroughReader(
    firstChunk: Uint8Array,
    rawReader: ReadableStreamDefaultReader<Uint8Array>,
  ): ReadableStreamDefaultReader<Uint8Array> {
    let firstConsumed = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (!firstConsumed) {
          firstConsumed = true;
          c.enqueue(firstChunk);
          return;
        }
        return rawReader.read().then(({ done, value }) => {
          if (done) {
            c.close();
          } else {
            c.enqueue(value);
          }
        });
      },
    });
    return stream.getReader();
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
