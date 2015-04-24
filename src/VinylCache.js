let crypto = require('crypto');

function getHash(vinylFile) {
	return crypto.createHash('md5').update(vinylFile.contents).digest('hex');
}

/**
 * Class that uses a vinyl object as its key.
 *
 * It uses a checksum of the vinyl objects content to determine if the file has changed and thus
 * if the value associated with the object is still valid.
 */
class VinylCache {
	constructor() {
		this.hashes = {};
		this.cache = {};
	}
	/**
	 * Get a value for a given vinyl file
	 *
	 * If no value is found or if the hashes don't match null is returned. If the second parameter is
	 * set to true then the hash will be ignored and any found value will be returned.
	 */
	get(vinylFile, ignoreHash) {
		let cached = this.cache[vinylFile.path];
		if (ignoreHash) {
			return cached || null;
		}
		if (cached) {
			let hash = getHash(vinylFile);
			if (this.hashes[vinylFile.path] === hash) {
				return cached;
			}
		}
		return null;
	}
	set(vinylFile, content) {
		this.cache[vinylFile.path] = content;
		let hash = getHash(vinylFile);
		this.hashes[vinylFile.path] = hash;
	}
}

module.exports = VinylCache;
