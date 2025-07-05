/*jslint node: true */
/*jshint esversion: 6 */
/*global emit*/
/*global _*/
"use strict";

var fs = require("fs");
var debug = require("debug")("beam:MongoController");
var inform = require("debug")("beam:MongoController:info");
var bunyan = require("bunyan");
var define = require("define-js");
var backend = require("backend-js");
var {
    ModelEntity: Entity,
    QueryExpression,
    AggregateExpression
} = backend;
var mongoose = require("mongoose");
var autoIncrementPlugin = require("mongodb-autoincrement");
var cachePlugin = require("mongoose-cache");
require("mongoose-pagination");

var sessions = {};

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

module.exports.LogicalOperators = {

    AND: "$and",
    OR: "$or",
    NOT: "$not"
};

var ComparisonOperators = module.exports.ComparisonOperators = {

    EQUAL: "=",
    EQUALIGNORECASE(value, options, expression) {

        var regex;
        if (value instanceof RegExp) {

            regex = value;
        } else regex = new RegExp("^" + value + "$");
        var query = {

            $regex: regex,
            $options: "i"
        };
        if (typeof options === "function") {

            query = options.apply(this, [query, expression]);
        }
        return query;
    },
    NE: "$ne",
    NEIGNORECASE(value, options, expression) {

        return {

            $ne: this.EQUALIGNORECASE(...[
                value,
                options,
                expression
            ])
        };
    },
    LT: "$lt",
    LE: "$lte",
    GT: "$gt",
    GE: "$gte",
    IN: "$in",
    INIGNORECASE(value, options, expression) {

        if (!Array.isArray(value)) {

            throw new Error("Invalid field value");
        }
        var query = {

            $in: value.map(function (value) {

                var regex;
                if (value instanceof RegExp) {

                    regex = new RegExp(value, "i");
                } else regex = new RegExp(...[
                    "^" + value + "$",
                    "i"
                ]);
                return regex;
            })
        };
        if (typeof options === "function") {

            query = options.apply(this, [query, expression]);
        }
        return query;
    },
    NIN: "$nin",
    NINIGNORECASE(value, options, expression) {

        var query = this.INIGNORECASE(...[
            value,
            options,
            expression
        ]);
        query.$nin = query.$in;
        delete query.$in;
        return query;
    },
    CONTAINS: "$regex",
    ANY(value, options, expression) {

        var database = expression.database;
        let many = Array.isArray(value);
        var query = many && value.some(function (condition) {

            return condition instanceof QueryExpression
        }) ? constructQuery(value, database) : many ? {

            $in: value
        } : typeof value === "object" ? value : {

            $eq: value
        };
        if (typeof options === "function") {

            query = options.apply(this, [query, expression]);
        }
        return {

            $elemMatch: query
        };
    },
    ALL: "$all",
    ANYMATCH(query) {

        return {

            $elemMatch: query
        };
    },
    ANYMATCHIGNORECASE(query) {

        return {

            $elemMatch: this.CASEINSENSITIVECOMPARE(query)
        };
    },
    CASEINSENSITIVECOMPARE(query) {

        if (Array.isArray(query.$in)) {

            return this.INIGNORECASE(query.$in);
        } else if (Array.isArray(query.$nin)) {

            return this.NINIGNORECASE(query.$nin);
        } else if (query.$eq) {

            return this.EQUALIGNORECASE(query.$eq);
        } else if (query["="]) {

            return this.EQUALIGNORECASE(query["="]);
        } else if (query.$ne) {

            return this.NEIGNORECASE(query.$ne);
        } else if (query.$regex) {

            if (!(query.$regex instanceof RegExp)) {

                query.$regex = new RegExp(query.$regex);
            }
            query.$options = "i";
        }
        return query;
    },
    SOME(query, expression) {

        var { fieldName, database } = expression;
        var attributes = fieldName.split(".");
        let one = !Array.isArray(attributes);
        if (!one) one |= attributes.length < 2;
        if (one) {

            throw new Error("Invalid field name in" +
                " a query expression");
        }
        fieldName = attributes[0];
        expression.fieldName = fieldName;
        var property = attributes.slice(1).join(".");
        property = fieldName + "_item." + property;
        var newQuery = {

            input: "$" + fieldName,
            as: property,
            cond: query
        };
        if (query["="]) newQuery.cond = {

            $eq: ["$$" + property, query["="]]
        }; else if (query.$regex) {

            if (sessions[database].version < "4.2") {

                throw new Error("Regex with SOME is" +
                    "n't supported below MongoDB 4.2");
            }
            var regex;
            if (query.$regex instanceof RegExp) {

                regex = new RegExp(...[
                    query.$regex,
                    query.$options
                ]);
            } else regex = new RegExp(...[
                "^" + query.$regex + "$",
                query.$options
            ]);
            query.$regexMatch = {
                input: "$$" + property, regex
            };
        } else if (Object.keys(query).length === 1) {

            query[Object.keys(query)[0]] = [
                "$$" + property,
                query[Object.keys(query)[0]]
            ];
        } else {

            throw new Error("Invalid filter condition");
        }
        return {

            $expr: {

                $filter: newQuery
            }
        };
    }
};

ComparisonOperators.IGNORECASE = ComparisonOperators.CASEINSENSITIVECOMPARE;

var getBinaryOperator = function (operator, acceptArray) {

    return function (leftValue, rightValue, passingArray) {

        var validLeft = leftValue !== undefined;
        var validRight = rightValue !== undefined;
        if (!validLeft && !validRight) {

            throw new Error("Invalid values in aggregate" +
                " expression");
        }
        if (acceptArray || passingArray) {

            if (acceptArray && validLeft) {

                leftValue = [leftValue];
            }
            if (passingArray && validRight) {

                rightValue = [rightValue];
            }
            if ([
                ...(leftValue || []),
                ...[].concat(rightValue || [])
            ].length === 0) {

                throw new Error("Invalid values in aggregate" +
                    " expression");
            }
        }
        var operation = {};
        if (acceptArray || passingArray) {

            operation[operator] = [
                ...(leftValue || []),
                ...[].concat(rightValue || [])
            ];
        } else if (validLeft && validRight) {

            operation[operator] = [
                leftValue,
                rightValue
            ];
        } else operation[operator] = [
            leftValue ||
            rightValue
        ];
        return operation;
    };
};

var getUnaryOperator = function (operator) {

    return function (value) {

        if (value === undefined) {

            throw new Error("Invalid value in aggregate" +
                " expression");
        }
        var operation = {};
        operation[operator] = value;
        return operation;
    };
};

var getTrimOperator = function (operator) {

    return function (chars) {

        return function (value) {

            var operation = {};
            operation[operator] = {

                input: value,
                chars: chars
            };
            return operation;
        };
    };
};

