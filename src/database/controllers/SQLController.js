/*jslint node: true */
/*jshint esversion: 6 */
'use strict';

var fs = require('fs');
var debug = require('debug')('beam:SQLController');
var bunyan = require('bunyan');
var backend = require('backend-js');
var Entity = backend.ModelEntity;
var QueryExpression = backend.QueryExpression;
var Sequelize = require('sequelize');
require('sequelize-values')(Sequelize);
var VariableAdaptor = require('sequelize-transparent-cache-variable');
var withCache = require('sequelize-transparent-cache')(new VariableAdaptor()).withCache;

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

        if (!(entity instanceof Entity)) throw new Error('Invalid through entity');
        return entity.getObjectConstructor();
    }
};

var ComputationOperators = module.exports.ComputationOperators = {

    COLUMN: Sequelize.col,
    CAST: function (value, type) {

        return Sequelize.cast(value, DataType(type) ? DataType(type).toString() : type);
    },
    FUNCTION: function (option) {

        return Sequelize.fn(...[option.get].concat(Array.isArray(option.of) ?
            option.of.map(function (öf) {

                return öf;
            }) : option.of));
    }
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
    method = prefix + method;
    var manipulator = function (value) {

        return function (callback) {

            if (value && !(value instanceof Sequelize.Model)) {

                return Model.create(value).then(function (model) {

                    if (Array.isArray(model)) session = session.concat(model);
                    else session.push(model);
                    return manipulator(model)(callback);
                }).catch(function (error) {

                    callback(null, error);
                });
            }
            if (self[method]) return self[method](value).then(function (values) {

                return callback(value || values);
            }).catch(function (error) {

                callback(null, error);
            }); else {

                var error = new Error('There is no ' + prefix + ' ' + property);
                return callback(null, error);
            }
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
                if (typeof queryExpressions[0].fieldName !== 'object')
                    filter[queryExpressions[0].fieldName] = queryExpressions[0].fieldValue;
                if (typeof queryExpressions[0].comparisonOperator === 'symbol')
                    subFilter[queryExpressions[0].comparisonOperator] =
                        queryExpressions[0].fieldValue;
                else if (typeof queryExpressions[0].comparisonOperator === 'function')
                    subFilter =
                        queryExpressions[0].comparisonOperator(queryExpressions[0].fieldValue);
                if (typeof queryExpressions[0].comparisonOperatorOptions === 'function')
                    queryExpressions[0].comparisonOperatorOptions(subFilter);
                if (typeof queryExpressions[0].fieldName === 'object')
                    return Sequelize.where(queryExpressions[0].fieldName, subFilter);
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

            var self = this;
            var indexes = [];
            var join = queryExpressions.reduce(function (join, queryExpression, index) {

                if (queryExpression.fieldValue instanceof Entity) {

                    join.push(self.constructQuery(queryExpression.fieldValue.getObjectQuery(),
                        queryExpression.fieldValue.getObjectFeatures(),
                        queryExpression.fieldValue.getObjectConstructor(),
                        queryExpression.fieldName,
                        queryExpression.comparisonOperator,
                        queryExpression.logicalOperator));
                    indexes.push(index);
                }
                return join;
            }, []);
            for (var i = indexes.length - 1; i > -1; i--) {

                queryExpressions.splice(indexes[i], 1);
            }
            return join;
        }
        return null;
    },
    constructQuery: function (queryExpressions, features, ObjectConstructor, fieldName,
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
            typeof fieldName === 'string' && fieldName.length > 0) {

            query.model = ObjectConstructor;
            query.as = fieldName;
        }
        if (comparisonOperator instanceof Sequelize.Model) query.through = {

            model: comparisonOperator
        };
        if (features.required === false) query.required = false;
        if (features.marked !== true) query.force = true; // Note: undocumented, related to paranoid
        query.include = this.constructJoin(queryExpressions);
        var where = this.getQuery(queryExpressions, 0);
        if (where) {

            if (query.through) query.through.where = where;
            else query.where = where;
        }
        if (Array.isArray(features.having) && features.having.every(function (have, index) {

            return !(have instanceof QueryExpression) || (index > 0 && !have.logicalOperator);
        })) query.having = this.getQuery(features.having, 0);
        var attributes;
        if (Array.isArray(features.including)) attributes = {

            include: features.including.map(function (option) {

                return option.of ? [ComputationOperators.FUNCTION(option), option.as] :
                    [Sequelize.col(option.get), option.as];
            })
        };
        if (Array.isArray(features.include)) attributes = features.include.map(function (option) {

            if (typeof option === 'string') return option;
            return option.of ? [ComputationOperators.FUNCTION(option), option.as] :
                [Sequelize.col(option.get), option.as];
        });
        if (Array.isArray(features.exclude)) attributes = {

            exclude: features.exclude
        };
        if (attributes) {

            if (query.through) query.through.attributes = attributes;
            else query.attributes = attributes;
        }
        if (Array.isArray(features.sort)) query.order = features.sort.map(function (option) {

            if (typeof option.by !== 'string') throw new Error('Invalid sort by field name');
            var order = Array.isArray(option.in) ? option.in : [];
            if (option.of) order.push(ComputationOperators.FUNCTION({

                get: option.by,
                of: option.of
            })); else if (option.order !== 'asc') {

                order.push(option.by);
                if (typeof option.order === 'string') order.push(option.order.toUpperCase());
            } else order.push(Sequelize.col(option.by));
            return order.length === 1 ? order[0] : order;
        });
        if (Array.isArray(features.group)) query.group = features.group.map(function (field) {

            if (typeof field !== 'string') throw new Error('Invalid group by field name');
            return field;
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
        return (features.cache ? withCache(ObjectConstructor).cache() :
            ObjectConstructor)[func](query).then(function (result) {

                var modelObjects = result;
                var countObjects;
                var pageCount;
                if (features.paginate && typeof features.limit === 'number') {

                    modelObjects = result.rows;
                    pageCount = result.count;
                    if (Array.isArray(pageCount)) {

                        countObjects = pageCount;
                        pageCount = pageCount.reduce(function (count, group) {

                            return count + parseInt(group.count);
                        }, 0);
                    }
                    pageCount /= features.limit;
                }
                if (features.readonly) modelObjects = Sequelize.getValues(modelObjects);
                return callback(features.paginate && typeof features.limit === 'number' ? {

                    modelObjects: modelObjects,
                    countObjects: countObjects,
                    pageCount: pageCount
                } : modelObjects, null);
            }).catch(function (error) {

                callback(null, error);
            });
    };
};

var openConnection = function (defaultURI, callback, options) {

    if (!options) options = {};
    var logging = function (message, duration, info) {

        if (message) {

            if (message.indexOf('error') > -1 || (info && (JSON.stringify(info, function () {

                const seen = new WeakSet();
                return function (key, value) {

                    if (typeof value === "object" && value !== null) {

                        if (seen.has(value)) return;
                        seen.add(value);
                    }
                    return value;
                };
            }) || '').toLowerCase().indexOf('error') > -1)) callback(new Error(message), duration);
            else debug(message);
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
    sequelize = openConnection(defaultURI, cb, options);
    sequelize.sync().catch(function (err) {

        log.error({

            database: 'sql',
            err: err
        });
    });
    ['beforeDefine', 'afterDefine'].forEach(function (hook) {

        Sequelize.addHook(hook, function (attributes, options) {

            var name = (options && options.modelName) || attributes.name;
            if (typeof hookHandlers[name + hook] === 'function')
                hookHandlers[name + hook](attributes, options);
        });
    });
    self.removeObjects = function (objWrapper, entity, callback) {

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

                        if (typeof callback === 'function') return callback(modelObjects, null);
                    }).catch(function (error) {

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

                if (typeof callback === 'function') return callback(null, error);
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
                else return getExecuteQuery(session)(queryExpressions,
                    entity.getObjectConstructor(), features, callback);
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

                if (workingModelObject instanceof Sequelize.Model &&
                    (workingModelObject.isNewRecord || workingModelObject.changed()))
                    workingModelObject.save().then(function (modelObject) {

                        currentSession.push(modelObject);
                        save(index + 1);
                    }).catch(function (error) {

                        if (error) {

                            debug(error);
                            log.error({

                                database: 'sql',
                                err: error
                            });
                        }
                        if (typeof callback === 'function') callback(error, currentSession);
                    });
                else if (workingSession.length > index + 1) save(index + 1);
                else if (typeof callback === 'function') return callback(null, currentSession);
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

ModelController.defineEntity = function (name, attributes, plugins, constraints) {

    if (typeof name !== 'string') throw new Error('Invalid entity name');
    if (typeof attributes !== 'object') throw new Error('Invalid entity schema');
    if (constraints && typeof constraints !== 'object')
        throw new Error('Invalid entity constraints');
    if (!sequelize) throw new Error('Sequelize is not initialized');
    var configuration = {

        hooks: {}
    };
    if (constraints.freezeTableName) configuration.freezeTableName = true;
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

        var constraint = constraints && constraints[property] &&
            typeof constraints[property] === 'object' ? constraints[property] : {};
        if (attributes[property] === String && constraint.unique) attributes[property] =
            Object.assign({

                type: Sequelize.DataTypes.STRING(125)
            }, constraint);
        else if (DataType(attributes[property])) attributes[property] = Object.assign({

            type: DataType(attributes[property])
        }, constraint);
    });
    attributes[constraints.id ? 'id' : '_id'] = Object.assign({

        type: Sequelize.DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    }, constraints.id && typeof constraints.id === 'object' ? constraints.id : {});
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

            var toMany = Array.isArray(attributes[property]);
            var entity = toMany ? attributes[property][0] : attributes[property];
            var lazy = typeof entity === 'function' && !(entity.prototype instanceof Entity);
            if (lazy) entity = entity(name);
            if (entity && entity.prototype instanceof Entity) {

                var func = toMany ? 'hasMany' : lazy ? 'belongsTo' : 'hasOne';
                var options = {

                    as: property
                };
                var constraint = constraints && constraints[property] &&
                    typeof constraints[property] === 'object' ? constraints[property] : {};
                if (toMany && constraint.through) func = 'belongsToMany';
                var otherModel = entity.prototype.getObjectConstructor();
                Model[func](otherModel, Object.assign(options, constraint));
                Object.defineProperty(Model.prototype, property, {

                    enumerable: true,
                    set: function (value) {

                        this['_' + property] = value;
                    },
                    get: function () {

                        if (this['_' + property]) return this['_' + property];
                        var self = this;
                        var relation = {

                            get: getManipulator.apply(self, [property, 'get', otherModel]),
                            set: getManipulator.apply(self, [property, 'set', otherModel])
                        };
                        if (toMany) {

                            relation.add =
                                getManipulator.apply(self, [property, 'add', otherModel]);
                            relation.remove =
                                getManipulator.apply(self, [property, 'remove', otherModel]);
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
    if (typeof options.uri === 'object') Object.assign(options, options.uri);
    if (typeof options.username !== 'string' || options.username.length === 0)
        throw new Error('Invalid username');
    options.dialect = options.type;
    options.database = options.name || 'test';
    options.host = options.host || '127.0.0.1';
    var port = options.port || {

        mysql: '3306',
        postgres: '5432'
    }[options.dialect];
    if (!options.uri || typeof options.uri !== 'string') {

        options.uri = options.dialect + '://' + options.username;
        if (typeof options.password === 'string' && options.password.length > 0)
            options.uri += ':' + options.password;
        options.uri += '@' + options.host + ':' + port + '/' + options.database;
    }
    return new ModelController(options.uri, function () {

        cb.apply(this, arguments);
    }, options);
};