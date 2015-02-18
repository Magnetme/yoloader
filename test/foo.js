var bar = require('./bar');
var bar2 = require('./bar.js');
var baz = require('./baz');
var qux = require('./qux');
var foo = require('foo');
var bar = require('bar');
var baz = require('baz');
var p = require('p');
var baz = require('yolo/baz');

let di = (x) => x;

console.log('foo');
