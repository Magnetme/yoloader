let through = require('through2');
let applySourceMap = require('vinyl-sourcemaps-apply');
let prefixSourceMap = require('./util/prefixSourceMap');
let minimatch = require('minimatch');

/**
 * Provides a shim for non-commonjs files.
 */
module.exports = function shim(shims) {
	return through.obj((chunk, enc, done) => {
		let shim = shims[chunk.path];
		if (!shim) {
			let shimKey = Object.keys(shims)
				.find((shim) => minimatch(chunk.path, shim));
			if (shimKey) {
				shim = shims[shimKey];
			}
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
};
