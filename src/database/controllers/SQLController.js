/*jslint node: true */
/*jshint esversion: 6 */
'use strict';

var fs = require('fs');
var debug = require('debug')('beam:SQLController');
var bunyan = require('bunyan');
var backend = require('backend-js');
var {
    ModelEntity: Entity,
    QueryExpression
} = backend;
var Sequelize = require('sequelize');
require('sequelize-values')(Sequelize);
var VariableAdaptor = require('sequelize-transparent-cache-variable');
var { withCache } = require('sequelize-transparent-cache')(new VariableAdaptor());

if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

var log = bunyan.createLogger({

    name: 'beam',
    streams: [{

        path: './logs/error.log',
        level: 'error',
    }],
    serializers: bunyan.stdSerializers
});

var Op = Sequelize.Op;

module.exports.LogicalOperators = {

    AND: Op.and,
    OR: Op.or,
    NOT: Op.not
};

var ComparisonOperators = module.exports.ComparisonOperators = {

    EQUAL: Op.eq,
    NE: Op.ne,
    LT: Op.lt,
    LE: Op.lte,
    GT: Op.gt,
    GE: Op.gte,
    IN: Op.in,
    NIN: Op.notIn,
    REGEX: Op.regexp,
    NREGEX: Op.notRegexp,
    LIKE: Op.like,
    NLIKE: Op.notLike,
    BETWEEN: Op.between,
    NBETWEEN: Op.notBetween,
    FROM: 'from',
    THROUGH: function (entity) {

        if (!(entity instanceof Entity)) {

            throw new Error('Invalid through entity');
        }
        return entity.getObjectConstructor();
    }
};

var ComputationOperators = module.exports.ComputationOperators = {

    COLUMN: Sequelize.col,
    CAST: function (value, type) {

        var typë = DataType(type);
        return Sequelize.cast(...[
            value,
            typë ? typë.toString() : type
        ]);
    },
    FUNCTION: function (option) {

        var many = Array.isArray(option.of);
        return Sequelize.fn(...[
            ...[option.get],
            ...(many ? option.of.map(function (öf) {

                return öf;
            }) : option.of)
        ]);
    }
};

var sequelize = null;
var session = [];
var hookTypes = [
    'beforeDefine',
    'afterDefine',
    'beforeBulkSync',
    'afterBulkSync'
];
var hookHandlers = {};

var getHookHandler = function (hook) {

    var self = this;
    return function () {

        for (var index in self[hook]) {

            self[hook][index].apply(...[
                self,
                arguments
            ]);
        }
    };
};

var getManipulator = function () {

    var self = this;
    var [
        property,
        prefix,
        Model
    ] = arguments;
    var method = property.slice(0, 1).toUpperCase();
    if (property.length > 1) {

        method += property.slice(...[
            1,
            property.length
        ]).toLowerCase();
    }
    method = prefix + method;
    var manipulator = function (value) {

        return function (callback) {

            if (!(value instanceof Sequelize.Model)) {

                return Model.create(...[
                    value
                ]).then(function (model) {

                    if (Array.isArray(model)) {

                        session = session.concat(model);
                    } else session.push(model);
                    return manipulator(model)(callback);
                }).catch(function (error) {

                    callback(null, error);
                });
            }
            if (self[method]) return self[method](...[
                value
            ]).then(function (values) {

                return callback(value || values);
            }).catch(function (error) {

                callback(null, error);
            }); else {

                var error = new Error('There is no ' +
                    prefix + ' ' + property);
                return callback(null, error);
            }
        };
    };
    return manipulator;
};

