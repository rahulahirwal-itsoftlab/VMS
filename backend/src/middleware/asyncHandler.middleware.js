/**
 * Wraps async Express route handlers to catch errors and pass them to the next middleware.
 * @param {function} fn - The async controller function.
 * @returns {function} An Express route handler.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;