var ComputationOperators = module.exports.ComputationOperators = {

    FIELD(fieldName) {

        var invalid = typeof fieldName !== "string";
        if (!invalid) invalid |= fieldName.length === 0;
        if (invalid) {

            throw new Error("Invalid field name in aggregate" +
                " expression");
        }
        return "$" + fieldName;
    },
    VAR(variable) {

        var invalid = typeof variable !== "string";
        if (!invalid) invalid |= variable.length === 0;
        if (invalid) {

            throw new Error("Invalid variable name in aggregate" +
                " expression");
        }
        return "$$" + variable;
    },
    EQUAL: getBinaryOperator("$eq"),
    EQUALIGNORECASE(leftValue, rightValue) {

        return this.EQUAL(this.CASEINSENSITIVECOMPARE(...[
            leftValue,
            rightValue
        ]), 0);
    },
    NE: getBinaryOperator("$ne"),
    NEIGNORECASE(leftValue, rightValue) {

        return this.NE(this.CASEINSENSITIVECOMPARE(...[
            leftValue,
            rightValue
        ]), 0);
    },
    LT: getBinaryOperator("$lt"),
    LE: getBinaryOperator("$lte"),
    GT: getBinaryOperator("$gt"),
    GE: getBinaryOperator("$gte"),
    IN: getBinaryOperator("$in"),
    INIGNORECASE(leftValue, rightValue) {

        if (!Array.isArray(rightValue)) {

            throw new Error("Invalid in operator array");
        }
        let self = this;
        return self.OR(rightValue.map(function (value) {

            return self.EQUALIGNORECASE(leftValue, value);
        }), true);
    },
    NIN(leftValue, rightValue) {

        return this.NOT(this.IN(leftValue, rightValue));
    },
    NINIGNORECASE(leftValue, rightValue) {

        return this.NOT(this.INIGNORECASE(...[
            leftValue,
            rightValue
        ]));
    },
    CONTAINS(leftValue, rightValue) {

        return {

            $regexMatch: {

                input: leftValue,
                regex: rightValue
            }
        };
    },
    CONTAINSIGNORECASE(leftValue, rightValue) {

        var operation = this.CONTAINS(...[
            leftValue,
            rightValue
        ]);
        operation.$regexMatch.options = "i";
        return operation;
    },
    SOME(variable) {

        var invalid = typeof variable !== "string";
        if (!invalid) invalid |= variable.length === 0;
        if (invalid) {

            throw new Error("Invalid array variable name in " +
                "aggregate expression");
        }
        return this.OPERATOR(...[
            "SOME",
            function (leftValue, rightValue) {

                return {

                    $filter: {

                        input: leftValue,
                        as: variable,
                        cond: rightValue
                    }
                };
            }
        ]);
    },
    AND: getBinaryOperator("$and"),
    OR: getBinaryOperator("$or"),
    NOT: getBinaryOperator("$not"),
    ABS: getUnaryOperator("$abs"),
    ACOS: getUnaryOperator("$acos"),
    ACOSH: getUnaryOperator("$acosh"),
    ADD: getBinaryOperator("$add"),
    ASIN: getUnaryOperator("$asin"),
    ASINH: getUnaryOperator("$asinh"),
    ATAN: getUnaryOperator("$atan"),
    ATANH: getUnaryOperator("$atanh"),
    CEIL: getUnaryOperator("$ceil"),
    COS: getUnaryOperator("$cos"),
    DIVIDE: getBinaryOperator("$divide"),
    EXP: getUnaryOperator("$exp"),
    FLOOR: getUnaryOperator("$floor"),
    LN: getUnaryOperator("$ln"),
    LOG: getBinaryOperator("$log"),
    LOG10: getUnaryOperator("$log10"),
    MOD: getBinaryOperator("$mod"),
    MULTIPLY: getBinaryOperator("$multiply"),
    POW: getBinaryOperator("$pow"),
    ROUND: getBinaryOperator("$round"),
    SIN: getUnaryOperator("$sin"),
    SQRT: getUnaryOperator("$sqrt"),
    SUBTRACT: getBinaryOperator("$subtract"),
    TAN: getUnaryOperator("$tan"),
    TRUNC: getUnaryOperator("$trunc"),
    CONCAT: getBinaryOperator("$concat"),
    SUBSTR: getBinaryOperator("$substrCP", true),
    SUBSTRINDEX: getBinaryOperator("$indexOfCP", true),
    STRLENGTH: getUnaryOperator("$strLenCP"),
    LOWERCASE: getUnaryOperator("$toLower"),
    UPPERCASE: getUnaryOperator("$toUpper"),
    CASEINSENSITIVECOMPARE: getBinaryOperator("$strcasecmp"),
    LTRIM: getTrimOperator("$ltrim"),
    RTRIM: getTrimOperator("$rtrim"),
    TRIM: getTrimOperator("$trim"),
    SPLIT: getBinaryOperator("$split"),
    INDEXAT: getBinaryOperator("$arrayElemAt"),
    INDEXOF: getBinaryOperator("$indexOfArray", true),
    APPEND: getBinaryOperator("$concatArrays"),
    ARRAY: getUnaryOperator("$isArray"),
    LENGTH: getUnaryOperator("$size"),
    SLICE: getBinaryOperator("$slice", true),
    DIFF: getBinaryOperator("$setDifference"),
    SAME: getBinaryOperator("$setEquals"),
    INTERSECT: getBinaryOperator("$setIntersection"),
    SUBSET: getBinaryOperator("$setIsSubset"),
    UNION: getBinaryOperator("$setUnion"),
    SUM: getUnaryOperator("$sum"),
    SUMWITH: getBinaryOperator("$sum"),
    AVR: getUnaryOperator("$avg"),
    AVRWITH: getBinaryOperator("$avg"),
    FIRST: getUnaryOperator("$first"),
    LAST: getUnaryOperator("$last"),
    MAX: getUnaryOperator("$max"),
    MAXWITH: getBinaryOperator("$max"),
    MIN: getUnaryOperator("$min"),
    MINWITH: getBinaryOperator("$min"),
    DEV: getUnaryOperator("$stdDevPop"),
    DEVSAMP: getUnaryOperator("$stdDevSamp"),
    IF(leftValue, rightValue) {

        var valid = typeof rightValue === "object";
        if (valid) {

            valid &= typeof rightValue.$cond === "object";
        }
        if (valid) {

            rightValue.$cond.then = leftValue;
            return rightValue;
        } else return {

            $cond: {

                if: rightValue,
                then: leftValue
            }
        };
    },
    ELSE(leftValue, rightValue) {

        var valid = typeof leftValue === "object";
        if (valid) {

            valid &= typeof leftValue.$cond === "object";
        }
        if (valid) {

            leftValue.$cond.else = rightValue;
            return leftValue;
        } else return {

            $cond: {

                if: leftValue,
                else: rightValue
            }
        };
    },
    IFNULL: getBinaryOperator("$ifNull"),
    RANGE: getBinaryOperator("$range"),
    MINUTE: getUnaryOperator("$minute"),
    HOUR: getUnaryOperator("$hour"),
    DAY: getUnaryOperator("$dayOfMonth"),
    WEEK: getUnaryOperator("$week"),
    MONTH: getUnaryOperator("$month"),
    YEAR: getUnaryOperator("$year"),
    UNEMBED: "$$DESCEND",
    HIDE: "$$PRUNE",
    SHOW: "$$KEEP",
    CONVERT(type) {

        var invalid = typeof type != "number";
        invalid |= type < 1;
        invalid |= type > 19;
        if (invalid) {

            invalid = typeof type !== "string";
            if (!invalid) {

                invalid |= type.length === 0;
            }
        }
        if (invalid) {

            throw new Error("Invalid conversion type in " +
                "aggregate expression");
        }
        return this.OPERATOR("CONVERT", function (value) {

            return {

                $convert: {

                    input: value,
                    to: type,
                    onError: null
                }
            };
        });
    },
    OPERATOR(name, operator) {

        var key = name + new Date().getTime();
        setTimeout(function () {

            delete this[key];
            this[key] = undefined;
        }, 60000);
        return this[key] = operator;
    }
};

