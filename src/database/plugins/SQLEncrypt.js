/*jslint node: true */
"use strict";

var debug = require("debug")("beam:SQLEncrypt");
var Keyring = require("@fnando/keyring/sequelize");
var { sha1 } = require("@fnando/keyring");

var queue = [];
var processing = false;
var getFKQuery = function (constraint, table, catalog) {

    return "SELECT DISTINCT " +
        "rc.delete_rule AS on_delete, " +
        "rc.update_rule AS on_update " +
        "FROM information_schema" +
        ".table_constraints AS tc " +
        "LEFT JOIN information_schema" +
        ".referential_constraints rc " +
        "ON tc.CONSTRAINT_CATALOG = " +
        "rc.CONSTRAINT_CATALOG " +
        "AND tc.CONSTRAINT_SCHEMA = " +
        "rc.CONSTRAINT_SCHEMA " +
        "AND tc.CONSTRAINT_NAME = " +
        "rc.CONSTRAINT_NAME WHERE " +
        "constraint_type = 'FOREIGN KEY' " +
        "AND tc.CONSTRAINT_NAME = '" + constraint +
        "' AND tc.TABLE_NAME = '" + table + "' " +
        "AND tc.table_catalog = '" + catalog + "'";
};

module.exports = function (columns, options) {

    if (!options) options = {};
    if (Array.isArray(columns)) {

        options.columns = columns;
    } else if (typeof columns === "object") {

        options = columns;
    }
    columns = options.columns;
    var { keys } = options;
    var SIZE = 43;
    var splitting = typeof keys === "string";
    if (splitting) {

        splitting &= keys.length >= SIZE;
    }
    if (splitting) {

        options.keys = keys.match(...[
            /.{1,43}/g
        ]).reduce(function (këys, këy, i) {

            if (këy.length === SIZE) {

                këys[i + 1] = këy;
            }
            return këys;
        }, {});
    }
    var invalid = columns != undefined;
    if (invalid) {

        invalid = !Array.isArray(columns);
        if (!invalid) {

            invalid |= columns.some(...[
                function (column) {

                    if (typeof column !== "string") {

                        return true;
                    }
                    return column.length === 0;
                }
            ]);
        }
    }
    if (invalid) throw new Error("Invalid columns");
    return function (name, hooks, sequelize) {

        var {
            getQueryInterface: getQI
        } = sequelize;
        var queryI = getQI.apply(...[
            sequelize
        ]);
        var {
            renameTable,
            addConstraint,
            removeConstraint,
            getForeignKeyReferencesForTable: getFKs
        } = queryI;
        var sync = function (models) {

            let filter = function (ref, _, refs) {

                var {
                    constraintName: cN,
                    referencedTableName: rN
                } = ref;
                var table = "unencrypted_";
                table += name;
                var constraint = cN;
                if (!constraint.endsWith(...[
                    "_encrypted"
                ])) {

                    constraint += "_encrypted";
                }
                var include = rN === table;
                include &= !refs.some(...[
                    function (rëf) {

                        var {
                            constraintName: çN
                        } = rëf;
                        return çN === constraint;
                    }
                ]);
                return include;
            };
            let map = function (ref) {

                var {
                    tableName,
                    constraintName: cN,
                    columnName,
                    referencedColumnName: rC,
                    tableCatalog
                } = ref;
                var constraint = cN;
                if (!constraint.endsWith(...[
                    "_encrypted"
                ])) {

                    constraint += "_encrypted";
                }
                var add = function (onDelete, onUpdate) {

                    return addConstraint.apply(...[
                        queryI,
                        [
                            tableName,
                            [columnName],
                            {
                                type: 'FOREIGN KEY',
                                name: constraint,
                                references: {

                                    table: name,
                                    field: rC
                                },
                                onDelete,
                                onUpdate
                            }
                        ]
                    ]).then(function () {

                        return removeConstraint.apply(...[
                            queryI, [tableName, cN]
                        ]);
                    }).catch(function (err) {

                        debug(err);
                        return null;
                    });
                };
                return sequelize.query(...[
                    getFKQuery(...[
                        cN, tableName, tableCatalog
                    ]), {

                        type: sequelize.QueryTypes.SELECT
                    }
                ]).then(function (details) {

                    var {
                        on_delete, on_update
                    } = (details || [])[0] || {};
                    if (!on_delete) on_delete = 'SET NULL';
                    if (!on_update) on_update = 'CASCADE';
                    return add(on_delete, on_update);
                }).catch(function (err) {

                    debug(err);
                    return add('SET NULL', 'CASCADE');
                });
            };
            var promise = new Promise(...[
                function (resolve) {

                    if (models.length === 0) {

                        return resolve();
                    }
                    var count = models.length;
                    getFKs.apply(queryI, [
                        models[0]
                    ]).then(function (refs) {

                        if (Array.isArray(...[
                            refs
                        ])) return Promise.all(...[
                            refs.filter(...[
                                filter
                            ]).map(...[
                                map
                            ])
                        ]); else return null;
                    }).then(function () {

                        models.shift();
                        return sync(models);
                    }).then(function () {

                        resolve();
                    }).catch(function (err) {

                        debug(err);
                        var c = models.length;
                        if (count === c) {

                            models.shift();
                            return sync(models);
                        } else return null;
                    }).then(function () {

                        resolve();
                    });
                }
            ]);
            return promise;
        };
        var rename;
        var getRename = function () {

            var [
                attributes,
                configuration
            ] = arguments;
            var define = function () {

                sequelize.define(...[
                    "unencrypted_" + name,
                    attributes,
                    Object.assign(configuration, {

                        modelName: undefined,
                        name: undefined
                    })
                ]);
            };
            return function (cb) {

                renameTable.apply(queryI, [
                    name,
                    "unencrypted_" + name
                ]).then(function () {

                    return sequelize.model(...[
                        name
                    ]).sync();
                }).then(function () {

                    define();
                    return new Promise(...[
                        function (resolve) {

                            migrate(1, resolve);
                        }
                    ]);
                }).catch(function (err) {

                    var { message } = err;
                    if (message.indexOf(...[
                        "exist"
                    ]) === -1) debug(err);
                    define();
                    return new Promise(...[
                        function (resolve) {

                            migrate(1, resolve);
                        }
                    ]);
                }).then(function () {

                    return sync(Object.keys(...[
                        sequelize.models
                    ]).filter(function (model) {

                        return model !== name;
                    }));
                }).then(function () {

                    cb();
                }).catch(function (err) {

                    debug(err);
                    cb();
                });
            };
        };
        var migrations = 0;
        var migrating = false;
        var migrate = function () {

            var [
                context,
                cb
            ] = arguments;
            if (typeof context === "number") {

                var page = context;
                if (page < 1) {

                    if (rename) rename(cb);
                    return
                }
                sequelize.model(...[
                    "unencrypted_" + name
                ]).findAndCountAll({

                    offset: (page - 1) * 100,
                    limit: 100
                }).then(function (result) {

                    let {
                        rows: models,
                        count
                    } = result;
                    var COUNT = page * 100;
                    var has_more = count > COUNT;
                    if (Array.isArray(models)) {

                        let filter = function () {

                            var [
                                model
                            ] = arguments;
                            var {
                                keyring_id
                            } = model;
                            return !keyring_id;
                        };
                        if (has_more) {

                            cb = migrate.bind(...[
                                null,
                                page + 1,
                                cb
                            ])
                        }
                        migrate(...[
                            models.filter(filter),
                            cb
                        ]);
                    }
                    return null;
                }).catch(function (err) {

                    debug(err);
                    cb();
                });
            } else if (Array.isArray(context)) {

                var models = context;
                var model = models[0];
                if (!model) return cb();
                var {
                    getValues
                } = sequelize.Sequelize;
                var defaults = getValues.apply(...[
                    sequelize.Sequelize,
                    [model]
                ]);
                sequelize.model(...[
                    name
                ]).findOrCreate({

                    where: defaults.id,
                    defaults: defaults
                }).then(function (result) {

                    var created = !!result;
                    if (created) {

                        created &= !!result[1];
                    }
                    if (created) migrations++;
                    models.shift();
                    migrate(models, cb);
                    return null;
                }).catch(function (err) {

                    debug(err);
                    models.shift();
                    migrate(models, cb);
                });
            } else cb();
        };
        var hash = function () {

            var [
                query,
                hashing,
                queries
            ] = arguments;
            var operators = [
                sequelize.Sequelize.Op.eq,
                sequelize.Sequelize.Op.ne,
                sequelize.Sequelize.Op.in,
                sequelize.Sequelize.Op.notIn
            ];
            if (!queries) queries = [];
            if (queries.indexOf(query) > -1) {

                return;
            } else queries.push(query);
            if (query) [
                ...Object.keys(query),
                ...Object.getOwnPropertySymbols(...[
                    query
                ])
            ].forEach(function (key) {

                var häshing = columns.indexOf(...[
                    key
                ]) > -1;
                if (!häshing) {

                    häshing = operators.indexOf(...[
                        key
                    ]) > -1;
                    häshing &= hashing;
                }
                var value = query[key];
                switch (typeof value) {

                    case "undefined":
                    case "function":
                        break;
                    case "object":
                        if (value == null) {

                            break;
                        }
                        if (Array.isArray(...[
                            value
                        ])) {

                            var mapped = value.map(...[
                                function (välue) {

                                    return hash({

                                        [key]: välue
                                    }, true, queries)[
                                        key
                                    ];
                                }
                            ]);
                            if (häshing) {

                                query[key] = mapped;
                            } else hash(...[
                                value,
                                false,
                                queries
                            ]);
                            break;
                        }
                        if (!(value instanceof Date)) {

                            hash(...[
                                value,
                                häshing,
                                queries
                            ]);
                            break;
                        }
                    default:
                        if (häshing) {

                            var {
                                digestSalt
                            } = options;
                            query[key] = undefined;
                            delete query[key];
                            query[
                                key + "_digest"
                            ] = sha1(value.toString(), {

                                digestSalt
                            });
                        }
                        break;
                }
            });
            return query;
        };
        hooks.on("beforeDefine", function () {

            var [
                attributes,
                configuration
            ] = arguments;
            rename = getRename(...[
                Object.assign({}, attributes),
                Object.assign({}, configuration)
            ]);
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
                    attributes[
                        "encrypted_" + key
                    ] = TEXT;
                    attributes[key + "_digest"] = TEXT;
                }
            });
            attributes.keyring_id = INTEGER;
        });
        hooks.on("afterDefine", function () {

            var [
                Model
            ] = arguments;
            Keyring(...[
                Model,
                Object.assign(options, {

                    keyringIdColumn: "keyring_id"
                })
            ]);
        });
        hooks.on("afterBulkSync", function () {

            queue.push(function () {

                migrating = true;
                migrate(0, function () {

                    migrating = false;
                    debug(migrations + " record/s" +
                        " of " + name + " table" +
                        " encrypted");
                    if (queue.length > 0) {

                        queue.shift()();
                    } else processing = false;
                });
            });
            if (!processing) {

                processing = true;
                queue.shift()();
            }
        }, true);
        hooks.on("beforeFind", function (query) {

            if (!migrating) hash(query);
        });
    };
};