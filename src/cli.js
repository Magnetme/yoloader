let fs = require('vinyl-fs');
let path = require('path');
let Common = require('./');
let through = require('through2');

let entries = process.argv.slice(2);

let common = new Common({ debug : true,
												path : [process.cwd() + '/test/p', process.cwd()],
});

function mappingResolver(mappings) {

	let wildcardMappings = {};
	Object.keys(mappings)
		.filter((key) => key.endsWith('*'))
		.forEach((key) => wildcardMappings[key.substr(0, key.length-1)] = mappings[key]);

	return function(from, to, opts, done) {
		if (mappings[to]) {
			return opts.resolve(instance.mappings[to], done);
		}
		let mapFrom = Object.keys(wildcardMappings).find((mapping) => to.startsWith(mapping));
		if (mapFrom) {
			let mapTo = wildcardMappings[mapFrom];
			to = to.replace(mapFrom, mapTo);
			return opts.resolve(to, done);
		}
		done(null, false);
	};
}

common.dependencyResolvers.unshift(mappingResolver({ 'yolo/*' : 'baz/' }));

function compile(file, base) {
	return fs.src(file, { base })
		.pipe(common.resolveDependencies(compile));
}

entries = entries.map((entry) => path.resolve(process.cwd(), entry));

compile(entries, process.cwd() + '/test')
	.pipe(common.bundle({ name : 'out.js', entries : entries }))
	.pipe(fs.dest(process.cwd() + '/test/out'));

