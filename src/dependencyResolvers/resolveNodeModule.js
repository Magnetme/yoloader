let { isGlobal, isResolved } = require('./util');
let debug = require('debug')('yoloader:resolve:node-module');
let { catcher } = require('../f');
let path = require('path');

/**
 * Tries to resolve a dependency as node module
 */
module.exports = function resolveNodeModule(dep, opts, cb) {
	//Only unresolved global modules
	if (!isGlobal(dep.to) || isResolved(dep)) {
		return cb(null, dep);
	}
	debug(`Trying to resolve ${dep.to} from ${dep.from} as a node module`);

	let current = dep.from;
	function loadFromParent() {
		if (opts.base.startsWith(current) || path.dirname(current) === current) {
			//We're either passed the base of the project or at root. In both cases
			//we can't resolve the bundle without getting weird behaviour
			return cb(null, dep);
		}
		current = path.dirname(current);
		let file = path.join(current, 'node_modules', dep.to);
		debug(`Trying to load ${dep.to} from ${dep.from} as ${file}`);
		let onSuccess = catcher(cb);
		opts.resolve(file, onSuccess((res) => {
			if (res) {
				dep.file = res.file;
				//If a path entry is a subpath of the rootpath then we add is as if it were a relative path.
				//Otherwise we would end up with files having two absolute paths in the bundle, which we
				//can't represent properly
				if (res.file.startsWith(opts.base)) {
					dep.base = opts.base;
				} else {
					dep.base = res.base;
				}
				dep.as = res.as;
				debug(`Resolved ${dep.to} from ${dep.from} to ${res.file}`);
				cb(null, dep);
			} else {
				loadFromParent();
			}
		}));
	}
	loadFromParent();
};