ComputationOperators.IGNORECASE = ComputationOperators.CASEINSENSITIVECOMPARE;

var getQuery = function () {

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
                comparisonOperatorOptions: comparisonOpts
            } = queryExpression;
            filter[fieldName] = fieldValue;
            if (typeof comparisonOp === "string") {

                subFilter[comparisonOp] = fieldValue;
                if (typeof comparisonOpts === "function") {

                    subFilter = comparisonOpts.apply(...[
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
                        comparisonOpts,
                        queryExpression
                    ]
                ]);
            }
            var nesting = Object.keys(subFilter).length > 0;
            if (nesting) {

                nesting &= !(ComparisonOperators.EQUAL in subFilter);
            }
            if (nesting) {

                if (queryExpression.fieldName in filter) {

                    filter[queryExpression.fieldName] = subFilter;
                } else filter = subFilter;
            }
            queryExpression.fieldName = fieldName;
            return filter;
        }
        for (var j = 0; j <= contextualLevel; j++) {

            for (var i = 1; i < queryExpressions.length; i++) {

                let queryExpression = queryExpressions[i];
                var splitting = queryExpressions.length === 2;
                splitting |= queryExpression.contextualLevel === j;
                if (splitting) {

                    var { logicalOperator } = queryExpression;
                    var rightFilter = getQuery(...[
                        queryExpressions.splice(i),
                        contextualLevel + 1
                    ]);
                    var leftFilter = getQuery(...[
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
};

var constructQuery = function (queryExpressions, database) {

    let many = Array.isArray(queryExpressions);
    if (many) queryExpressions.forEach(function () {

        var [queryExpression, index] = arguments;
        if (!(queryExpression instanceof QueryExpression)) {

            throw new Error("Invalid query expressions");
        }
        var {
            logicalOperator,
            contextualLevel
        } = queryExpression;
        if (index > 0 && !logicalOperator) {

            throw new Error("Query expression missing " +
                "logical operator");
        }
        if (index > 0 && typeof contextualLevel !== "number") {

            throw new Error("Query expression missing " +
                "contextual level");
        }
        queryExpression.database = database;
    });
    var query = getQuery(queryExpressions, 0);
    return query || {};
};

var getExecuteQuery = function (session) {

    return function () {

        var [
            queryExpressions,
            ObjectConstructor,
            features,
            callback,
            context
        ] = arguments;
        var {
            distinct,
            include,
            exclude,
            sort,
            populate,
            cache,
            readonly,
            paginate,
            limit,
            page
        } = features;
        var query = ObjectConstructor.find(...[
            constructQuery(...[
                queryExpressions, session.database
            ])
        ]);
        if (typeof distinct === "string") {

            query = query.distinct(distinct);
        } else {

            if (Array.isArray(include)) {

                query = query.select(include.join(" "));
            } else if (Array.isArray(exclude)) {

                query = query.select(...[
                    exclude.map(function (field) {

                        return "-" + field;
                    }).join(" ")
                ]);
            }
        }
        if (Array.isArray(sort)) {

            query = query.sort(...[
                sort.map(function (option) {

                    if (typeof option.by !== "string") {

                        throw new Error("Invalid sort by field name");
                    }
                    var sep = "";
                    if (option.order === "desc") {

                        sep = "-";
                    }
                    return sep + option.by;
                }).join(" ")
            ]);
        }
        if (Array.isArray(populate)) {

            populate.forEach(function (option) {

                var opt = {};
                if (typeof option.path !== "string") {

                    throw new Error("Invalid populate path");
                }
                opt.path = option.path;
                if (Array.isArray(option.include)) {

                    opt.select = option.include.join(" ");
                }
                if (Array.isArray(option.exclude)) {

                    var sep = "";
                    if (opt.select) {

                        sep = " ";
                    }
                    opt.select = sep + option.exclude.map(...[
                        function (field) {

                            return "-" + field;
                        }
                    ]).join(" ");
                }
                if (typeof option.model !== "string") {

                    throw new Error("Invalid populate model");
                }
                opt.model = option.model;
                query = query.populate(opt);
            });
        }
        if (cache) query = query.cache();
        if (readonly) query = query.lean();
        let time = session.busy();
        var paginating = paginate;
        paginating &= typeof limit === "number";
        if (paginating) query.paginate(...[
            page,
            limit,
            function (error, modelObjects, total) {

                session.idle(time);
                if (!readonly) Array.prototype.push.apply(...[
                    session,
                    modelObjects
                ]);
                if (typeof callback === "function") callback({

                    ...context,
                    modelObjects,
                    pageCount: total / limit
                }, error);
            }
        ]); else query.exec(function (error, modelObjects) {

            session.idle(time);
            if (!readonly) Array.prototype.push.apply(...[
                session,
                modelObjects
            ]);
            if (typeof callback === "function") {

                callback(context ? {

                    ...context,
                    modelObjects
                } : modelObjects, error);
            }
        });
    };
};

var getQueryUniqueArray = function () {

    var [
        filterExpressions,
        queryExpressions,
        features
    ] = arguments;
    var uniqueArray = [
        ...filterExpressions.concat(...[
            queryExpressions
        ]).map(function () {

            var [queryExpression] = arguments;
            return queryExpression.fieldValue;
        })
    ];
    var {
        distinct,
        include,
        exclude,
        sort,
        populate,
        cache,
        paginate
    } = features;
    var unique = typeof distinct === "string";
    unique |= Array.isArray(include);
    unique |= Array.isArray(exclude);
    unique |= Array.isArray(sort);
    unique |= Array.isArray(populate);
    unique |= cache;
    unique |= paginate;
    if (unique) uniqueArray = [
        ...uniqueArray,
        ...Object.keys(features),
        ...Object.values(features)
    ];
    return uniqueArray;
};

var getMapReduce = function (session) {

    return function () {

        var [
            queryExpressions,
            filterExpressions,
            ObjectConstructor,
            features,
            callback,
            context
        ] = arguments;
        if (!ObjectConstructor.mapReduce) {

            throw new Error("mapReduce is deprecated");
        }
        let options = {};
        var {
            filter,
            sort,
            map,
            reduce,
            finalize,
            scope,
            paginate,
            limit,
            page,
            output
        } = features.mapReduce;
        if (!scope) scope = {};
        if (!output) {

            if (!sort) sort = features.sort;
            if (typeof paginate !== "boolean") {

                paginate = features.paginate;
            }
            if (!limit) limit = features.limit;
            if (!page) page = features.page;
        }
        var collection;
        let many = queryExpressions.length > 0;
        var empty = filterExpressions.length === 0;
        if (filter && many && empty) {

            options.query = constructQuery(...[
                queryExpressions, session.database
            ]);
        } else if (!empty) {

            options.query = constructQuery(...[
                filterExpressions, session.database
            ]);
        }
        if (filter && Array.isArray(sort)) {

            options.sort = sort.reduce(function (sort, opt) {

                if (typeof opt.by !== "string") {

                    throw new Error("Invalid sort by field name");
                }
                sort[opt.by] = opt.order === "desc" ? -1 : 1;
                return sort;
            }, {});
        }
        options.map = function () {

            if (typeof _.count === "number") {

                _.count++;
                var skipping = typeof _.skip === "number";
                skipping &= _.count <= _.skip;
                if (skipping) return;
                var limiting = typeof _.limit === "number";
                limiting &= _.count > (_.skip + _.limit);
                if (limiting) return;
            }
            var emitter = _.map(this);
            if (typeof emitter === "function") {

                emitter(function (data) {

                    if (data && data.key && data.value) {

                        emit(data.key, data.value);
                    }
                });
            } else {

                var emitting = !!emitter;
                if (emitting) emitting &= !!emitter.key;
                if (emitting) emitting &= !!emitter.value;
                if (emitting) emit(emitter.key, emitter.value);
            }
        };
        options.reduce = reduce;
        if (typeof finalize === "function") {

            options.finalize = finalize;
        }
        options.scope = Object.keys(scope).reduce(function (scope, key) {

            if (scope[key] === undefined || scope[key] === null) {

                scope[key] = '';
            }
            return scope;
        }, scope);
        if (options.scope._) {

            throw new Error("Invalid use of _ it is reserved");
        }
        options.scope._ = {};
        options.scope._.map = map;
        var paginating = paginate;
        paginating &= typeof limit === "number";
        if (filter && paginating) {

            options.scope._.limit = limit;
            options.scope._.skip = Math.round(((page || 1) - 1) * limit);
            options.scope._.count = 0;
        }
        if (output) {

            var queryUniqueArray = getQueryUniqueArray(...[
                filterExpressions,
                queryExpressions,
                features
            ]);
            if (queryUniqueArray.length > 0) {

                collection = "MapReduce";
                var { modelName } = ObjectConstructor;
                collection += modelName.toUpperCase();
                collection += JSON.stringify(...[
                    queryUniqueArray
                ]).split("").reduce(function (number, string) {

                    return number / string.codePointAt(0);
                }, 9999).toString().replace("e-", "").slice(-4);
                options.out = {

                    replace: collection
                };
            }
        }
        var getEmittedValuesCount = function (stats, cb) {

            var {
                input
            } = (stats || {}).counts || {};
            if (input == undefined && paginating) {

                var countFunc = "estimatedDocumentCount";
                if (options.query) {

                    countFunc = "countDocuments";
                }
                ObjectConstructor[countFunc](...[
                    options.query,
                    function (error, count) {

                        cb(count, error);
                    }
                ]);
            } else cb(input);
        };
        let time = session.busy();
        ObjectConstructor.mapReduce(options, function () {

            var [error, out] = arguments;
            delete options.scope._;
            var {
                results,
                stats
            } = out || {};
            getEmittedValuesCount(stats, function () {

                var [count, err] = arguments;
                var pageCount = count / limit;
                var callingBack = !out;
                if (!callingBack) callingBack |= !out.model;
                if (!callingBack) callingBack |= !collection;
                if (callingBack) {

                    session.idle(time);
                    callingBack = typeof callback === "function";
                    if (callingBack) {

                        callback(context || paginating ? {

                            ...context,
                            modelObjects: results,
                            ...(paginating ? { pageCount } : {})
                        } : results, error || err);
                    }
                } else session.idle(time, function () {

                    getExecuteQuery(session)(...[
                        filter && empty ? [] : queryExpressions,
                        out.model,
                        features,
                        callback,
                        context || !isNaN(pageCount) ? {

                            ...context,
                            mapReduce: { pageCount }
                        } : undefined
                    ]);
                });
            });
        });
    };
};

var getAggregate = function () {

    var [
        aggregateExpression,
        contextualLevel
    ] = arguments;
    if (contextualLevel < 0) {

        throw new Error("Invalid contextual level");
    }
    var {
        fieldValue,
        contextualLevels
    } = aggregateExpression;
    if (!Array.isArray(fieldValue)) return fieldValue;
    if (fieldValue.length === 1) return fieldValue[0];
    var levels = contextualLevels.length;
    var invalid = levels > 0;
    if (invalid) {

        invalid &= levels !== fieldValue.filter(...[
            function (value) {

                return typeof value === "function";
            }
        ]).length;
    }
    if (invalid) throw new Error("Invalid contextual levels");
    for (var j = 0; j <= contextualLevel; j++) {

        var k = 0;
        for (var i = 0; i < fieldValue.length; i++) {

            if (typeof fieldValue[i] === "function") {

                if ((contextualLevels[k] || 0) === j) {

                    var computationOperator = fieldValue[i];
                    fieldValue.splice(i, 1);
                    contextualLevels.splice(k, 1);
                    var rightValue = getAggregate(...[
                        new AggregateExpression({

                            fieldValue: fieldValue.splice(i),
                            contextualLevels: [
                                ...contextualLevels.splice(k)
                            ]
                        }),
                        contextualLevel + 1
                    ]);
                    var leftValue = getAggregate(...[
                        new AggregateExpression({

                            fieldValue: fieldValue,
                            contextualLevels: contextualLevels
                        }),
                        contextualLevel + 1
                    ]);
                    if (leftValue !== undefined) {

                        return computationOperator(...[
                            leftValue,
                            rightValue
                        ]);
                    } else return computationOperator(...[
                        rightValue
                    ]);
                }
                k++;
            }
        }
    }
};

var constructAggregate = function () {

    var [
        aggregateExpressions,
        orderOrField
    ] = arguments;
    let many = Array.isArray(aggregateExpressions);
    if (many) aggregateExpressions.forEach(function () {

        var [aggregateExpression] = arguments;
        if (!(aggregateExpression instanceof AggregateExpression)) {

            throw new Error("Invalid aggregate expressions");
        }
        var { contextualLevels } = aggregateExpression;
        let one = !Array.isArray(contextualLevels);
        if (one || contextualLevels.some(function () {

            var [contextualLevel] = arguments;
            return typeof contextualLevel !== "number";
        })) {

            throw new Error("Aggregate expression missing " +
                "contextual levels");
        }
    });
    var indices = [];
    var aggregate = aggregateExpressions.reduce(function () {

        var [
            aggregate,
            aggregateExpression,
            index
        ] = arguments;
        var {
            computationOrder,
            fieldName
        } = aggregateExpression;
        if (computationOrder < 0) {

            throw new Error("Invalid computation order");
        }
        var aggregating = typeof orderOrField === "number";
        aggregating &= computationOrder === orderOrField;
        if (!aggregating) {

            aggregating = typeof orderOrField === "string";
            aggregating &= fieldName === orderOrField;
        }
        if (aggregating) {

            indices.push(index);
            aggregate[fieldName] = getAggregate(...[
                aggregateExpression,
                0
            ]);
        }
        return aggregate;
    }, {});
    indices.forEach(function (index) {

        aggregateExpressions.splice(index, 1);
    });
    return aggregate;
};

var getExecuteAggregate = function (session) {

    return function () {

        var [
            queryExpressions,
            aggregateExpressions,
            filterExpressions,
            ObjectConstructor,
            attributes,
            features,
            callback
        ] = arguments;
        var {
            include,
            exclude,
            filter,
            restrict,
            distinct,
            flatten,
            sort,
            populate,
            paginate,
            limit,
            page,
            output
        } = features.aggregate || {};
        if (!output) {

            if (!include) include = features.include;
            if (!exclude) exclude = features.exclude;
            if (!distinct) distinct = features.distinct;
            if (!sort) sort = features.sort;
            if (!populate) populate = features.populate;
            if (typeof paginate !== "boolean") {

                paginate = features.paginate;
            }
            if (!limit) limit = features.limit;
            if (!page) page = features.page;
        }
        var { mapReduce } = features;
        var aggregate = ObjectConstructor.aggregate();
        let many = queryExpressions.length > 0;
        var empty = filterExpressions.length === 0;
        if (filter && many && empty) {

            aggregate = aggregate.match(...[
                constructQuery(...[
                    queryExpressions, session.database
                ])
            ]);
        } else if (!empty) {

            aggregate = aggregate.match(...[
                constructQuery(...[
                    filterExpressions, session.database
                ])
            ]);
        }
        var redact;
        if (typeof restrict === "string") {

            redact = constructAggregate(...[
                aggregateExpressions,
                restrict
            ])[restrict];
        }
        var constructedAggregate;
        var group;
        var collection;
        if (filter && typeof distinct === "string") {

            constructedAggregate = constructAggregate(...[
                aggregateExpressions,
                distinct
            ]);
            var distinctAggregate = constructedAggregate[
                distinct
            ];
            group = {

                _id: distinctAggregate ? function () {

                    var _id = {};
                    _id[distinct] = distinctAggregate;
                    delete constructedAggregate[distinct];
                    return _id;
                }() : "$" + distinct
            };
            if (Array.isArray(sort)) {

                sort.forEach(function (option) {

                    if (typeof option.by !== "string") {

                        throw new Error("Invalid sort" +
                            " by field name");
                    }
                    var accum = "$min";
                    if (option.order === "desc") {

                        accum = "$max";
                    }
                    group[option.by] = {

                        [accum]: "$" + option.by
                    };
                });
            }
        }
        if (aggregateExpressions.length > 0) {

            var ordering = 0;
            constructedAggregate = constructAggregate(...[
                aggregateExpressions,
                ordering
            ]);
            if (filter && Array.isArray(include)) {

                aggregate = aggregate.project(...[
                    include.reduce(function () {

                        var [
                            project,
                            field
                        ] = arguments;
                        project[field] = 1;
                        return project;
                    }, constructedAggregate)
                ]);
            } else if (filter && Array.isArray(exclude)) {

                aggregate = aggregate.project([
                    ...Object.keys(attributes),
                    ...exclude
                ].reduce(function (project, field) {

                    if (exclude.indexOf(field) === -1) {

                        project[field] = 1;
                    }
                    return project;
                }, constructedAggregate));
            } else aggregate = aggregate.addFields(...[
                constructedAggregate
            ]);
            while (aggregateExpressions.length > 0) {

                constructedAggregate = constructAggregate(...[
                    aggregateExpressions,
                    ordering++
                ]);
                if (Object.keys(...[
                    constructedAggregate
                ]).length > 0) {

                    aggregate = aggregate.addFields(...[
                        constructedAggregate
                    ]);
                }
            }
        }
        if (redact) aggregate = aggregate.redact(redact);
        if (group) aggregate = aggregate.group(group);
        if (Array.isArray(flatten)) flatten.forEach(...[
            function (path) {

                aggregate = aggregate.unwind({

                    path: "$" + path,
                    preserveNullAndEmptyArrays: true
                });
            }
        ]);
        if (filter && Array.isArray(sort)) {

            aggregate = aggregate.sort(...[
                sort.map(function (option) {

                    if (typeof option.by !== "string") {

                        throw new Error("Invalid sort" +
                            " by field name");
                    }
                    var sep = "";
                    if (option.order === "desc") {

                        sep = "-";
                    }
                    return sep + option.by;
                }).join(" ")
            ]);
        }
        if (Array.isArray(populate)) {

            populate.forEach(function (option) {

                var opt = {

                    pipeline: []
                };
                if (typeof option.path !== "string") {

                    throw new Error("Invalid populate path");
                }
                if (typeof option.ref !== "string") {

                    throw new Error("Invalid populate ref");
                }
                var match = {};
                match[option.ref] = "$$ref";
                opt.var = {

                    ref: "$" + option.path
                };
                var project;
                if (Array.isArray(option.include)) {

                    project = option.include.reduce(...[
                        function (project, field) {

                            project[field] = 1;
                            return project;
                        }, {}
                    ]);
                } else if (Array.isArray(option.exclude)) {

                    project = option.exclude.reduce(...[
                        function (project, field) {

                            project[field] = 0;
                            return project;
                        }, {}
                    ]);
                }
                opt.pipeline.push({

                    $match: match,
                    $project: project
                });
                if (typeof option.model !== "string") {

                    throw new Error("Invalid populate model");
                }
                opt.from = option.model;
                opt.as = option.path;
                aggregate = aggregate.append({

                    $lookup: opt
                });
            });
        }
        var paginating = paginate;
        paginating &= typeof limit === "number";
        if (filter && paginating) {

            aggregate = aggregate.facet({

                modelObjects: [{

                    $skip: Math.round(((page || 1) - 1) * limit)
                }, {

                    $limit: limit
                }],
                pagination: [{

                    $count: "total"
                }]
            });
        }
        if (output) {

            var queryUniqueArray = getQueryUniqueArray(...[
                filterExpressions,
                queryExpressions,
                features
            ]);
            if (queryUniqueArray.length > 0) {

                var { modelName } = ObjectConstructor;
                collection = "Aggregate";
                collection += modelName.toUpperCase();
                collection += JSON.stringify(...[
                    queryUniqueArray
                ]).split("").reduce(function (number, string) {

                    return number / string.codePointAt(0);
                }, 9999).toString().replace("e-", "").slice(-4);
                aggregate = aggregate.append({

                    $out: collection
                });
            }
        }
        let time = session.busy();
        aggregate.exec(function (error, result) {

            var {
                modelObjects,
                pagination
            } = (result || [])[0] || {};
            var {
                total
            } = (pagination || [])[0] || {};
            var pageCount = total / limit;
            if (!result || !collection) {

                session.idle(time);
                var callingBack = typeof callback === "function";
                if (callingBack) {

                    callback(paginating ? {

                        modelObjects,
                        pageCount
                    } : result, error);
                }
            } else session.idle(time, function () {

                let {
                    mongoose: möngoose
                } = sessions[session.database];
                let Schema = möngoose.Schema;
                var Model = möngoose.models[collection];
                if (!Model) Model = möngoose.model(...[
                    collection,
                    new Schema({}, {

                        autoIndex: false,
                        strict: false,
                        collection: collection
                    })
                ]);
                var mapReducing = typeof mapReduce === "object";
                if (mapReducing) {

                    var { map, reduce } = mapReduce;
                    mapReducing &= typeof map === "function";
                    mapReducing &= typeof reduce === "function";
                }
                if (mapReducing) getMapReduce(session)(...[
                    filter && empty ? [] : queryExpressions,
                    [],
                    Model,
                    features,
                    callback,
                    !isNaN(pageCount) ? {

                        aggregate: { pageCount }
                    } : undefined
                ]); else getExecuteQuery(session)(...[
                    filter && empty ? [] : queryExpressions,
                    Model,
                    features,
                    callback,
                    !isNaN(pageCount) ? {

                        aggregate: { pageCount }
                    } : undefined
                ]);
            });
        });
    };
};

var openConnection = function () {

    var [
        { defaultURI, database },
        callback,
        closeCb
    ] = arguments;
    let {
        mongoose: möngoose
    } = sessions[database];
    var connect = function () {

        let options = {

            keepAlive: true,
            heartbeatFrequencyMS: 5000,
            maxPoolSize: 25
        };
        try {

            let cönnection = möngoose.connection;
            möngoose.connect(...[
                defaultURI,
                options,
                function (error) {

                    if (typeof closeCb === "function") {

                        closeCb(cönnection);
                    }
                    if (typeof callback === "function") {

                        callback(error);
                    }
                    if (möngoose.connection.db) {

                        möngoose.connection.db.command({

                            buildInfo: 1
                        }).then(function (info) {

                            sessions[
                                database
                            ].version = info.version;
                        }).catch(function (err) {

                            debug(err);
                        });
                    }
                }
            ]);
        } catch (error) {

            if (typeof callback === "function") {

                callback(error);
            }
        }
    };
    var connection;
    var { connections } = möngoose;
    if (connections.every(function (cönnection) {

        var { readyState } = cönnection;
        return readyState === 0 || readyState === 3;
    })) return connect();
    var disconnect = typeof closeCb === "function";
    if (disconnect && connections.some(function () {

        var [cönnection] = arguments;
        return cönnection.readyState === 1;
    })) {

        log.error({

            database: "mongodb",
            err: {

                message: "Reconnecting due to latency",
                name: "ReadyState",
                code: 1
            }
        });
        return connect();
    }
    if (connection = connections.find(function () {

        var [cönnection] = arguments;
        return cönnection.readyState === 2;
    })) connection.once("connected", callback); else {

        if (disconnect) möngoose.disconnect(connect);
    }
};

var checkConnection = function (options, callback) {

    let {
        mongoose: möngoose
    } = sessions[options.database];
    var { connections } = möngoose;
    if (!connections.some(function (connection) {

        return connection.readyState === 1;
    })) {

        openConnection(options, function () {

            var [error] = arguments;
            if (typeof callback === "function") {

                callback(error);
            }
        });
        return false;
    }
    return true;
};

var ModelController = function (defaultURI, cb, options, KEY) {

    let self = this;
    self.type = "mongodb";
    var Session = define(function (init) {

        return function () {

            let self = init.apply(this, arguments).self();
            var busy = 0;
            var reconnect = false;
            var MAX_LATENCY = 10000;
            var connections = [];
            self.database = KEY;
            self.busy = function () {

                busy++;
                return new Date();
            };
            self.idle = function (time, next) {

                if (!(time instanceof Date)) {

                    if (typeof next === "function") next();
                    return;
                }
                if (busy > 0) busy--;
                var timing = new Date().getTime();
                timing -= time.getTime();
                var reconnecting = timing > MAX_LATENCY;
                if (reconnect || reconnecting) {

                    if (busy === 0) {

                        reconnect = false;
                        connections.forEach(function () {

                            var [connection] = arguments;
                            connection.close();
                        });
                        connections = [];
                        openConnection(...[
                            { defaultURI, database: KEY },
                            next,
                            function (connection) {

                                if (connection) {

                                    var {
                                        readyState
                                    } = connection;
                                    if ([1, 2].indexOf(...[
                                        readyState
                                    ]) === -1) {

                                        return;
                                    }
                                    if (busy === 0) {

                                        connection.close();
                                    } else {

                                        connections.push(...[
                                            connection
                                        ]);
                                    }
                                }
                            }
                        ]);
                        return new Error("Reconnecting");
                    } else reconnect = true;
                }
                if (typeof next === "function") next();
            };
        };
    }).extend(Array).defaults();
    var session = new Session();
    if (!sessions[KEY]) {

        var möngoose = new mongoose.Mongoose();
        möngoose.plugin(autoIncrementPlugin.mongoosePlugin);
        möngoose.Promise = global.Promise;
        var cacheOpts = {

            max: 50,
            maxAge: 1000 * 60 * 2
        };
        cachePlugin.install(möngoose, cacheOpts);
        sessions[KEY] = {

            mongoose: möngoose,
            session: new Session()
        };
    }
    openConnection({ defaultURI, database: KEY }, cb);
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

            throw new Error("Invalid query " +
                "expressions wrapper");
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
                entity.getObjectConstructor(KEY).remove(...[
                    constructQuery(queryExpressions, KEY),
                    function (error) {

                        if (typeof callback === "function") {

                            callback(null, error);
                        }
                    }
                ]);
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
                modelObject._id = -1;
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

                    callback(null, error);
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
                var filterExpressions = [
                    ...(objWrapper.getObjectFilter() || [])
                ];
                var features = entity.getObjectFeatures() || {};
                var {
                    aggregate,
                    mapReduce
                } = features;
                var aggregating = aggregateExpressions.length > 0;
                if (!aggregating) {

                    aggregating = typeof aggregate === "object";
                    if (aggregating) {

                        aggregating &= Object.keys(...[
                            aggregate
                        ]).length > 0;
                    }
                }
                if (aggregating) getExecuteAggregate(session)(...[
                    queryExpressions,
                    aggregateExpressions,
                    filterExpressions,
                    entity.getObjectConstructor(KEY),
                    entity.getObjectAttributes(),
                    features,
                    callback
                ]); else {

                    var mapReducing = typeof mapReduce === "object";
                    if (mapReducing) {

                        var { map, reduce } = mapReduce;
                        mapReducing &= typeof map === "function";
                        mapReducing &= typeof reduce === "function";
                    }
                    if (mapReducing) getMapReduce(session)(...[
                        queryExpressions,
                        filterExpressions,
                        entity.getObjectConstructor(KEY),
                        features,
                        callback
                    ]); else getExecuteQuery(session)(...[
                        queryExpressions,
                        entity.getObjectConstructor(KEY),
                        features,
                        callback
                    ]);
                }
            }
        }, session.filter(function (modelObject) {

            let { getObjectConstructor } = entity;
            let ObjectConstructor = getObjectConstructor(KEY);
            return modelObject instanceof ObjectConstructor;
        }));
    };
    self.save = function (callback, oldSession, opts) {

        let {
            mongoose: möngoose,
            session: sëssion
        } = sessions[KEY];
        let many = Array.isArray(oldSession);
        var workingSession;
        if (many) workingSession = oldSession; else {

            workingSession = session.concat(sëssion);
            if (typeof oldSession === "object") {

                if (!opts) opts = oldSession;
            }
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

                var { Model } = möngoose;
                var saving = workingModelObject instanceof Model;
                if (saving) {

                    saving = workingModelObject.isNew;
                    saving |= workingModelObject.isModified();
                }
                if (saving) {

                    let time = session.busy();
                    workingModelObject.save(...[...(opts ? [
                        opts
                    ] : []), function () {

                        var [
                            error,
                            modelObject
                        ] = arguments;
                        if (error) {

                            debug(error);
                            log.error({

                                database: "mongodb",
                                err: error
                            });
                        }
                        if (error || !modelObject) {

                            session.idle(...[
                                time,
                                callingBack ? callback.bind(...[
                                    self,
                                    error,
                                    currentSession
                                ]) : undefined
                            ]);
                        } else {

                            currentSession.push(modelObject);
                            session.idle(time, function () {

                                if (checkConnection(...[
                                    { defaultURI, database: KEY },
                                    save.bind(self, index + 1)
                                ])) save(index + 1);
                            });
                        }
                    }]);
                } else if (workingSession.length > index + 1) {

                    if (checkConnection(...[
                        { defaultURI, database: KEY },
                        save.bind(self, index + 1)
                    ])) save(index + 1);
                } else if (callingBack && checkConnection(...[
                    { defaultURI, database: KEY },
                    callback.bind(self, null, currentSession)
                ])) callback(null, currentSession);
            }, 0);
        };
        if (checkConnection(...[
            { defaultURI, database: KEY },
            save.bind(self, 0)
        ])) save(0);
        return workingSession;
    };
};

