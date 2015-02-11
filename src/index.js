let through = require('through2');
let detective = require('detective');
let combine = require('stream-combiner');
let path = require('path');
let {
	binder,
	invoke,
	not,
	maskFilter,
	catcher,
	uniqFilter
} = require('./f');
let async = require('async');
let fs = require('fs');
let vinylFs = require('vinyl-fs');
let util = require('util');
let dependencyResolver = require('./dependencyResolver');
let VinylFile = require('vinyl');
let StreamConcat = require('stream-concat');
let beautify = require('js-beautify');

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
			async.map(chunk.deps, dependencyResolver(chunk, opts), onSuccess((depStreams) => {
				//Check if we've found all
				let unresolvedMask = depStreams.map(not);
				let unresolved = chunk.deps.filter(maskFilter(unresolvedMask));
				if (unresolved.length) {
					return done(new UnresolvedDependenciesError(chunk.vinyl.path, unresolved));
				}
				//Note: atm we only have paths where the files should be, but no guarantees yet
				depStreams = depStreams.filter(uniqFilter);
				//Now recurse the shit
				let outer = this;
				let finish = done;
				this.push(chunk);
				if (depStreams.length) {
					//Recursion FTW!
//					vinylFs.src(depPaths)
					new StreamConcat(depStreams, { objectMode : true })
						.pipe(combine(createPipeline(pipeline, opts)))
						.pipe(through.obj(function deps(chunk, enc, done) {
							outer.push(chunk);
							done(null, chunk);
						}, () => { finish(); }));
				} else {
					finish();
				}

			}));

		});
	},

	bundleStream (opts) {
		let obj = {};
		return through.obj(function toJson(chunk, enc, done) {
			function getModuleObj(moduleName) {
				if (!obj[moduleName]) {
					obj[moduleName] = {
						files : {},
						path : [],
						entry : []
					};
				}
				return obj[moduleName];
			}
			function getModuleNameFromPath(filePath) {
				return path.basename(filePath);
			}
			/*
			let filePath = chunk.vinyl.path;
			if (filePath.indexOf(opts.basePath) === 0) {
				filePath = filePath.substr(opts.basePath.length);
			}
			//TODO: configure modulename
			let moduleName = path.basename(opts.basePath);
			obj[moduleName] = obj[moduleName] || {
				files : {},
				//TODO: fix path and entry
				path : [],
				entry : []
			};
			*/
			let filePath = path.relative(chunk.vinyl.base, chunk.vinyl.path);
			let targetObj = filePath.split('/').filter((x) => x).reduce((obj, part) => {
				if (!obj[part]) {
					obj[part] = {};
				}
				return obj[part];
			}, getModuleObj(getModuleNameFromPath(chunk.vinyl.base)).files);
			/* jshint evil:true */
			targetObj.content = chunk.vinyl;
			/* jshint evil:false */
			targetObj.deps = chunk.deps;
			done();
		}, function finishJson() {
			//TODO: actual cwd
			/*
			var file = new VinylFile({
				cwd : process.cwd(),
				base : '/',
				path : '/out.json',
				contents : new Buffer(JSON.stringify(obj, null, '\t'))
			});
			*/
			this.push(obj);
		});
	},
	serialize (opts) {
		return through.obj(function serialize(chunk, enc, done) {
			//We need to serialize the object including functions, so we can't use JSON.stringify.
			//Therefore, custom serialization. It delegates to JSON.stringify for primitives, and
			//implements serialization for arrays, objects and the vinyl objects itself
			//It doesn't do any formatting though, that can be done

			//TODO: move serialization code

			/**
			 * Check if an object is a vinyl object.
			 *
			 * Currently it's done a bit cracky, it just checks if the expected properties are set.
			 * However, that's sufficient for now
			 */
			function isVinyl(obj) {
				return (obj.cwd !== undefined &&
				        obj.base !== undefined &&
				        obj.path !== undefined &&
				        obj.contents !== undefined);
			}

			function serializeThing(thing) {
				let serializer;
				if (thing instanceof Array) {
					serializer = serializeArray;
				} else if (thing instanceof Object && isVinyl(thing)) {
					serializer = serializeModule;
				} else if (thing instanceof Object) {
					serializer = serializeObject;
				} else {
					serializer = JSON.stringify;
				}
				return serializer(thing);
			}

			function serializeModule(module) {
				let res = 'function(require,module,exports){';
				res += module.contents.toString();
				res += '}';
				return res;
			}

			function serializeArray(arr) {
				let res = '[';

				res += arr
					.map((item) => {
						return serializeThing(item);
					})
					.join(',');

				res += ']';
				return res;
			}

			function serializeObject(obj) {
				let res = '{';
				//We only want the own enumerable properties, so we use Object.keys to get all those keys
				res += Object.keys(obj)
					.map((key) => {
						//Just in case we stringify the key. This should always result in a quoted string, which then
						//can be used as the key in an object. (not every unquoted string is a valid identifier)
						return JSON.stringify(key) + ':' + serializeThing(obj[key]);
					})
					.join(',');

				res += '}';
				return res;
			}
			done(null, serializeThing(chunk));
		});
	},
	beautify (opts) {
		if (!opts.debug) {
			return through.obj();
		} else {
			return through.obj((chunk, enc, done) => {
				let beauty = new Buffer(beautify(chunk));
				done(null, beauty);
			});
		}
	},
	createVinylStream (opts) {
		return through.obj(function createVinylStream(chunk, enc, done) {
			done(null, new VinylFile({ contents : new Buffer(chunk) }));
		});
	},
	collectEntries (opts) {
		return through.obj((chunk, enc, done) => {
			opts.entries.push(chunk.path);
			done(null, chunk);
		});
	}
};

let setup = [
	transformers.collectEntries
];

let pipeline = [transformers.wrapVinyl,
	transformers.attachDependencies,
	transformers.resolveDependencies
];

let finalize = [
	transformers.bundleStream,
	transformers.serialize,
	transformers.beautify,
	transformers.createVinylStream
];

function createPipeline(transformers, opts) {
	return transformers.map(binder(opts)).map(invoke);
}


module.exports = (opts) => {
	opts = opts || {};
	opts.entries = [];
	//TODO: better basepath
	opts.basePath = opts.basePath || process.cwd();
	opts.resolvers = opts.resolvers || dependencyResolver.defaultResolvers;
	return combine(createPipeline(setup.concat(pipeline, finalize), opts));
};

