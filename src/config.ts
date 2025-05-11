

// Resolve config file as much as possible, given that the tests will run on another machine
async function resolveConfig({config}: {config: string | object}): Promise<{config: object}> {
  // If config is a string, try to parse it as JSON
  if (typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch (error) {
      // If JSON parsing fails, treat it as a plain source string
      config = { source: config };
    }
  }

  // Process the validated input
  const result = {
    resolved: `Resolved: ${config.source}`,
    format: config.options?.format || 'json',
    timestamp: Date.now(),
  };

  return {config: result};
}