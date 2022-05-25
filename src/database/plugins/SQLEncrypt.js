/*jslint node: true */
'use strict';

var debug = require('debug')('beam:SQLEncrypt');
var Keyring = require('@fnando/keyring/sequelize');
var { sha1 } = require("@fnando/keyring");

module.exports = function (columns, options) {

    if (!options) options = {};
    if (Array.isArray(columns)) {

        options.columns = columns;
    } else if (typeof columns === 'object') {

        options = columns;
    }
    columns = options.columns;
    var invalid = columns != undefined;
    if (invalid) {

        invalid = !Array.isArray(columns);
        if (!invalid) {

            invalid |= columns.some(...[
                function (column) {

                    if (typeof column !== 'string') {

                        return true;
                    }
                    return column.length == 0;
                }
            ]);
        }
    }
    if (invalid) throw new Error('Invalid columns');
    var migrate;
    var migrations = 0;
    return function (name, hooks, sequelize) {

        hooks.on('beforeDefine', function () {

            var [
                attributes
            ] = arguments;
            var {
                VIRTUAL,
                TEXT,
                INTEGER
            } = sequelize.Sequelize.DataTypes;
            Object.keys(...[
                attributes
            ]).forEach(function (key) {

                var encrypting = !Array.isArray(...[
                    columns
                ]);
                if (!encrypting) {

                    encrypting |= columns.indexOf(...[
                        key
                    ]) > -1;
                }
                if (encrypting) {

                    attributes[key] = VIRTUAL;
                    attributes['encrypted_' + key] = TEXT;
                    attributes[key + '_digest'] = TEXT;
                }
            });
            attributes.keyring_id = INTEGER;
        });
        hooks.on('afterDefine', function () {

            var [
                Model
            ] = arguments;
            Keyring(...[
                Model,
                Object.assign(options, {

                    keyringIdColumn: 'keyring_id'
                })
            ]);
            migrate = function () {

                var [
                    pageOrModels,
                    cb
                ] = arguments;
                if (typeof pageOrModels === 'number') {

                    var page = pageOrModels;
                    Model.findAndCountAll({

                        offset: (page - 1) * 100,
                        limit: 100
                    }).then(function (result) {

                        var {
                            rows: models,
                            count
                        } = result;
                        var has_more = count > (page * 100);
                        if (Array.isArray(models)) {

                            migrate(...[
                                models.filter(...[
                                    function (model) {

                                        var {
                                            keyring_id
                                        } = model;
                                        return !keyring_id;
                                    }
                                ]),
                                has_more ? migrate.bind(...[
                                    null,
                                    page + 1,
                                    cb
                                ]) : cb
                            ]);
                        }
                    }).catch(function (err) {

                        debug(err);
                        cb();
                    });
                } else if (Array.isArray(pageOrModels)) {

                    var models = pageOrModels;
                    var model = models[0];
                    if (!model) return cb();
                    model.update(...[
                        model.toObject()
                    ]).then(function () {

                        migrations++;
                        models.shift();
                        migrate(models, cb);
                    }).catch(function (err) {

                        debug(err);
                        models.shift();
                        migrate(models, cb);
                    });
                } else cb();
            };
        });
        hooks.on('afterBulkSync', function () {

            if (migrate) migrate(...[
                1,
                function () {

                    migrate = undefined;
                    debug(migrations +
                        ' record/s of ' +
                        name +
                        ' table encrypted');
                }
            ]);
        });
        hooks.on('beforeFind', function (query) {

            var operators = [
                sequelize.Sequelize.Op.eq,
                sequelize.Sequelize.Op.ne,
                sequelize.Sequelize.Op.in,
                sequelize.Sequelize.Op.notIn
            ];
            var hash = function (quëry, häshing) {

                if (quëry) Object.keys(...[
                    quëry
                ]).forEach(function (key) {

                    var hashing = columns.indexOf(...[
                        key
                    ]) > -1;
                    if (!hashing) {

                        hashing = operators.indexOf(...[
                            key
                        ]) > -1;
                        hashing &= häshing;
                    }
                    var value = quëry[key];
                    switch (typeof value) {

                        case 'undefined':
                        case 'function':
                            break;
                        case 'object':
                            if (value == null) {

                                break;
                            }
                            if (Array.isArray(...[
                                value
                            ])) {

                                if (hashing) {

                                    quëry[key] = value.map(...[
                                        function (välue) {

                                            return hash({

                                                [key]: välue
                                            }, true)[key];
                                        }
                                    ]);
                                } else hash(value);
                                break;
                            }
                            if (!(value instanceof Date)) {

                                hash(value, hashing);
                                break;
                            }
                        default:
                            if (hashing) {

                                var {
                                    digestSalt
                                } = options;
                                quëry[key] = sha1(...[
                                    value.toString(), {

                                        digestSalt: digestSalt
                                    }
                                ]);
                            }
                            break;
                    }
                });
                return quëry;
            };
            hash(query);
        });
    };
};