var DataType = function (datatype, options, resolve, directives) {

    var { database } = directives;
    var Generator = Object.getPrototypeOf(...[
        function* () { }
    ]).constructor;
    switch (datatype) {

        case String:
        case Number:
        case Boolean:
        case Date:
        case Buffer:
            return datatype;
        case Map:
            var [ValueType] = options;
            let many = options.length > 1;
            var value = {

                datatype: many ? options : ValueType
            };
            if (ValueType !== undefined) {

                resolve(value, directives);
            }
            return {

                type: Map,
                of: value.datatype || String
            };
        default:
            if (datatype instanceof Generator) {

                var [
                    type,
                    ...otherOptions
                ] = datatype();
                if (typeof type === "function") {

                    return DataType(...[
                        type,
                        options.concat(otherOptions),
                        resolve,
                        directives
                    ]);
                }
                if (typeof otherOptions[0] === "function") {

                    return DataType(...[
                        otherOptions[0],
                        [
                            ...options,
                            ...[type],
                            ...otherOptions.slice(1)
                        ],
                        resolve,
                        directives
                    ]);
                }
                resolve(type, directives);
                return type;
            }
            if (datatype instanceof Function) {

                var [typeName] = options;
                if (!typeName) typeName = datatype.name;
                var invalid = typeof typeName !== "string";
                if (!invalid) {

                    invalid |= typeName.length === 0;
                }
                if (invalid) {

                    throw new Error("Invalid field custom" +
                        " data type name");
                }
                let {
                    mongoose: möngoose
                } = sessions[database];
                let Type = function (key, öptions) {

                    möngoose.SchemaType.call(...[
                        this,
                        key,
                        öptions,
                        typeName
                    ]);
                };
                Type.prototype = Object.create(...[
                    möngoose.SchemaType.prototype
                ]);
                Type.prototype.cast = datatype;
                möngoose.Schema.Types[typeName] = Type;
                return Type;
            }
            break;
    }
};

