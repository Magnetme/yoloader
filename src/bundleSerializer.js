let SourceMapGenerator = require('source-map').SourceMapGenerator;
let SourceMapConsumer = require('source-map').SourceMapConsumer;
let path = require('path');
let inlineSourceMapComment = require('inline-source-map-comment');

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
function serializeModule(module, bundleState) {
	if (!isVinyl(module)) {
		throw new Error("Tried to serialize a non-module as a module.");
	}
	let res = bundleState.add('function(require,module,exports){');

	let content = module.contents.toString();
	res += bundleState.add(content, bundleState.bundlePathParts.join('/'));

	res += bundleState.add('}');
	return res;
}

/**
 * Serializes an array to a javascript string based representation of the array
 */
function serializeArray(arr, bundleState) {
	if (!(arr instanceof Array)) {
		throw new Error("Tried to serialize a non-array as an array.");
	}
	let res = bundleState.add('[');

	res += arr
		.map((item, idx) => {
			bundleState.bundlePathParts.push(idx);
			let res = serializeThing(item, bundleState);
			bundleState.bundlePathParts.pop();
			//Only increase for the `,` or `]`, serializeThing should update the offset for res
			//We do a manual update here because we don't realy have a string here to add
			bundleState.currentLocation.column++;
			return res;
		})
		.join(',');

	//No need to update offset, already done in the map function
	res += ']';
	return res;
}

/**
 * Serializes an object into a string-based javascript representation of the object
 */
function serializeObject(obj, bundleState) {
	if (!(obj instanceof Object)) {
		throw new Error("Tried to serialize a non-object as an object.");
	}
	let res = bundleState.add('{');
	//We only want the own enumerable properties, so we use Object.keys to get all those keys
	res += Object.keys(obj)
		.map((key) => {
			//Just in case we stringify the key. This should always result in a quoted string, which then
			//can be used as the key in an object. (not every unquoted string is a valid identifier)
			let jsonKey = JSON.stringify(key);
			let prefix = bundleState.add(jsonKey + ':');
			bundleState.bundlePathParts.push(key);
			let res = prefix + serializeThing(obj[key], bundleState);
			bundleState.bundlePathParts.pop();
			bundleState.currentLocation.column++; //for the ',' or the trailing `}` when it's the last one
			return res;
		})
		.join(',');

	//We've already increased the column offset in the last iteration of the map (despite not adding a ,)
	//so we don't need to do it here anymore
	res += '}';
	return res;
}

function jsonSerializer(obj, bundleState) {
	return bundleState.add(JSON.stringify(obj));
}

/**
 * Serializes a thing (object, array, primitive, vinyl file, etc.) into a string-based javascript
 * representation.
 */
function serializeThing(thing, bundleState) {
	let serializer;
	if (thing instanceof Array) {
		serializer = serializeArray;
	} else if (thing instanceof Object && isVinyl(thing)) {
		serializer = serializeModule;
	} else if (thing instanceof Object) {
		serializer = serializeObject;
	} else {
		serializer = jsonSerializer;
	}
	return serializer(thing, bundleState);
}

/**
 * Serializes an object representing a bundle into a bundle script.
 *
 * @param {object} bundleObject An object representing a bundle.
 */
function serializeBundle(bundleObject, instance, bundleOpts) {
	let sourceRoot = bundleOpts.sourceRoot || '/';
	//We need to keep track of a state to generate sourcemaps
	//It's not pretty, but there aren't much pretty solutions here
	let bundleState = {
		//path pars into the object, can be used to find the current item being serialized
		bundlePathParts : [],
		currentLocation : {
			line : 1,
			column : 0,
		},
		//sourceMap : new SourceMapGenerator({sourceRoot : process.cwd() }),
		sourceMap : new SourceMapGenerator({sourceRoot : sourceRoot }),
		/**
		 * Registers a new part of the output to the bundle state, and returns the output;
		 * @param {String} str The input string
		 * @param {String} [file] The filename where the string comes from. If set new mappings will
		 *                        automatically be created
		 */
		add(str, file) {
			//Only bother with sourcemaps in debug mode
			if (!instance.options.debug) {
				return;
			}
			let source;
			if (file) {
				bundleState.sourceMap.setSourceContent(file, str);
			}
			let lines = str.split(/\r\n|\r|\n/);
			lines.forEach(function(line, idx) {
				//Ad source mappings if needed
				if (file) {
					let mapping = {
						generated : bundleState.currentLocation,
						source : file,
						original : { line : (idx + 1), column : 0 }
					};
					bundleState.sourceMap.addMapping(mapping);
				}
				if (idx !== lines.length - 1) {
					bundleState.currentLocation.line++;
					bundleState.currentLocation.column = 0;
				} else {
					bundleState.currentLocation.column += line.length;
				}
			});
			return str;
		}
	};
	let result = bundleState.add('(function(){require.load(');
	result += serializeThing(bundleObject, bundleState);
	result += bundleState.add(');}());');
	//Only sourcemaps in debug mode
	if (instance.options.debug) {
		result += '\n' + inlineSourceMapComment(bundleState.sourceMap.toString(), { sourcesContent : true });
	}
	return result;
}


module.exports = serializeBundle;
