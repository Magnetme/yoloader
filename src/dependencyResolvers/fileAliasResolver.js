let { isGlobal, isResolved } = require('./util');
let debug = require('debug')('common:resolve:file-alias');
let { catcher } = require('../f');
let resolveFile = require('./resolveFile');

/**
 * Creates a resolver that aliases a file and then tries to resolve that file.
 *
 * @param {Function} transformFunc A function that should created the aliased name. It get's passed
 *                                 a dependency object and should return a new dependency object
 *                                 with new paramters. It should NOT alter the passed in object.
 * @return {Function} A new resolver that will try to resolve the aliased dependency as a file
 */
module.exports = function fileAliasResolver(transformFunc) {
	return function resolveFileAlias(dep, opts, cb) {
		if (isGlobal(dep.to) || isResolved(dep)) {
			return cb(null, dep);
		}
		let onSuccess = catcher(cb);

		let newDep = transformFunc(dep);
		debug(`Trying to resolve ${dep.to} from ${dep.from} as aliased file ${newDep.to}`);

		resolveFile(newDep, opts, onSuccess((res) => {
			dep.path = res.path;
			dep.base = res.base;
			cb(null, dep);
		}));
	};
};
