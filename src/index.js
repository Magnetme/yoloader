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
let dependencyResolver = require('./dependencyResolver');
let VinylFile = require('vinyl');
let StreamConcat = require('stream-concat');
let beautify = require('js-beautify');
let bundleSerializer = require('./bundleSerializer');
//TODO: check if we might add constructors to the bundle.
//Constructors will help us to mark objects in the tree with a type, such that we can more easily mix stuff there.
//TODO: search paths. When doing this we need to maintain a list of already loaded modules with their absolute path.
//This allows us to detect overlapping search paths, which we can use to merge overlapping modules.

let transformers = {
	/**
	 * Wraps a vinyl stream in an object.
	 *
	 * The goal of this is to be able to pass additional data alongside the vinyl stream without
	 * having to monkey patch the vinyl objects.
	 */
	wrapVinyl (opts) {
		return through.obj((chunk, enc, done) => {
			done(null, {
				vinyl : chunk
			});
		});
	},
	/**
	 * Finds and attaches dependencies of a file
	 */
	findDependencies : through.obj.bind(null, (chunk, enc, done) => {
		chunk.deps = detective(chunk.vinyl.contents.toString());
		done(null, chunk);
	}),
	/**
	 * Resolves dependencies and adds them to the stream
	 */
	resolveDependencies (instance) {
		return through.obj(function resolveDependencies(chunk, enc, done) {
			//Push the current file, we'll need that anyway
			let onSuccess = catcher(done);

			//TODO: filter out requires that we're not going to resolve here
			async.map(chunk.deps, dependencyResolver(chunk, instance.options), onSuccess((deps) => {
				//Check if we've found all dependencies:
				//At this point depStreams should be an array of streams, but any dependency that could
				//not be resolved will have a falsy value instead. By applying a not operation to the
				//entire array we are left over with a mask that can filter out the unresolved files.
				//So that's exactly what we're going to do here.
				let unresolvedMask = deps.map(not);
				let unresolved = chunk.deps.filter(maskFilter(unresolvedMask));
				if (unresolved.length) {
					return done(new UnresolvedDependenciesError(chunk.vinyl.path, unresolved));
				}

				//Now we're going to replace the string based deps by objects with a mapping of require name
				//to their relative path
				let oldDeps = chunk.deps;
				chunk.deps = {};
				oldDeps.forEach((dep, index) => {
					//TODO: don't always prefix with ./, it's not always needed
					chunk.deps[dep] = './' + path.relative(path.dirname(chunk.vinyl.path), deps[index].path);
				});
				//at this point we can push the current file and recurse
				this.push(chunk);
				//TODO: this currently relies on the caching of `dependencyResolver`. Better would be to
				//improve the uniqness filter.
				let depStreams = deps.map((dep) => dep.vinyl).filter(uniqFilter);
				let outer = this;
				if (depStreams.length) {
					//We concatinate the streams and pipe them through the rest of the pipeline
					instance.compiler(new StreamConcat(depStreams, { objectMode : true }), instance)
					//TODO: either remove this line or reintroduce it
						//.pipe(combine(createPipeline(pipeline, opts)))
						.pipe(through.obj(function deps(chunk, enc, cb) {
							//Each file found in the recursive step will also be pushed to the outer stream to
							//collect all files together
							outer.push(chunk);
							cb(null, chunk);
						}, () => { done(); }));
				} else {
					done();
				}
			}));
		});
	},

	/**
	 * Bundles all streams together into one bundle object.
	 */
	bundleStream (instance, bundleOpts) {
		let bundle = {};
		/**
		 * Gets (or creates) an object for a package.
		 *
		 * The object returned will be already created in the bundle object, so anything placed here
		 * will end up in the bundle.
		 */
		function getPackageObject(packageName) {
			if (!bundle[packageName]) {
				bundle[packageName] = {
					files : {},
					path : [],
					entry : []
				};
			}
			return bundle[packageName];
		}
		/**
		 * Returns the name of a package based on it's path.
		 *
		 * For now it just implements path.basename, but in the future it might do something more intelligent,
		 * like searching for the package.json.
		 */
		function getPackageNameFromPath(filePath) {
			return path.basename(filePath);
		}
		//We'll bundle all the individual stream items into one object here
		return through.obj(function toBundle(chunk, enc, done) {
			let filePath = path.relative(chunk.vinyl.base, chunk.vinyl.path);
			let packageName = getPackageNameFromPath(chunk.vinyl.base);
			let packageObject = getPackageObject(packageName);
			//We need to get hold of an object where we can place the content of the module.
			//Since the bundle is structured as an object representation of a file system we need to
			//walk through the bundle tree as if it was a file system.
			//With a combination of split and reduce we can walk through the bundle tree, creating path
			//entries on the fly, and finally end up at the object we're interested in.
			let target = filePath
				.split('/')
				//leading or trailing slashes will leave empty strings, so we use an identity function to
				//filter those out.
				.filter((x) => x)
				.reduce((bundle, part) => {
					if (!bundle[part]) {
						bundle[part] = {};
					}
					return bundle[part];
				}, packageObject.files);

			if (bundleOpts.entries.indexOf(chunk.vinyl.path) !== -1) {
				packageObject.entry.push('./' + filePath);
			}

			//We've found our object, so we can place our info here
			//We keep the vinyl stream as it is, such that the serializer can later transform that into
			//an actual function
			target.content = chunk.vinyl;
			target.deps = chunk.deps;
			done();
		}, function finalizeBundle() { //NOTE: don't use arrow functions here, it binds this and messes stuff up
			this.push(bundle);
		});
	},
	/**
	 * Serializes a bundle object into a js file
	 */
	serialize (instance) {
		return through.obj(function serialize(chunk, enc, done) {
			done(null, bundleSerializer(chunk));
		});
	},
	/**
	 * Beautifies a javascript object if debug is set
	 */
	beautify (instance) {
		if (!instance.options.debug) {
			return through.obj();
		} else {
			return through.obj((chunk, enc, done) => {
				let beauty = new Buffer(beautify(chunk));
				done(null, beauty);
			});
		}
	},
	/**
	 * Transforms a simple stream into a vinyl object.
	 */
	createVinylStream (instance, bundleOpts) {
		return through.obj(function createVinylStream(chunk, enc, done) {
			done(null, new VinylFile({ contents : new Buffer(chunk), path : bundleOpts.name }));
		});
	}
};


//TODO: rename
let pipeline = [transformers.wrapVinyl,
	transformers.findDependencies,
	transformers.resolveDependencies
];

let finalize = [
	transformers.bundleStream,
	transformers.serialize,
	transformers.beautify,
	transformers.createVinylStream
];

function createPipeline(transformers, ...opts) {
	return transformers.map(binder(...opts)).map(invoke);
}

function defaultCompiler(stream, common) {
	return stream
		.pipe(common.processDeps());
}

function defaultDependencyProcessor(...args) {
	return combine(createPipeline(pipeline, ...args));
}

function defaultBundler(...args) {
	return combine(createPipeline(finalize, ...args));
}

class Common {
	constructor(options) {
		this.compiler = options.compiler || defaultCompiler;
		this.dependencyProcessor = options.dependencyProcessor || defaultDependencyProcessor;
		this.bundler = options.bundler || defaultBundler;

		this.options = options;
	}

	processDeps(opts) {
		//TODO: caching
		return this.dependencyProcessor(this, opts);
	}
	bundle(bundleOpts) {
		return this.bundler(this, bundleOpts);
	}
}
module.exports = Common;
