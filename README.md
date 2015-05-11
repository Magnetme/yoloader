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

var root = __dirname;
var entries = [path.join(root, 'app.js')];

vinylFs.src(entries, { base : root })
	.pipe(yoloader.resolveDependencies());
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
The `resolveDependencies` function accepts a callback that provides a vinyl transformer.
You can implement any compilation step you like here, as long as the transformation results in
a stream containing javascript files such that yoloader can parse it for dependencies. Keep in mind though that
the `resolveDependencies` function will call the compile function with *all* dependencies, so the
dependencies from `node_modules` will also be compiled with your compile function. (Tip: use [gulp-if](https://github.com/robrich/gulp-if) to conditionally apply your compilation steps to just your own files. Also works without gulp.)

Use [babel](https://github.com/babel/babel) to compile from es6 to es5:
```javascript
function compile() {
	return babel();
}
```

Processing steps that do not influence dependency resolving can also be done after dependencies
have been resolved, which is more efficient in many cases. For example, minifying files could look
like this:

```javascript
vinylFs.src(entries, { base : root })
	.pipe(yoloader.resolveDependencies());
	.pipe(minify());
	.pipe(yoloader.bundle({ entries : entries, name : 'bundle.js' }))
	.pipe(vinylFs.dest(__dirname + '/out'));
```

### Sourcemap support

Sourcemap support is enabled via [gulp-sourcemaps](https://www.npmjs.com/package/gulp-sourcemaps).
It should be initialized in the compile function such that all files will have sourcemaps enabled.

```javascript
function compile() {
	return combine(
		sourcemaps.init(),
		babel()
	);
}

vinylFs.src(entries, { base : root }
	.pipe(yoloader.resolveDependencies(compile))
	.pipe(yoloader.bundle({ entries : entries, name : 'bundle.js' }))
	.pipe(sourcemaps.write())
	.pipe(vinylFs.dest(__dirname + '/out'));
```

### Multiple bundles
Docs coming soon.

## API

### `new Yoloader(opts)`

Constructs a new yoloader instance.

- `opts.path` - Array of path entries which will be used to search for non-local modules (i.e. requires that do not begin with a dot or slash). Avoid using this.

### Stream transformers
#### `yoloader.resolveDependencies(compile)`
Resolves all dependencies for its input stream.
It accepts a compile function as its only argument, which it will call for all dependencies.
It will pass a vinyl stream with the dependencies as it's only argument.
The compile function must return a vinyl stream as well with javascript files that will be searched further for dependencies.
Note that the compile function can be called an arbitrary number of times and the streams passed can contain any number of files.

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
function compile()
	return combine(
		sourcemaps.init(),
		dirname()
	);
}
```

#### transform

Compatibility plugin for browserify-transformers.

This plugin can be used to wrap browserify transformers such that they can be used with yoloader.

Example (using the [brfs](https://github.com/substack/brfs) transformer):
```javascript
function compile() {
	return transform(brfs);
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
shimConfig['angular'] = {
	depends : {
		//results in `var $ = require('jquery');`
		'jquery' : '$'
		//results in `require('somePackage');`
		'somePackage' : null
	},
	//results in `module.exports = angular`
	exports : 'angular'
};

function compile() {
	return shim(shimConfig);
}

```

Keys for the shimconfig object may be node package names, paths or glob patterns.

#### packageCompile

Plugin to allow packages to specify their own compilation steps.

Usage:
- Packages may specify a compile script in their `package.json` in the `yoloaderCompile` field. This value will be resolved as if it where a require call such that scripts from external dependencies can also be used.
- Extra dependencies may be specified in the `yoloaderDependencies` field of the `package.json`, these will
  be installed before running the compiler.
- The package compile script should export a function that returns a transform stream in object mode.
- The package compile script may accept an options argument
- The build script that depends on this package should use the `packageCompile` transformer in its compiler pipeline.
- Options may be passed to specific compiler scripts by passing an object to the `packageCompile` transformer, where the keys should match package names and the values will be passed as argument to the compile script of that package.

Example:
`a/package.json`
```javascript
{
	"name" : "a",
	"yoloaderCompile" : "./yolofile.js",
	"yoloaderDependencies" : {
		"my-translate" : "~1.2.3"
	}
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

function compile(stream) {
	return combine(
		packageCompile(packageOptions),
		yoloader.resolveDependencies(opts)
	);
}

//etc.
```

The plugin also accepts a second option which will function as a shared base for the package specific options
by means of prototypal inheritance (it will be set as the prototype of a clone of the package specific options).
The package specific and the global parameters will also be passed as respectively second and third parameter,
but it is recommended to not use those.

