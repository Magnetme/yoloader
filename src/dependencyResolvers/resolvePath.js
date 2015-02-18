let { isGlobal, isResolved } = require('./util');
let debug = require('debug')('yolo:resolve:path');
let { catcher } = require('../f');
let path = require('path');

/**
 * Tries to resolve a dependency from path
 */
module.exports = function resolveNodeModule(dep, opts, cb) {
	//Only unresolved global modules
	if (!isGlobal(dep.to) || isResolved(dep)) {
		return cb(null, dep);
	}
	debug(`Trying to resolve ${dep.to} from ${dep.from} from the folders specified in path`);

	/**
	 * Tries to load from the first path entry in the path array.
	 */
	function loadFromFirstPathEntry(pathArray) {
		if (!pathArray.length) {
			//No path, nothing to do
			return cb(null, dep);
		}
		let pathEntry = pathArray[0];
		let file = path.join(pathEntry, dep.to);
		debug(`Trying to load ${dep.to} from ${dep.from} as ${file}`);
		let onSuccess = catcher(cb);
		opts.resolve(file, onSuccess((res) => {
			if (res) {
				dep.path = res.file;
				dep.base = res.base;
				debug(`Resolved ${dep.to} from ${dep.from} to ${res}`);
				cb(null, dep);
			} else {
				//If not found, recurse!
				return loadFromFirstPathEntry(pathArray.slice(1));
			}
		}));
	}
	loadFromFirstPathEntry(opts.compileOptions.path);
};

