var gulp = require('gulp');
var babel = require('gulp-babel');
var path = require('path');
var async = require('async');
var fs = require('fs-extra');
var runSequence = require('run-sequence');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');

var root = __dirname;

var srcRoot = path.join(root, 'src');
var destFolder = path.join(root, 'out');

//Files that we will expose on npm (we don't need index here, that will be done via package main)
var compiledPlugins = path.join(destFolder, 'plugins');
var compiledLoader = path.join(destFolder, 'loader.js');
var minifiedLoader = path.join(destFolder, 'loader.min.js');

//We need to expose the plugins and loader on the root path (such that we don't need /out/ in the require path)
var pluginTarget = path.join(root, 'plugins');
var loaderTarget = path.join(root, 'loader.js');
var minifiedLoaderTarget = path.join(root, 'loader.min.js');

var testOut = path.join(root, 'test/out');

//Compiles the ecmascript 6 files to ecmascript 5
gulp.task('compile', function() {
	return gulp.src(path.join(srcRoot, '**/*.js'))
		.pipe(babel())
		.pipe(gulp.dest(destFolder));
});

//Minifies the compiled loader file
gulp.task('minify-loader', ['compile'], function() {
	return gulp.src(compiledLoader)
		.pipe(uglify())
		.pipe(rename(path.basename(minifiedLoader)))
		.pipe(gulp.dest(path.dirname(minifiedLoader)));
});

//Removes all generated files
gulp.task('clean', function clean(cb) {
	async.parallel([
		fs.remove.bind(fs, destFolder),
		fs.remove.bind(fs, testOut),
		fs.remove.bind(fs, pluginTarget),
		fs.remove.bind(fs, loaderTarget),
		fs.remove.bind(fs, minifiedLoaderTarget)
	], cb);
});

//Copies files from the out folder to the root folder for publishing
gulp.task('copy-files', ['minify-loader'], function(done) {
	async.parallel([
		fs.copy.bind(fs, compiledPlugins, pluginTarget),
		fs.copy.bind(fs, compiledLoader, loaderTarget),
		fs.copy.bind(fs, minifiedLoader, minifiedLoaderTarget)
	], done);
});

gulp.task('build', ['copy-files']);

gulp.task('default', ['compile']);


gulp.task('pre-publish', function(cb) {
	runSequence('clean', 'build', cb);
});

