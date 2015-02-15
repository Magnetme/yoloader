module.exports = {
	invoke (f) {
		return f();
	},
	binder(...args) {
		return function bind(f) {
			//Sinc we have an unknown number of arguments we can't use Function.prototoype.bind and have
			//to implement it ourselves
			return () => {
				return f.apply(this, args);
			};
		};
	},
	/**
	 * Creates a mask filter.
	 *
	 * The filter returned will allow any element from it's input array where the value in mask
	 * at the same index is truthy. That is, an element `arr[i]` is allowed when `mask[i]`
	 * is truthy.
	 *
	 * If the size of the mask is smaller than the size of the array to mask than it wraps.
	 */
	maskFilter (mask) {
		return (el, index) => {
			return mask[index % mask.length];
		};
	},
	not (x) {
		return !x;
	},
	asyncReduce (arr, iterator, initialValue, cb) {
		let i = 0;
		let value = initialValue;
		function next() {
			if (i >= arr.length) {
				return cb(null, value);
			}
			iterator(value, arr[i], i, arr, (err, val) => {
				if (err) { return cb(err); }
				value = val;
				i++;
				next();
			});
		}
		next();
	},
	/**
	 * Creates a function that can wrap a node style callback and redirect errors elsewhere.
	 *
	 * E.g.:
	 * let onSuccess = catcher(done);
	 * fs.readFile('somefile', onSuccess((content) => {}));
	 *
	 * If readFile errors, done will be called with the error as it's first argument. If readFile succeeds,
	 * the arrow function will be called with the file content.
	 */
	catcher (errorFunc) {
		return function (f) {
			return function (err, ...args) {
				if (err) {
					return errorFunc(err);
				} else {
					f.apply(this, args);
				}
			};
		};
	},
	uniqFilter (item, index, arr) {
		return arr.slice(0, index).indexOf(item) === -1;
	},
	/**
	 * Returns all values of an object
	 */
	values (obj) {
		let values = [];
		for (let key in obj) {
			values.push(obj[key]);
		}
		return values;
	},
	/**
	 * Creates a getter function that accepts an object and returns a predefined property.
	 *
	 * @param {String} prop The name of the property that the getter function should get from it's input object.
	 * @return {Function} A getter function that takes an object `o` as input and returns `o[prop]`
	 */
	getter (prop) {
		return function(obj) {
			return obj[prop];
		};
	}
};
