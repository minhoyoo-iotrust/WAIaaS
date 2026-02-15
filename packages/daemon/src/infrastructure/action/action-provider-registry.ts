/**
 * ActionProviderRegistry -- manages IActionProvider registration, lookup, and execution.
 *
 * Responsibilities:
 * 1. Register/unregister IActionProvider implementations with Zod validation
 * 2. Look up providers and actions by name (providerName/actionName key format)
 * 3. Execute resolve() with input validation + return value re-validation
 * 4. Load ESM plugins from ~/.waiaas/actions/ directory
 *
 * Design source: doc 62 (action-provider-architecture).
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  WAIaaSError,
  ContractCallRequestSchema,
  ActionProviderMetadataSchema,
  ActionDefinitionSchema,
  type IActionProvider,
  type ActionDefinition,
  type ActionContext,
  type ContractCallRequest,
  type ActionProviderMetadata,
} from '@waiaas/core';

/**
 * ActionProviderRegistry manages provider registration, action lookup,
 * and resolve() execution with schema validation.
 */
export class ActionProviderRegistry {
  private readonly providers = new Map<string, IActionProvider>();
  private readonly actions = new Map<
    string,
    { provider: IActionProvider; action: ActionDefinition }
  >();

  /**
   * Register an IActionProvider implementation.
   * Validates metadata and action definitions with Zod schemas.
   * Checks inputSchema duck typing (parse/safeParse functions).
   * @throws WAIaaSError('ACTION_NAME_CONFLICT') if provider name is already registered.
   */
  register(provider: IActionProvider): void {
    // Validate metadata via Zod SSoT
    const metadata = ActionProviderMetadataSchema.parse(provider.metadata);

    // Check name conflict
    if (this.providers.has(metadata.name)) {
      throw new WAIaaSError('ACTION_NAME_CONFLICT', {
        message: `Action provider '${metadata.name}' is already registered`,
        details: { providerName: metadata.name },
      });
    }

    // Validate each action definition
    for (const action of provider.actions) {
      ActionDefinitionSchema.parse(action);

      // Duck-typing validation for inputSchema (cross-zod-version compatibility)
      if (
        typeof action.inputSchema?.parse !== 'function' ||
        typeof action.inputSchema?.safeParse !== 'function'
      ) {
        throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
          message: `Action '${action.name}' inputSchema must have parse() and safeParse() methods`,
          details: { providerName: metadata.name, actionName: action.name },
        });
      }

