let fs = require('vinyl-fs');
let path = require('path');
let Yolo = require('./');
let through = require('through2');
let mapFiles = require('./plugins/mapFiles');

let entries = process.argv.slice(2);

let yolo = new Yolo({ debug : true,
												path : [process.cwd() + '/test/p', process.cwd()],
});

mapFiles(yolo, { 'yolo/*' : 'baz/' });

function compile(file, base) {
	return fs.src(file, { base })
		.pipe(yolo.resolveDependencies(compile));
}

entries = entries.map((entry) => path.resolve(process.cwd(), entry));

compile(entries, process.cwd() + '/test')
	.pipe(yolo.bundle({ name : 'out.js', entries : entries }))
	.pipe(fs.dest(process.cwd() + '/test/out'));

