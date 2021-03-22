/*jslint node: true */
/*jshint esversion: 6 */
/*global Symbol*/
'use strict';

let backend = require('backend-js');
let debug = require('debug')('beam:SQLController');
let Entity = backend.ModelEntity;
let QueryExpression = backend.QueryExpression;
let Sequelize = require('sequelize');
require('sequelize-values')(Sequelize);
let VariableAdaptor = require('sequelize-transparent-cache-variable');
let withCache = require('sequelize-transparent-cache')(new VariableAdaptor()).withCache;

let Op = Sequelize.Op;

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
    COLUMN: Sequelize.col,
    FUNCTION: function (option) {

        return Sequelize.fn(option.get, Sequelize.col(option.of));
    },
    THROUGH: 'through'
};

var sequelize = null;
var session = [];
var hookHandlers = {};

var getHookHandler = function (hook) {

    var self = this;
    return function () {

        for (var index in self[hook]) self[hook][index].apply(self, arguments);
    };
};

var getManipulator = function (property, prefix, Model) {

    var self = this;
    var method = property.slice(0, 1).toUpperCase() + (property.length > 1 ?
        property.slice(1, property.length).toLowerCase() : '');
    var manipulator = function (value) {

        return function (callback) {

            if (value && !(value instanceof Sequelize.Model)) {

                Model.create(value).then(function (model) {

                    if (Array.isArray(model)) session = session.concat(model);
                    else session.push(model);
                    manipulator(model)(callback);
                }).catch(function (error) {

                    callback(null, error);
                });
                return;
            }
            if (self[prefix + method]) self[prefix + method](value).then(function (values) {

                callback(value || values);
            }).catch(function (error) {

                callback(null, error);
            }); else callback(null, new Error('There is no ' + prefix + ' ' + property));
        };
    };
    return manipulator;
};