var adapter = {

    getQuery: function () {

        var [
            queryExpressions,
            contextualLevel
        ] = arguments;
        if (contextualLevel < 0) {

            throw new Error('Invalid contextual level');
        }
        if (Array.isArray(queryExpressions)) {

            if (queryExpressions.length === 1) {

                var filter = {};
                var subFilter = {};
                var queryExpression = queryExpressions[0];
                var {
                    fieldName,
                    fieldValue,
                    comparisonOperator,
                    comparisonOperatorOptions
                } = queryExpression;
                if (typeof fieldName !== 'object') {

                    filter[fieldName] = fieldValue;
                }
                if (typeof comparisonOperator === 'symbol') {

                    subFilter[comparisonOperator] = fieldValue;
                } else if (typeof comparisonOperator === 'function') {

                    subFilter = comparisonOperator(fieldValue);
                }
                if (typeof comparisonOperatorOptions === 'function') {

                    comparisonOperatorOptions(subFilter);
                }
                if (typeof fieldName === 'object') {

                    return Sequelize.where(fieldName, subFilter);
                }
                if (comparisonOperator !== ComparisonOperators.EQUAL) {

                    filter[fieldName] = subFilter;
                }
                return filter;
            }
            for (var j = 0; j <= contextualLevel; j++) {

                for (var i = 1; i < queryExpressions.length; i++) {

                    var queryExpression = queryExpressions[i];
                    if (queryExpression.contextualLevel === j) {

                        var { logicalOperator } = queryExpression;
                        var rightFilter = this.getQuery(...[
                            queryExpressions.splice(i),
                            contextualLevel + 1
                        ]);
                        var leftFilter = this.getQuery(...[
                            queryExpressions,
                            contextualLevel + 1
                        ]);
                        var inducing = logicalOperator;
                        inducing &= leftFilter;
                        inducing &= rightFilter;
                        if (inducing) {

                            var superFilter = {};
                            superFilter[logicalOperator] = [
                                leftFilter,
                                rightFilter
                            ];
                            return superFilter;
                        } else return leftFilter || rightFilter || null;
                    }
                }
            }
        }
        return null;
    },
    constructJoin: function (queryExpressions) {

        var many = Array.isArray(queryExpressions);
        if (many) {

            var self = this;
            var indexes = [];
            var join = queryExpressions.reduce(...[
                function () {

                    var [
                        join,
                        queryExpression,
                        index
                    ] = arguments;
                    var {
                        fieldName,
                        fieldValue,
                        comparisonOperator,
                        logicalOperator
                    } = queryExpression;
                    if (fieldValue instanceof Entity) {

                        join.push(self.constructQuery(...[
                            fieldValue.getObjectQuery(),
                            fieldValue.getObjectFeatures(),
                            fieldValue.getObjectConstructor(),
                            fieldName,
                            comparisonOperator,
                            logicalOperator
                        ]));
                        indexes.push(index);
                    }
                    return join;
                },
                []
            ]);
            for (var i = indexes.length - 1; i > -1; i--) {

                queryExpressions.splice(...[
                    indexes[i],
                    1
                ]);
            }
            return join;
        }
        return null;
    },
    constructQuery: function () {

        var [
            queryExpressions,
            features,
            ObjectConstructor,
            fieldName,
            comparisonOperator
        ] = arguments;
        var many = Array.isArray(queryExpressions);
        if (many && queryExpressions.some(function () {

            var [
                queryExpression,
                index
            ] = arguments;
            if (!(queryExpression instanceof QueryExpression)) {

                return true;
            }
            return index > 0 && !queryExpression.logicalOperator;
        })) {

            throw new Error('Invalid query expressions');
        }
        var query = {};
        var { Model } = Sequelize;
        var joining = ObjectConstructor;
        if (joining) {

            var { prototype } = ObjectConstructor;
            joining &= prototype instanceof Model;
            joining &= typeof fieldName === 'string';
            if (joining) {

                joining &= fieldName.length > 0;
            }
        }
        if (joining) {

            query.model = ObjectConstructor;
            query.as = fieldName;
        }
        if (comparisonOperator instanceof Model) {

            query.through = {

                model: comparisonOperator
            };
        }
        var {
            required,
            marked,
            having,
            including,
            include,
            exclude,
            sort,
            group
        } = features;
        if (required === false) {

            query.required = false;
        }
        if (marked !== true) {

            query.force = true; // Note: undocumented, related to paranoid
        }
        query.include = this.constructJoin(...[
            queryExpressions
        ]);
        var where = this.getQuery(...[
            queryExpressions,
            0
        ]);
        if (where) {

            if (query.through) {

                query.through.where = where;
            } else query.where = where;
        }
        if (Array.isArray(having) && having.every(...[
            function (have, index) {

                if (!(have instanceof QueryExpression)) {

                    return true;
                }
                return index > 0 && !have.logicalOperator;
            }
        ])) {

            query.having = this.getQuery(having, 0);
        }
        var attributes;
        if (Array.isArray(including)) {

            attributes = {

                include: including.map(...[
                    function (option) {

                        return option.of ? [
                            ComputationOperators.FUNCTION(...[
                                option
                            ]),
                            option.as
                        ] : [
                            Sequelize.col(option.get),
                            option.as
                        ];
                    }
                ])
            };
        }
        if (Array.isArray(include)) {

            attributes = include.map(...[
                function (option) {

                    if (typeof option === 'string') {

                        return option;
                    }
                    return option.of ? [
                        ComputationOperators.FUNCTION(...[
                            option
                        ]),
                        option.as
                    ] : [
                        Sequelize.col(option.get),
                        option.as
                    ];
                }
            ]);
        }
        if (Array.isArray(exclude)) {

            attributes = {

                exclude: exclude
            };
        }
        if (attributes) {

            if (query.through) {

                query.through.attributes = attributes;
            } else query.attributes = attributes;
        }
        if (Array.isArray(sort)) {

            query.order = sort.map(function () {

                var [option] = arguments;
                if (typeof option.by !== 'string') {

                    throw new Error('Invalid sort by' +
                        ' field name');
                }
                var order = [];
                if (Array.isArray(option.in)) {

                    order = option.in;
                }
                if (option.of) order.push(...[
                    ComputationOperators.FUNCTION({

                        get: option.by,
                        of: option.of
                    })
                ]); else if (option.order !== 'asc') {

                    order.push(option.by);
                    if (typeof option.order === 'string') {

                        order.push(...[
                            option.order.toUpperCase()
                        ]);
                    }
                } else order.push(...[
                    Sequelize.col(option.by)
                ]);
                if (order.length === 1) return order[0];
                return order;
            });
        }
        if (Array.isArray(group)) {

            query.group = group.map(function (field) {

                if (typeof field !== 'string') {

                    throw new Error('Invalid group by' +
                        ' field name');
                }
                return field;
            });
        }
        return query;
    }
};

