let through = require('through2');
let detective = require('detective');
let combine = require('stream-combiner');
let path = require('path');
let {
	binder,
	invoke,
	not,
	maskFilter,
	catcher
} = require('./f');
let async = require('async');
let fs = require('fs');
let util = require('util');
let dependencyResolver = require('./dependencyResolver');

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
	this.file = file;
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
	resolveDependencies (opts) {
		return through.obj(function resolveDependencies(chunk, enc, done) {
			//Push the current file, we'll need that anyway
			let onSuccess = catcher(done);

			//TODO: filter out requires that we're not going to resolve here
			async.map(chunk.deps, dependencyResolver(chunk, opts), onSuccess((depPaths) => {
				//Check if we've found all
				let unresolvedMask = depPaths.map(not);
				let unresolved = chunk.deps.filter(maskFilter(unresolvedMask));
				if (unresolved.length) {
					return done(new UnresolvedDependenciesError(chunk.vinyl.path, unresolved));
				}
				//Note: atm we only have paths where the files should be, but no guarantees yet
			 console.log(depPaths);
			//	return done(null, depPaths);
				this.push(chunk);
			}));

		});
	}
};


let pipeline = [transformers.wrapVinyl,
	transformers.attachDependencies,
	transformers.resolveDependencies,
	transformers.unwrapVinyl];

function createPipeline(opts) {
	return pipeline.map(binder(opts)).map(invoke);
}

module.exports = (opts) => {
	opts = opts || {};
	opts.resolvers = opts.resolvers || dependencyResolver.defaultResolvers;
	var stream =  combine.apply(null, createPipeline(opts));
	return stream;
};

