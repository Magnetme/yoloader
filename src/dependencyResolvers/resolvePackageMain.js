let { isGlobal, isResolved, existsAndIsFile } = require('./util');
let fs = require('fs');
let path = require('path');
let debug = require('debug')('yoloader:resolve:package-main');
let { catcher } = require('../f');

/**
 * Tries to resolve a dependency as a package (via package.json)
 */
module.exports = function resolvePackageMain(dep, opts, cb) {
	if (isGlobal(dep.to) || isResolved(dep)) {
		return cb(null, dep);
	}
	debug(`Trying to resolve ${dep.to} from ${dep.from} via package.json#main`);
	let onSuccess = catcher(cb);

	let folder = path.resolve(path.dirname(dep.from), dep.to);
	let packagePath = path.join(folder, 'package.json');

	existsAndIsFile(packagePath, onSuccess((exists) => {
		if (exists) {
			debug(`Found package.json for ${dep.to} from ${dep.from}`);

			fs.readFile(packagePath, 'utf8', onSuccess((packageContent) => {
				let main = JSON.parse(packageContent).main;
				if (main) {
					let mainFile = path.resolve(path.dirname(packagePath), main);
					debug(`Found main field ${mainFile} in package.json for ${dep.to} from ${dep.from}`);

					//Now lets recursively try to resolve the found file using the resolving strategy
					opts.resolve(mainFile, onSuccess((res) => {
						dep.path = res.file;
						dep.base = opts.base;
						cb(null, dep);
					}));

				} else {
					cb(null, dep);
				}

			}));

		} else {
			debug(`No package.json found for ${dep.to} from ${dep.from}`);
			return cb(null, dep);
		}

	}));
};