var getExecuteQuery = function (session) {

    return function () {

        var [
            queryExpressions,
            ObjectConstructor,
            features,
            callback
        ] = arguments;
        var query = adapter.constructQuery(...[
            queryExpressions,
            features
        ]);
        var {
            paginate,
            limit,
            page,
            cache,
            readonly
        } = features;
        var func = 'findAll';
        if (paginate) {

            func = 'findAndCountAll';
        }
        var paginating = paginate;
        paginating &= typeof limit === 'number';
        if (paginating) {

            query.limit = limit;
            query.offset = (page - 1) * limit;
        }
        return (cache ? withCache(...[
            ObjectConstructor
        ]).cache() : ObjectConstructor)[func](...[
            query
        ]).then(function (result) {

            var modelObjects = result;
            var countObjects;
            var pageCount;
            if (paginating) {

                modelObjects = result.rows;
                pageCount = result.count;
                if (Array.isArray(pageCount)) {

                    countObjects = pageCount;
                    pageCount = pageCount.reduce(...[
                        function (count, group) {

                            return count + parseInt(...[
                                group.count
                            ]);
                        },
                        0
                    ]);
                }
                pageCount /= limit;
            }
            if (readonly) {

                modelObjects = Sequelize.getValues(...[
                    modelObjects
                ]);
            }
            return callback(paginating ? {

                modelObjects: modelObjects,
                countObjects: countObjects,
                pageCount: pageCount
            } : modelObjects, null);
        }).catch(function (error) {

            callback(null, error);
        });
    };
};

var openConnection = function () {

    var [
        defaultURI,
        callback,
        options
    ] = arguments;
    if (!options) options = {};
    var logging = function () {

        var [
            message,
            duration,
            info
        ] = arguments;
        if (message) {

            var callingBack = message.indexOf('error') > -1;
            if (!callingBack) {

                callingBack = info;
                if (callingBack) {

                    callingBack = JSON.stringify(...[
                        info,
                        function () {

                            const seen = new WeakSet();
                            return function (_, value) {

                                var one = typeof value === 'object';
                                if (one) {

                                    one &= value !== null;
                                }
                                if (one) {

                                    if (seen.has(value)) {

                                        return;
                                    }
                                    seen.add(value);
                                }
                                return value;
                            };
                        }
                    ]).toLowerCase().indexOf('error') > -1;
                }
            }
            if (callingBack) callback(...[
                new Error(message),
                duration
            ]); else debug(message);
        }
    };
    options.logging = logging;
    options.benchmark = true;
    options.sync = {

        logging: logging
    };
    options.pool = {

        acquire: 60000
    };
    return new Sequelize(defaultURI, options);
};

