/**
 * Check if an object is a vinyl object.
 *
 * Currently it's done a bit cracky, it just checks if the expected properties are set.
 * However, that's sufficient for now
 */
function isVinyl(obj) {
	return (obj.cwd !== undefined &&
	        obj.base !== undefined &&
	        obj.path !== undefined &&
	        obj.contents !== undefined);
}

/**
 * Serializes a module object.
 *
 * A module object is represented by a vinyl stream. The result will be a string containing a
 * javascript function that executes the module when called. This function must be passed a
 * require, module and exports parameter.
 */
function serializeModule(module) {
	if (!isVinyl(module)) {
		throw new Error("Tried to serialize a non-module as a module.");
	}
	let res = 'function(require,module,exports){';
	res += module.contents.toString();
	res += '}';
	return res;
}

/**
 * Serializes an array to a javascript string based representation of the array
 */
function serializeArray(arr) {
	if (!(arr instanceof Array)) {
		throw new Error("Tried to serialize a non-array as an array.");
	}
	let res = '[';

	res += arr
		.map((item) => {
			return serializeThing(item);
		})
		.join(',');

	res += ']';
	return res;
}

/**
 * Serializes an object into a string-based javascript representation of the object
 */
function serializeObject(obj) {
	if (!(obj instanceof Object)) {
		throw new Error("Tried to serialize a non-object as an object.");
	}
	let res = '{';
	//We only want the own enumerable properties, so we use Object.keys to get all those keys
	res += Object.keys(obj)
		.map((key) => {
			//Just in case we stringify the key. This should always result in a quoted string, which then
			//can be used as the key in an object. (not every unquoted string is a valid identifier)
			return JSON.stringify(key) + ':' + serializeThing(obj[key]);
		})
		.join(',');

	res += '}';
	return res;
}

/**
 * Serializes a thing (object, array, primitive, vinyl file, etc.) into a string-based javascript
 * representation.
 */
function serializeThing(thing) {
	let serializer;
	if (thing instanceof Array) {
		serializer = serializeArray;
	} else if (thing instanceof Object && isVinyl(thing)) {
		serializer = serializeModule;
	} else if (thing instanceof Object) {
		serializer = serializeObject;
	} else {
		serializer = JSON.stringify;
	}
	return serializer(thing);
}

/**
 * Serializes an object representing a bundle into a bundle script.
 *
 * @param {object} bundleObject An object representing a bundle.
 */
function serializeBundle(bundleObject) {
	let result = '(function(){require.register(';
	result += serializeThing(bundleObject);
	result += ');}());';
	return result;
}


module.exports = serializeBundle;
