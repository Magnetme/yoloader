let fileAliasResolver = require('./fileAliasResolver');
let path = require('path');

/**
 * Tries to resolve a dependency as a javascript file by appending .js to the filename.
 */
module.exports = fileAliasResolver((dep) => {
	let newDep = Object.create(dep);
	newDep.to = dep.to + '.js';
	return newDep;
});
