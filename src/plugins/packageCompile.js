let mothership = require('mothership');
let path = require('path');
let through = require('through2');

/**
 * Plugin that finds compile scripts in the package.json and applies it to the stream
 */
module.exports = function packageCompile(opts) {
	return through.obj(function(chunk, enc, done) {
		let outerStream = this;
		//We need to find the package.json of our chunk to find the compiler configuration
		//The package.json#yoloader-compile field should contain the filename of the module compiler
		mothership(chunk.path, () => true, (err, res) => {
			if (err) {
				return done(err);
			}
			let compileFileName = res.pack['yoloader-compile'];
			if (!compileFileName) {
				return done(null, chunk);
			}

			let name = res.pack.name;
			let compileOpts = name && opts[name];

			let compileFilePath = path.resolve(path.dirname(res.path), compileFileName);

			//Same trick as always: create the transformer stream, push the current chunk to it and
			//pipe the output back into the outer stream
			let compiler = require(compileFilePath)(compileOpts);

			compiler.pipe(through.obj((chunk, enc, cb) => {
				outerStream.push(chunk);
				cb();
			}, (cb) => { done(); cb(); }));

			compiler.end(chunk, enc);
		});
	});
};
