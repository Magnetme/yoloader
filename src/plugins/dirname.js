let through = require('through2');
let path = require('path');
let SourceMapGenerator = require('source-map').SourceMapGenerator;
let applySourceMap = require('vinyl-sourcemaps-apply');

module.exports = through.obj.bind(through, (chunk, enc, done) => {
	let fileContent = chunk.contents.toString();
	//Stringify should automatically make sure that the string that comes out of it is quoted
	//and valid javascript
	let filename = JSON.stringify(path.basename(chunk.path));
	let dirname = JSON.stringify('/' + path.relative(chunk.base, path.dirname(chunk.path)));
	let prefix = '(function(__dirname,__filename){';
	let postfix = `}(${dirname},${filename}))`;
	chunk.contents = new Buffer(prefix + fileContent + postfix);
	if (chunk.sourceMap) {
		let smg = new SourceMapGenerator({file : chunk.sourceMap.file});
		smg.addMapping({
			generated : {
				line : 1,
				column : prefix.length
			},
			source : chunk.relative,
			original : {
				line : 1,
				column : 0
			}
		});
		applySourceMap(chunk, smg.toString());
	}
	done(null, chunk);
});
