let through = require('through2');
let path = require('path');
let SourceMapGenerator = require('source-map').SourceMapGenerator;
let applySourceMap = require('vinyl-sourcemaps-apply');

module.exports = through.obj.bind(through, (chunk, enc, done) => {
	let fileContent = chunk.contents.toString();
	//Stringify should automatically make sure that the string that comes out of it is quoted
	//and valid javascript
	let filename = JSON.stringify(path.relative(chunk.base, chunk.path));
	let dirname = JSON.stringify('/' + path.relative(chunk.base, path.dirname(chunk.path)));
	let prefix = `var __dirname=${dirname},__filename=${filename};`;
	chunk.contents = new Buffer(prefix + fileContent);
	if (chunk.sourceMap) {
		let file = chunk.relative;
		let smg = new SourceMapGenerator({file : chunk.sourceMap.file});
		//Add sourcemap for prefix
		smg.addMapping({
			generated : {
				line : 1,
				column : prefix.length
			},
			source : file,
			name : file,
			original : {
				line : 1,
				column : 0
			}
		});
		//And for all other lines (the extra code doesn't add any extra lines, so we can just reuse fileContent)
		let nrOfLines = fileContent.split(/\r\n|\r|\n/).length;
		//skip the first because we've already added that above
		//Note that line-indices are 1-based, not 0-based
		for (let line = 2; line <= nrOfLines; line++) {
			let position = { line, column : 0};
			smg.addMapping({
				generated : position,
				source : file,
				name : file,
				original : position
			});
		}
		smg.setSourceContent(file, fileContent);
		applySourceMap(chunk, smg.toString());
	}
	done(null, chunk);
});
