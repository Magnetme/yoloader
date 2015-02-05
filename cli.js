let fs = require('vinyl-fs');
let path = require('path');
let common = require('./');

let entries = process.argv.slice(2);

entries.forEach((entry) => {
	let entryPath = path.resolve(process.cwd(), entry);
	fs.src(entryPath)
		.pipe(common())
		.pipe(fs.dest(__dirname + '/out'));
});

