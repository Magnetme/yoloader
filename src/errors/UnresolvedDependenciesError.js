let util = require('util');
let UserError = require('./UserError');

/**
 * Error that indicates that certain dependencies could not be resolved.
 * @param {String} file The file in which the dependencies are `require`d
 * @param {String[]} dependencies An array of dependencies that could not be resolved;
 */
function UnresolvedDependenciesError(file, dependencies) {
	UserError.call(this);
	this.file = file;
	this.dependencies = dependencies;
	let delimiter = '\n\t- ';
	this.message =  'Could not resolve all dependencies for ' + this.file + '.\n\tMissing:  ' +
	                delimiter + this.dependencies.join(delimiter);
}
util.inherits(UnresolvedDependenciesError, UserError);

UnresolvedDependenciesError.prototype.toString = function toString() {
	return this.message;
};

module.exports = UnresolvedDependenciesError;
