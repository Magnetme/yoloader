(() => {
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
	let bundles = {};
	function findFileDefinition(pkg, file, current) {
		current = current || "";
		let currentPath = current.split('/');
		//we're not interested in the filename, so we'll pop that
		currentPath.pop();
		let targetPath = file.split('/');
		if (targetPath[0] === '.' || targetPath[0] === '..') {
			targetPath = targetPath.reduce((current, nextPart) => {
				if (nextPart === '.') {
					return current;
				} else if (nextPart === '..') {
					//path up
					return current.slice(0, -1);
				} else {
					return current.concat(nextPart);
				}
			}, currentPath);
			let fileDef = targetPath.reduce((current, next) => {
				return current[next];
			}, pkg.files);
			return { fileDef, filePath : targetPath.join('/') };
		} else {
			//TODO: non-relative requires
		}
	}
	function loadFromDefinition(pkg, definition) {
		let { fileDef, filePath } = definition;
		let deps = {};
		Object.keys(fileDef.deps)
			.forEach((key) => {
				let dep = fileDef.deps[key];
				//TODO: null checking
				deps[key] = findFileDefinition(pkg, dep, filePath);
			});
		function localRequire(module) {
			if (!module) {
				throw new Error("Could not resolve " + module + " from " + filePath);
			}
			return loadFromDefinition(pkg, deps[module]);
		}
		let module = {
			exports : {}
		};
		fileDef.content(localRequire, module, module.exports);
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
