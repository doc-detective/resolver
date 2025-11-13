/**
 * Dynamic documentation analyzer with interactive execution.
 * Analyzes documentation text and iteratively executes and refines Doc Detective steps
 * using browser context and LLM guidance.
 */

const { analyze } = require('../analyzer-api');
const { extractBrowserContext } = require('./browser-context');
const { buildDynamicPrompt } = require('./dynamic-prompt-builder');
const { executeStepWithRetry, validateStepPreExecution } = require('./step-executor');
const {
  queryLowConfidenceStep,
  queryInsertStep,
  queryCredentials,
  queryStepFailure,
  queryInitialUrl
} = require('./user-query');
const { analyzeSegment } = require('../llm/provider');
const { validate, schemas } = require('doc-detective-common');
const { randomUUID } = require('crypto');

// Import from doc-detective-core (will be available after npm install)
let coreRunStep;
try {
  const core = require('doc-detective-core');
  coreRunStep = core.runStep;
} catch (error) {
  console.warn('doc-detective-core not available. Step execution will be limited.');
  // Fallback mock for development
  coreRunStep = async () => ({ status: 'PASS', description: 'Mock execution' });
}

/**
 * Dynamically analyzes documentation with interactive execution and step refinement.
 * 
 * @param {string} document - Documentation text to analyze
 * @param {Object} config - Configuration object
 * @param {string} config.provider - LLM provider ('anthropic', 'openai', 'google', 'local')
 * @param {string} config.apiKey - API key for the provider
 * @param {string} config.model - Model name (optional)
 * @param {number} config.temperature - Temperature for LLM (default: 0.3)
 * @param {number} config.userQueryThreshold - Confidence threshold for user queries (default: 0.7)
 * @param {number} config.maxRetries - Maximum retries per step (default: 3)
 * @param {boolean} config.useLlmRefinement - Use LLM for step refinement (default: false)
 * @param {string} config.envFilePath - Path to .env file for credentials (default: '.env')
 * @param {Object} DocDetectiveRunner - Doc Detective runner instance
 * @returns {Promise<Object>} Result object with test and metadata
 * @returns {Object} .test - Canonical Doc Detective test object
 * @returns {Object} .metadata - Execution metadata
 */
