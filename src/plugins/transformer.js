let through = require('through2');
/**
 * Wraps a browserify transformer to be used in a normal vinyl stream.
 *
 * Browserify transformers act on a single file, but streams may consist of many files. This plugin
 * calls the transformer constructor with the filename of each file, and applies the returned transformer.
 *
 * @param {Function} t - The transformer constructor
 * @param {any} opts - Additional options to be passed to the transformer
 */
module.exports = function transformer(t, opts) {
	return through.obj((chunk, enc, done) => {

		let bTransformer = t(chunk.path, opts);

		let outer = this;

		let buf = new Buffer('');
		bTransformer.pipe(through((processed, enc, cb) => {
			if (processed instanceof Buffer) {
				buf = Buffer.concat([buf, processed]);
			} else {
				buf.write(processed);
			}
			cb();
		}, (cb) => {
			chunk.contents = buf;
			done(null, chunk);
			cb();
		}));

		//We work with vinyl streams, but browserify work with vanilla streams. Therefore we need
		//to unwrap them first.
		bTransformer.end(chunk.contents, enc);
	});
};
