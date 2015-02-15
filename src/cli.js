let fs = require('vinyl-fs');
let path = require('path');
let Common = require('./');
let through = require('through2');

let entries = process.argv.slice(2);

let common = new Common({ debug : true,
												path : [process.cwd() + '/test/p', process.cwd()],
});

function mappingResolver(mappings) {

	//Wildcard mappings are very simple for now: their keys end in a * and everything before the star
	//will be replaced with their values.
	let wildcardMappings = {};
	Object.keys(mappings)
		.filter((key) => key.endsWith('*'))
		.forEach((key) => wildcardMappings[key.substr(0, key.length-1)] = mappings[key]);

	return function(dep, opts, done) {
		let { from, to } = dep;

		//If there's a simple file based mapping we will replace the require call with the mapped name
		if (mappings[to]) {
			dep.to = instanceMappings[to];
		} else {
			//Otherwise we'll check for wildcard mappings.
			let mapFrom = Object.keys(wildcardMappings).find((mapping) => to.startsWith(mapping));
			if (mapFrom) {
				let mapTo = wildcardMappings[mapFrom];
				to = to.replace(mapFrom, mapTo);
				dep.to = to;
			}
		}
		//After we've altered the dep object we can pass it through the rest of the resolve chain
		done(null, dep);
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

