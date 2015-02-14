let fs = require('vinyl-fs');
let path = require('path');
let Common = require('./');
let through = require('through2');

let entries = process.argv.slice(2);

let common = new Common({ debug : true,
												path : [process.cwd() + '/test/p', process.cwd()],
												mappings : {
													'yolo/*' : 'baz/'
												}

});

//(NOTE: this should be default compiler)
function compile(file, base) {
	return fs.src(file, { base })
		.pipe(common.resolveDependencies(compile));
}

entries = entries.map((entry) => path.resolve(process.cwd(), entry));
let entryStream = fs.src(entries, { base : process.cwd() + '/test' });

compile(entries, process.cwd() + '/test')
	.pipe(common.bundle({ name : 'out.js', entries : entries }))
	.pipe(fs.dest(process.cwd() + '/test/out'));

/*
//Or shortcut:
common.compile(entries)
.pipe(common.bundle({ name : 'out.js', entry : entries }))
.pipe(fs.dest(process.cwd() + '/test/out'));
*/

