/**
 * WAIaaS WalletConnect Spike
 *
 * Minimal Tauri 2 + @reown/appkit integration to verify:
 * 1. <w3m-modal> Web Component renders inside Tauri WebView
 * 2. WebSocket connects to wss://relay.walletconnect.com without CSP issues
 * 3. QR scan pairing + SIWS/SIWE signing works end-to-end
 */

import { createAppKit } from "@reown/appkit";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { mainnet, arbitrum, polygon } from "@reown/appkit/networks";
import { solana } from "@reown/appkit/networks";

// --- Logging utility ---

const logEl = document.getElementById("log")!;

function log(message: string, level: "info" | "success" | "error" = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${level}`;
  const ts = new Date().toISOString().split("T")[1].slice(0, 12);
  entry.textContent = `[${ts}] ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[spike:${level}] ${message}`);
}

// --- Project ID ---

const projectId = import.meta.env.VITE_WC_PROJECT_ID || "";

if (!projectId) {
  const warning = document.getElementById("env-warning")!;
  warning.style.display = "block";
  warning.textContent =
    "VITE_WC_PROJECT_ID not set. Get one from https://cloud.reown.com/ " +
    "and add VITE_WC_PROJECT_ID=xxx to packages/desktop-spike/.env";
  log("No projectId — UI will render but relay connection may fail", "error");
}

log(`projectId: ${projectId ? projectId.slice(0, 8) + "..." : "(empty)"}`);
log(`Environment: ${window.__TAURI_INTERNALS__ ? "Tauri Desktop" : "Browser"}`);

// --- Adapters ---

const solanaAdapter = new SolanaAdapter({
  wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
});

const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [mainnet, arbitrum, polygon],
});

log("Solana + Wagmi adapters created");

// --- AppKit ---

const metadata = {
  name: "WAIaaS Spike",
  description: "WalletConnect compatibility spike for Tauri Desktop",
  url: "https://waiaas.com",
  icons: ["https://waiaas.com/icon.png"],
};

let appKit: ReturnType<typeof createAppKit>;

try {
  appKit = createAppKit({
    adapters: [solanaAdapter, wagmiAdapter],
    networks: [mainnet, arbitrum, polygon, solana],
    projectId,
    metadata,
    features: {
      analytics: false,
    },
  });
  log("AppKit created successfully", "success");
} catch (err) {
  log(`AppKit creation failed: ${(err as Error).message}`, "error");
  throw err;
}

// --- Event subscriptions ---

appKit.subscribeEvents((event) => {
  log(`Event: ${event.data.event} ${JSON.stringify(event.data.properties || {})}`);
});

appKit.subscribeState((state) => {
  log(`State: open=${state.open} selectedNetworkId=${state.selectedNetworkId}`);
});

// Track connection status for sign button visibility
const signSection = document.getElementById("sign-section")!;

setInterval(() => {
  const address = appKit.getAddress();
  const isConnected = appKit.getIsConnectedState();
  if (isConnected && address) {
    signSection.classList.add("visible");
  } else {
    signSection.classList.remove("visible");
  }
}, 1000);

// --- Sign Message ---

const signBtn = document.getElementById("btn-sign-message") as HTMLButtonElement;

signBtn.addEventListener("click", async () => {
  signBtn.disabled = true;
  signBtn.textContent = "Signing...";

  try {
    const address = appKit.getAddress();
    const caipNetwork = appKit.getCaipNetwork();

    if (!address || !caipNetwork) {
      log("Not connected — cannot sign", "error");
      return;
    }

    log(`Requesting signature from ${address.slice(0, 10)}... on ${caipNetwork.name}`);

    const message = `WAIaaS Owner Verification\n\nAddress: ${address}\nTimestamp: ${new Date().toISOString()}\nNonce: ${Math.random().toString(36).slice(2)}`;

    // Use the universal provider to sign
    const provider = appKit.getWalletProvider();
    if (!provider) {
      log("No wallet provider available", "error");
      return;
    }

    // For EVM chains, use personal_sign
    if (caipNetwork.chainNamespace === "eip155") {
      const hexMessage = `0x${Array.from(new TextEncoder().encode(message))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`;
      const signature = await (provider as any).request({
        method: "personal_sign",
        params: [hexMessage, address],
      });
      log(`EVM Signature: ${(signature as string).slice(0, 20)}...`, "success");
    }
    // For Solana chains, use signMessage
    else if (caipNetwork.chainNamespace === "solana") {
      const encoded = new TextEncoder().encode(message);
      const signature = await (provider as any).signMessage(encoded, "utf8");
      const sigHex = Array.from(new Uint8Array(signature.signature || signature))
        .map((b: number) => b.toString(16).padStart(2, "0"))
        .join("");
      log(`Solana Signature: ${sigHex.slice(0, 20)}...`, "success");
    } else {
      log(`Unknown chain namespace: ${caipNetwork.chainNamespace}`, "error");
    }
  } catch (err) {
    log(`Sign failed: ${(err as Error).message}`, "error");
  } finally {
    signBtn.disabled = false;
    signBtn.textContent = "Sign Message";
  }
});

log("Spike app initialized — click Connect Wallet to begin", "info");

// --- Type augmentation for Tauri ---
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export {};
