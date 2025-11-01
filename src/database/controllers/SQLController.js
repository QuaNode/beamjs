/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

var fs = require("fs");
var debug = require("debug")("beam:SQLController");
var inform = require("debug")("beam:SQLController:info");
var bunyan = require("bunyan");
var define = require("define-js");
var backend = require("backend-js");
var {
    ModelEntity: Entity,
    QueryExpression
} = backend;
var Sequelize = require("sequelize");
var VariableAdaptor = require("sequelize-transparent-cache-variable");
var {
    withCache
} = require("sequelize-transparent-cache")(new VariableAdaptor());

var sessions = {};
var HOOKTYPES = [
    "beforeDefine",
    "afterDefine",
    "beforeBulkSync",
    "afterBulkSync"
];

inform.log = console.log.bind(console);

if (!fs.existsSync("./logs")) fs.mkdirSync("./logs");

var log = bunyan.createLogger({

    name: "beam",
    streams: [{

        path: "./logs/error.log",
        level: "error"
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
    FROM: "from",
    THROUGH(entity, database) {

        if (!(entity instanceof Entity)) {

            throw new Error("Invalid through entity");
        }
        return entity.getObjectConstructor(database);
    },
    SELECT: function (name, database) {

        if (!name) {

            throw new Error("Invalid sub query table name");
        }
        if (!database && Object.keys(sessions).length == 1) {

            database = Object.keys(sessions)[0];
        }
        var session = sessions[database];
        if (!session) {

            throw new Error("Invalid database key");
        }
        var { session: { adapter } } = session;
        return function (query, expression) {

            var {
                comparisonOperator: comparisonOp
            } = expression;
            var sql = adapter.constructSQL({

                get: query[comparisonOp],
                as: name
            });
            query[
                comparisonOp
            ] = ComputationOperators.LITERAL(...[
                "(" + sql + ")"
            ])
            return query;
        }
    }
};

var ComputationOperators = module.exports.ComputationOperators = {

    COLUMN: Sequelize.col,
    FIELD: Sequelize.col,
    LITERAL: Sequelize.literal,
    CAST(value, type) {

        var typë = DataType(type);
        return Sequelize.cast(...[
            value,
            typë ? typë.toString() : type
        ]);
    },
    FUNCTION(option) {

        let many = Array.isArray(option.of);
        return Sequelize.fn(...[
            ...[option.get],
            ...(many ? option.of : [option.of])
        ]);
    }
};

var NullIfUndefined = function (value) {

    return value === undefined ? null : value;
};

var getManipulator = function () {

    let self = this;
    var [
        property,
        prefix,
        Model,
        database
    ] = arguments;
    var method = property.slice(0, 1).toUpperCase();
    if (property.length > 1) {

        method += property.slice(...[
            1,
            property.length
        ]);
    }
    method = prefix + method;
    var manipulator = function (value) {

        /*var [
            _,
            features,
            queryExpressions
        ] = arguments;*/
        return function (callback) {

            var nëw = value !== null;
            nëw &= value !== undefined;
            nëw &= !(value instanceof Sequelize.Model)
            let cäse;
            if (nëw) return Model[
                (cäse = function (where) {

                    if (where) return {

                        function: "findOrCreate",
                        argument: { where, value }
                    }; else return {

                        function: "create",
                        argument: value
                    };
                }(function () {

                    let { id, _id } = value;
                    if (_id) return { _id };
                    else if (id) return { id };
                    return;
                }())).function
            ](cäse.argument).then(function (model) {

                if (cäse[
                    "function"
                ] === "findOrCreate") {

                    ([model] = model);
                }
                var { session } = sessions[database];
                if (session && Array.isArray(model)) {

                    session = session.concat(model);
                } else if (session) session.push(model);
                return manipulator(model)(callback);
            }).catch(function (error) {

                callback(null, error);
            });
            if (self[method]) return self[method](...[
                value,
                /*options*/
            ]).then(function (values) {

                var result = values;
                let one = !!value;
                one &= !Array.isArray(value);
                one &= Array.isArray(result);
                if (one) result = result[0];
                return NullIfUndefined(...[
                    callback(result)
                ]);
            }).catch(function (error) {

                callback(null, error);
            }); else {

                var error = new Error("There is no " +
                    prefix + " " + property);
                return NullIfUndefined(...[
                    callback(null, error)
                ]);
            }
        };
    };
    return manipulator;
};

var adapter = {

    getQuery() {

        var [
            queryExpressions,
            contextualLevel
        ] = arguments;
        if (contextualLevel < 0) {

            throw new Error("Invalid contextual level");
        }
        if (Array.isArray(queryExpressions)) {

            if (queryExpressions.length === 1) {

                var filter = {};
                var subFilter = {};
                let queryExpression = queryExpressions[0];
                var {
                    fieldName,
                    fieldValue,
                    comparisonOperator: comparisonOp,
                    comparisonOperatorOptions: comparisonOpOpt
                } = queryExpression;
                if (typeof fieldName !== "object") {

                    filter[fieldName] = fieldValue;
                }
                if (typeof comparisonOp === "symbol") {

                    subFilter[comparisonOp] = fieldValue;
                    if (typeof comparisonOpOpt === "function") {

                        subFilter = comparisonOpOpt.apply(...[
                            ComparisonOperators, [
                                subFilter,
                                queryExpression
                            ]
                        ]);
                    }
                } else if (typeof comparisonOp === "function") {

                    subFilter = comparisonOp.apply(...[
                        ComparisonOperators, [
                            fieldValue,
                            comparisonOpOpt,
                            queryExpression
                        ]
                    ]);
                }
                if (typeof fieldName === "object") {

                    return Sequelize.where(fieldName, subFilter);
                }
                if (comparisonOp !== ComparisonOperators.EQUAL) {

                    filter[fieldName] = subFilter;
                }
                return filter;
            }
            for (var j = 0; j <= contextualLevel; j++) {

                for (var i = 1; i < queryExpressions.length; i++) {

                    let queryExpression = queryExpressions[i];
                    var splitting = queryExpressions.length === 2;
                    splitting |= queryExpression.contextualLevel === j;
                    if (splitting) {

                        var { logicalOperator } = queryExpression;
                        var rightFilter = this.getQuery(...[
                            queryExpressions.splice(i),
                            contextualLevel + 1
                        ]);
                        var leftFilter = this.getQuery(...[
                            queryExpressions,
                            contextualLevel + 1
                        ]);
                        var inducing = !!logicalOperator;
                        inducing &= !!leftFilter;
                        inducing &= !!rightFilter;
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
    constructJoin(queryExpressions) {

        let many = Array.isArray(queryExpressions);
        if (many) {

            let self = this;
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
                        fieldValue: fValue,
                        comparisonOperator: cOperator,
                        logicalOperator: lOperator
                    } = queryExpression;
                    var joining = fValue instanceof Entity;
                    if (joining) {

                        let { Model } = Sequelize;
                        joining = cOperator instanceof Model;
                        let {
                            FROM
                        } = ComparisonOperators;
                        joining |= cOperator === FROM;
                    }
                    if (joining) {

                        join.push(self.constructQuery(...[
                            fValue.getObjectQuery(),
                            fValue.getObjectFeatures(),
                            fValue.getObjectConstructor(...[
                                self.database
                            ]),
                            fieldName,
                            cOperator,
                            lOperator
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
    constructQuery() {

        var [
            queryExpressions,
            features,
            ObjectConstructor,
            fieldName,
            comparisonOperator,
            logicalOperator
        ] = arguments;
        let many = Array.isArray(queryExpressions);
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

            throw new Error("Invalid query expressions");
        }
        var query = {};
        let { Model } = Sequelize;
        var joining = !!ObjectConstructor;
        if (joining) {

            var { prototype } = ObjectConstructor;
            joining &= prototype instanceof Model;
            joining &= typeof fieldName === "string";
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

            var or = joining;
            or &= logicalOperator === Op.or;
            if (query.through) {

                query.through.where = where;
                if (or) query.through.required = false;
            } else {

                query.where = where;
                if (or) query.required = false;
            }
        }
        if (Array.isArray(having) && having.every(...[
            function (have, index) {

                if (!(have instanceof QueryExpression)) {

                    return false;
                }
                return index === 0 || !!have.logicalOperator;
            }
        ])) {

            query.having = this.getQuery(having, 0);
        }
        var attributes;
        if (Array.isArray(including)) {

            attributes = {

                include: including.map(...[
                    function (option) {

                        let get = option.get;
                        if (typeof get !== "object") {

                            get = Sequelize.col(get);
                        }
                        return option.of ? [
                            ComputationOperators.FUNCTION(...[
                                option
                            ]),
                            option.as
                        ] : [get, option.as];
                    }
                ])
            };
        }
        if (Array.isArray(include)) {

            let self = this;
            attributes = include.map(function (option) {

                if (option.get instanceof Entity) {

                    var sql = self.constructSQL(option);
                    return [
                        ComputationOperators.LITERAL(...[
                            "(" + sql + ")"
                        ]),
                        option.as
                    ];
                }
                if (typeof option === "string") {

                    return option;
                }
                let get = option.get;
                if (typeof get !== "object") {

                    get = Sequelize.col(get);
                }
                return option.of ? [
                    ComputationOperators.FUNCTION(...[
                        option
                    ]),
                    option.as
                ] : [get, option.as];
            });
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
                if (typeof option.by !== "string") {

                    throw new Error("Invalid sort by" +
                        " field name");
                }
                var order = [];
                if (Array.isArray(option.in)) {

                    order = option.in;
                }
                if (option.of) {

                    let one = !Array.isArray(option.of);
                    let many = false;
                    if (!one) {

                        many |= option.of.length > 0;
                    }
                    if (one || many) {

                        order.push(...[
                            ComputationOperators.FUNCTION({

                                get: option.by,
                                of: option.of
                            })
                        ]);
                    } else order.push(...[
                        ComputationOperators.LITERAL(...[
                            option.by
                        ])
                    ]);
                } else order.push(...[
                    Sequelize.col(option.by)
                ]);
                if (typeof option.order === "string") {

                    if (option.order !== "asc") {

                        order.push(...[
                            option.order.toUpperCase()
                        ]);
                    }
                }
                if (order.length === 1) return order[0];
                return order;
            });
        }
        if (Array.isArray(group)) {

            query.group = group.map(function (field) {

                if (typeof field !== "string") {

                    throw new Error("Invalid group by" +
                        " field name");
                }
                return field;
            });
        }
        return query;
    },
    constructSQL: function (option) {

        let {
            getObjectConstructor: getC,
            getObjectQuery: getQ,
            getObjectFeatures: getF
        } = option.get;
        let self = this;
        var SubConstructor = getC.apply(...[
            option.get,
            [self.database]
        ]);
        var subQuery = getQ.apply(option.get);
        var subFeatures = getF.apply(...[
            option.get
        ]);
        var {
            subFilter
        } = subFeatures || {};
        if (typeof subFilter === "boolean") {

            subQuery.subQuery = subFilter;
        }
        subQuery = self.constructQuery(...[
            subQuery,
            subFeatures,
            SubConstructor,
            option.as
        ]);
        var {
            include
        } = subQuery;
        if (Array.isArray(include)) {

            include.forEach(function () {

                var [rel] = arguments;
                var missing = !rel.association;
                missing &= !!rel.as;
                if (missing) {

                    var {
                        associations
                    } = SubConstructor;
                    Object.keys(associations)[
                        "some"
                    ](function (name) {

                        if (name == rel.as) {

                            rel[
                                "association"
                            ] = associations[
                                name
                                ];
                            return true;
                        }
                        return false;
                    });
                }
                missing = !rel.parent;
                if (missing) {

                    rel.parent = {

                        as: option.as,
                        model: SubConstructor
                    };
                }
            });
        }
        var {
            queryGenerator
        } = SubConstructor;
        var {
            selectQuery
        } = queryGenerator;
        var sql = selectQuery.apply(...[
            queryGenerator,
            [
                SubConstructor.getTableName(),
                subQuery,
                SubConstructor
            ]
        ]);
        if (sql.endsWith(";")) {

            sql = sql.slice(0, -1);
        }
        return sql;
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
        var query = session.adapter.constructQuery(...[
            queryExpressions,
            features
        ]);
        var {
            paginate,
            limit,
            page,
            cache,
            readonly,
            subFilter
        } = features;
        var func = "findAll";
        if (paginate) {

            func = "findAndCountAll";
        }
        var paginating = paginate;
        paginating &= typeof limit === "number";
        if (paginating) {

            query.limit = limit;
            query.offset = Math.round((page - 1) * limit);
        }
        if (typeof subFilter === "boolean") {

            query.subQuery = subFilter; // Note: undocumented
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

                modelObjects = modelObjects.map(...[
                    function (modelObject) {

                        return JSON.parse(...[
                            JSON.stringify(...[
                                modelObject.get(...[
                                    { plain: true }
                                ])
                            ])
                        ]);
                    }
                ]);
            }
            return NullIfUndefined(callback(paginating ? {

                modelObjects,
                countObjects,
                pageCount
            } : modelObjects, null));
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

            var callingBack = message.indexOf("error") > -1;
            if (!callingBack) {

                callingBack = info;
                if (callingBack) {

                    var stringified = JSON.stringify(...[
                        info,
                        function () {

                            const seen = new WeakSet();
                            return function (_, value) {

                                let one = typeof value === "object";
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
                    ]);
                    callingBack = typeof stringified === "string";
                    if (callingBack) {

                        stringified = stringified.toLowerCase();
                        callingBack = stringified.indexOf(...[
                            "error"
                        ]) > -1;
                    }
                }
            }
            if (callingBack) callback(...[
                new Error(message),
                duration
            ]); else if (process.env.NODE_ENV != "production") {

                inform(message);
            }
        }
    };
    options.logging = logging;
    options.benchmark = true;
    options.sync = {

        logging
    };
    options.pool = {

        acquire: 60000
    };
    return new Sequelize(defaultURI, options);
};

var ModelController = function (defaultURI, cb, options, KEY) {

    let self = this;
    self.type = options.type;
    var Session = define(function (init) {

        return function () {

            let self = init.apply(...[
                this,
                arguments
            ]).self();
            self.database = KEY;
            self.adapter = Object.assign(...[
                {}, adapter, {

                    database: KEY
                }
            ]);
        };
    }).extend(Array).defaults();
    var session = new Session();
    var sequelize, hookHandlers;
    if (!sessions[KEY]) sessions[KEY] = {

        sequelize: sequelize = openConnection(...[
            defaultURI,
            cb,
            options
        ]),
        session: new Session(),
        hookHandlers: hookHandlers = {}
    }; else ({
        sequelize,
        hookHandlers
    } = sessions[KEY]);
    HOOKTYPES.forEach(function (hook) {

        sequelize.addHook(...[
            hook,
            function (attributes, öptions) {

                var name;
                if (öptions) {

                    name = öptions.modelName;
                }
                if (!name) {

                    name = attributes.tableName;
                }
                var handlers = hookHandlers[
                    name + hook
                ];
                if (!handlers) {

                    handlers = hookHandlers[hook];
                }
                var results = null;
                for (var index in handlers) {

                    if (!results) results = [];
                    var handler = handlers[index];
                    results.push(handler(...[
                        attributes,
                        öptions
                    ]));
                }
                return results;
            }
        ]);
    });
    sequelize.sync().catch(function (err) {

        log.error({

            database: "sql",
            err
        });
    });
    self.removeObjects = function () {

        var [
            objWrapper,
            entity,
            callback
        ] = arguments;
        if (!entity || !(entity instanceof Entity)) {

            throw new Error("Invalid entity");
        }
        if (typeof objWrapper !== "object") {

            throw new Error("Invalid query expressions" +
                " wrapper");
        }
        self.save(function (err) {

            if (err) {

                if (typeof callback === "function") {

                    callback(null, err);
                }
            } else {

                var queryExpressions = [
                    ...(objWrapper.getObjectQuery() || []),
                    ...(entity.getObjectQuery() || [])
                ];
                var features = entity.getObjectFeatures() || {};
                entity.getObjectConstructor(KEY).destroy(...[
                    session.adapter.constructQuery(...[
                        queryExpressions,
                        features
                    ])
                ]).then(function (modelObjects) {

                    if (typeof callback === "function") {

                        return NullIfUndefined(...[
                            callback(modelObjects, null)
                        ]);
                    }
                    return null;
                }).catch(function (error) {

                    if (typeof callback === "function") {

                        callback(null, error);
                    }
                });
            }
        }, session.filter(function (modelObject) {

            let { getObjectConstructor } = entity;
            let ObjectConstructor = getObjectConstructor(KEY);
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

            throw new Error("Invalid entity");
        }
        var modelObjects = [];
        var addObject = function (objAttributes) {

            try {

                let { getObjectConstructor } = entity;
                let ObjectConstructor = getObjectConstructor(KEY);
                var modelObject = new ObjectConstructor(...[
                    objAttributes
                ]);
                session.push(modelObject);
                modelObjects.push(modelObject);
            } catch (e) {

                if (typeof callback === "function") {

                    callback(null, e);
                }
            }
        };
        if (Array.isArray(objsAttributes)) {

            objsAttributes.forEach(addObject);
        } else addObject(objsAttributes);
        if (typeof callback === "function") {

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

            throw new Error("Invalid entity");
        }
        if (typeof objWrapper !== "object") {

            throw new Error("Invalid query expressions" +
                " wrapper");
        }
        self.save(function (error) {

            if (error) {

                if (typeof callback === "function") {

                    return NullIfUndefined(...[
                        callback(null, error)
                    ]);
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
                    aggregating = typeof aggregate === "object";
                    if (aggregating) {

                        aggregating &= Object(aggregate).length > 0;
                    }
                }
                if (aggregating) {

                    throw new Error("This feature is not " +
                        "implemented yet");
                } else return getExecuteQuery(session)(...[
                    queryExpressions,
                    entity.getObjectConstructor(KEY),
                    features,
                    callback
                ]);
            }
        }, session.filter(function (modelObject) {

            let { getObjectConstructor } = entity;
            let ObjectConstructor = getObjectConstructor(KEY);
            return modelObject instanceof ObjectConstructor;
        }));
    };
    self.save = function (callback, oldSession) {

        var {
            session: sëssion
        } = sessions[KEY];
        let many = Array.isArray(oldSession);
        var workingSession;
        if (many) workingSession = oldSession; else {

            workingSession = session.concat(sëssion);
        }
        if (workingSession.length === 0) {

            inform("Model controller session has " +
                "no objects to be saved!");
        }
        var currentSession = [];
        var callingBack = typeof callback === "function";
        var save = function (index) {

            var workingModelObject = workingSession[index];
            var i = session.indexOf(workingModelObject);
            if (i > -1) session.splice(i, 1); else {

                i = sëssion.indexOf(workingModelObject);
                if (i > -1) sëssion.splice(i, 1);
            }
            setTimeout(function () {

                let { Model } = Sequelize;
                var saving = workingModelObject instanceof Model;
                if (saving) {

                    saving = workingModelObject.isNewRecord;
                    saving |= !!workingModelObject.changed();
                }
                if (saving) {

                    workingModelObject.save().then(...[
                        function (modelObject) {

                            currentSession.push(modelObject);
                            save(index + 1);
                            return null;
                        }
                    ]).catch(function (error) {

                        if (error) {

                            debug(error);
                            log.error({

                                database: "sql",
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

                    return NullIfUndefined(...[
                        callback(null, currentSession)
                    ]);
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
        default:
            if (typeof datatype === "function") {

                var { name } = datatype;
                var typeName = name.toUpperCase();
                var TYPE = Sequelize.DataTypes[
                    typeName
                ];
                if (TYPE) return TYPE; else {

                    var {
                        ABSTRACT
                    } = Sequelize.DataTypes;
                    var { prototype } = datatype;
                    if (prototype instanceof ABSTRACT) {

                        return Sequelize.DataTypes[
                            typeName
                        ] = datatype;
                    }
                }
            }
            break;
    }
};

var resolveAttributes = function (attributes, directives) {

    var { constraints, validate } = directives;
    var id = {};
    var key;
    if (constraints.id) {

        key = "id";
        if (typeof constraints.id === "object") {

            id = constraints.id;
        }
    } else key = "_id";
    return Object.keys(attributes).concat([
        key
    ]).reduce(function (filteredAttributes, property) {

        var type = attributes[property];
        if (property === key) {

            type = Object.assign({

                type: Sequelize.DataTypes.BIGINT,
                autoIncrement: true,
                primaryKey: true
            }, id);
        } else {

            let constraint = {};
            let constraining = !!constraints;
            let rule;
            if (constraining) {

                rule = constraints[property];
                constraining &= !!rule;
                constraining &= typeof rule === "object";
            }
            if (constraining) {

                constraint = rule;
            }
            var unique = type === String;
            unique &= constraint.unique;
            if (unique) type = Object.assign({

                type: Sequelize.DataTypes.STRING(125)
            }, constraint); else if (DataType(type)) {

                type = Object.assign({

                    type: DataType(type)
                }, constraint);
            }
        }
        if (validate && Object.values(...[
            Sequelize.DataTypes
        ]).includes(type.type)) {

            if (property.startsWith("has")) {

                throw new Error('Remove/rename "has"' +
                    ' from field ' + property);
            }
            filteredAttributes[property] = type;
        } else if (!validate) {

            filteredAttributes[property] = type;
        }
        return filteredAttributes;
    }, {});
};

var resolveRelations = function () {

    let [
        name,
        attributes,
        constraints,
        Model,
        database
    ] = arguments;
    var getter = function () {

        let [
            property,
            otherModel,
            toMany
        ] = arguments;
        if (this["_" + property]) {

            return this["_" + property];
        }
        let self = this;
        var relation = {

            get: getManipulator.apply(...[
                self,
                [
                    property,
                    "get",
                    otherModel,
                    database
                ]
            ]),
            set: getManipulator.apply(...[
                self,
                [
                    property,
                    "set",
                    otherModel,
                    database
                ]
            ])
        };
        if (toMany) {

            relation.add = getManipulator.apply(...[
                self,
                [
                    property,
                    "add",
                    otherModel,
                    database
                ]
            ]);
            relation.remove = getManipulator.apply(...[
                self,
                [
                    property,
                    "remove",
                    otherModel,
                    database
                ]
            ]);
        }
        return relation;
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
            var lazy = typeof entity === "function";
            if (lazy) {

                let { prototype } = entity;
                lazy &= !(prototype instanceof Entity);
            }
            if (lazy) entity = entity(name);
            var valid = !!entity;
            if (valid) {

                let { prototype } = entity;
                valid &= prototype instanceof Entity;
            }
            if (valid) {

                var func = "hasOne";
                if (toMany) func = "hasMany";
                else if (lazy) func = "belongsTo";
                var options = {

                    as: property
                };
                let constraint = {};
                let constraining = !!constraints;
                let rule;
                if (constraining) {

                    rule = constraints[property];
                    constraining &= !!rule;
                    constraining &= typeof rule === "object";
                }
                if (constraining) {

                    constraint = rule;
                }
                if (toMany && constraint.through) {

                    func = "belongsToMany";
                }
                let {
                    getObjectConstructor
                } = entity.prototype;
                var otherModel = getObjectConstructor(...[
                    database
                ]);
                Model[func](...[
                    otherModel,
                    Object.assign(options, constraint)
                ]);
                Object.defineProperty(...[
                    Model.prototype,
                    property,
                    {
                        enumerable: true,
                        set(value) {

                            this["_" + property] = value;
                        },
                        get() {

                            return getter.apply(this, [
                                property,
                                otherModel,
                                toMany
                            ]);
                        }
                    }
                ]);
            }
        });
    }, 0);
};

ModelController.defineEntity = function () {

    let [
        name,
        attributes,
        plugins,
        constraints,
        database
    ] = arguments;
    if (typeof name !== "string") {

        throw new Error("Invalid entity name");
    }
    if (typeof attributes !== "object") {

        throw new Error("Invalid entity schema");
    }
    if (constraints && typeof constraints !== "object") {

        throw new Error("Invalid entity constraints");
    }
    if (!sessions[database]) {

        throw new Error("Sequelize is not initialized");
    }
    var { sequelize, hookHandlers } = sessions[database];
    var configuration = {

        hooks: {}
    };
    if (constraints.freezeTableName) {

        configuration.freezeTableName = true;
    }
    var hooks = {

        handlers: {},
        on(hook, handler, general) {

            if (typeof handler !== "function") {

                throw new Error("Invalid hook " +
                    hook + " handler in model " +
                    name);
            }
            var händler = function () {

                var result = handler.apply(...[
                    this,
                    arguments
                ]);
                if (result === undefined) {

                    return null;
                }
                return result;
            };
            if (HOOKTYPES.indexOf(hook) > -1) {

                if (!general) {

                    hook = name + hook;
                }
                if (!Array.isArray(...[
                    hookHandlers[hook]
                ])) hookHandlers[hook] = [];
                hookHandlers[hook].push(...[
                    händler
                ]);
            } else {

                if (general) {

                    if (configuration.hooks[hook]) {

                        inform("Overwriting hook " +
                            hook + " in model " +
                            name + "!");
                    }
                    configuration.hooks[
                        hook
                    ] = händler;
                } else {

                    if (!Array.isArray(...[
                        this.handlers[hook]
                    ])) this.handlers[hook] = [];
                    this.handlers[hook].push(händler);
                }
            }
        }
    };
    if (Array.isArray(plugins)) {

        for (var i = 0; i < plugins.length; i++) {

            if (typeof plugins[i] === "function") {

                plugins[i](...[
                    name, hooks, sequelize, database
                ]);
            }
        }
    }
    var Model = sequelize.define(...[
        name,
        resolveAttributes(attributes, {

            constraints, validate: true
        }),
        configuration
    ]);
    Model.prototype.toObject = function () {

        return JSON.parse(...[
            JSON.stringify(this.get(...[
                { plain: true }
            ]))
        ]);
    };
    Object.keys(hooks.handlers).forEach(...[
        function (hook) {

            for (var index in hooks.handlers[
                hook
            ]) {

                var handler = hooks.handlers[
                    hook
                ][index];
                Model.addHook(hook, handler);
            }
        }
    ]);
    resolveRelations(...[
        name, resolveAttributes(attributes, {
            constraints, validate: false
        }), constraints, Model, database
    ]);
    return Model;
};

ModelController.prototype.constructor = ModelController;

module.exports.getModelControllerObject = function () {

    var [options, cb, KEY] = arguments;
    if (typeof options !== "object") {

        throw new Error("Invalid options");
    }
    var {
        uri,
        username,
        password,
        type,
        name,
        host
    } = options;
    if (typeof uri === "object") {

        Object.assign(options, uri);
    }
    var invalid = typeof username !== "string";
    if (!invalid) {

        invalid |= username.length === 0;
    }
    if (invalid) {

        throw new Error("Invalid username");
    }
    options.dialect = type;
    options.database = name || "test";
    options.host = host || "127.0.0.1";
    var port = options.port || {

        mysql: "3306",
        postgres: "5432"
    }[options.dialect];
    if (!uri || typeof uri !== "string") {

        options.uri = options.dialect;
        options.uri += "://" + username;
        var auth = typeof password === "string";
        if (auth) {

            auth &= password.length > 0;
        }
        if (auth) {

            options.uri += ":";
            options.uri += encodeURIComponent(...[
                password
            ]);
        }
        options.uri += "@" + options.host;
        options.uri += ":" + port + "/";
        options.uri += options.database;
    }
    return new ModelController(...[
        options.uri,
        function () {

            cb.apply(this, arguments);
        },
        options,
        KEY
    ]);
};