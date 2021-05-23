/*jslint node: true */
'use strict';

var fs = require('fs');
var debug = require('debug');
var backend = require('backend-js');

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
    var ModelModule;
    var type;
    if (typeof options === 'object') type = options.type;
    else if (typeof key === 'string') type = (backend.getModelController(key) || {}).type;
    if (type) {

        if (!ModelControllerPath[type]) throw new Error('Invalid database type');
        ModelModule = require(ModelControllerPath[type]);
        if (ModelModule) {

            module.exports.ComparisonOperators = ModelModule.ComparisonOperators;
            module.exports.LogicalOperators = ModelModule.LogicalOperators;
            module.exports.ComputationOperators = ModelModule.ComputationOperators;
            backend.setComparisonOperators(ModelModule.ComparisonOperators);
            backend.setLogicalOperators(ModelModule.LogicalOperators);
            backend.setComputationOperators(ModelModule.ComputationOperators);
            if (typeof options === 'object') {

                backend.setModelController(ModelModule.getModelControllerObject(options,
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
    }
    return backend;
};

beam.storage = function (key, options) {

    if (typeof options === 'string' || typeof arguments[2] === 'string') return {

        type: key,
        id: options,
        key: arguments[2],
        name: arguments[3]
    };
    var ResourceModule;
    var type;
    if (typeof options === 'object') type = options.type;
    else if (typeof key === 'string') type = (backend.getResourceController(key) || {}).type;
    if (type) {

        if (!ResourceControllerPath[type]) throw new Error('Invalid storage type');
        ResourceModule = require(ResourceControllerPath[type]);
        if (ResourceModule && typeof options === 'object') {

            backend.setResourceController(ResourceModule.getResourceControllerObject(options,
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
    }
    return backend;
};

beam.backend = function (database, storage) {

    module.exports.storage(typeof storage === 'string' ? storage : 'local',
        typeof storage === 'object' ? {

            type: storage.type,
            id: storage.id,
            key: storage.key,
            name: storage.name
        } : undefined);
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
beam.Delegate = beam.delegator = require('./src/api/plugins/Delegate.js');
beam.Forward = beam.Proxy = beam.forwarder = require('./src/api/plugins/Forward.js');