var resolveAttributes = function (attributes, directives) {

    var { database, validate, copy } = directives;
    var resolveType = function (property) {

        var value;
        if (property === undefined) {

            value = attributes;
        } else value = attributes[property];
        var isArray = Array.isArray(value);
        var [, ...options] = isArray ? value : [];
        let Type = isArray ? value[0] : value;
        var type = typeof Type;
        var setType = function () {

            var [
                PropertyType,
                noExtra
            ] = arguments;
            if (typeof PropertyType !== "function") {

                return false;
            }
            if (database) PropertyType = DataType(...[
                PropertyType,
                options,
                resolveAttributes,
                { database, validate, copy: {} }
            ]);
            if (property === undefined) {

                Type = PropertyType
                return false;
            }
            if (isArray && noExtra) {

                PropertyType = [PropertyType];
            }
            if (copy) {

                copy[property] = PropertyType;
            } else attributes[property] = PropertyType;
            return true;
        };
        var getCopy = function () {

            if (!copy) return;
            var nested_copy = {};
            if (Array.isArray(Type)) {

                var [, ...TypeOptions] = Type;
                if (Array.isArray(Type[0])) {

                    nested_copy = [];
                }
                nested_copy = [
                    nested_copy, ...TypeOptions
                ];
            }
            if (property && !Array.isArray(copy)) {

                if (isArray) {

                    copy[property] = [
                        nested_copy, ...options
                    ];
                } else copy[property] = nested_copy;
            } else if (Array.isArray(copy)) {

                copy[0] = nested_copy;
                if (copy.length === 1) {

                    copy.push(...options);
                }
            } else {

                throw new Error("Error while copying" +
                    " attributes");
            }
            return nested_copy;
        };
        switch (type) {

            case "object":
                if (Type instanceof Date) {

                    throw new Error("Invalid field data" +
                        " type");
                }
                if (!Array.isArray(Type) && validate) {

                    switch (Object.keys(Type).length) {

                        case 2:
                            if (!("ref" in Type)) break;
                        case 1:
                            if (("type" in Type)) {

                                if (setType(...[
                                    Type.type, true
                                ])) return;
                            }
                    }
                }
                resolveAttributes(Type, {

                    database,
                    validate,
                    copy: getCopy()
                });
                break;
            case "string":
                if (typeof options[0] !== "function") {

                    throw new Error("Custom field data" +
                        " type needs cast function");
                }
                options[1] = Type;
                Type = options[0];
                options = [Type].concat(options.slice(1));
            case "function":
                setType(Type, isArray && value.length === 1);
            default:
                if (property === "type" && validate) {

                    throw new Error("type is a reserved word" +
                        " if it is used as an field so " +
                        "it's data type should be object");
                }
                if (property === "self") {

                    throw new Error("self is a reserved word," +
                        " it should not be an field");
                }
                break;
        }
        return Type;
    };
    var resolving = Array.isArray(attributes);
    resolving |= attributes instanceof Date;
    resolving |= typeof attributes !== "object";
    if (resolving) return resolveType(); else {

        Object.keys(attributes).forEach(resolveType);
    }
    return copy;
};

