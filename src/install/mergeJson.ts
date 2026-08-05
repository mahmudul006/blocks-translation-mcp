/** Sets config[wrapperKey][key] = entry, preserving every other key. Creates the wrapper
 *  object if missing. Pure (returns a new object) and idempotent — re-running replaces only
 *  our own entry, never duplicating or touching neighbours. */
export function upsertMcpServer(
  config: Record<string, unknown>,
  key: string,
  entry: object,
  wrapperKey: 'mcpServers' | 'servers' | 'context_servers',
): Record<string, unknown> {
  const existingWrapper = (config[wrapperKey] as Record<string, unknown> | undefined) ?? {};
  return {
    ...config,
    [wrapperKey]: { ...existingWrapper, [key]: entry },
  };
}
