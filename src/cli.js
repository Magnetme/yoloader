let fs = require('vinyl-fs');
let path = require('path');
let Yolo = require('./');
let through = require('through2');
let mapFiles = require('./plugins/mapFiles');
let sourcemaps = require('gulp-sourcemaps');
let babel = require('gulp-babel');

let entries = process.argv.slice(2);

let yolo = new Yolo({ debug : true,
	//dev : true,
	path : [process.cwd() + '/test/p', { path : process.cwd(), name : 'yolo'}],
});

mapFiles(yolo, { 'yolo/*' : 'baz/' });

function compile(file, base) {
	return fs.src(file, { base })
		.pipe(sourcemaps.init())
		.pipe(babel())
		.pipe(yolo.resolveDependencies(compile));
}

entries = entries.map((entry) => path.resolve(process.cwd(), entry));

compile(entries, process.cwd() + '/test')
	.pipe(yolo.bundle({ name : 'out.js', entries : entries, sourceRoot : 'yolo' }))
	.pipe(sourcemaps.write())
	.pipe(fs.dest(process.cwd() + '/test/out'));