var resolveConstraints = function (schema, constraints) {

    if (!constraints) return;
    Object.keys(constraints).forEach(function (property) {

        let constraint = constraints[property];
        let constraining = !!constraint;
        constraining &= typeof constraint === "object";
        if (!constraining) return;
        var path = schema.path(property);
        if (!path) return;
        Object.keys(constraint).forEach(function (key) {

            constraining = !!constraint[key];
            constraining &= typeof path[key] === "function";
            if (constraining) {

                if (key === "validate") {

                    if (!Array.isArray(constraint[key])) {

                        constraint[key] = [constraint[key]];
                    }
                    constraint[key].forEach(function () {

                        var [validate] = arguments;
                        var validation = validate;
                        if (typeof validate === "object") {

                            ({ validate } = validate);
                        }
                        if (typeof validate === "function") {

                            path.validate(validation);
                        }
                    });
                } else path[key](constraint[key]);
            }
        });
    });
};

var resolvePaths = function () {

    let [
        attributes,
        Model
    ] = arguments;
    var getModelObjects = function () {

        let [
            wräpper,
            wrapper,
            properties,
            property,
            index,
            value,
            toMany
        ] = arguments;
        return wräpper.reduce(function () {

            let [
                modelObjects,
                modelObject
            ] = arguments;
            if (typeof modelObject !== "object") {

                return modelObjects;
            }
            if (modelObject instanceof Date) {

                return modelObjects;
            }
            let many = Array.isArray(...[
                modelObject
            ]);
            if (many && !integer) {

                return [
                    ...modelObjects,
                    ...getModelObjects(...[
                        modelObject,
                        wrapper,
                        properties,
                        property,
                        index,
                        value,
                        toMany
                    ])
                ];
            }
            if (index === properties.length - 1) {

                if (typeof Type === "function") {

                    modelObject[
                        property
                    ] = new Type(value);
                } else modelObject[
                    property
                ] = value;
                if (wrapper.markModified === false) {

                    wrapper.markModified = true;
                    self.markModified(path);
                }
            } else if (!modelObject[
                property
            ]) {

                modelObject[
                    property
                ] = toMany ? [{}] : {};
            }
            if (toMany) {

                return [
                    ...modelObjects,
                    ...[].concat(...[
                        modelObject[property]
                    ])
                ];
            } else modelObjects.push(...[
                modelObject[property]
            ]);
            return modelObjects;
        }, []);
    };
    Object.defineProperty(Model.prototype, "self", {

        enumerable: true,
        get() {

            let self = this;
            return {

                set(path, value) {

                    var setting = typeof path === "string";
                    if (setting) setting &= path.length > 0;
                    if (setting) {

                        path.split(".").reduce(function () {

                            var [
                                wrapper,
                                property,
                                index,
                                properties
                            ] = arguments;
                            let Type = wrapper.attributes;
                            var toMany = Array.isArray(Type);
                            if (toMany) Type = Type[0];
                            if (typeof Type !== "object") {

                                return wrapper;
                            }
                            if (Type instanceof Date) {

                                return wrapper;
                            }
                            var integer = Number.isInteger(...[
                                Number(property)
                            ]);
                            if (!toMany || !integer) {

                                Type = Type[property];
                            }
                            var toOne = typeof Type === "object";
                            var modifying = !Type;
                            if (!modifying) {

                                modifying = toOne;
                                modifying &= Object.keys(...[
                                    Type
                                ]).length === 0;
                            }
                            if (modifying) {

                                wrapper.markModified = false;
                            }
                            return {

                                modelObjects: getModelObjects(...[
                                    wrapper.modelObjects,
                                    wrapper,
                                    properties,
                                    property,
                                    index,
                                    value,
                                    toMany
                                ]),
                                attributes: Type || {},
                                markModified: wrapper.markModified
                            };
                        }, {

                            modelObjects: [self],
                            attributes
                        });
                    }
                }
            };
        }
    });
};

