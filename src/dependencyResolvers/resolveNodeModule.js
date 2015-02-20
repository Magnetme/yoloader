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
		if (path.dirname(current) === current) {
			//we're at root, nothing left to do
			return cb(null, dep);
		}
		current = path.dirname(current);
		let file = path.join(current, 'node_modules', dep.to);
		debug(`Trying to load ${dep.to} from ${dep.from} as ${file}`);
		let onSuccess = catcher(cb);
		opts.resolve(file, onSuccess((res) => {
			if (res) {
				dep.file = res.file;
				dep.base = res.base;
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
