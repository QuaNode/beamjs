/*jslint node: true */
'use strict';

var backend = require('backend-js');
var crypto = require('crypto');

var beam = module.exports;
var started = false;
var ModelControllerPath = {

    mongodb: './src/MongoController.js',
    mysql: './src/SQLController.js'
};

beam.database = function(path, options) {

    if (typeof arguments[1] === 'string' || typeof arguments[2] === 'string') return {

        dbType: arguments[0],
        dbURI: arguments[1],
        dbName: arguments[2]
    };
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

beam.backend = function(database) {

    return module.exports.database('', database && {

        type: database.dbType,
        uri: database.dbURI,
        name: database.dbName
    });
};

beam.SQLTimestamps = function(name, hooks) {

    hooks.on('beforeDefine', function(attributes, options) {

        options.timestamps = true;
    });
};

beam.SQLHashedProperty = function(name, hooks, sequelize) {

    var hash = function(password, options) {

        var salt,
            saltlen,
            iterations,
            hashedPassword;
        if (options && options.salt) {

            salt = options.salt;
            saltlen = options.salt.length;
        } else {

            saltlen = options && options.saltlen || 64;
            salt = crypto.randomBytes(saltlen);
        }
        iterations = options && options.iterations || 10000;
        hashedPassword = crypto.pbkdf2Sync(password, salt, iterations, saltlen, 'sha256');
        return 'pkdf2$' + iterations + '$' + salt.toString('hex') + '$' + hashedPassword.toString('hex');
    };
    var verify = function(password, hashedPassword) {

        var split = hashedPassword.split('$');
        if (split.length !== 4) {

            throw new Error('Invalid password hash provided');
        }
        var salt = new Buffer(split[2], 'hex'),
            saltlen = salt.length,
            iterations = Number(split[1]);
        var options = {

            salt: salt,
            saltlen: saltlen,
            iterations: iterations
        };
        var verifiedPassword = hash(password, options);
        //perform the comparison in a constant time to avoid timing attacks - see http://carlos.bueno.org/2011/10/timing.html
        if (hashedPassword.length === verifiedPassword.length) {

            var diff = 0;
            for (var i = 0; i < hashedPassword.length; ++i) {

                diff |= hashedPassword.charCodeAt(i) ^ verifiedPassword.charCodeAt(i);
            }
            return diff === 0;
        } else {

            return false;
        }
    };
    hooks.on('beforeDefine', function(attributes, options) {

        attributes.hashed_password = {

            type: sequelize.Sequelize.DataTypes.TEXT
        };
        attributes.password = {

            type: sequelize.Sequelize.DataTypes.VIRTUAL,
            set: function(password) {

                this.setDataValue('hashed_password', hash(password));
            }
        };
    });
    hooks.on('afterDefine', function(Model) {

        Model.prototype.verifyPassword = function(password) {

            if (this.getDataValue('hashed_password')) {

                return verify(password, this.getDataValue('hashed_password'));
            } else {

                return false;
            }
        };
    });
};

beam.SQLSecret = function(name, hooks, sequelize) {

    var createSecret = function(size) {

        var hex = crypto.randomBytes(size).toString('hex');
        return hex.substring(0, size);
    };
    hooks.on('beforeDefine', function(attributes, options) {

        attributes.secret = {

            type: sequelize.Sequelize.DataTypes.STRING,
            defaultValue: createSecret(32)
        };
    });
    hooks.on('afterDefine', function(Model) {

        Model.prototype.generateNewSecret = function(cb) {

            this.setDataValue('secret', createSecret(32));
            return this.save().then(function(model) {

                cb(model.getDataValue('secret'));
            }).catch(function(error) {

                cb(null, error);
            });
        };
    });
};
