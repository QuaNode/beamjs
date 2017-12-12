/*jslint node: true */
'use strict';

var backend = require('backend-js');

var beam = module.exports;
var started = false;
var ModelControllerPath = {

    mongodb: './src/MongoController.js',
    mysql: './src/SQLController.js'
}

beam.database = function(path, options) {

    if (started || !options) return backend;
    if (!ModelControllerPath[options.type]) throw new Error('Invalid database type.');
    started = true;
    var ModelController = require(ModelControllerPath[options.type]);
    module.exports.ComparisonOperators = ModelController.ComparisonOperators;
    module.exports.LogicalOperators = ModelController.LogicalOperators;
    backend.setComparisonOperators(ModelController.ComparisonOperators);
    backend.setLogicalOperators(ModelController.LogicalOperators);
    backend.setModelController(ModelController.getModelControllerObject(options, function() {

        // if (!error) {

        // } else {

        // }
    }), path);
    return backend;
};