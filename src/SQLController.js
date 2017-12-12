/*jslint node: true */
/*global emit*/
/*global map*/
'use strict';

var backend = require('backend-js');
var ModelEntity = backend.ModelEntity;
var QueryExpression = backend.QueryExpression;
var Sequelize = require('sequelize');
var sequelize = null;
var sequelizePagination = require('sequelize-paginate-cursor');
var cacheOpts = {

    max: 50,
    maxAge: 1000 * 60 * 2
};
var VariableAdaptor = require('sequelize-transparent-cache-variable');
var variableAdaptor = new VariableAdaptor(cacheOpts);
var sequelizeCache = require('sequelize-transparent-cache');
var withCache = sequelizeCache(variableAdaptor).withCache;
var Op = Sequelize.Op;
var LogicalOperators = module.exports.LogicalOperators = {

    AND: [Op.and],
    OR: [Op.or],
    NOT: [Op.not]
};

var ComparisonOperators = module.exports.ComparisonOperators = {

    EQUAL: [Op.eq],
    NE: [Op.ne],
    LT: [Op.lt],
    LE: [Op.lte],
    GT: [Op.gt],
    GE: [Op.gte],
    IN: [Op.in],
    NIN: [Op.notIn],
    REGEX: [Op.regexp],
    NREGEX: [Op.notRegexp],
    LIKE: [Op.like],
    NLIKE: [Op.notLike],
    BETWEEN: [Op.between],
    NBETWEEN: [Op.notBetween],
    COLUMN: Sequelize.col,
    FUNCTION: function(option) {

        return Sequelize.fn(option.get, Sequelize.col(option.of))
    },
    THROUGH: 'through'
};

var adapter = {

    getQuery: function(queryExpressions, contextualLevel) {

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
                        var rightFilter = this.getQuery(queryExpressions.splice(i, queryExpressions.length), contextualLevel + 1);
                        var leftFilter = this.getQuery(queryExpressions, contextualLevel + 1);
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
    },
    constructJoin: function(queryExpressions) {

        if (Array.isArray(queryExpressions)) {

            var indexes = [];
            var join = queryExpressions.reduce(function(join, queryExpression, index) {

                if (queryExpression.fieldValue instanceof ModelEntity) {

                    join.push(this.constructQuery(queryExpression.fieldValue.getObjectQuery(),
                        queryExpression.fieldValue.getObjectFeatures(),
                        queryExpression.fieldValue.getObjectConstructor(),
                        queryExpression.fieldName));
                    indexes.push(index);
                }
                return join;
            }, []);
            for (var i = 0; i < indexes.length; i++) {

                queryExpressions.splice(indexes[i], 1);
            }
            return join;
        }
        return null;
    },
    constructQuery: function(queryExpressions, features, ObjectConstructor, field, comparisonOperator, logicalOperator) {

        if (Array.isArray(queryExpressions) && queryExpressions.some(function(queryExpression, index) {

                return !(queryExpression instanceof QueryExpression) || (index > 0 && !queryExpression.logicalOperator);
            })) {

            throw new Error('Invalid query expressions');
        }
        var query = {};
        if (ObjectConstructor instanceof Sequelize.Model && typeof relation === 'string' && field.length > 0) {

            query.model = ObjectConstructor;
            query.as = field;
        }
        if (comparisonOperator === ComparisonOperators.THROUGH) query.through = {};
        if (features.required === false) query.required = false;
        if (features.marked !== true) query.force = true;
        query.include = this.constructJoin(queryExpressions);
        var where = this.getQuery(queryExpressions, 0);
        if (query.through) query.through.where = where;
        else query.where = where;
        if (Array.isArray(features.having) && features.having.every(function(have, index) {

                return !(have instanceof QueryExpression) || (index > 0 && !have.logicalOperator);
            })) query.having = this.getQuery(features.having, 0);
        var attributes = null;
        if (Array.isArray(features.include)) attributes = features.include.map(function(option) {

            return typeof option === 'string' ? option : option.of ? [Sequelize.fn(option.get, Sequelize.col(option.of)), option.as] : [
                Sequelize.col(option.get),
                option.as
            ]
        });
        if (Array.isArray(features.including)) attributes = {
            include: features.including.map(function(option) {

                return option.of ? [Sequelize.fn(option.get, Sequelize.col(option.of)), option.as] : [
                    Sequelize.col(option.get),
                    option.as
                ]
            })
        };
        if (Array.isArray(features.exclude)) attributes = {

            exclude: features.exclude
        };
        if (query.through) query.through.attributes = attributes;
        else query.attributes = attributes;
        if (Array.isArray(features.sort)) query.sort = features.sort.map(function(option) {

            if (typeof option.by !== 'string') throw new Error('Invalid sort by field name');
            var order = Array.isArray(option.in) ? option.in : [];
            if (option.of) order.push(Sequelize.fn(option.by, Sequelize.col(option.of)));
            else if (option.order === 'desc') order.push(option.by);
            else order.push(Sequelize.col(option.by));
            if (option.order === 'desc') order.push('DESC');
            return order.length === 1 ? order[0] : order;
        });
        return query;
    }
}

