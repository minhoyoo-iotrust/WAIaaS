/**
 * E2E Test Type System
 *
 * Defines scenario types, result tracking, and a registry for organizing
 * offchain and onchain E2E test scenarios.
 */

/** Track distinguishes offchain (no real blockchain) from onchain (real testnet) scenarios. */
export type Track = 'offchain' | 'onchain';

/** Status of a completed scenario execution. */
export type ScenarioStatus = 'passed' | 'failed' | 'skipped';

/** Describes an E2E test scenario. */
export interface E2EScenario {
  /** Unique ID (e.g., 'auth-session-crud') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Track: offchain or onchain */
  track: Track;
  /** Category (e.g., 'core', 'interface', 'advanced', 'transfer') */
  category: string;
  /** Scenario description */
  description: string;
  /** Required networks for onchain scenarios */
  networks?: string[];
  /** Required protocols for onchain scenarios */
  protocols?: string[];
}

/** Result of executing a single scenario. */
export interface ScenarioResult {
  scenario: E2EScenario;
  status: ScenarioStatus;
  durationMs: number;
  error?: string;
  skipReason?: string;
}

/**
 * Registry for managing E2E scenarios.
 * Supports registration, lookup by ID/track/category, and enumeration.
 */
export class ScenarioRegistry {
  private scenarios: Map<string, E2EScenario> = new Map();

  /** Register a scenario. Throws if duplicate ID. */
  register(scenario: E2EScenario): void {
    if (this.scenarios.has(scenario.id)) {
      throw new Error(`Scenario '${scenario.id}' already registered`);
    }
    this.scenarios.set(scenario.id, scenario);
  }

  /** Get a scenario by ID. */
  get(id: string): E2EScenario | undefined {
    return this.scenarios.get(id);
  }

  /** Get all scenarios matching a track. */
  getByTrack(track: Track): E2EScenario[] {
    return [...this.scenarios.values()].filter((s) => s.track === track);
  }

  /** Get all scenarios matching a category. */
  getByCategory(category: string): E2EScenario[] {
    return [...this.scenarios.values()].filter((s) => s.category === category);
  }

  /** Get all registered scenarios. */
  all(): E2EScenario[] {
    return [...this.scenarios.values()];
  }
}

/** Global scenario registry instance. */
export const registry = new ScenarioRegistry();
