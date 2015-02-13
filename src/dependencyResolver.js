//TODO: all sorts of caching (at least to allow cyclic requires)
//TODO: Do base paths in a better way, it's a bit fragile now
//TODO: Check if upwards paths (../) work with vinyl
let {
	asyncReduce,
	catcher
} = require('./f');
let path = require('path');
let fs = require('fs');
let vinylFs = require('vinyl-fs');
let debug = require('debug')('common:resolve');


/**
 * Resolves the dependencies for a file to full file paths
 */
module.exports = function dependencyResolver(chunk, compileOptions = {}) {
	//TODO: this can be done cleaner
	compileOptions.resolvers = compileOptions.resolvers || dependencyResolver.defaultResolvers;
	debug('Creating dependency resolver for ' + chunk.vinyl.path);
	return function resolveDependency(dep, done) {
		debug('Resolving dependency from ' + chunk.vinyl.path + ' to ' + dep);
		asyncReduce(compileOptions.resolvers, (result, resolver, index, arr, cb) => {
			if (result) {
				cb(null, result);
			} else {
				let opts = {
					compileOptions : compileOptions,
					stream : chunk,
					base : chunk.vinyl.base
				};
				resolver(chunk.vinyl.path, dep, opts, cb);
			}
		}, null, done);
	};
};

function resolvePath(from, to) {
	if (to.indexOf('.') !== 0 && to.indexOf('/') !== 0) {
		return false;
	} else {
		return path.resolve(path.dirname(from), to);
	}
}

/**
 * Checks if the given file is actually a file
 */
function checkIfFile(filePath, cb) {
	debug(filePath + ' found, checking if it\'s a file');
	fs.stat(filePath, catcher(cb)((stat) => {
		if (stat.isFile()) {
			debug(filePath + ' found and is file');
			return cb(null, filePath);
		} else {
			return cb(null, false);
		}
	}));
}

/**
 * Checks if the given file exists and is a file (not a directory)
 */
function existsAndIsFile(filePath, cb) {
	fs.exists(filePath, (exists) => {
		if (!exists) {
			return cb(null, false);
		} else {
			return checkIfFile(filePath, cb);
		}
	});
}

let fileCache = {};

function toResultObject(file, base) {
	if (!fileCache[file]) {
		fileCache[file] = { vinyl : vinylFs.src(file, { base : base }), path: file };
	}

	return fileCache[file];
}

/**
 * Loads a dependency as normal file
 */
function loadAsFile(from, to, opts, cb) {
	let filePath = resolvePath(from, to);
	if (!filePath) {
		return cb(null, false);
	}
	debug('Trying to load ' + filePath + ' as file');
	let onSuccess = catcher(cb);
	existsAndIsFile(filePath, onSuccess((found) => {
		if (found) {
			cb(null, toResultObject(found, opts.base));
		} else {
			debug('Could not find ' + filePath + ', trying ' + filePath + '.js');
			existsAndIsFile(filePath + '.js', onSuccess((file) => {
				cb(null, file && toResultObject(file, opts.base));
			}));
		}
	}));
}

/**
 * Loads a file from the main field in a package.json file
 */
function loadFromPackageMain(packagePath, opts, cb) {
	debug('Loading ' + packagePath + ' to find main field');
	fs.readFile(packagePath, 'utf8', catcher(cb)(function(packageContent) {
		let pjs = JSON.parse(packageContent);
		if (pjs.main) {
			debug('Main field found in ' + packagePath + '. main: ' + pjs.main);
			let main = path.resolve(path.dirname(packagePath), pjs.main);
			return loadAsFile('/', main, opts, cb);
		} else {
			debug('No main field found in ' + packagePath);
			return cb(null, false);
		}
	}));
}

/**
 * Loads a file from a folder with a package.json
 */
function loadFromPackageJson(from, to, opts, cb) {
	let dirPath = resolvePath(from, to);
	if (!dirPath) {
		return cb(null, false);
	}
	let packagePath = path.join(dirPath, 'package.json');
	debug('Trying to load from ' + packagePath);
	fs.exists(packagePath, (exists) => {
		if (exists) {
			debug(packagePath + ' found');
			loadFromPackageMain(packagePath, opts, cb);
		} else {
			debug(packagePath + ' not found');
			return cb(null, false);
		}
	});
}

/**
 * Loads the file from an index.js file
 */
function loadFromFolderIndex(from, to, opts, cb) {
	let dirPath = resolvePath(from, to);
	if (!dirPath) {
		return cb(null, false);
	}
	let indexPath = path.join(dirPath, 'index.js');
	debug('Trying to load from ' + indexPath);
	fs.exists(indexPath, (exists) => {
		if (exists) {
			debug(indexPath + ' found');
			return cb(null, toResultObject(indexPath, opts.base));
		} else {
			debug(indexPath + ' not found');
			return cb(null, false);
		}
	});
}

/**
 * Tries to load a file as a node module.
 */
function loadAsModule(modulePath, opts, done) {
	var resolvers = [loadAsFile, loadFromPackageJson, loadFromFolderIndex];
	debug('Trying to load ' + modulePath + ' as node_module');
	asyncReduce(resolvers, (result, resolver, index, arr, cb) => {
		if (result) {
			cb(null, result);
		} else {
			resolver('/', modulePath, opts, cb);
		}
	}, null, done);
}

/**
 * Resolves dependencies from the node_modules folder.
 *
 * TODO: move this to somewhere else
 */
function loadFromNodeModules(from, to, opts, cb) {
	if (to.indexOf('.') === 0 || to.indexOf('/') === 0) {
		//Only path-style includes
		return cb(null, false);
	}
	let basePath = from;
	let onSuccess = catcher(cb);
	debug('Trying to load ' + to + ' as node_modules module (from=' + from +')');
	function next() {
		if (basePath === '/') {
			//Not found, so we can exit
			return cb(null, false);
		}
		basePath = path.dirname(basePath);
		let filePath = path.join(basePath, 'node_modules', to);
		debug('Trying to load ' + filePath + ' as node_module');
		loadAsModule(filePath, opts, onSuccess((res) => {
			if (res) {
				return cb(null, res);
			} else {
				next();
			}
		}));
	}
	next();
}

module.exports.defaultResolvers = [
	loadAsFile,
	loadFromPackageJson,
	loadFromFolderIndex,
	loadFromNodeModules
];
