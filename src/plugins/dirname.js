let through = require('through2');
let path = require('path');
let applySourceMap = require('vinyl-sourcemaps-apply');
let prefixSourceMap = require('./util/prefixSourceMap');

module.exports = through.obj.bind(through, (chunk, enc, done) => {
	let fileContent = chunk.contents.toString();
	//Stringify should automatically make sure that the string that comes out of it is quoted
	//and valid javascript
	let filename = JSON.stringify(path.relative(chunk.base, chunk.path));
	let dirname = JSON.stringify('/' + path.relative(chunk.base, path.dirname(chunk.path)));
	let prefix = `var __dirname=${dirname},__filename=${filename};`;
	chunk.contents = new Buffer(prefix + fileContent);
	if (chunk.sourceMap) {
		let map = prefixSourceMap(chunk, prefix, fileContent);
		applySourceMap(chunk, map);
	}
	done(null, chunk);
});