      // Register action with providerName/actionName key
      const actionKey = `${metadata.name}/${action.name}`;
      this.actions.set(actionKey, { provider, action });
    }

    this.providers.set(metadata.name, provider);
  }

  /**
   * Unregister a provider and all its actions.
   * @returns true if the provider was found and removed, false otherwise.
   */
  unregister(providerName: string): boolean {
    const provider = this.providers.get(providerName);
    if (!provider) return false;

    // Remove all actions belonging to this provider
    for (const action of provider.actions) {
      this.actions.delete(`${providerName}/${action.name}`);
    }

    this.providers.delete(providerName);
    return true;
  }

  /**
   * Get a registered provider by name.
   */
  getProvider(name: string): IActionProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get an action entry by key (providerName/actionName).
   */
  getAction(
    key: string,
  ): { provider: IActionProvider; action: ActionDefinition } | undefined {
    return this.actions.get(key);
  }

  /**
   * List metadata for all registered providers.
   */
  listProviders(): ActionProviderMetadata[] {
    return Array.from(this.providers.values()).map((p) => p.metadata);
  }

  /**
   * List actions, optionally filtered by provider name.
   */
  listActions(
    providerName?: string,
  ): { providerName: string; action: ActionDefinition }[] {
    const result: { providerName: string; action: ActionDefinition }[] = [];
    for (const [key, entry] of this.actions) {
      const pName = key.split('/')[0];
      if (providerName && pName !== providerName) continue;
      result.push({ providerName: pName, action: entry.action });
    }
    return result;
  }

  /**
   * Get actions from providers with mcpExpose=true.
   */
  getMcpExposedActions(): {
    provider: IActionProvider;
    action: ActionDefinition;
  }[] {
    const result: { provider: IActionProvider; action: ActionDefinition }[] = [];
    for (const entry of this.actions.values()) {
      if (entry.provider.metadata.mcpExpose) {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * Execute an action's resolve() with full validation pipeline:
   * 1. Lookup action by key
   * 2. Validate input params via action.inputSchema.parse()
   * 3. Call provider.resolve()
   * 4. Re-validate result via ContractCallRequestSchema.parse()
   *
   * @throws WAIaaSError('ACTION_NOT_FOUND') if action key not found
   * @throws WAIaaSError('ACTION_VALIDATION_FAILED') if input validation fails
   * @throws WAIaaSError('ACTION_RETURN_INVALID') if resolve() return value is invalid
   */
  async executeResolve(
    actionKey: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    // 1. Lookup action
    const entry = this.actions.get(actionKey);
    if (!entry) {
      throw new WAIaaSError('ACTION_NOT_FOUND', {
        message: `Action '${actionKey}' not found`,
        details: { actionKey },
      });
    }

    // 2. Validate input params
    try {
      entry.action.inputSchema.parse(params);
    } catch (err) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `Input validation failed for action '${actionKey}'`,
        details: { actionKey, validationErrors: (err as Error).message },
        cause: err as Error,
      });
    }

    // 3. Call provider.resolve()
    const result = await entry.provider.resolve(
      entry.action.name,
      params,
      context,
    );

    // 4. Re-validate return value (prevent policy bypass)
    try {
      return ContractCallRequestSchema.parse(result);
    } catch (err) {
      throw new WAIaaSError('ACTION_RETURN_INVALID', {
        message: `Resolve return value schema validation failed for action '${actionKey}'`,
        details: { actionKey },
        cause: err as Error,
      });
    }
  }

  /**
   * Load ESM plugins from a directory. Each subdirectory is a plugin.
   * Individual plugin failures are logged and skipped (fail-open).
   *
   * @returns Object with loaded/failed plugin names.
   */
  async loadPlugins(
    actionsDir: string,
  ): Promise<{ loaded: string[]; failed: string[] }> {
    const loaded: string[] = [];
    const failed: string[] = [];

    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(actionsDir, { withFileTypes: true });
    } catch {
      // Directory doesn't exist or not readable -- not an error
      return { loaded, failed };
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await this.loadSinglePlugin(
          join(actionsDir, entry.name),
          entry.name,
        );
        loaded.push(entry.name);
      } catch (error) {
        console.warn(
          `Plugin load failed (skipped): ${entry.name}`,
          error instanceof Error ? error.message : error,
        );
        failed.push(entry.name);
      }
    }

    return { loaded, failed };
  }

  /**
   * Load a single ESM plugin from a directory.
   */
  private async loadSinglePlugin(
    pluginDir: string,
    pluginName: string,
  ): Promise<void> {
    // 1. Read package.json
    const pkgPath = join(pluginDir, 'package.json');
    let pkg: { type?: string; main?: string };
    try {
      const raw = await readFile(pkgPath, 'utf-8');
      pkg = JSON.parse(raw);
    } catch {
      throw new Error(
        `Plugin '${pluginName}': package.json not found or invalid`,
      );
    }

    // Verify ESM module
    if (pkg.type !== 'module') {
      throw new Error(
        `Plugin '${pluginName}': package.json must have "type": "module"`,
      );
    }

    // 2. Determine entry point
    const mainFile = pkg.main || 'index.js';
    const mainPath = join(pluginDir, mainFile);

    // 3. ESM dynamic import via file:// URL
    const moduleUrl = pathToFileURL(mainPath).href;
    const module = await import(moduleUrl);

    // 4. Extract default export
    let provider: IActionProvider;
    const defaultExport = module.default;

    if (!defaultExport) {
      throw new Error(
        `Plugin '${pluginName}': no default export found`,
      );
    }

    // Handle class (constructor), factory function, or plain object
    if (typeof defaultExport === 'function') {
      try {
        // Try as constructor (class)
        provider = new defaultExport();
      } catch {
        // Fall back to factory function
        provider = defaultExport();
      }
    } else {
      provider = defaultExport;
    }

    // 5. Register (validates metadata/actions via Zod)
    this.register(provider);
  }
}
