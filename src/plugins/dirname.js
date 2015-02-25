let through = require('through2');
let path = require('path');
let applySourceMap = require('vinyl-sourcemaps-apply');
let prefixSourceMap = require('./util/prefixSourceMap');

module.exports = function(base) {
	base = base || '/';
	return through.obj((chunk, enc, done) => {
		let fileContent = chunk.contents.toString();
		let filePath = path.relative(chunk.base, chunk.path);
		filePath = path.resolve(base, filePath);
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
