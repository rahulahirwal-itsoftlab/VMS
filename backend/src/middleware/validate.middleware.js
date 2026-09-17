import ApiError from '../utils/ApiError.js';
import sanitizeObject from '../utils/logSanitizer.js';

/**
 * Express middleware factory that validates the request against a Zod schema.
 *
 * - Validates body, query, and params.
 * - On success: replaces req.body / req.query / req.params with the parsed (coerced) values.
 * - On failure: passes a structured ApiError to the next middleware.
 *
 * @param {import('zod').ZodSchema} schema - The Zod schema to validate against.
 * @returns {import('express').RequestHandler}
 */
const validate = (schema) => (req, res, next) => {
  // If no valid schema is provided, skip validation silently.
  if (!schema || typeof schema.safeParse !== 'function') return next();

  const isDev = process.env.NODE_ENV !== 'production';

  // ── Always log incoming payload in development (Sanitized) ───────────────────
  if (isDev) {
    const sanitizedHeaders = sanitizeObject(req.headers) ?? {};
    const sanitizedBody = sanitizeObject(req.body) ?? {};
    const sanitizedParams = sanitizeObject(req.params) ?? {};
    const sanitizedQuery = sanitizeObject(req.query) ?? {};
    const sanitizedUser = sanitizeObject(req.user);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Validate] Incoming Request (Before Validation)');
    console.log(`  Method      : ${req.method}`);
    console.log(`  URL         : ${req.originalUrl}`);
    console.log(`  Headers     : ${JSON.stringify(sanitizedHeaders, null, 2)}`);
    console.log(`  Content-Type: ${req.headers['content-type'] || 'NOT SET'}`);
    if (req.method !== 'GET' && Object.keys(sanitizedBody).length > 0) {
      console.log(`  Body        : ${JSON.stringify(sanitizedBody, null, 2)}`);
    }
    if (Object.keys(sanitizedParams).length > 0) {
      console.log(`  Params      : ${JSON.stringify(sanitizedParams, null, 2)}`);
    }
    if (Object.keys(sanitizedQuery).length > 0) {
      console.log(`  Query       : ${JSON.stringify(sanitizedQuery, null, 2)}`);
    }
    if (sanitizedUser) {
      console.log(`  User        : ${JSON.stringify(sanitizedUser, null, 2)}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  const result = schema.safeParse({
    body: req.body ?? {},
    query: req.query ?? {},
    params: req.params ?? {},
  });

  if (result.success) {
    // Overwrite req.body / query / params with Zod-parsed (coerced) values.
    if (result.data.body !== undefined) {
      req.body = result.data.body;
    }
    if (result.data.query !== undefined) {
      for (const key of Object.keys(result.data.query)) {
        req.query[key] = result.data.query[key];
      }
    }
    if (result.data.params !== undefined) {
      for (const key of Object.keys(result.data.params)) {
        req.params[key] = result.data.params[key];
      }
    }

    if (isDev) {
      console.log('[Validate]  Validation passed');
    }
    return next();
  }

  // ── Validation failed (Standardized structure) ──────────────────────────────
  const issues = result.error.issues ?? result.error.errors ?? [];

  // Group validation errors by parameter field (stripping body/query/params prefix)
  const groupedErrors = {};
  issues.forEach((issue) => {
    let path = issue.path;
    if (path.length > 0 && (path[0] === 'body' || path[0] === 'query' || path[0] === 'params')) {
      path = path.slice(1);
    }
    const field = path.join('.') || 'root';
    
    if (!groupedErrors[field]) {
      groupedErrors[field] = [];
    }
    groupedErrors[field].push(issue.message);
  });

  const summary = Object.entries(groupedErrors)
    .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
    .join(' | ') || 'Invalid request payload';

  if (isDev) {
    console.log('[Validate]  Validation failed:');
    Object.entries(groupedErrors).forEach(([field, msgs]) => {
      console.log(`  - ${field}: ${msgs.join(', ')}`);
    });
  }

  const apiError = new ApiError(400, summary);
  apiError.code = 'VALIDATION_ERROR';
  apiError.errors = groupedErrors;
  next(apiError);
};

export default validate;
