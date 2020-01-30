/*jslint node: true */
/*jshint esversion: 6 */
/*global emit*/
/*global _*/
'use strict';

let define = require('define-js');
let backend = require('backend-js');
let ModelEntity = backend.ModelEntity;
let QueryExpression = backend.QueryExpression;
let AggregateExpression = backend.AggregateExpression;
let mongoose = require('mongoose');
mongoose.Promise = global.Promise;
let Schema = mongoose.Schema;
let autoIncrement = require('mongodb-autoincrement');
mongoose.plugin(autoIncrement.mongoosePlugin);
require('mongoose-pagination');
var cacheOpts = {

    max: 50,
    maxAge: 1000 * 60 * 2
};
require('mongoose-cache').install(mongoose, cacheOpts);

module.exports.LogicalOperators = {

    AND: '$and',
    OR: '$or',
    NOT: '$not'
};

var ComparisonOperators = module.exports.ComparisonOperators = {

    EQUAL: '=',
    EQUALIGNORECASE: function (value, options, expression) {

        var query = {

            $regex: value instanceof RegExp ? value : new RegExp('^' + value + '$'),
            $options: 'i'
        };
        if (typeof options === 'function') query = options.apply(this, [query, expression]);
        return query;
    },
    NE: '$ne',
    NEIGNORECASE: function (value, options, expression) {

        return {

            $ne: this.EQUALIGNORECASE(value, options, expression)
        };
    },
    LT: '$lt',
    LE: '$lte',
    GT: '$gt',
    GE: '$gte',
    IN: '$in',
    INIGNORECASE: function (value, options, expression) {

        if (!Array.isArray(value)) throw new Error('Invalid field value');
        var query = {

            $in: value.map(function (value) {

                return value instanceof RegExp ? new RegExp(value, 'i') : new RegExp('^' + value + '$', 'i');
            })
        };
        if (typeof options === 'function') query = options.apply(this, [query, expression]);
        return query;
    },
    NIN: '$nin',
    NINIGNORECASE: function (value, options, expression) {

        var query = this.INIGNORECASE(value, options, expression);
        query.$nin = query.$in;
        delete query.$in;
        return query;
    },
    CONTAINS: '$regex',
    ANY: function (value, options, expression) {

        var query = Array.isArray(value) ? {

            $in: value
        } : typeof value === 'object' ? value : {

            $eq: value
        };
        if (typeof options === 'function') query = options.apply(this, [query, expression]);
        return {

            $elemMatch: query
        };
    },
    ALL: '$all',
    ANYMATCH: function (query) {

        return {

            $elemMatch: query
        };
    },
    ANYMATCHIGNORECASE: function (query) {

        return {

            $elemMatch: this.CASEINSENSITIVECOMPARE(query)
        };
    },
    CASEINSENSITIVECOMPARE: function (query) {

        if (Array.isArray(query.$in)) return this.INIGNORECASE(query.$in);
        else if (Array.isArray(query.$nin)) return this.NINIGNORECASE(query.$nin);
        else if (query.$eq) return this.EQUALIGNORECASE(query.$eq);
        else if (query['=']) return this.EQUALIGNORECASE(query['=']);
        else if (query.$ne) return this.NEIGNORECASE(query.$ne);
        else if (query.$regex) {

            query.$regex = query.$regex instanceof RegExp ? query.$regex : new RegExp(query.$regex);
            query.$options = 'i';
        }
        return query;
    },
    SOME: function (query, expression) {

        var attributes = expression.fieldName.split('.');
        if (!Array.isArray(attributes) || attributes.length < 2)
            throw new Error('Invalid field name in a query expression');
        var attribute = attributes.splice(-1, 1)[0];
        expression.fieldName = attributes.join('.');
        var newQuery = {

            input: '$' + expression.fieldName,
            as: 'item',
            cond: query
        };
        if (query['=']) newQuery.cond = {

            $eq: ['$$item.' + attribute, query['=']]
        };
        else if (query.$regex) query.$regex = [
            '$$item.' + attribute,
            query.$regex instanceof RegExp ? new RegExp(query.$regex, query.$options) :
                new RegExp('^' + query.$regex + '$', query.$options)
        ];
        else if (Object.keys[query].length === 1) {

            query[Object.keys[query][0]] = ['$$item.' + attribute, query[Object.keys[query][0]]];
        } else throw new Error('Invalid filter condition');
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

        if (leftValue === undefined && rightValue === undefined)
            throw new Error('Invalid values in aggregate expression');
        if (acceptArray || passingArray) {

            if (leftValue !== undefined && !Array.isArray(leftValue)) leftValue = [leftValue];
            if (rightValue !== undefined && !Array.isArray(rightValue)) rightValue = [rightValue];
            if ((leftValue || []).concat(rightValue || []).length === 0)
                throw new Error('Invalid values in aggregate expression');
        }
        var operation = {};
        operation[operator] = acceptArray || passingArray ? (leftValue || []).concat(rightValue || []) :
            leftValue !== undefined && rightValue !== undefined ? [leftValue, rightValue] :
                [leftValue || rightValue];
        return operation;
    };
};