var ModelController = function (defaultURI, cb, options) {

    var self = this;
    self.type = options.type;
    sequelize = openConnection(...[
        defaultURI,
        cb,
        options
    ]);
    hookTypes.forEach(function (hook) {

        Sequelize.addHook(...[
            hook,
            function (attributes, options) {

                var name;
                if (options) name = options.modelName;
                if (!name) name = attributes.name;
                if (typeof hookHandlers[
                    name + hook
                ] === 'function') {

                    hookHandlers[name + hook](...[
                        attributes,
                        options
                    ]);
                }
            }
        ]);
    });
    sequelize.sync().catch(function (err) {

        log.error({

            database: 'sql',
            err: err
        });
    });
    self.removeObjects = function () {

        var [
            objWrapper,
            entity,
            callback
        ] = arguments;
        if (!entity || !(entity instanceof Entity)) {

            throw new Error('Invalid entity');
        }
        if (typeof objWrapper !== 'object') {

            throw new Error('Invalid query expressions' +
                ' wrapper');
        }
        self.save(function (err) {

            if (err) {

                if (typeof callback === 'function') {

                    callback(null, err);
                }
            } else {

                var queryExpressions = [
                    ...(objWrapper.getObjectQuery() || []),
                    ...(entity.getObjectQuery() || [])
                ];
                var features = entity.getObjectFeatures() || {};
                entity.getObjectConstructor().destroy(...[
                    adapter.constructQuery(...[
                        queryExpressions,
                        features
                    ])
                ]).then(function (modelObjects) {

                    if (typeof callback === 'function') {

                        return callback(modelObjects, null);
                    }
                }).catch(function (error) {

                    if (typeof callback === 'function') {

                        callback(null, error);
                    }
                });
            }
        }, session.filter(function (modelObject) {

            var { getObjectConstructor } = entity;
            var ObjectConstructor = getObjectConstructor();
            return modelObject instanceof ObjectConstructor;
        }));
    };
    self.addObjects = function () {

        var [
            objsAttributes,
            entity,
            callback
        ] = arguments;
        if (!entity || !(entity instanceof Entity)) {

            throw new Error('Invalid entity');
        }
        var modelObjects = [];
        var addObject = function (objAttributes) {

            try {

                var { getObjectConstructor } = entity;
                var ObjectConstructor = getObjectConstructor();
                var modelObject = new ObjectConstructor(...[
                    objAttributes
                ]);
                session.push(modelObject);
                modelObjects.push(modelObject);
            } catch (e) {

                if (typeof callback === 'function') {

                    callback(null, e);
                }
            }
        };
        if (Array.isArray(objsAttributes)) {

            objsAttributes.forEach(addObject);
        } else addObject(objsAttributes);
        if (typeof callback === 'function') {

            callback(modelObjects);
        }
        if (modelObjects.length === 1) {

            return modelObjects[0];
        }
        return modelObjects;
    };
    self.getObjects = function () {

        var [
            objWrapper,
            entity,
            callback
        ] = arguments;
        if (!entity || !(entity instanceof Entity)) {

            throw new Error('Invalid entity');
        }
        if (typeof objWrapper !== 'object') {

            throw new Error('Invalid query expressions' +
                ' wrapper');
        }
        self.save(function (error) {

            if (error) {

                if (typeof callback === 'function') {

                    return callback(null, error);
                }
            } else {

                var queryExpressions = [
                    ...(objWrapper.getObjectQuery() || []),
                    ...(entity.getObjectQuery() || [])
                ];
                var aggregateExpressions = [
                    ...(objWrapper.getObjectAggregate() || []),
                    ...(entity.getObjectAggregate() || [])
                ];
                // var filterExpressions = objWrapper.getObjectFilter() || [];
                var features = entity.getObjectFeatures() || {};
                var aggregating = aggregateExpressions.length > 0;
                if (!aggregating) {

                    var { aggregate } = features;
                    aggregating = typeof aggregate === 'object';
                    if (aggregating) {

                        aggregating &= Object(aggregate).length > 0;
                    }
                }
                if (aggregating) {

                    throw new Error('This feature is not ' +
                        'implemented yet');
                } else return getExecuteQuery(session)(...[
                    queryExpressions,
                    entity.getObjectConstructor(),
                    features,
                    callback
                ]);
            }
        }, session.filter(function (modelObject) {

            var { getObjectConstructor } = entity;
            var ObjectConstructor = getObjectConstructor();
            return modelObject instanceof ObjectConstructor;
        }));
    };
    self.save = function (callback, oldSession) {

        var many = Array.isArray(oldSession);
        var workingSession;
        if (many) workingSession = oldSession
        else workingSession = session.slice();
        if (workingSession.length === 0) {

            debug('Model controller session has ' +
                'no objects to be saved!');
        }
        var currentSession = [];
        var callingBack = typeof callback === 'function';
        var save = function (index) {

            var workingModelObject = workingSession[index];
            var i = session.indexOf(workingModelObject);
            if (i > -1) session.splice(i, 1);
            setTimeout(function () {

                var { Model } = Sequelize;
                var saving = workingModelObject instanceof Model;
                if (saving) {

                    saving = workingModelObject.isNewRecord;
                    saving |= workingModelObject.changed();
                }
                if (saving) {

                    workingModelObject.save().then(...[
                        function (modelObject) {

                            currentSession.push(modelObject);
                            save(index + 1);
                        }
                    ]).catch(function (error) {

                        if (error) {

                            debug(error);
                            log.error({

                                database: 'sql',
                                err: error
                            });
                        }
                        if (callingBack) {

                            callback(error, currentSession);
                        }
                    });
                } else if (workingSession.length > index + 1) {

                    save(index + 1);
                } else if (callingBack) {

                    return callback(null, currentSession);
                }
            }, 0);
        };
        save(0);
        return workingSession;
    };
};