async function dynamicAnalyze({document, config, DocDetectiveRunner}) {
  const startTime = Date.now();
  
  // Set defaults
  const userQueryThreshold = config.userQueryThreshold || 0.7;
  const maxRetries = config.maxRetries || 3;
  const useLlmRefinement = config.useLlmRefinement || false;
  const envFilePath = config.envFilePath || '.env';

  // Metadata tracking
  const metadata = {
    startTime: new Date().toISOString(),
    tokenUsage: {
      prompt: 0,
      completion: 0,
      total: 0
    },
    retries: 0,
    userInterventions: [],
    executionTime: 0,
    stepsAnalyzed: 0,
    stepsExecuted: 0,
    stepsFailed: 0,
    stepsSkipped: 0
  };

  // Initialize test structure
  const test = {
    testId: randomUUID(),
    description: `Dynamic test generated from: "${document.substring(0, 100)}..."`,
    steps: [],
    contexts: [{
      platform: process.platform === 'darwin' ? 'mac' : (process.platform === 'win32' ? 'windows' : 'linux'),
      browser: { name: 'chrome' } // Default, should be detected from driver
    }]
  };

  const completedSteps = [];
  const credentialsDetected = new Set();
  let hasLoadVariablesStep = false;

  try {
    console.log('\n' + '='.repeat(80));
    console.log('DYNAMIC DOCUMENTATION ANALYSIS');
    console.log('='.repeat(80));
    console.log(`\nDocument: "${document.substring(0, 200)}${document.length > 200 ? '...' : ''}"\n`);

    // Step 1: Initial static analysis to get rough steps
    console.log('Step 1: Performing initial static analysis...');
    const staticAnalysis = await analyze(document, config);
    metadata.stepsAnalyzed = staticAnalysis.steps.length;
    
    // Aggregate token usage from static analysis
    if (staticAnalysis.summary) {
      metadata.tokenUsage.prompt += staticAnalysis.summary.totalTokens || 0;
      metadata.tokenUsage.total += staticAnalysis.summary.totalTokens || 0;
    }

    console.log(`Found ${staticAnalysis.steps.length} rough steps from static analysis.\n`);

    // Check if any interactive steps appear before a goTo step
    // Interactive steps that require a page to be loaded: find, click, screenshot, record, type
    let needsInitialNavigation = false;
    if (staticAnalysis.steps.length > 0) {
      for (let i = 0; i < staticAnalysis.steps.length; i++) {
        const step = staticAnalysis.steps[i];
        
        // If we encounter a goTo, we don't need initial navigation
        if (step.goTo) {
          needsInitialNavigation = false;
          break;
        }
        
        // If we encounter an interactive step before any goTo, we need initial navigation
        if (step.find || step.click || step.screenshot || step.record || step.type) {
          needsInitialNavigation = true;
          break;
        }
      }
    }

    if (needsInitialNavigation) {
      // Try to extract URL from document
      const urlMatch = document.match(/https?:\/\/[^\s]+/);
      const suggestedUrl = urlMatch ? urlMatch[0] : null;
      
      const urlResult = await queryInitialUrl(suggestedUrl, document);
      metadata.userInterventions.push({
        type: 'initial_url',
        timestamp: new Date().toISOString(),
        result: urlResult
      });

      if (urlResult.action === 'abort') {
        throw new Error('Analysis aborted by user during URL selection');
      }

      // Create initial navigation step
      const goToStep = {
        stepId: randomUUID(),
        goTo: urlResult.url,
        description: `Navigate to ${urlResult.url}`
      };

      // Navigate
      await DocDetectiveRunner.runStep({step: goToStep, driver: DocDetectiveRunner.driver});
      console.log(`Navigated to: ${urlResult.url}\n`);

      // Add goTo step at beginning
      completedSteps.push(goToStep);
    }

    // Step 2: Iterate through rough steps and refine with browser context
    console.log('Step 2: Iteratively refining and executing steps...\n');

    for (let i = 0; i < staticAnalysis.steps.length; i++) {
      const roughStep = staticAnalysis.steps[i];
      console.log(`\n--- Processing Rough Step ${i + 1}/${staticAnalysis.steps.length} ---`);
      console.log(`Rough step: ${JSON.stringify(roughStep)}\n`);

      // Extract browser context
      console.log('Extracting browser context...');
      const browserContext = await extractBrowserContext(DocDetectiveRunner.driver);
      console.log(`Current page: ${browserContext.url}`);
      console.log(`Found: ${browserContext.buttons.length} buttons, ${browserContext.inputs.length} inputs, ${browserContext.links.length} links\n`);

      // Refine step with LLM using browser context
      console.log('Refining step with LLM and browser context...');
      const sourceSegment = roughStep._source || null;
      const refinedResult = await refineStepWithContext(
        roughStep,
        browserContext,
        completedSteps,
        config,
        sourceSegment
      );

      // Track token usage
      if (refinedResult.metadata) {
        metadata.tokenUsage.prompt += refinedResult.metadata.promptTokens || 0;
        metadata.tokenUsage.completion += refinedResult.metadata.completionTokens || 0;
        metadata.tokenUsage.total += (refinedResult.metadata.promptTokens || 0) + (refinedResult.metadata.completionTokens || 0);
      }

      let { step: refinedStep, confidence, reasoning } = refinedResult;
      console.log(`Confidence: ${(confidence * 100).toFixed(1)}%`);
      console.log(`Reasoning: ${reasoning}\n`);

      // Check for credentials in the step
      const stepCredentials = detectCredentialsInStep(refinedStep);
      stepCredentials.forEach(cred => credentialsDetected.add(cred));

      // Query user if confidence is low
      // if (confidence < userQueryThreshold) {
        const userDecision = await queryLowConfidenceStep(refinedStep, confidence, browserContext);
        
        metadata.userInterventions.push({
          type: 'low_confidence',
          timestamp: new Date().toISOString(),
          step: refinedStep,
          confidence,
          decision: userDecision
        });

        if (userDecision.action === 'abort') {
          throw new Error('Analysis aborted by user.\n');
        } else if (userDecision.action === 'skip') {
          metadata.stepsSkipped++;
          console.log('Step skipped by user.\n');
          continue;
        } else if (userDecision.action === 'insert_before') {
          // User wants to insert a step before the current one
          const insertedStep = userDecision.insertedStep;
          const currentStep = userDecision.currentStep;
          
          console.log('\nExecuting inserted step first...');
          console.log(JSON.stringify(insertedStep, null, 2) + '\n');
          
          // Execute the inserted step
          const insertContext = test.contexts[0];
          const insertResult = await DocDetectiveRunner.runStep({
            step: insertedStep, 
            context: insertContext, 
            driver: DocDetectiveRunner.driver
          });
          
          metadata.stepsExecuted++;
          console.log(`Result: ${insertResult.status}`);
          
          if (insertResult.status === 'PASS') {
            completedSteps.push(insertResult);
            console.log('✓ Inserted step completed successfully.\n');
            
            // Now continue with the current step
            refinedStep = currentStep;
            console.log('Now continuing with original step...');
            console.log(JSON.stringify(refinedStep, null, 2) + '\n');
          } else {
            metadata.stepsFailed++;
            console.log(`✗ Inserted step failed: ${insertResult.description}\n`);
            
            const insertFailureDecision = await queryStepFailure(
              insertedStep,
              insertResult,
              0,
              maxRetries
            );
            
            if (insertFailureDecision === 'abort') {
              throw new Error('Analysis aborted by user due to inserted step failure');
            } else if (insertFailureDecision === 'skip') {
              metadata.stepsSkipped++;
              console.log('Failed inserted step skipped. Continuing with original step...\n');
              refinedStep = currentStep;
            } else if (insertFailureDecision === 'insert_before') {
              // User wants to insert another step before the inserted step
              console.log('Inserting another step...\n');
              // This will be handled in the retry loop naturally
              continue;
            } else {
              // Retry the inserted step
              console.log('Retrying inserted step...\n');
              continue;
            }
          }
        } else {
          // Continue with the step if user chose 'continue'
          refinedStep = userDecision.step || refinedStep;
        }
      // }

      // Validate step before execution
      console.log('Validating step...');
      const validation = await validateStepPreExecution(refinedStep, DocDetectiveRunner.driver);
      if (!validation.valid) {
        console.log(`Validation failed: ${validation.reason}`);
        console.log('Attempting to execute anyway (may fail)...\n');
      } else {
        console.log('Validation passed.\n');
      }

      // Execute step with retry
      console.log('Executing step...');
      const context = test.contexts[0];
      const stepResult = await DocDetectiveRunner.runStep({step: refinedStep, context: context, driver: DocDetectiveRunner.driver});
      // const executionResult = await executeStepWithRetry(
      //   refinedStep,
      //   DocDetectiveRunner.driver,
      //   config,
      //   coreRunStep,
      //   context,
      //   {
      //     maxRetries,
      //     useLlmRefinement,
      //     browserContext
      //   }
      // );

      metadata.retries += stepResult.retries || 0;
      metadata.stepsExecuted++;

      console.log(`Result: ${stepResult.status}`);
      console.log(`Retries: ${stepResult.retries || 0}\n`);

      // Handle execution result
      if (stepResult.status === 'PASS') {
        // Add to completed steps
        completedSteps.push(stepResult);
        console.log('✓ Step completed successfully.\n');
      } else {
        // Step failed even after retries
        metadata.stepsFailed++;
        console.log(`✗ Step failed: ${stepResult.description}\n`);

        const failureDecision = await queryStepFailure(
          refinedStep,
          stepResult,
          stepResult.retries || 0,
          maxRetries
        );

        metadata.userInterventions.push({
          type: 'step_failure',
          timestamp: new Date().toISOString(),
          step: refinedStep,
          result: stepResult,
          decision: failureDecision
        });

        if (failureDecision === 'abort') {
          throw new Error('Analysis aborted by user due to step failure');
        } else if (failureDecision === 'skip') {
          metadata.stepsSkipped++;
          console.log('Failed step skipped by user.\n');
          continue;
        } else if (failureDecision === 'insert_before') {
          // User wants to insert a prerequisite step
          const insertedStep = await queryInsertStep(browserContext);
          
          if (insertedStep.action === 'abort') {
            throw new Error('Analysis aborted by user');
          } else if (insertedStep.action === 'continue') {
            console.log('\nExecuting inserted step before retry...');
            console.log(JSON.stringify(insertedStep.step, null, 2) + '\n');
            
            const insertContext = test.contexts[0];
            const insertResult = await DocDetectiveRunner.runStep({
              step: insertedStep.step,
              context: insertContext,
              driver: DocDetectiveRunner.driver
            });
            
            metadata.stepsExecuted++;
            console.log(`Result: ${insertResult.status}`);
            
            if (insertResult.status === 'PASS') {
              completedSteps.push(insertResult);
              console.log('✓ Inserted step completed successfully.\n');
              console.log('Now retrying the failed step...\n');
              
              // Retry the original failed step
              const retryContext = test.contexts[0];
              const retryResult = await DocDetectiveRunner.runStep({
                step: refinedStep,
                context: retryContext,
                driver: DocDetectiveRunner.driver
              });
              
              metadata.stepsExecuted++;
              console.log(`Retry result: ${retryResult.status}`);
              
              if (retryResult.status === 'PASS') {
                completedSteps.push(retryResult);
                console.log('✓ Retry successful after inserted step.\n');
              } else {
                metadata.stepsFailed++;
                console.log(`✗ Retry still failed: ${retryResult.description}\n`);
                // Will ask user again in next iteration if needed
              }
            } else {
              metadata.stepsFailed++;
              console.log(`✗ Inserted step failed: ${insertResult.description}\n`);
            }
          }
          // Continue to next instruction segment
          continue;
        }
        // If 'retry' was selected, it already happened in executeStepWithRetry
      }
    }

    // Step 3: Handle credentials if detected
    if (credentialsDetected.size > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('CREDENTIALS HANDLING');
      console.log('='.repeat(80));
      
      const credentialArray = Array.from(credentialsDetected);
      const credentialResult = await queryCredentials(credentialArray, envFilePath);
      
      metadata.userInterventions.push({
        type: 'credentials',
        timestamp: new Date().toISOString(),
        credentials: credentialArray,
        result: credentialResult
      });

      if (credentialResult.action === 'abort') {
        throw new Error('Analysis aborted by user during credential handling');
      }

      // Add loadVariables step at the beginning (after any goTo)
      if (!hasLoadVariablesStep) {
        const loadVarsStep = {
          stepId: randomUUID(),
          loadVariables: envFilePath,
          description: 'Load credentials from environment file'
        };
        
        // Insert after initial navigation
        const insertIndex = completedSteps.findIndex(s => !s.goTo);
        if (insertIndex > 0) {
          completedSteps.splice(insertIndex, 0, loadVarsStep);
        } else {
          completedSteps.unshift(loadVarsStep);
        }
      }

      // Replace credential values with placeholders in all steps
      completedSteps.forEach(step => {
        replaceCredentialsWithPlaceholders(step, credentialResult.placeholders);
      });
    }

    // Step 4: Generate canonical test
    test.steps = completedSteps;
    metadata.executionTime = Date.now() - startTime;
    metadata.endTime = new Date().toISOString();

    console.log('\n' + '='.repeat(80));
    console.log('ANALYSIS COMPLETE');
    console.log('='.repeat(80));
    console.log(`\nTotal steps: ${completedSteps.length}`);
    console.log(`Execution time: ${(metadata.executionTime / 1000).toFixed(2)}s`);
    console.log(`Total tokens used: ${metadata.tokenUsage.total}`);
    console.log(`Retries: ${metadata.retries}`);
    console.log(`User interventions: ${metadata.userInterventions.length}\n`);

    return {
      test,
      metadata
    };

  } catch (error) {
    metadata.error = error.message;
    metadata.executionTime = Date.now() - startTime;
    metadata.endTime = new Date().toISOString();

    return {
      test,
      metadata,
      error: error.message
    };
  }
}

