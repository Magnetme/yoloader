let through = require('through2');
let path = require('path');
let applySourceMap = require('vinyl-sourcemaps-apply');
let prefixSourceMap = require('./util/prefixSourceMap');

/**
 * Creates the __dirname and __filename variables for a file.
 *
 * @param {String} [opts.base] Base path from which __dirname and __filename will be calculated.
 *                             If no base path is given chunk.base will be used.
 * @param {String} [opts.prefix] path that will be prefixed to __dirname and __filename.
 */
module.exports = function(opts) {
	let pathPrefix = opts.prefix || '/';
	return through.obj((chunk, enc, done) => {
		let base = opts.base || chunk.base;
		let fileContent = chunk.contents.toString();
		let filePath = path.relative(base, chunk.path);
		filePath = path.resolve(pathPrefix, filePath);
		let dirPath = path.dirname(filePath);
		//Stringify should automatically make sure that the string that comes out of it is quoted
		//and valid javascript
		let filename = JSON.stringify(filePath);
		let dirname = JSON.stringify(dirPath);
		let prefix = `var __dirname=${dirname},__filename=${filename};`;
		chunk.contents = new Buffer(prefix + fileContent);
		if (chunk.sourceMap) {
			let map = prefixSourceMap(chunk, prefix, fileContent);
			applySourceMap(chunk, map);
		}
		done(null, chunk);
	});
};
