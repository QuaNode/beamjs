/*jslint node: true */
'use strict';

var fs = require('fs');
var debug = require('debug');
var backend = require('backend-js');

debug.enable('beam:*,backend:*');
debug = debug('beam:index');

var bunyan = require('bunyan');

if (!fs.existsSync('./logs')) {

    fs.mkdirSync('./logs');
}

var log = bunyan.createLogger({

    name: 'beam',
    streams: [{

        path: './logs/error.log',
        level: 'error',
    }],
    serializers: bunyan.stdSerializers
});

var beam = Object.assign(...[
    module.exports,
    backend
]);

var getModelControllerPath = function () {

    var [key] = arguments;
    var controllers = {

        mongodb: '/MongoController.js',
        mysql: '/SQLController.js',
        postgres: '/SQLController.js'
    }
    var path = [
        '.',
        'src',
        'database',
        'controllers'
    ];
    path = path.join('/');
    path += controllers[key];
    return path;
};

var getResourceControllerPath = function () {

    var [key] = arguments;
    var controllers = {

        fs: '/FSController.js'
    }
    var path = [
        '.',
        'src',
        'storage',
        'controllers'
    ];
    path = path.join('/');
    path += controllers[key];
    return path;
};

beam.database = function (KEY, options) {

    var [
        dbType,
        dbURI,
        dbName
    ] = arguments;
    var version_0 = typeof dbURI === 'string';
    version_0 |= typeof dbName === 'string';
    if (version_0) {

        return { dbType, dbURI, dbName };
    }
    if (typeof KEY === 'object') {

        options = KEY;
        KEY = undefined;
    }
    var type;
    if (typeof options === 'object') {

        type = options.type;
    } else if (typeof KEY === 'string') {

        var {
            getModelController: getMC
        } = backend;
        var controller = getMC(KEY);
        if (controller) {

            type = controller.type;
        }
    }
    if (type) {

        if (!getModelControllerPath(...[
            type
        ])) {

            throw new Error('Invalid' +
                ' database type');
        }
        var ModelModule = require(...[
            getModelControllerPath(type)
        ]);
        if (ModelModule) {

            [
                'ComparisonOperators',
                'LogicalOperators',
                'ComputationOperators'
            ].forEach(function (key) {

                var operators = ModelModule[key];
                beam[key] = operators;
                backend['set' + key](operators);
            });
            if (typeof options === 'object') {

                var {
                    setModelController
                } = backend;
                var {
                    getModelControllerObject
                } = ModelModule;
                setModelController(...[
                    getModelControllerObject(...[
                        options,
                        function (error) {

                            if (error) {

                                debug(error);
                                log.error({

                                    controller: 'database',
                                    err: error
                                });
                            }
                        }
                    ]),
                    KEY
                ]);
            }
        }
    }
    return beam;
};

beam.storage = function (KEY, options) {

    var [
        type,
        id,
        key,
        name
    ] = arguments;
    var version_0 = typeof id === 'string';
    version_0 |= typeof key === 'string';
    if (version_0) {

        return { type, id, key, name };
    }
    if (typeof KEY === 'object') {

        options = KEY;
        KEY = undefined;
    }
    var type;
    if (typeof options === 'object') {

        type = options.type;
    } else if (typeof KEY === 'string') {

        var {
            getResourceController: getRC
        } = backend;
        var controller = getRC(KEY);
        if (controller) {

            type = controller.type;
        }
    }
    if (type) {

        if (!getResourceControllerPath(...[
            type
        ])) {

            throw new Error('Invalid' +
                ' storage type');
        }
        var ResourceModule = require(...[
            getResourceControllerPath(type)
        ]);
        if (ResourceModule) {

            if (typeof options === 'object') {

                var {
                    setResourceController
                } = backend;
                var {
                    getResourceControllerObject
                } = ResourceModule;
                setResourceController(...[
                    getResourceControllerObject(...[
                        options,
                        function (error) {

                            if (error) {

                                debug(error);
                                log.error({

                                    controller: 'storage',
                                    err: error
                                });
                            }
                        }
                    ]),
                    KEY
                ]);
            }
        }
    }
    return beam;
};

beam.backend = function (database, storage) {

    var storageOptions;
    if (typeof storage === 'object') {

        if (storage) {

            var {
                type,
                id,
                key,
                name
            } = storage;
            storageOptions = {
                type,
                id,
                key,
                name
            };
        }
    }
    if (typeof storage !== 'string') {

        storage = 'local';
    }
    beam.storage(storage, storageOptions);
    var databaseOptions;
    if (typeof database === 'object') {

        if (database) {

            var {
                dbType: type,
                dbURI: uri,
                dbName: name
            } = database;
            databaseOptions = {
                type,
                uri,
                name
            };
        }
    }
    if (typeof database !== 'string') {

        database = 'main';
    }
    beam.database(database, databaseOptions);
    return backend;
};

var db = './src/database/plugins/';
var api = './src/api/plugins/';

beam.SQLEncrypt = require(db + 'SQLEncrypt.js');
beam.SQLTimestamps = require(db + 'SQLTimestamps.js');
beam.SQLHashedProperty = require(db + 'SQLHashedProperty.js');
beam.SQLSecret = require(db + 'SQLSecret.js');
beam.Respond = require(api + 'Respond.js');
beam.responder = beam.Respond;
beam.Redirect = require(api + 'Redirect.js');
beam.Delegate = beam.Redirect;
beam.delegator = beam.Redirect;
beam.Forward = require(api + 'Forward.js');
beam.Proxy = beam.Forward;
beam.forwarder = beam.Forward;