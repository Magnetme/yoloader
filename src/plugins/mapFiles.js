/**
 * Adds a mapping resolver to the pipeline.
 *
 * It will rename require calls in the resolve proces.
 * @param {Object} yoloader - A Yoloader instance
 * @param {Object} mapping - A mapping object
 */
module.exports = function addMapping(yoloader, mapping) {
	function mappingResolver(mappings) {

		//First transform the mapping object into the standard, expanded format
		//That is, expand string values to objects.
		Object.keys(mapping)
			.forEach((key) => {
				let mapped = mapping[key];
				if (mapped instanceof String || typeof mapped === 'string') {
					mapping[key] = {
						to : mapping[key]
					};
				}
			});

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
				//Keep track of the mapping for post-processing
				dep.to = mappings[to].to;
				dep.as = mappings[to].as;
			} else {
				//Otherwise we'll check for wildcard mappings.
				let mapFrom = Object.keys(wildcardMappings).find((mapping) => to.startsWith(mapping));
				if (mapFrom) {
					let mapTo = wildcardMappings[mapFrom];
					to = to.replace(mapFrom, mapTo.to);
					if (mapTo.as) {
						let as = to.replace(mapFrom, mapTo.as);
						dep.as = as;
					}
					dep.to = to;
				}
			}
			//After we've altered the dep object we can pass it through the rest of the resolve chain
			done(null, dep);
		};
	}
	yoloader.dependencyResolvers.unshift(mappingResolver(mapping));
};