var getExecuteQuery = function(session) {

    return function(queryExpressions, ObjectConstructor, features, callback) {

        var query = ObjectConstructor.find(adapter.constructQuery(queryExpressions, features));
        if (typeof features.distinct === 'string') query = query.distinct(features.distinct);
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
        if (features.mapReduce.query) options.query = adapter.constructQuery(queryExpressions);
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

var openConnection = function(defaultURI, config) {

    return new Sequelize(defaultURI, config);
};

var checkConnection = function(seq, callback) {

    seq.authenticate().
    then(function(response) {

        if (typeof callback === 'function') callback(null, response);
    }).
    catch(function(error) {

        if (typeof callback === 'function') callback(error);
    });
};

var ModelController = function(defaultURI, cb, config) {

    var self = this;
    var session = [];
    sequelize = openConnection(defaultURI, config);
    self.removeObjects = function(queryExprs, entity, callback) {

        var self = this;
        if (!entity || !(entity instanceof ModelEntity)) {

            throw new Error('invalid entity');
        }
        checkConnection(sequelize, function(er) {

            if (er) {

                if (typeof callback === 'function') callback(null, er);
            } else {

                self.save(function(err) {

                    if (err) {

                        if (typeof callback === 'function') callback(null, err);
                    } else {

                        var features = entity.getObjectFeatures() || {};
                        var queryExpressions = queryExprs.concat(entity.getObjectQuery() || []);
                        entity.getObjectConstructor().destroy(adapter.constructQuery(queryExpressions, features)).
                        then(function(modelObjects) {

                            if (typeof callback === 'function') callback(modelObjects, null);
                        }).
                        catch(function(error) {

                            if (typeof callback === 'function') callback(null, error);
                        });
                    }
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
        }
    });
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
    resovleTypeAttribute(attributes);
    return entityModel;
};

ModelController.prototype.constructor = ModelController;

module.exports.getModelControllerObject = function(options, cb) {

    if (typeof options.username !== 'string' || options.username.length === 0) {

        throw new Error('Invalid username');
    }
    if (typeof options.password !== 'string' || options.password.length === 0) {

        throw new Error('Invalid password');
    }
    options.dialect = options.type;
    options.database = options.name || 'test';
    options.host = options.host || '127.0.0.1';
    var port = options.port || {

        mysql: '3306'
    }[options.dialect];
    options.uri = options.uri || (options.dialect + '://' + options.username + ':' + options.password +
        '@' + options.host + ':' + port + '/' + options.database);
    return new ModelController(options.uri, function() {

        cb.apply(this, arguments);
    }, options);
}()