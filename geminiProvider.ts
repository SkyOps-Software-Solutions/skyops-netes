/**
 * geminiProvider.ts
 *
 * AI Robustness & Runtime Validation Module for Google Gemini / AI Studio
 *
 * Implements:
 * - Strict runtime schema validation using Zod on raw JSON responses.
 * - Single-pass structured repair prompt on validation failure, with strongly-typed fallback.
 * - AbortSignal cancellation token support and dynamic model parameters.
 * - Clean export function: `generateValidatedContent<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T>`
 */

import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

/**
 * Options for Gemini content generation and validation.
 */
export interface GeminiRequestOptions<T = any> {
  /**
   * Dynamic model override. Defaults to 'gemini-3.8-flash'.
   */
  model?: string;
  /**
   * Generation temperature (0.0 - 2.0).
   */
  temperature?: number;
  /**
   * Nucleus sampling parameter.
   */
  topP?: number;
  /**
   * Top-k sampling parameter.
   */
  topK?: number;
  /**
   * Maximum output tokens allowed.
   */
  maxOutputTokens?: number;
  /**
   * System instruction to steer generation behavior.
   */
  systemInstruction?: string;
  /**
   * Cancellation token via standard AbortSignal.
   */
  signal?: AbortSignal;
  /**
   * Maximum execution timeout in milliseconds.
   */
  timeoutMs?: number;
  /**
   * Explicit API key override (falls back to process.env.GEMINI_API_KEY).
   */
  apiKey?: string;
  /**
   * Strongly-typed fallback state returned if generation and repair both fail.
   */
  fallbackValue?: T;
  /**
   * Maximum number of repair attempts on schema mismatch (defaults to 1).
   */
  maxRepairAttempts?: number;
}

/**
 * Strongly typed error thrown when Gemini output fails schema validation
 * and no fallback state is supplied.
 */
export class GeminiValidationError extends Error {
  public readonly statusCode = 422;
  public readonly validationIssues: z.ZodIssue[];
  public readonly rawResponse?: string;
  public readonly repairedResponse?: string;

  constructor(
    message: string,
    validationIssues: z.ZodIssue[] = [],
    rawResponse?: string,
    repairedResponse?: string
  ) {
    super(message);
    this.name = 'GeminiValidationError';
    this.validationIssues = validationIssues;
    this.rawResponse = rawResponse;
    this.repairedResponse = repairedResponse;
    Object.setPrototypeOf(this, GeminiValidationError.prototype);
  }
}

/**
 * Error thrown for API transport, authentication, or timeout issues.
 */
export class GeminiAIError extends Error {
  public readonly statusCode: number;
  public readonly originalError?: unknown;

  constructor(message: string, statusCode = 500, originalError?: unknown) {
    super(message);
    this.name = 'GeminiAIError';
    this.statusCode = statusCode;
    this.originalError = originalError;
    Object.setPrototypeOf(this, GeminiAIError.prototype);
  }
}

/**
 * Cleans raw string output from LLMs by stripping Markdown code fences and
 * isolating the outermost JSON object or array.
 */
export function extractJsonString(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim();

  // Strip markdown code fences if wrapped in ```json ... ``` or ``` ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  // Find boundaries of valid JSON payload (either object or array)
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else {
    startIdx = firstBrace !== -1 ? firstBrace : firstBracket;
  }

  if (startIdx !== -1) {
    const isArray = cleaned[startIdx] === '[';
    const lastIdx = isArray ? cleaned.lastIndexOf(']') : cleaned.lastIndexOf('}');
    if (lastIdx !== -1 && lastIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, lastIdx + 1);
    }
  }

  return cleaned.trim();
}

/**
 * Core execution helper for invoking the Gemini API with timeout and AbortSignal support.
 */
async function callGemini(
  prompt: string,
  options: GeminiRequestOptions = {}
): Promise<string> {
  const apiKey =
    options.apiKey !== undefined ? options.apiKey : process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new GeminiAIError(
      'GEMINI_API_KEY is not configured in server environment',
      503
    );
  }

  // Check if caller's AbortSignal has already been aborted
  if (options.signal?.aborted) {
    const abortError = new Error('Gemini generation aborted by client');
    abortError.name = 'AbortError';
    throw abortError;
  }

  const model = options.model || 'gemini-3.8-flash';
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const config: Record<string, any> = {
    responseMimeType: 'application/json'
  };

  if (options.temperature !== undefined) config.temperature = options.temperature;
  if (options.topP !== undefined) config.topP = options.topP;
  if (options.topK !== undefined) config.topK = options.topK;
  if (options.maxOutputTokens !== undefined) config.maxOutputTokens = options.maxOutputTokens;
  if (options.systemInstruction) config.systemInstruction = options.systemInstruction;

  const timeoutMs = options.timeoutMs || 30000;

  // Race API call against timeout and cancellation signal
  const generatePromise = (async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config
    });
    return response.text || '';
  })();

  let abortListener: (() => void) | undefined;
  let timer: NodeJS.Timeout | undefined;

  const cancellationPromise = new Promise<never>((_, reject) => {
    if (options.signal) {
      abortListener = () => {
        const err = new Error('Gemini generation cancelled via AbortSignal');
        err.name = 'AbortError';
        reject(err);
      };
      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    timer = setTimeout(() => {
      reject(new GeminiAIError(`Gemini request timed out after ${timeoutMs}ms`, 504));
    }, timeoutMs);
  });

  try {
    return await Promise.race([generatePromise, cancellationPromise]);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    throw new GeminiAIError(
      `Gemini API invocation failed: ${err?.message || err}`,
      err?.status || err?.statusCode || 500,
      err
    );
  } finally {
    if (timer) clearTimeout(timer);
    if (options.signal && abortListener) {
      options.signal.removeEventListener('abort', abortListener);
    }
  }
}

