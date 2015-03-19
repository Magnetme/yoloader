let mothership = require('mothership');
let path = require('path');
let through = require('through2');
let spawn = require('child_process').spawn;
let async = require('async');
let fs = require('fs');
let npa = require('npm-package-arg');
let semver = require('semver');

/**
 * Plugin that finds compile scripts in the package.json and applies it to the stream.
 *
 * The transform takes an options hash containing options to pass to specific packages. E.g.
 * to pass the options `{ dev : true}` to the compiler for the foo package you should use the plugin
 * as followed:
 *
 * let packageOptions = {
 *   foo : { dev : true }
 * };
 * fileStream
 *   .pipe(packageCompile(packageOptions))
 *   .pipe(outStream);
 *
 * Additionally a second object may be passed to the packageCompile transform which will be passed
 * to all transform functions. This object will be merged with the package specific options by means
 * of prototypal inheritance (the shared object will be the prototype of a clone of the package
 * specific options). Additionally the package specific and global options will be passed separately
 * as second and third argument to the transform function as well, but it is recommended to only use
 * the combined options.
 *
 * If extra dependencies are needed to run the compile script that are not present in the normal
 * dependencies then they may be specified in the `yoloaderDependencies` field
 */

/**
 * Installs all dev & normal dependencies for a given package file
 */
let installDependencies = (() => {
	let packagesResolved = [];
	let pendingCbs = {};
	return (mothership, cb) => {
		//The same package can end up here twice. Therefore we keep track of both pending and resolved
		//packages. If a package is already resolved we can call the callback right away, if it's pending
		//we add it to the callback queue.
		if (packagesResolved.indexOf(mothership.path) !== -1) {
			return cb();
		} else if (pendingCbs[mothership.path]) {
			return pendingCbs[mothership.path].push(cb);
		}
		pendingCbs[mothership.path] = [cb];
		//Resolves the callbacks when done
		function done(...args) {
			pendingCbs[mothership.path].forEach((cb) => { cb(...args); });
			packagesResolved.push(mothership.path);
			delete pendingCbs[mothership.path];
		}

		let pkg = mothership.pack;

		//TODO: this entire snippet below should be refactored into a separate npm module
		let deps = pkg.yoloaderDependencies || {};

		let modulesFolder = path.resolve(mothership.path, '..', 'node_modules');

		//We're going to filter the dependencies such that we only install dependencies that are not
		//up to date, not installed, or not verifyable.
		async.filter(Object.keys(deps), (depName, filterCb) => {
			let depString = depName + '@' + pkg.yoloaderDependencies[depName];
			let parsed = npa(depString);
			//Any non-version or non-range package needs to be installed again. We can't reliably determine
			//if they're up to date, so we install them always
			if (['version', 'range'].indexOf(parsed.type) === -1) {
				return filterCb(true);
			}
			//For semvered packages we're going to check if the currently installed version is up to date
			let packageJsonPath = path.join(modulesFolder, depName, 'package.json');
			async.waterfall([
				(cb) => {
					fs.exists(packageJsonPath, cb.bind(null, null));
				},
				(exists, cb) => {
					//If the package.json doesn't exist then we just install the package again, otherwise
					//we need to check versions
					if (!exists) {
						filterCb(true);
					} else {
						fs.readFile(packageJsonPath, 'utf8', cb);
					}
				},
				(packageJson, cb) => {
					//If we do have a package.json file then we're going to check if there is a version, and
					//if there is if it satisfies the required range
					let version = JSON.parse(packageJson).version;
					cb(!version || !semver.satisfies(version, parsed.rawSpec));
				}
			], filterCb);
		}, (filteredDeps) => {
			//Naturally, when there are no deps to install we're done immediately
			if (filteredDeps.length === 0) {
				return cb();
			}
			//Otherwise we need to generate the arguments for npm install, which will then install
			//the dependencies
			let projectFolder = path.dirname(mothership.path);
			let depsArray = filteredDeps.map((dep) => dep + "@" + pkg.yoloaderDependencies[dep]);
			let npmArgs = ['install'].concat(depsArray);
			console.log("Installing yoloaderDependencies for " + pkg.name);
			spawn('npm', npmArgs, { cwd : projectFolder, stdio : 'inherit' })
				.on('exit', (code, signal) => {
					if (code) {
						return done(new Error("Could not install dependencies for " + packageFile));
					} else {
						return done();
					}
				});
		});
	};
}());

module.exports = function packageCompile(opts, globalOptions) {
	globalOptions = globalOptions || {};
	return through.obj(function(chunk, enc, done) {
		let outerStream = this;
		//We need to find the package.json of our chunk to find the compiler configuration
		//The package.json#yoloaderCompile field should contain the filename of the module compiler
		mothership(chunk.path, () => true, (err, res) => {
			if (err) {
				return done(new Error(err));
			}

			if (!res) {
				return done(null, chunk);
			}

			let compileFileName = res.pack.yoloaderCompile;
			if (!compileFileName) {
				return done(null, chunk);
			}

			installDependencies(res, function(err) {
				if (err) {
					return done(new Error(err));
				}

				let name = res.pack.name;
				let packageOptions = (name && opts[name]) || {};
				let compileOptions = Object.create(globalOptions);
				Object.keys(packageOptions)
					.forEach((optionKey) => compileOptions[optionKey] = packageOptions[optionKey]);



				let compileFilePath = path.resolve(path.dirname(res.path), compileFileName);

				//Same trick as always: create the transformer stream, push the current chunk to it and
				//pipe the output back into the outer stream
				let compiler = require(compileFilePath)(compileOptions, packageOptions, globalOptions);

				compiler.pipe(through.obj((chunk, enc, cb) => {
					outerStream.push(chunk);
					cb();
				}, (cb) => { done(); cb(); }));

				compiler.end(chunk, enc);
			});
		});
	});
};
