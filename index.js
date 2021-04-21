/*jslint node: true */
'use strict';

var backend = require('backend-js');
var debug = require('debug');

debug.enable('beam:*,backend:*');
debug = debug('beam:index');

var bunyan = require('bunyan');

if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

var log = bunyan.createLogger({

    name: 'beam',
    streams: [{

        path: './logs/error.log',
        level: 'error',
    }],
    serializers: bunyan.stdSerializers
});

var beam = module.exports;
var ModelControllerPath = {

    mongodb: './src/database/controllers/MongoController.js',
    mysql: './src/database/controllers/SQLController.js',
    postgres: './src/database/controllers/SQLController.js'
};
var ResourceControllerPath = {

    fs: './src/storage/controllers/FSController.js'
};

beam.database = function (key, options) {

    if (typeof options === 'string' || typeof arguments[2] === 'string') return {

        dbType: key,
        dbURI: options,
        dbName: arguments[2]
    };
    var ModelController;
    if (typeof options === 'object') {

        if (!ModelControllerPath[options.type]) throw new Error('Invalid database type');
        ModelController = require(ModelControllerPath[options.type]);
    } else if (typeof key === 'string') ModelController = backend.getModelController(key);
    if (ModelController) {

        module.exports.ComparisonOperators = ModelController.ComparisonOperators;
        module.exports.LogicalOperators = ModelController.LogicalOperators;
        module.exports.ComputationOperators = ModelController.ComputationOperators;
        backend.setComparisonOperators(ModelController.ComparisonOperators);
        backend.setLogicalOperators(ModelController.LogicalOperators);
        backend.setComputationOperators(ModelController.ComputationOperators);
        if (typeof options === 'object') {

            backend.setModelController(ModelController.getModelControllerObject(options,
                function (error) {

                    if (error) {

                        debug(error);
                        log.error({

                            controller: 'database',
                            err: error
                        });
                    }
                }), key);
        }
    }
    return backend;
};

beam.storage = function (key, options) {

    if (typeof options === 'string' || typeof arguments[2] === 'string') return {};
    var ResourceController;
    if (typeof options === 'object') {

        if (!ResourceControllerPath[options.type]) throw new Error('Invalid storage type');
        ResourceController = require(ResourceControllerPath[options.type]);
    } else if (typeof key === 'string') ResourceController = backend.getResourceController(key);
    if (ResourceController && typeof options === 'object') {

        backend.setResourceController(ResourceController.getResourceControllerObject(options,
            function (error) {

                if (error) {

                    debug(error);
                    log.error({

                        controller: 'storage',
                        err: error
                    });
                }
            }), key);
    }
    return backend;
};

beam.backend = function (database, storage) {

    module.exports.storage(typeof storage === 'string' ? storage : 'local',
        typeof storage === 'object' ? {} : undefined);
    return module.exports.database(typeof database === 'string' ? database : 'main',
        typeof database === 'object' ? {

            type: database.dbType,
            uri: database.dbURI,
            name: database.dbName
        } : undefined);
};

beam.SQLTimestamps = require('./src/database/plugins/SQLTimestamps.js');
beam.SQLHashedProperty = require('./src/database/plugins/SQLHashedProperty.js');
beam.SQLSecret = require('./src/database/plugins/SQLSecret.js');
beam.Respond = beam.responder = require('./src/api/plugins/Respond.js');
