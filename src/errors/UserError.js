let util = require('util');

/**
 * Error that is a result of some user action, e.g. invalid require statements.
 */
function UserError() {
	Error.call(this);
}
util.inherits(UserError, Error);

module.exports = UserError;
