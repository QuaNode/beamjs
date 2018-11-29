/*jslint node: true */
/*global emit*/
/*global map*/
'use strict';

var backend = require('backend-js');
var ModelEntity = backend.ModelEntity;
var QueryExpression = backend.QueryExpression;
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var Schema = mongoose.Schema;
var autoIncrement = require('mongodb-autoincrement');
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
    EQUALIGNORECASE: function(value, options, expression) {

        var query = {

            $regex: value instanceof RegExp ? value : new RegExp('^' + value + '$'),
            $options: 'i'
        };
        if (typeof options === 'function') query = options.apply(this, [query, expression]);
        return query;
    },
    NE: '$ne',
    NEIGNORECASE: function(value, options, expression) {

        return {

            $ne: this.EQUALIGNORECASE(value, options, expression)
        };
    },
    LT: '$lt',
    LE: '$lte',
    GT: '$gt',
    GE: '$gte',
    IN: '$in',
    INIGNORECASE: function(value, options, expression) {

        if (!Array.isArray(value)) throw new Error('Invalid field value');
        var query = {

            $in: value.map(function(value) {

                return value instanceof RegExp ? new RegExp(value, 'i') : new RegExp('^' + value + '$', 'i');
            })
        };
        if (typeof options === 'function') query = options.apply(this, [query, expression]);
        return query;
    },
    NIN: '$nin',
    NINIGNORECASE: function(value, options, expression) {

        var query = this.INIGNORECASE(value, options, expression);
        query.$nin = query.$in;
        delete query.$in;
        return query;
    },
    CONTAINS: '$regex',
    ANY: function(value, options, expression) {

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
    FOREACH: function(query) {

        return {

            $elemMatch: query
        };
    },
    FOREACHIGNORECASE: function(query) {

        return {

            $elemMatch: this.CASEINSENSITIVECOMPARE(query)
        };
    },
    CASEINSENSITIVECOMPARE: function(query) {

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
    SOME: function(query, expression) {

        var fieldName = expression.fieldName;
        var attributes = expression.fieldName.split('.');
        if (!Array.isArray(attributes) || attributes.length < 2) throw new Error('Invalid field name in a query expression');
        var attribute = attributes.splice(-1, 1)[0];
        expression.fieldName = attributes.join('.');
        var newQuery = {

            input: "$" + expression.fieldName,
            as: "item",
            cond: query
        };
        if (query['=']) newQuery.cond = {
            $eq: ["$$item." + attribute, query['=']]
        };
        else if (query.$regex) query.$regex = ["$$item." + attribute,
            query.$regex instanceof RegExp ? new RegExp(query.$regex, query.$options) :
            new RegExp('^' + query.$regex + '$', query.$options)
        ];
        else if (Object.keys[query].length === 1) {

            query[Object.keys[query][0]] = ["$$item." + attribute, query[Object.keys[query][0]]];
        } else throw new Error('Invalid filter condition');
        return {

            $expr: {

                $filter: newQuery
            }
        };
    }
};

ComparisonOperators.IGNORECASE = ComparisonOperators.CASEINSENSITIVECOMPARE;

var getQuery = function(queryExpressions, contextualLevel) {

    if (Array.isArray(queryExpressions) && contextualLevel > -1) {

        if (queryExpressions.length === 1) {

            var filter = {};
            var subFilter = {};
            var fieldName = queryExpressions[0].fieldName;
            filter[queryExpressions[0].fieldName] = queryExpressions[0].fieldValue;
            if (typeof queryExpressions[0].comparisonOperator === 'string') {

                subFilter[queryExpressions[0].comparisonOperator] = queryExpressions[0].fieldValue;
                if (typeof queryExpressions[0].comparisonOperatorOptions === 'function')
                    subFilter = queryExpressions[0].comparisonOperatorOptions.apply(ComparisonOperators, [subFilter, queryExpressions[0]]);
            } else if (typeof queryExpressions[0].comparisonOperator === 'function')
                subFilter = queryExpressions[0].comparisonOperator.apply(ComparisonOperators, [queryExpressions[0].fieldValue,
                    queryExpressions[0].comparisonOperatorOptions, queryExpressions[0]
                ]);
            if (Object.keys(subFilter).length > 0 && Object.keys(subFilter).indexOf(ComparisonOperators.EQUAL) === -1) {

                if (Object.keys(filter).indexOf(queryExpressions[0].fieldName) > -1) filter[queryExpressions[0].fieldName] = subFilter;
                else filter = subFilter;
            }
            queryExpressions[0].fieldName = fieldName;
            return filter;
        }
        for (var j = 0; j <= contextualLevel; j++) {

            for (var i = 1; i < queryExpressions.length; i++) {

                if (queryExpressions[i].contextualLevel === j) {

                    var logicalOperator = queryExpressions[i].logicalOperator;
                    var rightFilter = getQuery(queryExpressions.splice(i, queryExpressions.length), contextualLevel + 1);
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

var constructQuery = function(queryExpressions) {


    if (Array.isArray(queryExpressions)) queryExpressions.forEach(function(queryExpression, index) {

        if (!(queryExpression instanceof QueryExpression)) throw new Error('Invalid query expressions');
        if (index > 0 && !queryExpression.logicalOperator) throw new Error('Query expression missing logical operator');
        if (index > 0 && typeof queryExpression.contextualLevel !== 'number') throw new Error('Query expression missing contextual level');
    });
    var query = getQuery(queryExpressions, 0);
    return query || {};
};

var getExecuteQuery = function(session) {

    return function(queryExpressions, ObjectConstructor, features, callback) {

        var query = ObjectConstructor.find(constructQuery(queryExpressions));
        if (typeof features.distinct === 'string') query = query.distinct(features.distinct);
        else {

            if (Array.isArray(features.include)) query = query.select(features.include.join(' '));
            if (Array.isArray(features.exclude)) query = query.select(features.exclude.map(function(field) {

                return '-' + field;
            }).join(' '));
        }
        if (Array.isArray(features.sort)) query = query.sort(features.sort.map(function(option) {

            if (typeof option.by !== 'string') throw new Error('Invalid sort by field name');
            return (option.order === 'desc' ? '-' : '') + option.by;
        }).join(' '));
        if (Array.isArray(features.populate)) features.populate.forEach(function(option) {

            var opt = {};
            if (typeof option.path !== 'string') throw new Error('Invalid populate path');
            opt.path = option.path;
            if (Array.isArray(option.include)) {

                opt.select = option.include.join(' ');
            }
            if (Array.isArray(option.exclude)) {

                opt.select = (opt.select ? opt.select + ' ' : '') + option.exclude.map(
                    function(field) {

                        return '-' + field;
                    }).join(' ');
            }
            if (typeof option.model !== 'string') throw new Error('Invalid populate model');
            opt.model = option.model;
            query = query.populate(opt);
        });
        if (features.cache) query = query.cache();
        if (features.readonly) query = query.lean();
        if (features.paginate && typeof features.limit === 'number') query.paginate(features.page, features.limit,
            function(error, modelObjects, total) {

                if (!features.readonly) Array.prototype.push.apply(session, modelObjects);
                if (typeof callback === 'function') callback({

                    modelObjects: modelObjects,
                    pageCount: total / features.limit
                }, error);
            });
        else query.exec(function(error, modelObjects) {

            if (!features.readonly) Array.prototype.push.apply(session, modelObjects);
            if (typeof callback === 'function') callback(modelObjects, error);
        });
    };
};

var getMapReduce = function(session) {

    return function(queryExpressions, entity, features, callback) {

        var afterQueryUniqueArray = function() {

            var uniqueArray = [];
            if (!features.mapReduce.query && queryExpressions.length > 0)
                uniqueArray = ['query'].concat(queryExpressions.map(function(queryExpression) {

                    return queryExpression.fieldValue;
                }));
            if (typeof features.distinct === 'string' || Array.isArray(features.include) ||
                Array.isArray(features.exclude) || Array.isArray(features.sort) ||
                Array.isArray(features.populate) || features.cache || features.paginate)
                uniqueArray = uniqueArray.concat(Object.keys(features).concat(Object.values(features)));
            return uniqueArray;
        }();
        var options = {};
        options.map = function() {

            var emitting = map(this);
            if (typeof emitting === 'function') emitting(function(data) {

                if (data && data.key && data.value) emit(data.key, data.value);
            });
            else if (emitting && emitting.key && emitting.value) emit(emitting.key, emitting.value);
        };
        options.reduce = features.mapReduce.reduce;
        if (features.mapReduce.query) options.query = constructQuery(queryExpressions);
        if (afterQueryUniqueArray.length > 0) options.out = {

            replace: 'MapReduce' + entity.getObjectConstructor().modelName.toUpperCase() +
                JSON.stringify(afterQueryUniqueArray).split('').reduce(function(number, string) {

                    return number / string.codePointAt(0);
                }, 9999).toString().replace('e-', '').slice(-4)
        };
        if (Array.isArray(features.mapReduce.sort)) options.sort = features.mapReduce.sort.reduce(function(sort,
            opt) {

            if (typeof opt.by !== 'string') throw new Error('invalid sort by field name');
            sort[opt.by] = opt.order === 'desc' ? -1 : 1;
            return sort;
        }, {});
        if (typeof features.mapReduce.limit === 'number') options.limit = features.mapReduce.limit;
        if (typeof features.mapReduce.finalize === 'function') options.finalize = features.mapReduce.finalize;
        options.scope = features.mapReduce.scope || {};
        options.scope.map = features.mapReduce.map;
        entity.getObjectConstructor().mapReduce(options, function(error, out) {

            if (!out || Array.isArray(out)) {

                if (typeof callback === 'function') callback(out, error);
            } else getExecuteQuery(session)(features.mapReduce.query ? [] : queryExpressions, out, features, callback);
        });
    };
};

var openConnection = function(defaultURI, callback) {

    var connect = function() {

        var options = {

            useMongoClient: true,
            keepAlive: true,
            connectTimeoutMS: 30000,
            reconnectTries: Number.MAX_VALUE
        };
        try {

            mongoose.connect(defaultURI, options, function(error, response) {

                if (typeof callback === 'function') callback(error, response);
            });
        } catch (error) {

            if (typeof callback === 'function') callback(error);
        }
    };
    if (mongoose.connection.readyState === 1) {

        try {

            console.log('disconnecting mongodb');
            mongoose.disconnect(connect);
        } catch (error) {

            if (typeof callback === 'function') callback(error);
        }
    } else connect();
};

var checkConnection = function(defaultURI, callback) {

    if (mongoose.connection.readyState === 0) {

        openConnection(defaultURI, function(error) {

            if (typeof callback === 'function') callback(null, error || new Error('DB connection error : reconnected'));
        });
        return false;
    }
    return true;
};

var ModelController = function(defaultURI, cb) {

    var self = this;
    var session = [];
    openConnection(defaultURI, cb);
    self.removeObjects = function(queryExprs, entity, callback) {

        var self = this;
        if (!entity || !(entity instanceof ModelEntity)) {

            throw new Error('invalid entity');
        }
        if (!checkConnection(defaultURI, callback)) return;
        self.save(function(err) {

            if (err) {

                if (typeof callback === 'function') callback(null, err);
            } else {

                var queryExpressions = queryExprs.concat(entity.getObjectQuery() || []);
                entity.getObjectConstructor().remove(constructQuery(queryExpressions), function(error) {

                    if (typeof callback === 'function') callback(null, error);
                });
            }
        });
    };
    self.newObjects = function(objsAttributes, entity, callback) {

        if (!checkConnection(defaultURI, callback)) return;
        if (!entity || !(entity instanceof ModelEntity)) {

            throw new Error('invalid entity');
        }
        var modelObjects = [];
        var newObject = function(objAttributes) {

            try {

                var modelObject = new(entity.getObjectConstructor())(objAttributes);
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
    self.getObjects = function(queryExprs, entity, callback) {

        if (!checkConnection(defaultURI, callback)) return;
        if (!entity || !(entity instanceof ModelEntity)) {

            throw new Error('invalid entity');
        }
        self.save(function(error) {

            if (error) {

                if (typeof callback === 'function') callback(null, error);
            } else {

                var features = entity.getObjectFeatures() || {};
                var queryExpressions = queryExprs.concat(entity.getObjectQuery() || []);
                if (features.mapReduce && typeof features.mapReduce.map === 'function' &&
                    typeof features.mapReduce.reduce === 'function') {

                    getMapReduce(session)(queryExpressions, entity, features, callback);
                } else getExecuteQuery(session)(queryExpressions, entity.getObjectConstructor(), features, callback);
            }
        });
    };
    self.save = function(callback, oldSession) {

        if (!checkConnection(defaultURI, callback)) return;
        var workingSession = (Array.isArray(oldSession) && oldSession) || session;
        if (workingSession.length === 0) console.log('Model controller session has no objects to be saved!');
        var currentSession = [];
        var save = function(index) {

            setTimeout(function() {

                if (workingSession[index] instanceof mongoose.Model) workingSession[index].save(function(error, modelObject
                    /*, count*/
                ) {

                    if (error) console.log(error);
                    if (error || !modelObject) {

                        var i = session.indexOf(workingSession[index]);
                        if (i > -1) session.splice(i, 1);
                        if (typeof callback === 'function') callback(error);
                    } else {

                        currentSession.push(modelObject);
                        save(index + 1);
                    }
                });
                else {

                    if (!Array.isArray(oldSession)) session = [];
                    if (typeof callback === 'function') callback(null, currentSession);
                }
            }, 0);
        };
        save(0);
        return workingSession;
    };
};

var resovleTypeAttribute = function(attributes) {

    Object.keys(attributes).forEach(function(key) {

        var object = Array.isArray(attributes[key]) ? attributes[key][0] : typeof attributes[key] === 'object' ? attributes[key] : null;
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
        } else if (key === 'type') throw new Error('type is reserved word if it is used as an attribute so it should be an object');
    });
};

ModelController.defineEntity = function(name, attributes, plugins) {

    if (typeof name !== 'string') throw new Error('invalid entity name');
    if (typeof attributes !== 'object') throw new Error('invalid entity schema');
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

module.exports.getModelControllerObject = function(options, cb) {

    return new ModelController(options.uri || ('mongodb://localhost:27017/' + (options.name ||
        'test')), function() {

        cb.apply(this, arguments);
    });
};