/**
 * Refines a rough step using LLM with browser context.
 * 
 * @param {Object} roughStep - Rough step from static analysis
 * @param {Object} browserContext - Current browser state
 * @param {Array<Object>} completedSteps - Previously completed steps
 * @param {Object} config - Configuration
 * @param {Object} sourceSegment - Original source segment from document (optional)
 * @returns {Promise<Object>} Refined step with confidence and reasoning
 */
async function refineStepWithContext(roughStep, browserContext, completedSteps, config, sourceSegment = null) {
  // Use source segment content if available, otherwise fall back to step description
  const instruction = sourceSegment?.content || roughStep.description || JSON.stringify(roughStep);
  const prompt = buildDynamicPrompt(instruction, browserContext, null, completedSteps);

  const segment = {
    type: 'text',
    content: instruction,
    lineNumber: 0
  };

  try {
    const result = await analyzeSegment(segment, prompt, config);
    
    // Parse the result - expecting { step, confidence, reasoning }
    if (result.actions && result.actions.length > 0) {
      const action = result.actions[0];
      return {
        step: action.step || action,
        confidence: action.confidence || 0.5,
        reasoning: action.reasoning || 'No reasoning provided',
        metadata: result.metadata
      };
    }

    // Fallback
    return {
      step: roughStep,
      confidence: 0.3,
      reasoning: 'Failed to refine step, using original',
      metadata: result.metadata
    };
  } catch (error) {
    console.error('Error refining step:', error.message);
    return {
      step: roughStep,
      confidence: 0.2,
      reasoning: `Error during refinement: ${error.message}`,
      metadata: {}
    };
  }
}

