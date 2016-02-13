/*jslint node: true */
'use strict';

var LogicalOperators = require('./src/ModelController.js').LogicalOperators;
var ComparisonOperators = require('./src/ModelController.js').ComparisonOperators;
var backend = require('backend-js');

module.exports.backend = function() {

  return backend;
};

module.exports.ComparisonOperators = ComparisonOperators;
module.exports.LogicalOperators = LogicalOperators;
