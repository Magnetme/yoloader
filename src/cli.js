let fs = require('vinyl-fs');
let path = require('path');
let common = require('./');
let through = require('through2');

let entries = process.argv.slice(2);

entries.forEach((entry) => {
	let entryPath = path.resolve(process.cwd(), entry);
	fs.src(entryPath, { base : process.cwd() + '/test' })
		.pipe(common({ debug : true }))
		//TOdO: move this to a separate module
		.pipe(through.obj((chunk, enc, done) => {
			chunk.path = 'out.js';
			done(null, chunk);
		}))
		.pipe(fs.dest(process.cwd() + '/test/out'));
});

