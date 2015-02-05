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
	}

};
