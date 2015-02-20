let through = require('through2');
/**
 * Renames a file before including it in the bundle.
 */
module.exports = function rename(yoloader, renames) {
	yoloader.bundlePipeline.unshift((instance, bundleOpts) => {
		return through.obj((chunk, enc, done) => {
			let renameKey = Object.keys(renames)
				.find((key) => {
					if (key.endsWith('*')) {
						key = key.slice(0, -1);
						return chunk.vinyl.path.startsWith(key);
					} else {
						return chunk.vinyl.path === key;
					}
					return chunk.vinyl.path.startsWith(key);
				});
			if (renameKey) {
				if (renameKey.endsWith('*')) {
					chunk.name = chunk.path.replace(renameKey.slice(0, -1), renames[renameKey]);
				} else {
					chunk.name = renames[renameKey];
				}
			}
			done(null, chunk);
		});
	});
};