/**
 * Generates content using the Gemini API and strictly validates the raw JSON response
 * against a Zod schema. If validation fails, it attempts a single structured repair prompt
 * before either safely returning a strongly-typed fallback or throwing a GeminiValidationError.
 *
 * @param prompt The prompt to execute against the model
 * @param schema Zod schema defining the expected output structure
 * @param options Cancellation tokens, dynamic model parameters, and fallbacks
 */
export async function generateValidatedContent<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  options: GeminiRequestOptions<T> = {}
): Promise<T> {
  const maxRepairAttempts = options.maxRepairAttempts !== undefined ? options.maxRepairAttempts : 1;

  // Step 1: Initial Generation
  let rawText: string;
  try {
    rawText = await callGemini(prompt, options);
  } catch (err) {
    // If generation fails and fallback is available, safely return fallback
    if (options.fallbackValue !== undefined) {
      console.warn('[GeminiProvider] Initial call failed; returning fallback state:', err);
      return options.fallbackValue;
    }
    throw err;
  }

  // Step 2: Clean and parse JSON
  const cleaned = extractJsonString(rawText);
  let parsedJson: unknown;
  let parseError: Error | null = null;

  try {
    parsedJson = JSON.parse(cleaned);
  } catch (err: any) {
    parseError = err instanceof Error ? err : new Error(String(err));
  }

  // Step 3: Initial Schema Validation
  if (!parseError) {
    const parseResult = schema.safeParse(parsedJson);
    if (parseResult.success) {
      return parseResult.data;
    }
    // Record schema mismatch issues
    parseError = new GeminiValidationError(
      `Initial Gemini response failed schema validation: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      parseResult.error.issues,
      rawText
    );
  }

  // Step 4: Structured Repair Prompt (if allowed)
  if (maxRepairAttempts > 0) {
    console.warn(
      `[GeminiProvider] Schema validation failed. Triggering structured repair prompt. Reason: ${parseError.message}`
    );

    const errorDetails =
      parseError instanceof GeminiValidationError
        ? JSON.stringify(parseError.validationIssues, null, 2)
        : parseError.message;

    const repairPrompt = `You are an automated, high-reliability JSON repair engine.
The following JSON output failed schema validation.

ERROR DETAILS:
${errorDetails}

ORIGINAL RAW OUTPUT:
${rawText}

ORIGINAL USER REQUEST:
${prompt}

CRITICAL REPAIR INSTRUCTIONS:
1. Fix all missing, misplaced, or mistyped keys.
2. Ensure types strictly match (numbers as numbers, booleans as booleans, arrays as arrays).
3. Return ONLY valid, parseable JSON without backticks, markdown fences, or conversational filler.`;

    try {
      const repairedRaw = await callGemini(repairPrompt, {
        ...options,
        temperature: 0.1 // Use lower temperature for deterministic repair
      });

      const cleanedRepaired = extractJsonString(repairedRaw);
      const repairedJson = JSON.parse(cleanedRepaired);
      const repairedValidation = schema.safeParse(repairedJson);

      if (repairedValidation.success) {
        console.info('[GeminiProvider] Output successfully repaired and verified against schema.');
        return repairedValidation.data;
      }

      console.warn(
        `[GeminiProvider] Repair attempt failed schema validation: ${repairedValidation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      );

      // Trapped failure state: check for fallback
      if (options.fallbackValue !== undefined) {
        return options.fallbackValue;
      }

      throw new GeminiValidationError(
        `Gemini output failed schema validation after repair attempt: ${repairedValidation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        repairedValidation.error.issues,
        rawText,
        repairedRaw
      );
    } catch (repairErr: any) {
      // If caller provided a fallback, safely return it instead of throwing
      if (options.fallbackValue !== undefined) {
        console.warn('[GeminiProvider] Repair routine encountered error; returning typed fallback:', repairErr?.message || repairErr);
        return options.fallbackValue;
      }

      if (repairErr instanceof GeminiValidationError) {
        throw repairErr;
      }

      throw new GeminiValidationError(
        `Repair routine failed: ${repairErr?.message || repairErr}`,
        parseError instanceof GeminiValidationError ? parseError.validationIssues : [],
        rawText
      );
    }
  }

  // Step 5: If no repair allowed, check fallback or throw
  if (options.fallbackValue !== undefined) {
    return options.fallbackValue;
  }

  if (parseError instanceof GeminiValidationError) {
    throw parseError;
  }

  throw new GeminiValidationError(
    `Failed to parse Gemini output as valid JSON: ${parseError.message}`,
    [],
    rawText
  );
}

/**
 * High-level GeminiProvider class encapsulating configuration and validated generation.
 */
export class GeminiProvider {
  constructor(private defaultOptions: GeminiRequestOptions = {}) {}

  /**
   * Generates content and validates it against the supplied Zod schema.
   */
  public async generateValidated<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: GeminiRequestOptions<T>
  ): Promise<T> {
    return generateValidatedContent(prompt, schema, {
      ...this.defaultOptions,
      ...options
    });
  }

  /**
   * Checks if the Gemini API key is available in the environment.
   */
  public isAvailable(): boolean {
    const key =
      this.defaultOptions.apiKey !== undefined
        ? this.defaultOptions.apiKey
        : process.env.GEMINI_API_KEY;
    return Boolean(key && key.trim().length > 0);
  }
}
