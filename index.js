/*jslint node: true */
'use strict';

var backend = require('backend-js');
var beam = module.exports;
var started = false;

module.exports.backend = function(database) {

  if (started || !database) return backend;
  started = true;
  backend.dbType = database.dbType;
  backend.dbURI = database.dbURI;
  backend.dbName = database.dbName;
  beam.setComparisonOperators(require('./src/ModelController.js').ComparisonOperators);
  beam.setLogicalOperators(require('./src/ModelController.js').LogicalOperators);
  return backend;
};

module.exports.database = function(dbType, dbURI, dbName) {

  return {

    dbType: dbType,
    dbURI: dbURI,
    dbName: dbName
  };
};
