let fileAliasResolver = require('./fileAliasResolver');

/**
 * Tries to resolve a dependency as a folder by finding the index.js of the folder.
 */
module.exports = fileAliasResolver((dep) => {
	let newDep = Object.create(dep);
	//Can't use path.join here, it removes the ./ part of the path
	newDep.to = dep.to;
	if (!dep.to.endsWith('/')) {
		newDep.to += '/';
	}
	newDep.to += 'index.js';

	return newDep;
});
