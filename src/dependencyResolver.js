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
			path : null,
			base : null
		};
		asyncReduce(instance.dependencyResolvers, (result, resolver, index, arr, cb) => {
			let timeout = setTimeout(() =>
			                           done(new Error("Resolver took more than a second, it's probably broken")),
			                         1000);
			let opts = {
				compileOptions : compileOptions,
				base : chunk.vinyl.base,
				resolve : resolveDependency
			};
			resolver(dep, opts, (...args) => {
				clearTimeout(timeout);
				cb.apply(null, args);
			}) ;
		}, null, (err, dep) => {
			if (err) {
				done(err);
			} else {
				done(null, toResultObject(dep));
			}
		});
	};
};

let fileCache = {};

function toResultObject(dep) {
	if (!dep.path) {
		return false;
	}
	if (!fileCache[dep.path]) {
		fileCache[dep.path] = { file : dep.path, base : dep.base };
	}

	return fileCache[dep.path];
}

module.exports.defaultResolvers = [
	resolveFile,
	resolveJsFile,
	resolvePackageMain,
	resolveFolderIndex,
	resolveNodeModule,
	resolvePath
];
