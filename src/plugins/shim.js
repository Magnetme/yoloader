let through = require('through2');
let applySourceMap = require('vinyl-sourcemaps-apply');
let prefixSourceMap = require('./util/prefixSourceMap');
let minimatch = require('minimatch');
let path = require('path');
let mothership = require('mothership');

/**
 * Expands node_modules style shims to glob patterns.
 */
function extractPackageShims(shims) {
	let packageShims = {};
	Object.keys(shims)
		.filter((shimKey) => !path.isAbsolute(shimKey))
		//This second filter tries to filter out glob patterns by checking if the first character
		//could be the first character of a glob pattern. These are all rarely used tokens in files
		//and all not valid for npm packages, so it's safe to assume that we don't exclude valid package
		//names here.
		.filter((shimKey) => !shimKey.match(/^[\*\!\+\{\[\?]/))
		.forEach((shimKey) => {
			packageShims[shimKey] = shims[shimKey];
			delete shims[shimKey];
		});
	return packageShims;
}

/**
 * Finds the shim for a file.
 *
 * @param {String} file Full path to the file to shim
 * @param {Object} shims Shims definition (glob & full path)
 * @param {Object} packageShims Shim definitions for node_modules packages
 * @param {Function} cb Standard node style callback. Will be called with the shim config if found,
 *                      or with a falsy value if no shim config for this file is found.
 */
function findShim(file, shims, packageShims, cb) {
	//First try to get a regular shim
	let shim = shims[file];
	if (!shim) {
		//If we haven't found a regular one, try glob matching
		let shimKey = Object.keys(shims)
			.find((shim) => minimatch(file, shim));
		if (shimKey) {
			shim = shims[shimKey];
		}
	}
	if (!shim) {
		//If we still haven't found a shim here then we try a package based shim
		let keys = Object.keys(packageShims);
		//First we skip the obvious base case: if there is no packageShim definition then there's nothing
		//to do here
		if (!keys.length) {
			return cb();
		}
		//First we simply try to match on filename
		let shim = keys
			.find((shimKey) => {
				let shimFile = shimKey;
				//require calls don't require .js, so we don't either
				if (!shimFile.endsWith('.js')) {
					shimFile += '.js';
				}
				return file.endsWith('node_modules/' + shimFile) ||
					//Note that we use shimKey here, not shimFile, since we use the name here as folder name,
					//not as filename
					file.endsWith('node_modules/' + shimKey + '/index.js');
			});
		if (shim) {
			return cb(null, shim);
		}
		//Otherwise we'll need to get the package.json, and figure out if the package name matches AND
		//the current file is the main file
		mothership(file, () => true, (err, res) => {
			if (err) {
				cb(err);
			} else {
				let isMain = path.join(path.dirname(res.path), res.pack.main) === file;
				let shim = isMain && packageShims[res.pack.name];
				cb(null, shim);
			}
		});
	}
}

/**
 * Provides a shim for non-commonjs files.
 */
module.exports = function shim(shims) {
	let packageShims = extractPackageShims(shims);

	return through.obj((chunk, enc, done) => {

		findShim(chunk.path, shims, packageShims, (err, shim) => {
			if (err) {
				return done(err);
			}
			if (shim) {

				//Expand string form to object form, for easier use later on
				if (shim instanceof String || typeof shim === 'string') {
					shim = {
						exports : shim
					};
				}
				let prefix = '';
				let suffix = '';
				//Add require calls when needed
				if (shim.depends) {
					//Depends is a map of <var-name>:<require-name> pairs
					let requires = Object.keys(shim.depends)
						.map((dependency) => {
							//stringify to ensure valid js
							let requireString = JSON.stringify(shim.depends[dependency]);
							return `${dependency}=require(${requireString})`;
						});
					prefix = 'var ' + requires.join(',') + ';';
				}
				if (shim.exports) {
					//We need a leading ; because we can't be sure the file is closed properly
					suffix = ';module.exports=' + shim.exports + ';';
				}
				let fileContent = chunk.contents.toString();
				chunk.contents = new Buffer(prefix + fileContent + suffix);
				//Apply sourcemaps
				if (chunk.sourceMap) {
					let map = prefixSourceMap(chunk, prefix, fileContent);
					applySourceMap(chunk, map);
				}
			}
			done(null, chunk);

		});

	});
};
