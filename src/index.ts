/**
 * Resolver - Transform source files (structured or unstructured) into resolved Doc Detective tests.
 * 
 * This is the main entry point for the resolver module.
 * 
 * There are two main functions:
 * 1. `detectTests`: Detects tests from source files/directories.
 * 2. `resolveTests`: Resolves the detected tests into a structured format.
 * 
 * This module adapts behaviors from doc-detective-core and is designed to be used as a library within `core` or independently.
 * 
 * Overall flow:
 * 1. Resolve configuration.
 * 2. Qualify source files for inclusion based on the configuration.
 * 3. Detect tests from the source files.
 * 4. Resolve the detected tests into a fully-formed test structure.
*/




import { parseInput, parseOutput, type Input, type Output } from './schemas.js';

// /**
//  * Resolves input data using Zod for validation
//  * 
//  * @param input - The input string or object to resolve
//  * @returns A resolved output object
//  */
// export function resolve(input: string | Input): Output {
//   // Parse and validate input
//   let validatedInput: Input;
  
//   if (typeof input === 'string') {
//     try {
//       // If input is a string, try to parse it as JSON
//       validatedInput = parseInput(JSON.parse(input));
//     } catch (error) {
//       // If JSON parsing fails, treat it as a plain source string
//       validatedInput = parseInput({ source: input });
//     }
//   } else {
//     validatedInput = parseInput(input);
//   }
  
//   // Process the validated input
//   const result: Output = {
//     resolved: `Resolved: ${validatedInput.source}`,
//     format: validatedInput.options.format,
//     timestamp: Date.now(),
//   };
  
//   // Validate the output before returning
//   return parseOutput(result);
// }

/**
 * Default export for easier importing
 */
export default {
  resolve
};
