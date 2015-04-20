require('babel/polyfill');
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
	values,
	getter
} = require('./f');
let async = require('async');
let fs = require('fs');
let vinylFs = require('vinyl-fs');
let dependencyResolver = require('./dependencyResolver');
let VinylFile = require('vinyl');
let StreamConcat = require('stream-concat');
let beautify = require('js-beautify');
let bundleSerializer = require('./bundleSerializer');
let countDownLatch = require('./countDownLatch');
let UnresolvedDependenciesError = require('./errors/UnresolvedDependenciesError');
let crypto = require('crypto');

//Very simple ad hoc profiling implementation. I couldn't find any good non-continuous profiling
//libraries in a couple of minutes, so writing my own is faster here. (suggestions for better frameworks
//are welcome!)
let startTimer = () => { return { stop(){} };};
let printTimings = () => {};
if (process.env.YOLOADER_PROFILE) {
	let totalTimings = {};
	startTimer = (name) => {
		let start = new Date().getTime();
		return {
			stop() {
				let now = new Date().getTime();
				if (!start) {
					console.error('timer was already stopped');
				} else {
					let totalTiming = totalTimings[name] || { time : 0, calls : 0 };
					totalTiming.time += now - start;
					totalTiming.calls++;
					totalTimings[name] = totalTiming;
					start = null;
				}
			}
		};
	};
	printTimings = () => {
		console.log(totalTimings);
	};
}

