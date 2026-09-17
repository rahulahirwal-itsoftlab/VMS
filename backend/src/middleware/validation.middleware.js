import ApiError from '../utils/ApiError.js';

/**
 * Generic validation middleware for Zod schemas
 */
const 
validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    return next();
  } catch (error) {
    const errorMessage = error.errors
      ? error.errors.map((details) => details.message).join(', ')
      : error.message;
    return next(new ApiError(400, errorMessage));
  }
};

export default validate;