var DataType = function (datatype) {

    switch (datatype) {

        case String: return Sequelize.DataTypes.TEXT;
        case Number: return Sequelize.DataTypes.DOUBLE;
        case Boolean: return Sequelize.DataTypes.BOOLEAN;
        case Date: return Sequelize.DataTypes.DATE;
    }
};

ModelController.defineEntity = function () {

    var [
        name,
        attributes,
        plugins,
        constraints
    ] = arguments;
    if (typeof name !== 'string') {

        throw new Error('Invalid entity name');
    }
    if (typeof attributes !== 'object') {

        throw new Error('Invalid entity schema');
    }
    if (constraints && typeof constraints !== 'object') {

        throw new Error('Invalid entity constraints');
    }
    if (!sequelize) {

        throw new Error('Sequelize is not initialized');
    }
    var configuration = {

        hooks: {}
    };
    if (constraints.freezeTableName) {

        configuration.freezeTableName = true;
    }
    var hooks = {

        on: function (hook, handler) {

            if (!Array.isArray(this[hook])) {

                this[hook] = [];
            }
            this[hook].push(handler);
            if (hookTypes.indexOf(hook) > -1) {

                hookHandlers[
                    name + hook
                ] = getHookHandler.apply(...[
                    this,
                    [hook]
                ]);
            } else configuration.hooks[
                hook
            ] = getHookHandler.apply(...[
                this,
                [hook]
            ]);
        }
    };
    if (Array.isArray(plugins)) {

        for (var i = 0; i < plugins.length; i++) {

            if (typeof plugins[i] === 'function') {

                plugins[i](name, hooks, sequelize);
            }
        }
    }
    Object.keys(attributes).forEach(...[
        function (property) {

            var constraint = {};
            var constraining = constraints;
            var rule;
            if (constraining) {

                rule = constraints[property];
                constraining &= rule;
                constraining &= typeof rule === 'object';
            }
            if (constraining) {

                constraint = rule;
            }
            var type = attributes[property];
            var unique = type === String;
            unique &= constraint.unique;
            if (unique) {

                attributes[property] = Object.assign({

                    type: Sequelize.DataTypes.STRING(125)
                }, constraint);
            } else if (DataType(type)) {

                attributes[property] = Object.assign({

                    type: DataType(type)
                }, constraint);
            }
        }
    ]);
    var id = {};
    var key;
    if (constraints.id) {

        key = 'id';
        if (typeof constraints.id === 'object') {

            id = constraints.id;
        }
    } else key = '_id';
    attributes[key] = Object.assign({

        type: Sequelize.DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    }, id);
    var Model = sequelize.define(...[
        name,
        Object.keys(...[
            attributes
        ]).reduce(function () {

            var [
                filteredAttributes,
                property
            ] = arguments;
            if (Object.values(...[
                Sequelize.DataTypes
            ]).includes(...[
                attributes[property].type
            ])) {

                if (property.startsWith('has')) {

                    throw new Error('Remove/rename' +
                        ' "has" from field ' +
                        property);
                }
                filteredAttributes[
                    property
                ] = attributes[property];
            }
            return filteredAttributes;
        }, {}),
        configuration
    ]);
    Model.prototype.toObject = function () {

        return Sequelize.getValues(this);
    };
    setTimeout(function () {

        Object.keys(...[
            attributes
        ]).forEach(function (property) {

            var toMany = Array.isArray(...[
                attributes[property]
            ]);
            var entity;
            if (toMany) {

                entity = attributes[property][0];
            } else entity = attributes[property];
            var lazy = typeof entity === 'function';
            if (lazy) {

                var { prototype } = entity;
                lazy &= !(prototype instanceof Entity);
            }
            if (lazy) entity = entity(name);
            var valid = entity;
            if (valid) {

                var { prototype } = entity;
                valid &= prototype instanceof Entity;
            }
            if (valid) {

                var func = 'hasOne';
                if (toMany) func = 'hasMany';
                else if (lazy) func = 'belongsTo';
                var options = {

                    as: property
                };
                var constraint = {};
                var constraining = constraints;
                var rule;
                if (constraining) {

                    rule = constraints[property];
                    constraining &= rule;
                    constraining &= typeof rule === 'object';
                }
                if (constraining) {

                    constraint = rule;
                }
                if (toMany && constraint.through) {

                    func = 'belongsToMany';
                }
                var {
                    getObjectConstructor
                } = entity.prototype;
                var otherModel = getObjectConstructor();
                Model[func](...[
                    otherModel,
                    Object.assign(options, constraint)
                ]);
                Object.defineProperty(...[
                    Model.prototype,
                    property,
                    {
                        enumerable: true,
                        set: function (value) {

                            this['_' + property] = value;
                        },
                        get: function () {

                            if (this['_' + property]) {

                                return this['_' + property];
                            }
                            var self = this;
                            var relation = {

                                get: getManipulator.apply(...[
                                    self,
                                    [
                                        property,
                                        'get',
                                        otherModel
                                    ]
                                ]),
                                set: getManipulator.apply(...[
                                    self,
                                    [
                                        property,
                                        'set',
                                        otherModel
                                    ]
                                ])
                            };
                            if (toMany) {

                                relation.add = getManipulator.apply(...[
                                    self,
                                    [
                                        property,
                                        'add',
                                        otherModel
                                    ]
                                ]);
                                relation.remove = getManipulator.apply(...[
                                    self,
                                    [
                                        property,
                                        'remove',
                                        otherModel
                                    ]
                                ]);
                            }
                            return relation;
                        }
                    }
                ]);
            }
        });
    }, 0);
    return Model;
};

ModelController.prototype.constructor = ModelController;

module.exports.getModelControllerObject = function () {

    var [options, cb] = arguments;
    if (typeof options !== 'object') {

        throw new Error('Invalid options');
    }
    var {
        uri,
        username,
        password,
        type,
        name,
        host
    } = options;
    if (typeof uri === 'object') {

        Object.assign(options, uri);
    }
    var invalid = username;
    if (!invalid) {

        invalid |= username.length === 0;
    }
    if (invalid) {

        throw new Error('Invalid username');
    }
    options.dialect = type;
    options.database = name || 'test';
    options.host = host || '127.0.0.1';
    var port = options.port || {

        mysql: '3306',
        postgres: '5432'
    }[options.dialect];
    if (!uri || typeof uri !== 'string') {

        options.uri = options.dialect;
        options.uri += '://' + username;
        var auth = typeof password === 'string';
        if (auth) {

            auth &= password.length > 0;
        }
        if (auth) options.uri += ':' + password;
        options.uri += '@' + options.host;
        options.uri += ':' + port + '/';
        options.uri += options.database;
    }
    return new ModelController(...[
        options.uri,
        function () {

            cb.apply(this, arguments);
        },
        options
    ]);
};