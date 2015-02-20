//TODO: all sorts of caching (at least to allow cyclic requires)
//TODO: Do base paths in a better way, it's a bit fragile now
//TODO: Check if upwards paths (../) work with vinyl
let {
	asyncReduce,
	catcher
} = require('./f');
let path = require('path');
let fs = require('fs');
let vinylFs = require('vinyl-fs');
let debug = require('debug')('yoloader:resolve');
let resolveFile = require('./dependencyResolvers/resolveFile');
let resolveJsFile = require('./dependencyResolvers/resolveJsFile');
let resolvePackageMain = require('./dependencyResolvers/resolvePackageMain');
let resolveFolderIndex = require('./dependencyResolvers/resolveFolderIndex');
let resolveNodeModule = require('./dependencyResolvers/resolveNodeModule');
let resolvePath = require('./dependencyResolvers/resolvePath');

/**
 * Resolves the dependencies for a file to full file paths
 */
module.exports = function dependencyResolver(chunk, instance) {
	let compileOptions = instance.options;

	debug('Creating dependency resolver for ' + chunk.vinyl.path);
	return function resolveDependency(depName, done) {
		debug('Resolving dependency from ' + chunk.vinyl.path + ' to ' + depName);
		let dep = {
			from : chunk.vinyl.path,
			to : depName,
			file : null,
			base : null,
			//The resolved path under which it will be loaded. This can be used to overwrite the normal
			//behaviour, e.g. when you expose a file under a different name than it's actual filename.
			as : null
		};
		asyncReduce(instance.dependencyResolvers, (result, resolver, index, arr, cb) => {
			let opts = {
				compileOptions : compileOptions,
				base : chunk.vinyl.base,
				resolve : resolveDependency
			};
			resolver(dep, opts, cb);
		}, null, (err, dep) => {
			if (err) {
				done(err);
			} else if (dep.file) {
				done(null, dep);
			} else {
				done(null, false);
			}
		});
	};
};

module.exports.defaultResolvers = [
	resolveFile,
	resolveJsFile,
	resolvePackageMain,
	resolveFolderIndex,
	resolveNodeModule,
	resolvePath
];
