# yoloader (you only load once)

Yoloader is a CommonJS module loader implementation. It provides tools to bundle a CommonJS based
project and to load such bundles.

## Installation

`npm install yoloader`

## Basic usage

Yoloader consists of 3 main parts, which can be used to construct a compilation pipeline:

1. Dependency resolver - Resolves CommonJS dependencies for a file
2. Bundler - Links & bundles files together in a format that can be run by the:
3. Loader - Reads and executes a compiled bundle on runtime.

Yoloader uses [vinyl](https://github.com/wearefractal/vinyl) streams (a.k.a. [gulp](https://github.com/gulpjs/gulp) streams) for the entire compilation toolchain. Make sure you understand how those work when using yoloader.

Note that yoloader itself does not compile files, it merely provides the dependency resolver part and the linker part of a compilation pipeline.

### Compilation

Very basic example (for more explanation see the api below):

```javascript
var Yoloader = require('yoloader');
var vinylFs = require('vinyl-fs');

//Construct a new instance of yoloader
var yoloader = new Yoloader(opts);


function compile(file, base) {
	//for gulp users: vinylFs.src === gulp.src
	return vinylFs.src(file, { base : base })
		//Find dependencies and recursively compile them
		.pipe(yoloader.resolveDependencies(compile));
}

var root = __dirname;
var entries = [path.join(root, 'app.js')];
compile(entries, root)
	//bundle the compiled files together
	.pipe(yoloader.bundle({ entries : entries, name : 'bundle.js' })
	.pipe(vinylFs.dest(__dirname + '/out'));
```

### Loading files (browser)

The `loader.js` (or `loader.min.js`) file can load and run a compiled bundle, your webserver should make
that file accessible for the browser.

```html
<head>
  <script src="loader.js"></script>
	<script src="bundle.js"></script>
```

## Advanced usage

### Additional compilation steps
Since you write the compile function you can add as many steps as you like! Keep in mind though that
the `resolveDependencies` function will call the compile function with *all* dependencies, so the
dependencies from `node_modules` will also be compiled with your compile function. (Tip: use [gulp-if](https://github.com/robrich/gulp-if) to conditionally apply your compilation steps to just your own files. Also works without gulp.)

Use [babel](https://github.com/babel/babel) to compile from es6 to es5:
```javascript
function compile(entries, root) {
	return vinylFs.src(file, { base : base })
		.pipe(babel())
		.pipe(yoloader.resolveDependencies(compile));
}
```

Minify files (with any of the many minification transformers):
```javascript
compile(entries, root)
	.pipe(yoloader.bundle({ entries : entries, name : 'bundle.js' }))
	//Minification can best be done after bundling such that also the bundle code is minified
	.pipe(minify());
	.pipe(vinylFs.dest(__dirname + '/out'));
```

### Sourcemap support

Sourcemap support is enabled via [gulp-sourcemaps](https://www.npmjs.com/package/gulp-sourcemaps), and is only used in the bundle stage. It should be initialized before the call to `yoloader.resolveDependencies`:

```javascript
function compile(file, base) {
	return vinylFs.src(file, { base : base })
		.pipe(sourcemaps.init())
		.pipe(yoloader.resolveDependencies(compile));
}

compile(entries, root)
	.pipe(yoloader.bundle({ entries : entries, name : 'bundle.js' }))
	.pipe(sourcemaps.write())
	.pipe(vinylFs.dest(__dirname + '/out'));
```

This also works with additional compilation steps that support gulp-sourcemaps::

```javascript
function compile(file, base) {
	return vinylFs.src(file, { base : base })
		.pipe(sourcemaps.init())
		//Compile es6 to es5
		.pipe(babel())
		.pipe(yoloader.resolveDependencies(compile));
}
```

### Multiple bundles
Docs coming soon.

## API

### `new Yoloader(opts)`

Constructs a new yoloader instance.

- `opts.path` - Array of path entries which will be used to search for non-local modules (i.e. requires that do not begin with a dot or slash). Avoid using this.

### Stream transformers
#### `yoloader.resolveDependencies(compile)`
Resolves all dependencies for its input stream. It accepts a compile function as its only argument, which it will call once for each dependency. It will pass the full dependency path as the first argument, and the base path as second argument, which can (and should) be used to construct a vinyl stream. The compile function must return a vinyl stream, which will appended to the input stream. The output stream of `resolveDependencies` is also a vinyl stream.

#### `yoloader.bundle(opts)`
Bundles a vinyl stream into a single bundle file.
Note that the vinyl stream must come from `resolveDependencies`; it adds some extra information to the stream that is required to be able to bundle everything together. (More information about the format will follow soon)

Arguments:
- `opts.name` - Filename of the bundle. Required if using sourcemaps.
- `opts.entries` - Full paths to the entry files. These files will be called upon load.

### Bundled plugins

Bundled plugins can be required with `require('yoloader/plugins/<pluginname>')`

#### dirname
Transformer that exposes the node style `__dirname` and `__filename` properties to the files.

Example:
```javascript
function compile(file, base)
	return vinylFs.src(file, { base : base })
		.pipe(sourcemaps.init())
		.pipe(dirname())
		.pipe(yoloader.resolveDependencies(opts))
}
```

#### transform

Compatibility plugin for browserify-transformers.

This plugin can be used to wrap browserify transformers such that they can be used with yoloader.

Example (using the [brfs](https://github.com/substack/brfs) transformer):
```javascript
function compile(file, base) {
	return vinylFs.src(file, { base : base })
		.pipe(transform(brfs))
		.pipe(resolveDependencies(opts));
}
```

Some important notes:
- Browserify transformers don't act on modules from the `node_modules` folder or from `path` by default.
  However, yoloader doesn't make a difference between these two types of files, and hence the transformers will
  always work as if they were global. You should do filtering yourself (e.g. with [gulp-if](https://github.com/robrich/gulp-if)).
- The transform wrapper only works for "plain" transformers, that don't use browserify-specific functionality. Most transformers should work, but not all will.

#### shim

Allows non-CommonJS modules to be used as CommonJS module. It adds `require` calls for dependencies and adds a `module.exports` to expose its result to other modules.

Example:
```javascript
var shimConfig = {};
shimConfig[pathToAngularJs] = {
	depends : {
		//results in `var jQuery = require('jquery');`
		'jQuery' : 'jquery'
	},
	//results in `module.exports = angular`
	exports : 'angular'
};

function compile(file, base) {
	return vinylFs.src(file, { base : base })
		.pipe(shim(shimConfig))
		.pipe(resolveDependencies(opts));
}

```

Keys for the shimconfig may also be glob patterns, which may be used to match with node_modules. E.g.:

```javascript
var shimConfig = {
	'**/node_modules/my-package/pkg.js' : {}
};
```

#### packageCompile

Plugin to allow packages to specify their own compilation steps.

Usage:
- Packages may specify a compile script in their `package.json` in the `yoloader-compile` field.
- The package compile script should export a function that returns a transform stream in object mode.
- The package compile script may accept an options argument
- The build script that depends on this package should use the `packageCompile` transformer in its compiler pipeline.
- Options may be passed to specific compiler scripts by passing an object to the `packageCompile` transformer, where the keys should match package names and the values will be passed as argument to the compile script of that package.

Example:
`a/package.json`
```javascript
{
	"name" : "a",
	"yoloader-compile" : "yolofile.js"
}
```

`a/yolofile.js`
```javascript
module.exports = function compile(opts) {
	return through.obj(function(chunk, enc, done) {
		chunk.contents = translate(chunk.contents.toString(), opts.lang);
	});
}
```

`buildscript.js`
```javascript
var packageOptions = {
	a : {
		lang : "en"
	}
};

function compile(file, base) {
	return vinylFs.src(file, { base : base })
		.pipe(packageCompile(packageOptions))
		.pipe(yoloader.resolveDependencies(opts));
}

//etc.
```

The plugin also accepts a second option which will function as a shared base for the package specific options
by means of prototypal inheritance (it will be set as the prototype of a clone of the package specific options).
The package specific and the global parameters will also be passed as respectively second and third parameter,
but it is recommended to not use those.

