let through = require('through2');
let detective = require('detective');
let combine = require('stream-combiner');
let path = require('path');
let {
	asyncReduce,
	binder,
	invoke,
	not,
	maskFilter
} = require('./f');
let async = require('async');
let fs = require('fs');
let util = require('util');


//TODO:
//- Extract entry files. either:
//	- With a transformer at the beginning of the pipeline
//	- Manually via options (perhaps this is better, it's more flexible and allows for library-only code)
//- Get basepath. Either:
//	- Based on pwd
//	- Based on entry files
//	- Based on initial files
//	- Explicit via options
//- Support for package.json as input file (via transformers?)

function UserError() {
	Error.call(this);
}
util.inherits(UserError, Error);

function UnresolvedDependenciesError(file, dependencies) {
	UserError.call(this);
	Object.defineProperty(this, file, { value: file, enumerable : false });
	//this.file = file;
	this.dependencies = dependencies;
	let delimiter = '\n\t- ';
	this.message =  'Could not resolve all dependencies for ' + this.file + '.\n\tMissing:  ' +
	                delimiter + this.dependencies.join(delimiter);
}
util.inherits(UnresolvedDependenciesError, UserError);

//UnresolvedDependenciesError.prototype = new UserError();
UnresolvedDependenciesError.prototype.toString = function toString() {
	return this.message;
};


function dependencyResolver(chunk, opts) {
	return function resolveDependency(dep, done) {
		asyncReduce(opts.resolvers, (result, resolver, index, arr, cb) => {
			if (result) {
				return cb(null, result);
			} else {
				resolver(chunk.vinyl.path, dep, opts, cb);
			}
		}, null, done);
	};
}

let transformers = {
	/**
	 * Wraps a vinyl stream in an object.
	 *
	 * The goal of this is to be able to pass additional data alongside the vinyl stream without
	 * having to monkey patch the vinyl objects.
	 */
	wrapVinyl : through.obj.bind(null, (chunk, enc, done) => {
		done(null, {
			vinyl : chunk
		});
	}),
	/**
	 * Unwraps a wrapped vinyl stream
	 */
	unwrapVinyl : through.obj.bind(null, (chunk, enc, done) => {
		done(null, chunk.vinyl);
	}),
	/**
	 * Finds and attaches dependencies of a file
	 */
	attachDependencies : through.obj.bind(null, (chunk, enc, done) => {
		chunk.deps = detective(chunk.vinyl.contents.toString());
		done(null, chunk);
	}),
	/**
	 * Resolves dependencies.
	 */
	resolveDependencies : function(opts) {
		return through.obj(function resolveDependencies(chunk, enc, done) {
			//Push the current file, we'll need that anyway
			this.push(chunk);

			//TODO: filter out requires that we're not going to resolve here
			async.map(chunk.deps, dependencyResolver(chunk, opts), function (err, depPaths) {
				if (err) {
					return done(err);
				}
				let unresolvedMask = depPaths.map(not);
				let unresolved = chunk.deps.filter(maskFilter(unresolvedMask));
				if (unresolved.length) {
					return done(new UnresolvedDependenciesError(chunk.vinyl.path, unresolved));
				}
				//Note: atm we only have paths where the files should be, but no guarantees yet
				async.map(depPaths, fs.readFile, (files) => {
					console.log(files);
					console.log(files.map(invoke({}.toString)));
				});
			//	return done(null, depPaths);
			});
		});
	}
};


let pipeline = [transformers.wrapVinyl,
	transformers.attachDependencies,
	transformers.resolveDependencies,
	transformers.unwrapVinyl];

let pathResolvers = [
	function relativeResolver(from, to, opts, cb) {
		//Only deal with relative paths
		if (to.indexOf('.') !== 0) {
			return cb(null, false);
		}
		//Otherwise we can just let `path` deal with it
		return cb(null, path.resolve(path.dirname(from), to));
	},
	function absoluteResolver(from, to, opts, cb) {
		if (to.indexOf('/') !== 0) {
			return cb(null, false);
		}
		console.warn('Warning: absolute require for file ' + to + '  found in ' + from + '. This is likely an error');
		return cb(null, to);
	},
	//TODO: move this to somewhere else
	//
	function nodeModulesResolver(from, to, opts, cb) {
		let basePath = from;
		function next() {
			if (basePath === '/') {
				//Not found, so we can exit
				return cb(null, false);
			}
			basePath = path.dirname(basePath);
			let filePath = path.join(basePath, 'node_modules', to);
			fs.exists(filePath, (exists) => {
				if (exists) {
					cb(null, filePath);
				} else {
					next();
				}
			});
		}
		next();
	}
];

module.exports = (opts) => {
	opts = opts || {};
	opts.resolvers = opts.resolvers || pathResolvers;
	var stream =  combine.apply(null, pipeline.map(binder(opts)).map(invoke));
	return stream;
};

