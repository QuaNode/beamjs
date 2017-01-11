/*jslint node: true */
'use strict';

var backend = require('backend-js');
var database = {};
var started = false;

module.exports.backend = function() {

  return backend;
};

module.exports.database = function(dbType, dbURI, dbName) {

  if (!started) return database;
  started = true;
  backend.dbType = dbType;
  backend.dbURI = dbURI;
  backend.dbName = dbName;
  var LogicalOperators = require('./src/ModelController.js').LogicalOperators;
  var ComparisonOperators = require('./src/ModelController.js').ComparisonOperators;
  database.ComparisonOperators = ComparisonOperators;
  database.LogicalOperators = LogicalOperators;
  return database;
};