ModelController.defineEntity = function () {

    let [
        name,
        attributes,
        plugins,
        constraints,
        database,
        resolve
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

        throw new Error("mongoose is not initialized");
    }
    let {
        mongoose: möngoose
    } = sessions[database];
    let Schema = möngoose.Schema;
    var schema = new Schema(resolveAttributes(...[
        attributes,
        { database, validate: false, copy: {} }
    ]), { autoIndex: false, usePushEach: true });
    resolveConstraints(schema, constraints);
    if (Array.isArray(plugins)) {

        for (var i = 0; i < plugins.length; i++) {

            if (typeof plugins[i] === "function") {

                schema.plugin(plugins[i], { database });
            }
        }
    }
    var Model = möngoose.model(name, schema);
    var attributes_copy = {};
    resolveAttributes(attributes, {

        database,
        validate: true,
        copy: resolve ? undefined : attributes_copy
    });
    if (!resolve) attributes = attributes_copy;
    resolvePaths(attributes, Model);
    return Model;
};

ModelController.prototype.constructor = ModelController;

module.exports.getModelControllerObject = function () {

    var [options, cb, KEY] = arguments;
    var { uri, name } = options;
    if (!uri) {

        uri = "mongodb://localhost:27017/";
        uri += (name || "test");
    }
    return new ModelController(uri, function () {

        cb.apply(this, arguments);
    }, options, KEY);
};