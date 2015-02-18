let { isGlobal, isResolved, existsAndIsFile } = require('./util');
let debug = require('debug')('yoloader:resolve:file');
let { catcher } = require('../f');
let path = require('path');

/**
 * Tries to resolve a dependency as a file
 */
module.exports = function resolveFile(dep, opts, cb) {
	if (isGlobal(dep.to) || isResolved(dep)) {
		return cb(null, dep);
	}
	debug(`Trying to resolve ${dep.to} from ${dep.from} as a file`);
	let file = path.resolve(path.dirname(dep.from), dep.to);
	let onSuccess = catcher(cb);
	existsAndIsFile(file, onSuccess((found) => {
		if (found) {
			debug(`Resolved ${dep.to} from ${dep.from} as ${file}`);
			dep.path = file;
			dep.base = opts.base;
		}
		cb(null, dep);
	}));
};
