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
				//Check if we've found all dependencies:
				//At this point depStreams should be an array of streams, but any dependency that could
				//not be resolved will have a falsy value instead. By applying a not operation to the
				//entire array we are left over with a mask that can filter out the unresolved files.
				//So that's exactly what we're going to do here.
				let unresolvedMask = depStreams.map(not);
				let unresolved = chunk.deps.filter(maskFilter(unresolvedMask));
				if (unresolved.length) {
					return done(new UnresolvedDependenciesError(chunk.vinyl.path, unresolved));
				}

				//TODO: this currently relies on the caching of `dependencyResolver`. Better would be to
				//improve the uniqness filter.
				depStreams = depStreams.filter(uniqFilter);

				//at this point we can push the current file and recurse
				this.push(chunk);
				let outer = this;
				if (depStreams.length) {
					//We concatinate the streams and pipe them through the rest of the pipeline
					new StreamConcat(depStreams, { objectMode : true })
						.pipe(combine(createPipeline(pipeline, opts)))
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
	bundleStream (opts) {
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
			let filesObject = getPackageObject(packageName).files;
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
				}, filesObject);

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
	serialize (opts) {
		return through.obj(function serialize(chunk, enc, done) {
			done(null, bundleSerializer(chunk));
		});
	},
	/**
	 * Beautifies a javascript object if debug is set
	 */
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
	/**
	 * Transforms a simple stream into a vinyl object.
	 */
	createVinylStream (opts) {
		return through.obj(function createVinylStream(chunk, enc, done) {
			done(null, new VinylFile({ contents : new Buffer(chunk) }));
		});
	},
	/**
	 * Collects all files passed through the transformer into the entries array of the options.
	 *
	 * This should be placed at the beginning of the pipeline, such that all files initially passed
	 * to it will be marked as entry files.
	 *
	 * If entries is already manually provided a no-op transformer will be returned, such that the
	 * user can overwrite the default behaviour easily.
	 */
	collectEntries (opts) {
		if (opts.entries) {
			return through.obj();
		} else {
			opts.entries = [];
			return through.obj((chunk, enc, done) => {
				opts.entries.push(chunk.path);
				done(null, chunk);
			});
		}
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
	//TODO: better basepath
	opts.basePath = opts.basePath || process.cwd();
	opts.resolvers = opts.resolvers || dependencyResolver.defaultResolvers;
	return combine(createPipeline(setup.concat(pipeline, finalize), opts));
};

