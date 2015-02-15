let fs = require('fs');
let { catcher } = require('../f');

/**
 * Checks if a dependency name is a global dependency (i.e. it does not begin with . or /)
 */
function isGlobal(depName) {
	return depName.charAt(0) !== '.' && depName.charAt(0) !== '/';
}
/**
 * Checks if a dependency object is already resolved.
 */
function isResolved(dep) {
	return !!dep.path;
}

/**
 * Checks if the given file is actually a file
 */
function isFile(filePath, cb) {
	fs.stat(filePath, catcher(cb)((stat) => {
		if (stat.isFile()) {
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
			return isFile(filePath, cb);
		}
	});
}

module.exports = { isGlobal, isResolved, existsAndIsFile, isFile };
