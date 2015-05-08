var fs = require('vinyl-fs');
var path = require('path');
var Yoloader = require('../');
var through = require('through2');
var mapFiles = require('../out/plugins/mapFiles');
var sourcemaps = require('gulp-sourcemaps');
var babel = require('gulp-babel');
var shim = require('../plugins/shim');

var entries = ['foo.js'];

var yoloader = new Yoloader({
	//dev : true,
	path : [__dirname + '/p'],
});

mapFiles(yoloader, { 'yolo/*' : 'baz/' });

function compile(file, base) {
	return fs.src(file, { base : base })
		.pipe(sourcemaps.init())
		.pipe(babel())
		.pipe(shim({
			'foo' : {
				exports : 'test'
			}
		}))
		.pipe(yoloader.resolveDependencies(compile));
}

entries = entries.map(function(entry) { return  path.resolve(__dirname, entry); });

compile(entries, __dirname)
	.pipe(yoloader.bundle({ name : 'out.js', entries : entries, sourceRoot : 'yoloader' }))
	.pipe(sourcemaps.write())
	.pipe(fs.dest(__dirname + '/out'));

