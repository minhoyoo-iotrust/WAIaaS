/**
 * ERC-8128 Signature-Input builder and Signature Base construction
 *
 * Implements RFC 9421 Structured Fields format for Signature-Input header
 * and Signature Base construction per section 2.5.
 */
import { SIGNATURE_LABEL } from './constants.js';

export interface BuildSignatureInputParams {
  coveredComponents: string[];
  keyid: string;
  algorithm: string;
  created: number;
  expires: number;
  nonce?: string;
}

/**
 * Build the RFC 9421 Signature-Input header value.
 *
 * Format: sig1=("@method" "@target-uri" ...);created=T;keyid="...";alg="...";expires=T[;nonce="..."]
 */
export function buildSignatureInput(params: BuildSignatureInputParams): string {
  const { coveredComponents, keyid, algorithm, created, expires, nonce } =
    params;

  // Component list: each quoted in double quotes, space-separated, wrapped in parens
  const componentList = coveredComponents
    .map((c) => `"${c}"`)
    .join(' ');

  // Build parameters
  let paramStr = '';
  paramStr += `;created=${created}`;
  paramStr += `;keyid="${keyid}"`;
  paramStr += `;alg="${algorithm}"`;
  paramStr += `;expires=${expires}`;

  if (nonce !== undefined) {
    paramStr += `;nonce="${nonce}"`;
  }

  return `${SIGNATURE_LABEL}=(${componentList})${paramStr}`;
}

export interface BuildSignatureBaseParams {
  method: string;
  url: string;
  headers: Record<string, string>;
  coveredComponents: string[];
  signatureInput: string;
}

/**
 * Resolve a derived component (prefixed with @) to its value.
 */
function resolveDerivedComponent(
  component: string,
  method: string,
  url: string,
): string {
  const parsedUrl = new URL(url);

  switch (component) {
    case '@method':
      return method.toUpperCase();
    case '@target-uri':
      return url;
    case '@authority': {
      const hostname = parsedUrl.hostname.toLowerCase();
      const port = parsedUrl.port;
      // Include port only if non-default (not 80 for http, not 443 for https)
      if (port) {
        return `${hostname}:${port}`;
      }
      return hostname;
    }
    case '@request-target': {
      return parsedUrl.pathname + parsedUrl.search;
    }
    default:
      throw new Error(`Unknown derived component: ${component}`);
  }
}

/**
 * Build the RFC 9421 Signature Base (section 2.5).
 *
 * Each covered component gets its own line: "component-id": value
 * Final line: "@signature-params": <inner-list-portion>
 * Lines separated by \n, no trailing newline.
 */
export function buildSignatureBase(params: BuildSignatureBaseParams): string {
  const { method, url, headers, coveredComponents, signatureInput } = params;

  // Build lowercase header map for case-insensitive lookups
  const headerMap = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    headerMap.set(key.toLowerCase(), value);
  }

  const lines: string[] = [];

  for (const component of coveredComponents) {
    let value: string;

    if (component.startsWith('@')) {
      // Derived component
      value = resolveDerivedComponent(component, method, url);
    } else {
      // Regular header (case-insensitive lookup)
      const headerValue = headerMap.get(component.toLowerCase());
      if (headerValue === undefined) {
        throw new Error(
          `Header "${component}" not found in request headers`,
        );
      }
      value = headerValue;
    }

    lines.push(`"${component}": ${value}`);
  }

  // Final line: @signature-params with inner list (everything after "sig1=")
  const innerList = signatureInput.replace(`${SIGNATURE_LABEL}=`, '');
  lines.push(`"@signature-params": ${innerList}`);

  return lines.join('\n');
}