var adapter = {

    getQuery: function (queryExpressions, contextualLevel) {

        if (contextualLevel < 0) throw new Error('Invalid contextual level');
        if (Array.isArray(queryExpressions)) {

            if (queryExpressions.length === 1) {

                var filter = {};
                var subFilter = {};
                filter[queryExpressions[0].fieldName] = queryExpressions[0].fieldValue;
                if (typeof queryExpressions[0].comparisonOperator instanceof Symbol)
                    subFilter[queryExpressions[0].comparisonOperator] =
                        queryExpressions[0].fieldValue;
                else if (typeof queryExpressions[0].comparisonOperator === 'function')
                    subFilter =
                        queryExpressions[0].comparisonOperator(queryExpressions[0].fieldValue);
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
                        var rightFilter =
                            this.getQuery(queryExpressions.splice(i), contextualLevel + 1);
                        var leftFilter = this.getQuery(queryExpressions, contextualLevel + 1);
                        if (logicalOperator && leftFilter && rightFilter) {

                            var superFilter = {};
                            superFilter[logicalOperator] = [leftFilter, rightFilter];
                            return superFilter;
                        } else return leftFilter || rightFilter || null;
                    }
                }
            }
        }
        return null;
    },
    constructJoin: function (queryExpressions) {

        if (Array.isArray(queryExpressions)) {

            var indexes = [];
            var join = queryExpressions.reduce(function (join, queryExpression, index) {

                if (queryExpression.fieldValue instanceof Entity) {

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
    constructQuery: function (queryExpressions, features, ObjectConstructor, field,
        comparisonOperator, logicalOperator) {

        if (Array.isArray(queryExpressions) &&
            queryExpressions.some(function (queryExpression, index) {

                return !(queryExpression instanceof QueryExpression) ||
                    (index > 0 && !queryExpression.logicalOperator);
            })) {

            throw new Error('Invalid query expressions');
        }
        var query = {};
        if (ObjectConstructor && ObjectConstructor.prototype instanceof Sequelize.Model &&
            typeof relation === 'string' && field.length > 0) {

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
        if (Array.isArray(features.having) && features.having.every(function (have, index) {

            return !(have instanceof QueryExpression) || (index > 0 && !have.logicalOperator);
        })) query.having = this.getQuery(features.having, 0);
        var attributes = null;
        if (Array.isArray(features.include)) attributes = features.include.map(function (option) {

            return typeof option === 'string' ? option : option.of ? [Sequelize.fn(option.get,
                Sequelize.col(option.of)), option.as] : [Sequelize.col(option.get), option.as];
        });
        if (Array.isArray(features.including)) attributes = {
            include: features.including.map(function (option) {

                return option.of ? [Sequelize.fn(option.get, Sequelize.col(option.of)),
                option.as] : [Sequelize.col(option.get), option.as];
            })
        };
        if (Array.isArray(features.exclude)) attributes = {

            exclude: features.exclude
        };
        if (query.through) query.through.attributes = attributes;
        else query.attributes = attributes;
        if (Array.isArray(features.sort)) query.sort = features.sort.map(function (option) {

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
};

var getExecuteQuery = function (session) {

    return function (queryExpressions, ObjectConstructor, features, callback) {

        var query = adapter.constructQuery(queryExpressions, features);
        var func = features.paginate ? 'findAndCountAll' : 'findAll';
        if (features.paginate && typeof features.limit === 'number') {

            query.limit = features.limit;
            query.offset = (features.page - 1) * features.limit;
        }
        (features.cache ? withCache(ObjectConstructor).cache() :
            ObjectConstructor)[func](query).then(function (result) {

                var modelObjects = result;
                var pageCount = null;
                if (features.paginate && typeof features.limit === 'number') {

                    modelObjects = result.rows;
                    pageCount = result.count / features.limit;
                }
                if (features.readonly) modelObjects = Sequelize.getValues(modelObjects);
                callback(modelObjects, null);
            }).catch(function (error) {

                callback(null, error);
            });
    };
};

var openConnection = function (defaultURI, callback, options) {

    if (!options) options = {};
    var logging = function (error, duration) {

        callback(new Error(error), duration);
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
    sequelize = openConnection(defaultURI, cb, options);
    sequelize.sync();
    ['beforeDefine', 'afterDefine'].forEach(function (hook) {

        sequelize.addHook(hook, function (attributes, options) {

            var name = (options && options.modelName) || attributes.name;
            if (typeof hookHandlers[name + hook] === 'function')
                hookHandlers[name + hook](attributes, options);
        });
    });
    self.removeObjects = function (objWrapper, entity, callback) {

        var self = this;
        if (!entity || !(entity instanceof Entity)) {

            throw new Error('Invalid entity');
        }
        if (typeof objWrapper !== 'object') {

            throw new Error('Invalid query expressions wrapper');
        }
        self.save(function (err) {

            if (err) {

                if (typeof callback === 'function') callback(null, err);
            } else {

                var queryExpressions = (objWrapper.getObjectQuery() || [])
                    .concat(entity.getObjectQuery() || []);
                var features = entity.getObjectFeatures() || {};
                entity.getObjectConstructor().destroy(adapter.constructQuery(queryExpressions,
                    features)).then(function (modelObjects) {

                        if (typeof callback === 'function') callback(modelObjects, null);
                    }).
                    catch(function (error) {

                        if (typeof callback === 'function') callback(null, error);
                    });
            }
        }, session.filter(function (modelObject) {

            return modelObject instanceof entity.getObjectConstructor();
        }));
    };
    self.newObjects = function (objsAttributes, entity, callback) {

        if (!entity || !(entity instanceof Entity)) {

            throw new Error('Invalid entity');
        }
        var modelObjects = [];
        var newObject = function (objAttributes) {

            try {

                var modelObject = new (entity.getObjectConstructor())(objAttributes);
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

        if (!entity || !(entity instanceof Entity)) {

            throw new Error('Invalid entity');
        }
        if (typeof objWrapper !== 'object') {

            throw new Error('Invalid query expressions wrapper');
        }
        self.save(function (error) {

            if (error) {

                if (typeof callback === 'function') callback(null, error);
            } else {

                var queryExpressions = (objWrapper.getObjectQuery() || [])
                    .concat(entity.getObjectQuery() || []);
                var aggregateExpressions = (objWrapper.getObjectAggregate() || [])
                    .concat(entity.getObjectAggregate() || []);
                // var filterExpressions = objWrapper.getObjectFilter() || [];
                var features = entity.getObjectFeatures() || {};
                if (aggregateExpressions.length > 0 || (typeof features.aggregate === 'object' &&
                    Object(features.aggregate).length > 0))
                    throw new Error('This feature is not implemented yet');
                else getExecuteQuery(session)(queryExpressions, entity.getObjectConstructor(),
                    features, callback);
            }
        }, session.filter(function (modelObject) {

            return modelObject instanceof entity.getObjectConstructor();
        }));
    };
    self.save = function (callback, oldSession) {

        var workingSession = (Array.isArray(oldSession) && oldSession) || session.slice();
        if (workingSession.length === 0)
            debug('Model controller session has no objects to be saved!');
        var currentSession = [];
        var save = function (index) {

            var workingModelObject = workingSession[index];
            var i = session.indexOf(workingModelObject);
            if (i > -1) session.splice(i, 1);
            setTimeout(function () {

                if (workingModelObject instanceof sequelize.Model &&
                    (workingModelObject.isNewRecord || workingModelObject.changed()))
                    workingModelObject.save().then(function (modelObject) {

                        currentSession.push(modelObject);
                        save(index + 1);
                    }).catch(function (error) {

                        if (error) debug(error);
                        if (typeof callback === 'function') callback(error, currentSession);
                    });
                else if (workingSession.length > index + 1) save(index + 1);
                else if (typeof callback === 'function') callback(null, currentSession);
            }, 0);
        };
        save(0);
        return workingSession;
    };
};

var DataType = function (datatype) {

    switch (datatype) {

        case String:
            return Sequelize.DataTypes.TEXT;
        case Number:
            return Sequelize.DataTypes.DOUBLE;
        case Boolean:
            return Sequelize.DataTypes.BOOLEAN;
        case Date:
            return Sequelize.DataTypes.DATE;
    }
};

ModelController.defineEntity = function (name, attributes, plugins, constraints) {

    if (typeof name !== 'string') throw new Error('Invalid entity name');
    if (typeof attributes !== 'object') throw new Error('Invalid entity schema');
    if (!sequelize) throw new Error('Sequelize is not initialized');
    var configuration = {

        hooks: {}
    };
    var hooks = {

        on: function (hook, handler) {

            if (!Array.isArray(this[hook])) this[hook] = [];
            this[hook].push(handler);
            if (['beforeDefine', 'afterDefine'].indexOf(hook) === -1)
                configuration.hooks[hook] = getHookHandler.apply(this, [hook]);
            else hookHandlers[name + hook] = getHookHandler.apply(this, [hook]);
        }
    };
    for (var i = 0; Array.isArray(plugins) && i < plugins.length &&
        typeof plugins[i] === 'function'; i++) {

        plugins[i](name, hooks, sequelize);
    }
    Object.keys(attributes).forEach(function (property) {

        if (attributes[property] === String && constraints && constraints[property] &&
            constraints[property].unique) attributes[property] = Object.assign({

                type: Sequelize.DataTypes.STRING(125)
            }, (constraints && constraints[property]) || {});
        else if (DataType(attributes[property])) attributes[property] = Object.assign({

            type: DataType(attributes[property])
        }, (constraints && constraints[property]) || {});
    });
    attributes._id = {

        type: Sequelize.DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    };
    var Model = sequelize.define(name, Object.keys(attributes)
        .reduce(function (filteredAttributes, property) {

            if (Object.values(Sequelize.DataTypes).includes(attributes[property].type)) {

                if (property.startsWith('has'))
                    throw new Error('Remove/rename has from field ' + property);
                filteredAttributes[property] = attributes[property];
            }
            return filteredAttributes;
        }, {}), configuration);
    Model.prototype.toObject = function () {

        return Sequelize.getValues(this);
    };
    setTimeout(function () {

        Object.keys(attributes).forEach(function (property) {

            var entity = Array.isArray(attributes[property]) ? attributes[property][0] :
                attributes[property];
            if (typeof entity === 'function' && !(entity.prototype instanceof Entity))
                entity = entity(name);
            if (entity && entity.prototype instanceof Entity) {

                var func = Array.isArray(attributes[property]) ? 'hasMany' : 'belongsTo';
                var options = {

                    as: property
                };
                Model[func](entity.prototype.getObjectConstructor(), Object.assign(options,
                    (constraints && constraints[property]) || {}));
                Object.defineProperty(Model.prototype, property, {

                    enumerable: true,
                    get: function () {

                        var self = this;
                        var relation = {

                            get: getManipulator.apply(self, [property, 'get',
                                entity.prototype.getObjectConstructor()]),
                            set: getManipulator.apply(self, [property, 'set',
                                entity.prototype.getObjectConstructor()])
                        };
                        if (Array.isArray(attributes[property])) {

                            relation.add = getManipulator.apply(self, [property, 'add',
                                entity.prototype.getObjectConstructor()]);
                            relation.remove = getManipulator.apply(self, [property, 'remove',
                                entity.prototype.getObjectConstructor()]);
                        }
                        return relation;
                    }
                });
            }
        });
    }, 0);
    return Model;
};

ModelController.prototype.constructor = ModelController;

module.exports.getModelControllerObject = function (options, cb) {

    if (typeof options !== 'object') throw new Error('Invalid options');
    if (typeof options.username !== 'string' || options.username.length === 0)
        throw new Error('Invalid username');
    if (typeof options.password !== 'string' || options.password.length === 0)
        throw new Error('Invalid password');
    if (typeof options.uri === 'object') Object.assign(options, options.uri);
    options.dialect = options.type;
    options.database = options.name || 'test';
    options.host = options.host || '127.0.0.1';
    var port = options.port || {

        mysql: '3306',
        postgres: '5432'
    }[options.dialect];
    if (!options.uri || typeof options.uri !== 'string')
        options.uri = options.dialect + '://' + options.username + ':' +
        options.password + '@' + options.host + ':' + port + '/' + options.database;
    return new ModelController(options.uri, function () {

        cb.apply(this, arguments);
    }, options);
};
