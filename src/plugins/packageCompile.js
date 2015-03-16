let mothership = require('mothership');
let path = require('path');
let through = require('through2');

/**
 * Plugin that finds compile scripts in the package.json and applies it to the stream.
 *
 * The transform takes an options hash containing options to pass to specific packages. E.g.
 * to pass the options `{ dev : true}` to the compiler for the foo package you should use the plugin
 * as followed:
 *
 * var packageOptions = {
 *   foo : { dev : true }
 * };
 * fileStream
 *   .pipe(packageCompile(packageOptions))
 *   .pipe(outStream);
 *
 * Additionally a second object may be passed to the packageCompile transform which will be passed
 * to all transform functions. This object will be merged with the package specific options by means
 * of prototypal inheritance (the shared object will be the prototype of a clone of the package
 * specific options). Additionally the package specific and global options will be passed separately
 * as second and third argument to the transform function as well, but it is recommended to only use
 * the combined options.
 */
module.exports = function packageCompile(opts, globalOptions) {
	globalOptions = globalOptions || {};
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
			let packageOptions = (name && opts[name]) || {};
			var compileOptions = Object.create(globalOptions);
			Object.keys(packageOptions)
				.forEach((optionKey) => compileOptions[optionKey] = packageOptions[optionKey]);



			let compileFilePath = path.resolve(path.dirname(res.path), compileFileName);

			//Same trick as always: create the transformer stream, push the current chunk to it and
			//pipe the output back into the outer stream
			let compiler = require(compileFilePath)(compileOptions, packageOptions, globalOptions);

			compiler.pipe(through.obj((chunk, enc, cb) => {
				outerStream.push(chunk);
				cb();
			}, (cb) => { done(); cb(); }));

			compiler.end(chunk, enc);
		});
	});
};