let transformers = {

	/**
	 * Finds and attaches dependencies of a file
	 */
	findDependencies (instance) {
		instance.dependencyCache = instance.dependencyCache || {};
		return through.obj((chunk, enc, done) => {
			let content = chunk.contents.toString();
			let hash = crypto.createHash('md5').update(content).digest('hex');
			let cachedDeps = instance.dependencyCache[hash];
			if (cachedDeps) {
				chunk.deps = cachedDeps;
			} else {
				let timer = startTimer('findDeps');
				instance.dependencyCache[hash] = chunk.deps = {};
				detective(content)
					//For now all dependencies will have value null since they're not resolved yet
					.forEach((dep) => chunk.deps[dep] = null );
				timer.stop();
			}
			done(null, chunk);
		});
	},

	/**
	 * Resolves dependencies and adds them to the stream
	 */
	resolveDependencies (instance) {
		return through.obj(function resolveDependencies(chunk, enc, done) {
			let timer = startTimer('resolveDeps');
			//Push the current file, we'll need that anyway
			let onSuccess = catcher(done);

			let deps = Object.keys(chunk.deps)
				.filter((dep) => {
					return !chunk.deps[dep];
				});

			async.map(deps, dependencyResolver(chunk, instance), onSuccess((resolvedDeps) => {
				//Check if we've found all dependencies:
				//At this point resolvedDeps should be an array of {file, base} pairs, but any dependency that could
				//not be resolved will have falsy values for the file values. We use that to filter out
				//unresolved dependencies.
				let unresolvedMask = resolvedDeps.map(getter('file')).map(not);
				let unresolved = deps.filter(maskFilter(unresolvedMask));
				if (unresolved.length) {
					return done(new UnresolvedDependenciesError(chunk.path, unresolved));
				}

				//Now we can attach the dependency objects to the chunk.deps object.
				resolvedDeps.forEach((dep, index) => {
					let depName = deps[index];
					chunk.deps[depName] = dep;
				});

				timer.stop();
				done(null, chunk);
			}));
		});
	},

	compileDependencies (instance, compile, resolver) {
		//TODO: more efficient duplicate checking
		return through.obj(function (chunk, enc, done) {
			let timer = startTimer('compileDepsPrepare');

			let outer = this;
			this.push(chunk, enc);
			let newFiles = values(chunk.deps);
			let latch = countDownLatch(newFiles.length, () =>  done());
			timer.stop();
			newFiles.forEach((file) => {
				let timer = startTimer('compileDepsTrigger');
				let compileStream = compile(file.file, file.base);
				//If the compile function didn't return anything then we ignore the file.
				if (compileStream) {
					compileStream
						.pipe(resolver.resolveDependencies())
						.pipe(through.obj((chunk, enc, cb) => {
							outer.push(chunk);
							//IMPORTANT: if we push the chunk here to the inner stream stuff blows up.
							//I don't know why (yet), but just don't do it
							cb();
					}, (cb) => { latch.countDown(); cb(); } ));
				} else {
					latch.countDown();
				}
				timer.stop();
			});
		});
	},

	/**
	 * Resolves the require paths to links to actual files in the bundle.
	 */
	linkDependencies (instance) {
		return through.obj(function (chunk, enc, done) {
			let timer = startTimer('link');
			Object.keys(chunk.deps)
				.forEach((depName) =>  {
					let dep = chunk.deps[depName];
					//If we have an aliased file, we'll use that name
					if (dep.as) {
						//nothing to do
					} else if (dep.file.startsWith(chunk.base)) {
						//If the dependency is in the same module as the file that requires it we can just
						//use a relative require. Otherwise we'll have to try a path-require or an external require
						chunk.deps[depName].as = './' + path.relative(path.dirname(chunk.path), dep.file);
					} else {
						let pathEntry = instance.options.path.find((pathEntry) => {
							return dep.file.startsWith(pathEntry.path);
						});
						if (!pathEntry) {
							throw new Error("Could not find the base module for " + dep.file);
						}
						chunk.deps[depName].as = pathEntry.name + '/' + path.relative(pathEntry.path, dep.file);
					}
				});
			timer.stop();
			done(null, chunk);
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
			let timer = startTimer('bundle');
			//First try to check if the vinyl base is exactly equal to some path entry. If it is, then we'll
			//use that as the package.
			let packageName;
			let pathEntry = instance.options.path.find((current) => {
				return path.relative(chunk.base, current.path) === '';
			});
			if (pathEntry && pathEntry.name) {
				packageName = pathEntry.name;
			} else {
				packageName = getPackageNameFromPath(chunk.base);
			}
			let packageObject = getPackageObject(packageName);

			let filePath;
			let files;
			//If an explicit name is set we'll use that
			if (chunk.name) {
				let nameParts = chunk.name.split('/');
				filePath = nameParts.slice(1).join('/');
				packageName = nameParts[0];
				packageObject = getPackageObject(packageName);
				files = packageObject.files;
			} else if (chunk.path.startsWith(chunk.base)) {
				//If file is subpath of base then we can use a normal, relative require
				filePath = path.relative(chunk.base, chunk.path);
				files = packageObject.files;
			} else {
				throw new Error("Could not resolve file");
			}
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
				}, files);

			if (bundleOpts.entries.indexOf(chunk.path) !== -1) {
				packageObject.entry.push('./' + filePath);
			}

			//We've found our object, so we can place our info here
			//We keep the vinyl stream as it is, such that the serializer can later transform that into
			//an actual function
			target.content = chunk;
			target.deps = {};
			Object.keys(chunk.deps)
				.forEach((dep) => {
					target.deps[dep] = chunk.deps[dep].as;
				});
			done();
			timer.stop();
		}, function finalizeBundle(cb) { //NOTE: don't use arrow functions here, it binds this and messes stuff up
			this.push(bundle);
			cb();
		});
	},
	/**
	 * Serializes a bundle object into a js file
	 */
	serialize (instance, bundleOpts) {
		return through.obj(function serialize(chunk, enc, done) {
			let timer = startTimer('serialize');
			done(null, bundleSerializer(chunk, instance, bundleOpts));
			timer.stop();
		});
	},
	/**
	 *  Beautifies a javascript object if dev is set.
	 *  It's just for debugging purposes and should not be used for actual module generation.
	 *  It's not guaranteed to work with all features (e.g. atm it breaks sourcemaps)
	 */
	beautify (instance) {
		if (!instance.options.dev) {
			return through.obj();
		} else {
			return through.obj((chunk, enc, done) => {
				let timer = startTimer('beautify');
				let beauty = beautify(chunk.contents.toString());
				chunk.contents = new Buffer(beauty);
				done(null, chunk);
				timer.stop();
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


let dependencyPipeline = [
	transformers.findDependencies,
	transformers.resolveDependencies,
	transformers.compileDependencies,
];

let bundlePipeline = [
	transformers.linkDependencies,
	transformers.bundleStream,
	transformers.serialize,
	transformers.beautify
];

function createPipeline(transformers, ...opts) {
	return combine(transformers.map(binder(...opts)).map(invoke));
}

class Resolver {
	constructor(yoloaderInstance, compiler) {
		this.yoloader = yoloaderInstance;
		this.compiler = compiler;
		this.filesProcessed = new Set();
	}
	resolveDependencies() {
		let id = Math.random();
		let processor = this.yoloader.dependencyProcessor(this.yoloader, this.compiler, this);

		let self = this;
		//Filter the calls such that we only ever compile each file once
		let filter = through.obj((chunk, enc, done) => {
			if (self.filesProcessed.has(chunk.path)) {
				return done(null, null);
			} else {
				self.filesProcessed.add(chunk.path);
				return done(null, chunk);
			}
		});
		return combine(filter, processor);
	}
}

class Yoloader {
	constructor(options = {}) {
		this.dependencyProcessorPipeline = dependencyPipeline;
		this.bundlePipeline = bundlePipeline;
		this.dependencyProcessor = options.dependencyProcessor || createPipeline.bind(null, this.dependencyProcessorPipeline);
		this.bundler = options.bundler || createPipeline.bind(null, this.bundlePipeline);
		this.filesCompiled = [];
		this.filesPending = [];
		//We want an array of path objects, where each object is a { path, name } pair.
		//This is because at runtime we don't have full paths to resolve to, so we'll have to do it
		//name based. However, for convenience we also allow just path strings, from which we'll derive
		//the name by using path.basename on the full path. Here we convert all those strings to objects,
		//so that we don't need to bother about it later on.
		options.path = options.path || [];
		options.path = options.path.map((pathDef) => {
			if (pathDef instanceof String || typeof pathDef === 'string') {
				return { path : pathDef, name : path.basename(pathDef) };
			} else {
				return pathDef;
			}
		});
		this.path = options.path;

		this.mappings = options.mappings || {};
		this.dependencyResolvers = dependencyResolver.defaultResolvers;

		this.options = options;
	}

	resolveDependencies(compiler) {
		return new Resolver(this, compiler).resolveDependencies();
	}
	bundle(bundleOpts) {
		return this.bundler(this, bundleOpts);
	}
}
module.exports = Yoloader;

process.on('exit', printTimings);
