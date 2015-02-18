module.exports = function addMapping(yoloader, mapping) {
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
	yoloader.dependencyResolvers.unshift(mappingResolver(mapping));
};