var getUnaryOperator = function (operator) {

    return function (value) {

        if (value === undefined) throw new Error('Invalid value in aggregate expression');
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

    FIELD: function (fieldName) {

        if (typeof fieldName !== 'string' || fieldName.length === 0)
            throw new Error('Invalid field name in aggregate expression');
        return '$' + fieldName;
    },
    VAR: function (variable) {

        if (typeof variable !== 'string' || variable.length === 0)
            throw new Error('Invalid variable name in aggregate expression');
        return '$$' + variable;
    },
    EQUAL: getBinaryOperator('$eq'),
    EQUALIGNORECASE: function (leftValue, rightValue) {

        return this.EQUAL(this.CASEINSENSITIVECOMPARE(leftValue, rightValue), 0);
    },
    NE: getBinaryOperator('$ne'),
    NEIGNORECASE: function (leftValue, rightValue) {

        return this.NE(this.CASEINSENSITIVECOMPARE(leftValue, rightValue), 0);
    },
    LT: getBinaryOperator('$lt'),
    LE: getBinaryOperator('$lte'),
    GT: getBinaryOperator('$gt'),
    GE: getBinaryOperator('$gte'),
    IN: getBinaryOperator('$in'),
    INIGNORECASE: function (leftValue, rightValue) {

        if (!Array.isArray(rightValue)) throw new Error('Invalid in operator array');
        var self = this;
        return self.OR(rightValue.map(function (value) {

            return self.EQUALIGNORECASE(leftValue, value);
        }), true);
    },
    NIN: function (leftValue, rightValue) {

        return this.NOT(this.IN(leftValue, rightValue));
    },
    NINIGNORECASE: function (leftValue, rightValue) {

        return this.NOT(this.INIGNORECASE(leftValue, rightValue));
    },
    CONTAINS: function (leftValue, rightValue) {

        return {

            $regexMatch: {

                input: leftValue,
                regex: rightValue
            }
        };
    },
    CONTAINSIGNORECASE: function (leftValue, rightValue) {

        var operation = this.CONTAINS(leftValue, rightValue);
        operation.$regexMatch.options = 'i';
        return operation;
    },
    SOME: function (variable) {

        if (typeof variable !== 'string' || variable.length === 0)
            throw new Error('Invalid array variable name in aggregate expression');
        return function (leftValue, rightValue) {

            return {

                $filter: {

                    input: leftValue,
                    as: variable,
                    cond: rightValue
                }
            };
        };
    },
    AND: getBinaryOperator('$and'),
    OR: getBinaryOperator('$or'),
    NOT: getBinaryOperator('$not'),
    ABS: getUnaryOperator('$abs'),
    ACOS: getUnaryOperator('$acos'),
    ACOSH: getUnaryOperator('$acosh'),
    ADD: getBinaryOperator('$add'),
    ASIN: getUnaryOperator('$asin'),
    ASINH: getUnaryOperator('$asinh'),
    ATAN: getUnaryOperator('$atan'),
    ATANH: getUnaryOperator('$atanh'),
    CEIL: getUnaryOperator('$ceil'),
    COS: getUnaryOperator('$cos'),
    DIVIDE: getBinaryOperator('$divide'),
    EXP: getUnaryOperator('$exp'),
    FLOOR: getUnaryOperator('$floor'),
    LN: getUnaryOperator('$ln'),
    LOG: getBinaryOperator('$log'),
    LOG10: getUnaryOperator('$log10'),
    MOD: getBinaryOperator('$mod'),
    MULTIPLY: getBinaryOperator('$multiply'),
    POW: getBinaryOperator('$pow'),
    ROUND: getBinaryOperator('$round'),
    SIN: getUnaryOperator('$sin'),
    SQRT: getUnaryOperator('$sqrt'),
    SUBTRACT: getBinaryOperator('$subtract'),
    TAN: getUnaryOperator('$tan'),
    TRUNC: getUnaryOperator('$trunc'),
    CONCAT: getBinaryOperator('$concat'),
    SUBSTR: getBinaryOperator('$substrCP', true),
    SUBSTRINDEX: getBinaryOperator('$indexOfCP', true),
    STRLENGTH: getUnaryOperator('$strLenCP'),
    LOWERCASE: getUnaryOperator('$toLower'),
    UPPERCASE: getUnaryOperator('$toUpper'),
    CASEINSENSITIVECOMPARE: getBinaryOperator('$strcasecmp'),
    LTRIM: getTrimOperator('$ltrim'),
    RTRIM: getTrimOperator('$rtrim'),
    TRIM: getTrimOperator('$trim'),
    SPLIT: getBinaryOperator('$split'),
    INDEXAT: getBinaryOperator('$arrayElemAt'),
    INDEXOF: getBinaryOperator('$indexOfArray', true),
    APPEND: getBinaryOperator('$concatArrays'),
    ARRAY: getUnaryOperator('$isArray'),
    LENGTH: getUnaryOperator('$size'),
    SLICE: getBinaryOperator('$slice', true),
    DIFF: getBinaryOperator('$setDifference'),
    SAME: getBinaryOperator('$setEquals'),
    INTERSECT: getBinaryOperator('$setIntersection'),
    SUBSET: getBinaryOperator('$setIsSubset'),
    UNION: getBinaryOperator('$setUnion'),
    SUM: getUnaryOperator('$sum'),
    AVR: getUnaryOperator('$avg'),
    FIRST: getUnaryOperator('$first'),
    LAST: getUnaryOperator('$last'),
    MAX: getUnaryOperator('$max'),
    MIN: getUnaryOperator('$min'),
    DEV: getUnaryOperator('$stdDevPop'),
    DEVSAMP: getUnaryOperator('$stdDevSamp'),
    IF: function (leftValue, rightValue) {

        if (typeof rightValue === 'object' && typeof rightValue.$cond === 'object') {

            rightValue.$cond.then = leftValue;
            return rightValue;
        } else return {

            $cond: {

                if: rightValue,
                then: leftValue
            }
        };
    },
    ELSE: function (leftValue, rightValue) {

        if (typeof leftValue === 'object' && typeof leftValue.$cond === 'object') {

            leftValue.$cond.else = rightValue;
            return leftValue;
        } else return {

            $cond: {

                if: leftValue,
                else: rightValue
            }
        };
    },
    IFNULL: getBinaryOperator('$ifNull'),
    RANGE: getBinaryOperator('$range'),
    MINUTE: getUnaryOperator('$minute'),
    HOUR: getUnaryOperator('$hour'),
    DAY: getUnaryOperator('$dayOfMonth'),
    WEEK: getUnaryOperator('$week'),
    MONTH: getUnaryOperator('$month'),
    YEAR: getUnaryOperator('$year'),
    UNEMBED: '$$DESCEND',
    HIDE: '$$PRUNE',
    SHOW: '$$KEEP',
    CONVERT: function (type) {

        if ((typeof type != 'number' || type < 1 || type > 19) && (typeof type !== 'string' ||
            type.length === 0)) throw new Error('Invalid conversion type in aggregate expression');
        return function (value) {

            return {

                $convert: {

                    input: value,
                    to: type,
                    onError: null
                }
            };
        };
    }
};

ComputationOperators.IGNORECASE = ComputationOperators.CASEINSENSITIVECOMPARE;

var getQuery = function (queryExpressions, contextualLevel) {

    if (contextualLevel < 0) throw new Error('Invalid contextual level');
    if (Array.isArray(queryExpressions)) {

        if (queryExpressions.length === 1) {

            var filter = {};
            var subFilter = {};
            var fieldName = queryExpressions[0].fieldName;
            filter[queryExpressions[0].fieldName] = queryExpressions[0].fieldValue;
            if (typeof queryExpressions[0].comparisonOperator === 'string') {

                subFilter[queryExpressions[0].comparisonOperator] = queryExpressions[0].fieldValue;
                if (typeof queryExpressions[0].comparisonOperatorOptions === 'function')
                    subFilter = queryExpressions[0].comparisonOperatorOptions.apply(ComparisonOperators,
                        [subFilter, queryExpressions[0]]);
            } else if (typeof queryExpressions[0].comparisonOperator === 'function')
                subFilter = queryExpressions[0].comparisonOperator.apply(ComparisonOperators,
                    [queryExpressions[0].fieldValue, queryExpressions[0].comparisonOperatorOptions,
                    queryExpressions[0]
                    ]);
            if (Object.keys(subFilter).length > 0 &&
                Object.keys(subFilter).indexOf(ComparisonOperators.EQUAL) === -1) {

                if (Object.keys(filter).indexOf(queryExpressions[0].fieldName) > -1)
                    filter[queryExpressions[0].fieldName] = subFilter;
                else filter = subFilter;
            }
            queryExpressions[0].fieldName = fieldName;
            return filter;
        }
        for (var j = 0; j <= contextualLevel; j++) {

            for (var i = 1; i < queryExpressions.length; i++) {

                if (queryExpressions[i].contextualLevel === j) {

                    var logicalOperator = queryExpressions[i].logicalOperator;
                    var rightFilter = getQuery(queryExpressions.splice(i), contextualLevel + 1);
                    var leftFilter = getQuery(queryExpressions, contextualLevel + 1);
                    if (logicalOperator && leftFilter && rightFilter) {

                        var superFilter = {};
                        superFilter[logicalOperator] = [leftFilter, rightFilter];
                        return superFilter;
                    } else {

                        return leftFilter || rightFilter || null;
                    }
                }
            }
        }
    }
    return null;
};

var constructQuery = function (queryExpressions) {

    if (Array.isArray(queryExpressions)) queryExpressions.forEach(function (queryExpression, index) {

        if (!(queryExpression instanceof QueryExpression)) throw new Error('Invalid query expressions');
        if (index > 0 && !queryExpression.logicalOperator)
            throw new Error('Query expression missing logical operator');
        if (index > 0 && typeof queryExpression.contextualLevel !== 'number')
            throw new Error('Query expression missing contextual level');
    });
    var query = getQuery(queryExpressions, 0);
    return query || {};
};

var getExecuteQuery = function (session) {

    return function (queryExpressions, ObjectConstructor, features, callback) {

        var distinct = features.distinct;
        var include = features.include,
            exclude = features.exclude;
        var sort = features.sort;
        var populate = features.populate;
        var cache = features.cache;
        var readonly = features.readonly;
        var paginate = features.paginate,
            limit = features.limit,
            page = features.page;
        var query = ObjectConstructor.find(constructQuery(queryExpressions));
        if (typeof distinct === 'string') query = query.distinct(distinct);
        else {

            if (Array.isArray(include)) query = query.select(include.join(' '));
            else if (Array.isArray(exclude)) query = query.select(exclude.map(function (field) {

                return '-' + field;
            }).join(' '));
        }
        if (Array.isArray(sort)) query = query.sort(sort.map(function (option) {

            if (typeof option.by !== 'string') throw new Error('Invalid sort by field name');
            return (option.order === 'desc' ? '-' : '') + option.by;
        }).join(' '));
        if (Array.isArray(populate)) populate.forEach(function (option) {

            var opt = {};
            if (typeof option.path !== 'string') throw new Error('Invalid populate path');
            opt.path = option.path;
            if (Array.isArray(option.include)) {

                opt.select = option.include.join(' ');
            }
            if (Array.isArray(option.exclude)) {

                opt.select = (opt.select ? opt.select + ' ' : '') + option.exclude.map(
                    function (field) {

                        return '-' + field;
                    }).join(' ');
            }
            if (typeof option.model !== 'string') throw new Error('Invalid populate model');
            opt.model = option.model;
            query = query.populate(opt);
        });
        if (cache) query = query.cache();
        if (readonly) query = query.lean();
        var time = session.busy();
        if (paginate && typeof limit === 'number') query.paginate(page, limit,
            function (error, modelObjects, total) {

                if (!readonly) Array.prototype.push.apply(session, modelObjects);
                if (typeof callback === 'function') callback({

                    modelObjects: modelObjects,
                    pageCount: total / limit
                }, error);
                session.idle(time);
            });
        else query.exec(function (error, modelObjects) {

            if (!readonly) Array.prototype.push.apply(session, modelObjects);
            if (typeof callback === 'function') callback(modelObjects, error);
            session.idle(time);
        });
    };
};

var getQueryUniqueArray = function (queryExpressions, features) {

    var uniqueArray = [];
    uniqueArray = [].concat(queryExpressions.map(function (queryExpression) {

        return queryExpression.fieldValue;
    }));
    if (typeof features.distinct === 'string' || Array.isArray(features.include) ||
        Array.isArray(features.exclude) || Array.isArray(features.sort) ||
        Array.isArray(features.populate) || features.cache || features.paginate)
        uniqueArray = uniqueArray.concat(Object.keys(features).concat(Object.values(features)));
    return uniqueArray;
};

var getMapReduce = function (session) {

    return function (queryExpressions, filterExpressions, ObjectConstructor, features, callback) {

        var options = {};
        var filter = features.mapReduce.filter;
        var sort = features.mapReduce.sort || features.sort;
        var map = features.mapReduce.map,
            reduce = features.mapReduce.reduce,
            finalize = features.mapReduce.finalize;
        var scope = features.mapReduce.scope || {};
        var paginate = typeof features.mapReduce.paginate === 'boolean' ? features.mapReduce.paginate :
            features.paginate,
            limit = features.mapReduce.limit || features.limit,
            page = features.mapReduce.page || features.page;
        var collection, output = features.mapReduce.output;
        if (filter && queryExpressions.length > 0 && filterExpressions.length === 0)
            options.query = constructQuery(queryExpressions);
        else if (filterExpressions.length > 0) options.query = constructQuery(filterExpressions);
        if (filter && Array.isArray(sort)) options.sort = sort.reduce(function (sort, opt) {

            if (typeof opt.by !== 'string') throw new Error('Invalid sort by field name');
            sort[opt.by] = opt.order === 'desc' ? -1 : 1;
            return sort;
        }, {});
        options.map = function () {

            if (typeof _.count === 'number') {

                _.count++;
                if (typeof _.skip === 'number' && _.count <= _.skip) return;
                if (typeof _.limit === 'number' && _.count > _.skip + _.limit) return;
            }
            var emitting = _.map(this);
            if (typeof emitting === 'function') emitting(function (data) {

                if (data && data.key && data.value) emit(data.key, data.value);
            });
            else if (emitting && emitting.key && emitting.value) emit(emitting.key, emitting.value);
        };
        options.reduce = reduce;
        if (typeof finalize === 'function') options.finalize = finalize;
        options.scope = scope;
        if (options.scope._) throw new Error('Invalid use of _ it is reserved');
        options.scope._ = {};
        options.scope._.map = map;
        if (filter && paginate && typeof limit === 'number') {

            options.scope._.limit = limit;
            options.scope._.skip = ((page || 1) - 1) * limit;
            options.scope._.count = 0;
        }
        if (output) {

            var queryUniqueArray = getQueryUniqueArray(queryExpressions, features);
            if (queryUniqueArray.length > 0) {

                collection = 'MapReduce' + ObjectConstructor.modelName.toUpperCase() +
                    JSON.stringify(queryUniqueArray).split('').reduce(function (number, string) {

                        return number / string.codePointAt(0);
                    }, 9999).toString().replace('e-', '').slice(-4);
                options.out = {

                    replace: collection
                };
            }
        }
        var time = session.busy();
        ObjectConstructor.mapReduce(options, function (error, out) {

            if (!out || !out.model || !collection) {

                if (typeof callback === 'function') callback(paginate && typeof limit === 'number' ? {

                    modelObjects: out && out.results,
                    pageCount: out && out.stats && out.stats.counts && out.stats.counts.input / limit
                } : out && out.results, error);
                session.idle(time);
            } else session.idle(time, function () {

                getExecuteQuery(session)(filter && filterExpressions.length === 0 ? [] : queryExpressions,
                    out.model, features, callback);
            });
        });
    };
};

var getAggregate = function (aggregateExpression, contextualLevel) {

    if (contextualLevel < 0) throw new Error('Invalid contextual level');
    if (!Array.isArray(aggregateExpression.fieldValue)) return aggregateExpression.fieldValue;
    if (aggregateExpression.fieldValue.length === 1) return aggregateExpression.fieldValue[0];
    if (aggregateExpression.contextualLevels.length > 0 && aggregateExpression.contextualLevels.length !==
        aggregateExpression.fieldValue.filter(function (value) {

            return typeof value === 'function';
        }).length) throw new Error('Invalid contextual levels');
    for (var j = 0; j <= contextualLevel; j++) {

        var k = 0;
        for (var i = 0; i < aggregateExpression.fieldValue.length; i++) {

            if (typeof aggregateExpression.fieldValue[i] === 'function') {

                if ((aggregateExpression.contextualLevels[k] || 0) === j) {

                    var computationOperator = aggregateExpression.fieldValue[i];
                    aggregateExpression.fieldValue.splice(i, 1);
                    aggregateExpression.contextualLevels.splice(k, 1);
                    var rightValue = getAggregate(new AggregateExpression({

                        fieldValue: aggregateExpression.fieldValue.splice(i),
                        contextualLevels: aggregateExpression.contextualLevels.splice(k)
                    }), contextualLevel + 1);
                    var leftValue = getAggregate(new AggregateExpression({

                        fieldValue: aggregateExpression.fieldValue,
                        contextualLevels: aggregateExpression.contextualLevels
                    }), contextualLevel + 1);
                    if (leftValue !== undefined) return computationOperator(leftValue, rightValue);
                    else return computationOperator(rightValue);
                }
                k++;
            }
        }
    }
};

var constructAggregate = function (aggregateExpressions, orderOrField) {

    if (Array.isArray(aggregateExpressions))
        aggregateExpressions.forEach(function (aggregateExpression, index) {

            if (!(aggregateExpression instanceof AggregateExpression))
                throw new Error('Invalid aggregate expressions');
            if (!Array.isArray(aggregateExpression.contextualLevels) ||
                aggregateExpression.contextualLevels.some(function (contextualLevel) {

                    return typeof contextualLevel !== 'number';
                })) throw new Error('Aggregate expression missing contextual levels');
        });
    var indices = [];
    var aggregate = aggregateExpressions.reduce(function (aggregate, aggregateExpression, index) {

        if (aggregateExpression.computationOrder < 0) throw new Error('Invalid computation order');
        if ((typeof orderOrField === 'number' && aggregateExpression.computationOrder === orderOrField) ||
            (typeof orderOrField === 'string' && aggregateExpression.fieldName === orderOrField)) {

            indices.push(index);
            aggregate[aggregateExpression.fieldName] = getAggregate(aggregateExpression, 0);
        }
        return aggregate;
    }, {});
    indices.forEach(function (index) {

        aggregateExpressions.splice(index, 1);
    });
    return aggregate;
};

var getExecuteAggregate = function (session) {

    return function (queryExpressions, aggregateExpressions, filterExpressions, ObjectConstructor,
        attributes, features, callback) {

        if (!features.aggregate) features.aggregate = {};
        var constructedAggregate, include = features.aggregate.include || features.include,
            exclude = features.aggregate.exclude || features.exclude;
        var filter = features.aggregate.filter;
        var redact, restrict = features.aggregate.restrict;
        var group, distinct = features.aggregate.distinct || features.distinct;
        var flatten = features.aggregate.flatten;
        var sort = features.aggregate.sort || features.sort;
        var populate = features.aggregate.populate || features.populate;
        var paginate = typeof features.aggregate.paginate === 'boolean' ? features.aggregate.paginate :
            features.paginate,
            limit = features.aggregate.limit || features.limit,
            page = features.aggregate.page || features.page;
        var collection, mapReduce = features.mapReduce,
            output = features.aggregate.output;
        var aggregate = ObjectConstructor.aggregate();
        if (filter && queryExpressions.length > 0 && filterExpressions.length === 0)
            aggregate = aggregate.match(constructQuery(queryExpressions));
        else if (filterExpressions.length > 0) aggregate = aggregate.match(constructQuery(filterExpressions));
        if (typeof restrict === 'string') redact = constructAggregate(aggregateExpressions, restrict)[restrict];
        if (filter && typeof distinct === 'string') {

            constructedAggregate = constructAggregate(aggregateExpressions, distinct);
            group = {

                _id: constructedAggregate[distinct] ? function () {

                    var _id = {};
                    _id[distinct] = constructedAggregate[distinct];
                    delete constructedAggregate[distinct];
                    return _id;
                }() : '$' + distinct
            };
        }
        if (aggregateExpressions.length > 0) {

            var ordering = 0;
            constructedAggregate = constructAggregate(aggregateExpressions, ordering);
            if (filter && Array.isArray(include)) aggregate = aggregate.project(include
                .reduce(function (project, field) {

                    project[field] = 1;
                    return project;
                }, constructedAggregate));
            else if (filter && Array.isArray(exclude)) aggregate = aggregate.project(Object.keys(attributes)
                .concat(exclude).reduce(function (project, field) {

                    project[field] = exclude.indexOf(field) === -1;
                    return project;
                }, constructedAggregate));
            else aggregate = aggregate.addFields(constructedAggregate);
            while (aggregateExpressions.length > 0) {

                constructedAggregate = constructAggregate(aggregateExpressions, ordering++);
                if (Object.keys(constructedAggregate).length > 0)
                    aggregate = aggregate.addFields(constructedAggregate);
            }
        }
        if (redact) aggregate = aggregate.redact(redact);
        if (group) aggregate = aggregate.group(group);
        if (Array.isArray(flatten)) flatten.forEach(function (path) {

            aggregate = aggregate.unwind({

                path: '$' + path,
                preserveNullAndEmptyArrays: true
            });
        });
        if (filter && Array.isArray(sort)) aggregate = aggregate.sort(sort.map(function (option) {

            if (typeof option.by !== 'string') throw new Error('Invalid sort by field name');
            return (option.order === 'desc' ? '-' : '') + option.by;
        }).join(' '));
        if (Array.isArray(populate)) populate.forEach(function (option) {

            var opt = {

                pipeline: []
            };
            if (typeof option.path !== 'string') throw new Error('Invalid populate path');
            if (typeof option.ref !== 'string') throw new Error('Invalid populate ref');
            var match = {};
            match[option.ref] = '$$ref';
            opt.let = {

                ref: '$' + option.path
            };
            var project;
            if (Array.isArray(option.include)) project = option.include.reduce(function (project, field) {

                project[field] = 1;
                return project;
            }, {});
            else if (Array.isArray(option.exclude)) project = option.exclude.reduce(function (project, field) {

                project[field] = 0;
                return project;
            }, {});
            opt.pipeline.push({

                $match: match,
                $project: project
            });
            if (typeof option.model !== 'string') throw new Error('Invalid populate model');
            opt.from = option.model;
            opt.as = option.path;
            aggregate = aggregate.append({

                $lookup: opt
            });
        });
        if (filter && paginate && typeof limit === 'number') aggregate = aggregate.facet({

            modelObjects: [{

                $skip: ((page || 1) - 1) * limit
            }, {

                $limit: limit
            }],
            pagination: [{

                $count: 'total'
            }]
        });
        if (output) {

            var queryUniqueArray = getQueryUniqueArray(queryExpressions, features);
            if (queryUniqueArray.length > 0) {

                collection = 'Aggregate' + ObjectConstructor.modelName.toUpperCase() +
                    JSON.stringify(queryUniqueArray).split('').reduce(function (number, string) {

                        return number / string.codePointAt(0);
                    }, 9999).toString().replace('e-', '').slice(-4);
                aggregate = aggregate.append({

                    $out: collection
                });
            }
        }
        var time = session.busy();
        aggregate.exec(function (error, result) {

            if (!result || !collection) {

                if (typeof callback === 'function') callback(paginate && typeof limit === 'number' ? {

                    modelObjects: result && result[0] && result[0].modelObjects,
                    pageCount: result && result[0] && result[0].pagination[0] &&
                        result[0].pagination[0].total / limit
                } : result, error);
                session.idle(time);
            } else session.idle(time, function () {

                var entityModel = mongoose.models[collection] || mongoose.model(collection, new Schema({}, {

                    autoIndex: false,
                    strict: false,
                    collection: collection
                }));
                if (typeof mapReduce === 'object' && typeof mapReduce.map === 'function' &&
                    typeof mapReduce.reduce === 'function') getMapReduce(session)(filter &&
                        filterExpressions.length === 0 ? [] : queryExpressions, [], entityModel,
                        features, callback);
                else getExecuteQuery(session)(filter && filterExpressions.length === 0 ? [] :
                    queryExpressions, entityModel, features, callback);
            });
        });
    };
};

var openConnection = function (defaultURI, callback) {

    var connect = function () {

        var options = {

            useNewUrlParser: true,
            keepAlive: true,
            connectTimeoutMS: 30000,
            reconnectTries: Number.MAX_VALUE,
            poolSize: 25
        };
        try {

            mongoose.connect(defaultURI, options, function (error, response) {

                if (typeof callback === 'function') callback(error, response);
            });
        } catch (error) {

            if (typeof callback === 'function') callback(error);
        }
    };
    switch (mongoose.connection.readyState) {

        case 0:
            connect();
            break;
        case 1:
            try {

                console.log('disconnecting mongodb');
                mongoose.disconnect(connect);
            } catch (error) {

                if (typeof callback === 'function') callback(error);
            }
            break;
        case 2:
            if (typeof callback === 'function') mongoose.connection.on('connected', callback);
            break;
        case 3:
            if (typeof callback === 'function') mongoose.connection.on('disconnected', connect);
            break;
        default:
            if (typeof callback === 'function') callback(new Error('Invalid DB connection state'));

    }
};

var checkConnection = function (defaultURI, callback) {

    if (mongoose.connection.readyState !== 1) {

        openConnection(defaultURI, function (error, response) {

            if (response) console.log(response);
            if (typeof callback === 'function') callback(error);
        });
        return false;
    }
    return true;
};

var ModelController = function (defaultURI, cb) {

    var self = this;
    var Session = define(function (init) {

        return function () {

            var self = init.apply(this, arguments).self();
            var busy = 0;
            var reconnect = false;
            var MAX_LATENCY = 5000;
            self.busy = function () {

                busy++;
                return new Date();
            };
            self.idle = function (time, next) {

                if (!(time instanceof Date)) {

                    if (typeof next === 'function') next();
                    return;
                }
                if (busy > 0) busy--;
                if (reconnect || (new Date().getTime() - time.getTime()) > MAX_LATENCY) {

                    if (busy === 0) {

                        reconnect = false;
                        openConnection(defaultURI, next);
                        return;
                    } else reconnect = true;
                }
                if (typeof next === 'function') next();
            };
        };
    }).extend(Array).parameters();
    var session = new Session();
    openConnection(defaultURI, cb);
    self.removeObjects = function (objWrapper, entity, callback) {

        var self = this;
        if (!entity || !(entity instanceof ModelEntity)) {

            throw new Error('Invalid entity');
        }
        if (typeof objWrapper !== 'object') {

            throw new Error('Invalid query expressions wrapper');
        }
        var save = self.save.bind(self, function (err) {

            if (err) {

                if (typeof callback === 'function') callback(null, err);
            } else {

                var queryExpressions = (objWrapper.getObjectQuery() || []).concat(entity.getObjectQuery() || []);
                entity.getObjectConstructor().remove(constructQuery(queryExpressions), function (error) {

                    if (typeof callback === 'function') callback(null, error);
                });
            }
        }, session.filter(function (modelObject) {

            return modelObject instanceof entity.getObjectConstructor();
        }));
        if (checkConnection(defaultURI, save)) save();
    };
    self.newObjects = function (objsAttributes, entity, callback) {

        if (!entity || !(entity instanceof ModelEntity)) {

            throw new Error('Invalid entity');
        }
        var modelObjects = [];
        var newObject = function (objAttributes) {

            try {

                var modelObject = new (entity.getObjectConstructor())(objAttributes);
                modelObject._id = -1;
                session.push(modelObject);
                modelObjects.push(modelObject);
            } catch (e) {

                if (typeof callback === 'function') callback(null, e);
            }
        };
        if (Array.isArray(objsAttributes)) objsAttributes.forEach(newObject);
        else newObject(objsAttributes);
        if (typeof callback === 'function') callback(modelObjects);
        return (modelObjects.length === 1 && modelObjects[0]) || modelObjects;
    };
    self.getObjects = function (objWrapper, entity, callback) {

        if (!entity || !(entity instanceof ModelEntity)) {

            throw new Error('Invalid entity');
        }
        if (typeof objWrapper !== 'object') {

            throw new Error('Invalid query expressions wrapper');
        }
        var save = self.save.bind(self, function (error) {

            if (error) {

                if (typeof callback === 'function') callback(null, error);
            } else {

                var queryExpressions = (objWrapper.getObjectQuery() ||
                    []).concat(entity.getObjectQuery() || []);
                var aggregateExpressions = (objWrapper.getObjectAggregate() ||
                    []).concat(entity.getObjectAggregate() || []);
                var filterExpressions = objWrapper.getObjectFilter() || [];
                var features = entity.getObjectFeatures() || {};
                var aggregate = features.aggregate,
                    mapReduce = features.mapReduce;
                if (aggregateExpressions.length > 0 || (typeof aggregate === 'object' &&
                    Object.keys(aggregate).length > 0))
                    getExecuteAggregate(session)(queryExpressions, aggregateExpressions, filterExpressions,
                        entity.getObjectConstructor(), entity.getObjectAttributes(), features, callback);
                else {

                    if (typeof mapReduce === 'object' && typeof mapReduce.map === 'function' &&
                        typeof mapReduce.reduce === 'function') getMapReduce(session)(queryExpressions,
                            filterExpressions, entity.getObjectConstructor(), features, callback);
                    else getExecuteQuery(session)(queryExpressions, entity.getObjectConstructor(),
                        features, callback);
                }
            }
        }, session.filter(function (modelObject) {

            return modelObject instanceof entity.getObjectConstructor();
        }));
        if (checkConnection(defaultURI, save)) save();
    };
    self.save = function (callback, oldSession) {

        var workingSession = (Array.isArray(oldSession) && oldSession) || session.slice();
        if (workingSession.length === 0) console.log('Model controller session has no objects to be saved!');
        var currentSession = [];
        var save = function (index) {

            var workingModelObject = workingSession[index];
            var i = session.indexOf(workingModelObject);
            if (i > -1) session.splice(i, 1);
            setTimeout(function () {

                if (workingModelObject instanceof mongoose.Model && (workingModelObject.isNew ||
                    workingModelObject.isModified())) {

                    var time = session.busy();
                    workingModelObject.save(function (error, modelObject) {

                        if (error) console.log(error);
                        if (error || !modelObject) {

                            if (typeof callback === 'function') callback(error, currentSession);
                            session.idle(time);
                        } else {

                            currentSession.push(modelObject);
                            session.idle(time, save.bind(self, index + 1));
                        }
                    });
                } else if (workingSession.length > index + 1) {

                    save(index + 1);
                } else {

                    if (typeof callback === 'function') callback(null, currentSession);
                }
            }, 0);
        };
        if (checkConnection(defaultURI, save.bind(self, 0))) save(0);
        return workingSession;
    };
};

var resovleTypeAttribute = function (attributes) {

    Object.keys(attributes).forEach(function (key) {

        var object = Array.isArray(attributes[key]) ? attributes[key][0] :
            typeof attributes[key] === 'object' ? attributes[key] : null;
        if (object) {

            switch (Object.keys(object).length) {

                case 2:
                    if (Object.keys(object).indexOf('ref') === -1) break;
                /* falls through */
                case 1:
                    if (Object.keys(object).indexOf('type') > -1) {

                        attributes[key] = object.type;
                        return;
                    }
            }
            resovleTypeAttribute(object);
        } else if (key === 'type')
            throw new Error('type is reserved word if it is used as an attribute so it should be an object');
    });
};

ModelController.defineEntity = function (name, attributes, plugins) {

    if (typeof name !== 'string') throw new Error('Invalid entity name');
    if (typeof attributes !== 'object') throw new Error('Invalid entity schema');
    var entitySchema = new Schema(attributes, {

        autoIndex: false,
        usePushEach: true
    });
    for (var i = 0; Array.isArray(plugins) && i < plugins.length && typeof plugins[i] === 'function'; i++) {

        entitySchema.plugin(plugins[i]);
    }
    var entityModel = mongoose.model(name, entitySchema);
    resovleTypeAttribute(attributes);
    return entityModel;
};

ModelController.prototype.constructor = ModelController;

module.exports.getModelControllerObject = function (options, cb) {

    return new ModelController(options.uri || ('mongodb://localhost:27017/' + (options.name ||
        'test')), function () {

            cb.apply(this, arguments);
        });
};
