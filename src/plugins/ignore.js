module.exports = function ignoreFiles(yolo, ignores) {
	yolo.dependencyResolvers.unshift((dep, opts, done) => {
		if (ignores.indexOf(dep.to) !== -1) {
		}
	});
};