/**
 * Detects credential-related placeholders in a step.
 * 
 * @param {Object} step - Step to check
 * @returns {Array<string>} Array of detected credential names
 */
function detectCredentialsInStep(step) {
  const credentials = [];
  const stepStr = JSON.stringify(step).toLowerCase();

  // Common credential patterns
  const patterns = [
    { pattern: /\$username/i, name: 'username' },
    { pattern: /\$password/i, name: 'password' },
    { pattern: /\$email/i, name: 'email' },
    { pattern: /\$api[_-]?key/i, name: 'api_key' },
    { pattern: /\$token/i, name: 'token' },
    { pattern: /\$secret/i, name: 'secret' }
  ];

  patterns.forEach(({ pattern, name }) => {
    if (pattern.test(stepStr)) {
      credentials.push(name);
    }
  });

  return credentials;
}

/**
 * Replaces credential values with placeholders in a step.
 * 
 * @param {Object} step - Step to modify
 * @param {Object} placeholders - Map of credential names to placeholders
 */
function replaceCredentialsWithPlaceholders(step, placeholders) {
  const stepStr = JSON.stringify(step);
  let modified = stepStr;

  Object.entries(placeholders).forEach(([name, placeholder]) => {
    // Replace various forms of the credential
    const patterns = [
      new RegExp(`"${name}"\\s*:\\s*"[^"]*"`, 'gi'),
      new RegExp(`\\b${name}\\b(?!=)`, 'gi')
    ];

    patterns.forEach(pattern => {
      modified = modified.replace(pattern, placeholder);
    });
  });

  // Parse back and update step
  try {
    const parsed = JSON.parse(modified);
    Object.assign(step, parsed);
  } catch (error) {
    // If parsing fails, leave step unchanged
    console.warn('Failed to replace credentials in step:', error.message);
  }
}

module.exports = {
  dynamicAnalyze
};
