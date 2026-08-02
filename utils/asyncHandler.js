/**
 * Converts an asynchronous Express handler into middleware
 * that forwards rejected Promises to next(error).
 */
function asyncHandler(handler) {
  return function wrappedHandler(
    req,
    res,
    next
  ) {
    return Promise
      .resolve(handler(req, res, next))
      .catch(next);
  };
}

module.exports = {
  asyncHandler
};