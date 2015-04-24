let { isGlobal, isResolved } = require('./util');
let debug = require('debug')('yoloader:resolve:path');
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
		let pathName = pathArray[0].name;
		let pathEntry = pathArray[0].path;
		let file = path.join(pathEntry, dep.to);
		debug(`Trying to load ${dep.to} from ${dep.from} as ${file}`);
		let onSuccess = catcher(cb);
		opts.resolve(file, onSuccess((res) => {
			if (res) {
				dep.file = res.file;
				//If a path entry is a subpath of the rootpath then we add is as if it were a relative path.
				//Otherwise we would end up with files having two absolute paths in the bundle, which we
				//can't represent properly
				if (pathEntry.startsWith(opts.base)) {
					dep.base = opts.base;
				} else {
					dep.base = pathEntry;
				}
				dep.as = res.as;
				//If we have given a name for the path than we will use that to generate a dependency name.
				//that'll be used later for sourcemaps and stuff
				if (pathName) {
					dep.name = path.join(pathName, path.relative(pathEntry, dep.file));
				}
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

