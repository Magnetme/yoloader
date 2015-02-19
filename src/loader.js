(() => {
	/**
	 * Utility method that recursively merges objects.
	 */
	function recursiveMerge(base, extra) {
		Object.keys(extra).forEach((key) => {
			if (base[key] && base[key] instanceof Object) {
				base[key] = recursiveMerge(base[key], extra[key]);
			} else {
				base[key] = extra[key];
			}
		});
		return base;
	}
	//Bundle cache
	let bundles = {};
	/**
	 * Finds a file definition object in a package.
	 * @param {Object} pkg A package object
	 * @param {String} file The file to find (should be relative or absolute path)
	 * @param {String} current  The current file path
	 */
	function findFileDefinition(pkg, file, current) {
		current = current || "";
		let currentPath = current.split('/');
		//we're not interested in the filename, so we'll pop that
		currentPath.pop();
		//We're going to build up the new absolute (in-package) path by splitting the path up in parts,
		//and then recursively applying each part on the current path. We'll end up with an array of
		//path parts, which we can use to walk through the package to find the correct object
		let targetPath = file.split('/');
		if (targetPath[0] === '.') {
			targetPath = targetPath.reduce((current, nextPart) => {
				//Current folder
				if (nextPart === '.') {
					return current;
				} else if (nextPart === '..') {
					//Parent folder
					return current.slice(0, -1);
				} else {
					//Some child folder/file
					return current.concat(nextPart);
				}
			}, currentPath);
			//Walking through the package to get the definition
			let fileDef = targetPath.reduce((current, next) => {
				return current && current[next];
			}, pkg.files);
			if (fileDef) {
				// We return both the file definition and it's path
				return { fileDef, filePath : targetPath.join('/') };
			}
		} else {
			//non relative = require from path entry or otherwise globally
			let fileParts = file.split('/').filter((x) => x);
			let fileDef = fileParts.reduce((current, next) => {
				return current && current[next];
			}, pkg.pathFiles);
			if (!fileDef) {
				//try globally
				fileDef = fileParts.reduce((current, next) => {
					return current && current[next];
				}, bundles);
			}
			if (fileDef) {
				return { fileDef, filePath : file };
			}

		}
		//Oh oh..
		throw new Error("Could not find file " + file + " from " + current);
	}
	/**
	 * Loads a file from a definition object.
	 *
	 * @param {Object} pkg A package object
	 * @param {Object} definition A file definition
	 */
	function loadFromDefinition(pkg, definition) {
		let { fileDef, filePath } = definition;

		//we're first going to find all dependencies (but not load them yet)
		//We use this to build a localized require function
		let deps = {};
		Object.keys(fileDef.deps)
			.forEach((key) => {
				let dep = fileDef.deps[key];
				deps[key] = findFileDefinition(pkg, dep, filePath);
			});
		//Now it's just wrapping up: build the require function and the module.exports object and we're done
		function localRequire(file) {
			if (!deps[file]) {
				throw new Error("Could not resolve " + file + " from " + filePath);
			}
			return loadFromDefinition(pkg, deps[file]);
		}
		let module = {
			exports : {}
		};
		if (!fileDef.result) {
			fileDef.content(localRequire, module, module.exports);
			fileDef.result = {
				module : module
			};
		} else {
			module = fileDef.result.module;
		}
		return module.exports;
	}
	function load(pkg, file, current) {
		return loadFromDefinition(pkg, findFileDefinition(pkg, file, current));
	}
	window.require = {
		load (bundle) {
			recursiveMerge(bundles, bundle);
			Object.keys(bundle).forEach((packageName) => {
				let pkg = bundle[packageName];
				let entry = pkg.entry;
				if (entry) {
					entry.forEach((entry) => {
						load(pkg, entry);
					});
				}
			});
		}
	};
}());
