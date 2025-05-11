/**
 * Resolver - Transform source files into resolved tests.
 * 
 * This is the main entry point for the resolver module.
 */

/**
 * Simple example function to demonstrate ES module format
 */
export function resolve(input: string): string {
  return `Resolved: ${input}`;
}

/**
 * Default export for easier importing
 */
export default {
  resolve
};
