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
	 * @param {Object} packageName Name of the package
	 * @param {String} file The file to find (should be relative or absolute path)
	 * @param {String} current  The current file path
	 */
	function findFileDefinition(packageName, file, current) {
		let pkg = bundles[packageName];
		current = current || "";
		let currentPath = current.split('/');
		//we're not interested in the filename, so we'll pop that
		currentPath.pop();
		//We're going to build up the new absolute (in-package) path by splitting the path up in parts,
		//and then recursively applying each part on the current path. We'll end up with an array of
		//path parts, which we can use to walk through the package to find the correct object
		let targetPath = file.split('/');
		let fullPathParts = null;
		if (targetPath[0] === '.') {
			fullPathParts = targetPath.reduce((current, nextPart) => {
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
		} else {
			//Non relative, require globally
			fullPathParts = file.split('/').filter((x) => x);
		}

		let targetPackage = bundles[fullPathParts[0]];
		if (targetPackage) {
			let fileDef = fullPathParts.slice(1).reduce((current, next) => {
				return current && current[next];
			}, targetPackage.files);
			if (fileDef) {
				return { fileDef, filePath : fullPathParts.join('/') };
			}
		}
		//Oh oh.. (should've returned by now)
		throw new Error("Could not find file " + file + " from " + current);
	}
	/**
	 * Loads a file from a definition object.
	 *
	 * @param {Object} packageName Name of the package
	 * @param {Object} definition A file definition
	 */
	function loadFromDefinition(packageName, definition) {
		let { fileDef, filePath } = definition;

		//we're first going to find all dependencies (but not load them yet)
		//We use this to build a localized require function
		let deps = {};
		Object.keys(fileDef.deps)
			.forEach((key) => {
				let dep = fileDef.deps[key];
				deps[key] = findFileDefinition(packageName, dep, filePath);
			});
		//Now it's just wrapping up: build the require function and the module.exports object and we're done
		function localRequire(file) {
			if (!deps[file]) {
				throw new Error("Could not resolve " + file + " from " + filePath);
			}
			return loadFromDefinition(packageName, deps[file]);
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
	function load(packageName, file, current) {
		return loadFromDefinition(packageName, findFileDefinition(packageName, file, current));
	}
	window.require = function(file) {
		let fileParts = file.split('/');
		let packageName = fileParts[0];
		if (!bundles[packageName]) {
			throw new Error("Could not resolve " + file);
		}
		fileParts[0] = '.';
		let def = findFileDefinition(packageName, fileParts.join('/'), '.');
		loadFromDefinition(packageName, def);
	};
	window.require.load = (bundle) => {
		recursiveMerge(bundles, bundle);
		Object.keys(bundle).forEach((packageName) => {
			//Note: the shared bundles should be used here, such that external files can be loaded as well
			let pkg = bundles[packageName];
			let entry = pkg.entry;
			if (entry) {
				entry.forEach((entry) => {
					load(packageName, entry, packageName + '/');
				});
			}
		});
	};
}());
