/**
 * List of sensitive keys that should be redacted from logs.
 * All keys are stored in lowercase for case-insensitive matching.
 */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'confirmpassword',
  'currentpassword',
  'newpassword',
  'passwordhash',
  'temporarypassword',
  'temppassword',
  'passwordchangetoken',
  'html',
  'text',
  'accesstoken',
  'refreshtoken',
  'token',
  'resettoken',
  'verificationtoken',
  'otp',
  'code',
  'apikey',
  'clientsecret',
  'secret',
  'databaseurl',
]);

/**
 * Recursively clone and sanitize an object or array to redact sensitive keys.
 * Never mutates the original object.
 *
 * @param {*} data - The data to sanitize.
 * @param {Set<string>} [visited] - Internal set to prevent infinite loops from circular references.
 * @returns {*} The sanitized clone of the data.
 */
export const sanitizeObject = (data, visited = new WeakSet()) => {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitive types
  if (typeof data !== 'object') {
    return data;
  }

  // Handle Date instances
  if (data instanceof Date) {
    return new Date(data.getTime());
  }

  // Prevent circular reference loops
  if (visited.has(data)) {
    return '[Circular Reference]';
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    visited.add(data);
    const sanitizedArray = data.map(item => sanitizeObject(item, visited));
    visited.delete(data);
    return sanitizedArray;
  }

  // Handle Objects
  visited.add(data);
  const sanitizedObj = {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    // Check if the key is sensitive
    if (SENSITIVE_KEYS.has(lowerKey)) {
      if (lowerKey === 'authorization' && typeof value === 'string') {
        const parts = value.split(' ');
        if (parts.length > 1) {
          sanitizedObj[key] = `${parts[0]} ***`;
        } else {
          sanitizedObj[key] = '***';
        }
      } else {
        sanitizedObj[key] = '***';
      }
    } else if (lowerKey === 'permissions' && Array.isArray(value)) {
      // Avoid logging full permissions array to keep log sizes clean
      sanitizedObj[key] = `[Array(${value.length})]`;
    } else {
      sanitizedObj[key] = sanitizeObject(value, visited);
    }
  }

  visited.delete(data);
  return sanitizedObj;
};

export default sanitizeObject;
