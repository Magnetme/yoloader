let SourceMapGenerator = require('source-map').SourceMapGenerator;
/**
 * Generates a sourcemap for a file with a generated prefix.
 *
 * Assumes that the prefix is on the first line and doesn't contain newlines
 */
module.exports = function(chunk, prefix, fileContent) {
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
	return JSON.parse(smg.toString());
};
