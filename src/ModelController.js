/*jslint node: true */
/*global emit*/
/*global map*/
'use strict';

var backend = require('backend-js');
var ModelEntity = backend.ModelEntity;
var QueryExpression = backend.QueryExpression;
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var autoIncrement = require('mongodb-autoincrement');
mongoose.plugin(autoIncrement.mongoosePlugin);
require('mongoose-pagination');
var cacheOpts = {

    max: 50,
    maxAge: 1000 * 60 * 2
};
require('mongoose-cache').install(mongoose, cacheOpts);

var LogicalOperators = module.exports.LogicalOperators = {

    AND: '$and',
    OR: '$or',
    NOT: '$not'
};

var ComparisonOperators = module.exports.ComparisonOperators = {

    EQUAL: '=',
    NE: '$ne',
    LT: '$lt',
    LE: '$lte',
    GT: '$gt',
    GE: '$gte',
    IN: '$in',
    NIN: '$nin',
    CONTAINS: '$regex',
    ANY: function(value) {

        return {

            $elemMatch: Array.isArray(value) ? {

                $in: value
            } : {

                $eq: value
            }
        };
    },
    ALL: '$all',
    CASEINSENSITIVECOMPARE: function(query) {

        query.$options = 'i';
    }
};

var getQuery = function(queryExpressions, contextualLevel) {

    if (Array.isArray(queryExpressions) && contextualLevel > -1) {

        if (queryExpressions.length === 1) {

            var filter = {};
            var subFilter = {};
            filter[queryExpressions[0].fieldName] = queryExpressions[0].fieldValue;
            if (typeof queryExpressions[0].comparisonOperator === 'string')
                subFilter[queryExpressions[0].comparisonOperator] = queryExpressions[0].fieldValue;
            else if (typeof queryExpressions[0].comparisonOperator === 'function')
                subFilter = queryExpressions[0].comparisonOperator(queryExpressions[0].fieldValue);
            if (typeof queryExpressions[0].comparisonOperatorOptions === 'function')
                queryExpressions[0].comparisonOperatorOptions(subFilter);
            if (queryExpressions[0].comparisonOperator !== ComparisonOperators.EQUAL)
                filter[queryExpressions[0].fieldName] = subFilter;
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

    if (Array.isArray(queryExpressions) && queryExpressions.some(function(queryExpression, index) {

            return !(queryExpression instanceof QueryExpression) || (index > 0 && !queryExpression.logicalOperator);
        })) {

        throw new Error('invalid query expressions');
    }
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
        if (Array.isArray(features.sort)) query = query.sort(features.sort.map(function(options) {

            if (typeof options.by !== 'string') throw new Error('invalid sort by field name');
            return (options.order === 'desc' ? '-' : '') + options.by;
        }).join(' '));
        if (Array.isArray(features.populate)) features.populate.forEach(function(options) {

            var opt = {};
            if (typeof options.path !== 'string') throw new Error('invalid populate path');
            opt.path = options.path;
            if (Array.isArray(options.include)) {

                opt.select = options.include.join(' ');
                console.log();
            }
            if (Array.isArray(options.exclude)) {

                opt.select = (opt.select ? opt.select + ' ' : '') + options.exclude.map(
                    function(field) {

                        return '-' + field;
                    }).join(' ');
            }
            if (typeof options.model !== 'string') throw new Error('invalid populate model');
            opt.model = options.model;
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

        var hasAfterQuery = function() {

            return (!features.mapReduce.query && queryExpressions.length > 0) || typeof features.distinct === 'string' ||
                Array.isArray(features.include) || Array.isArray(features.exclude) || Array.isArray(features.sort) ||
                Array.isArray(features.populate) || features.cache || features.paginate;
        };
        var options = {};
        options.map = function() {

            var data = map(this);
            if (data && data.key && data.value)
                emit(data.key, data.value);
        };
        options.reduce = features.mapReduce.reduce;
        if (features.mapReduce.query) options.query = constructQuery(queryExpressions);
        if (hasAfterQuery()) options.out = {

            replace: 'MapReduceResults'
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

            if (Array.isArray(out)) {

                if (typeof callback === 'function') callback(out, error);
            } else getExecuteQuery(session)(features.mapReduce.query ? [] : queryExpressions, out, features, callback);
        });
    };
};

var openConnection = function(defaultURI, callback) {

    var connect = function() {

        var options = {

            server: {

                socketOptions: {

                    keepAlive: 1,
                    connectTimeoutMS: 30000
                }
            },
            replset: {

                socketOptions: {

                    keepAlive: 1,
                    connectTimeoutMS: 30000
                }
            }
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
        if (!checkConnection(defaultURI, callback)) return;
        if (!entity || !(entity instanceof ModelEntity)) {

            throw new Error('invalid entity');
        }
        self.save(function(error) {

            if (error) {

                if (typeof callback === 'function') callback(null, error);
            } else {

                var queryExpressions = queryExprs.concat(entity.getObjectQueryExpressions() || []);
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

                if (typeof callback === 'function') callback(null, new Error('invalid attributes'));
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
                var queryExpressions = queryExprs.concat(entity.getObjectQueryExpressions() || []);
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
        var save = function(index) {

            setTimeout(function() {

                if (workingSession[index] instanceof mongoose.Model) workingSession[index].save(function(error, modelObject
                    /*, count*/
                ) {

                    if (error) console.log(error);
                    if (error || !modelObject) {

                        if (typeof callback === 'function') callback(error);
                    } else {

                        save(index + 1);
                    }
                });
                else {

                    if (!Array.isArray(oldSession)) session = [];
                    if (typeof callback === 'function') callback();
                }
            }, 0);
        };
        save(0);
        return workingSession;
    };
};

ModelController.defineEntity = function(name, attributes, plugins) {

    if (typeof name !== 'string') throw new Error('invalid entity name');
    if (typeof attributes !== 'object') throw new Error('invalid entity schema');
    var entitySchema = new Schema(attributes, {

        autoIndex: false
    });
    for (var i = 0; Array.isArray(plugins) && i < plugins.length && typeof plugins[i] === 'function'; i++) {

        entitySchema.plugin(plugins[i]);
    }
    var entityModel = mongoose.model(name, entitySchema);
    return entityModel;
};

ModelController.prototype.constructor = ModelController;

backend.setComparisonOperators(ComparisonOperators);
backend.setLogicalOperators(LogicalOperators);
backend.setModelController(new ModelController(backend.dbURI || ('mongodb://localhost:27017/' + (backend.dbName || 'test')), function(error) {

    if (!error) {

    } else {

    }
}));

module.exports.ModelController = ModelController;
