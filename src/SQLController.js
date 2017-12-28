/*jslint node: true */
/*global emit*/
/*global map*/
'use strict';

var backend = require('backend-js');
var ModelEntity = backend.ModelEntity;
var QueryExpression = backend.QueryExpression;


var Memcached = require('memcached');
var memcached = new Memcached('localhost:11211');
var MemcachedAdaptor = require('sequelize-transparent-cache-memcached')
var memcachedAdaptor = new MemcachedAdaptor({
  client: memcached,
  lifetime: 60 * 60
})
var sequelizeCache = require('sequelize-transparent-cache');
var withCache = sequelizeCache(memcachedAdaptor).withCache;

var Sequelize = require('sequelize');
var Sequelize = require('sequelize');
require('sequelize-values')(Sequelize);
var sequelize = null;

var SequelizeTokenify = require('sequelize-tokenify');

var bcrypt = require("bcrypt");

var sequelizePagination = require('sequelize-paginate-cursor');

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
var DataTypes = {
  String: Sequelize.STRING,
  Number: Sequelize.NUMBER
}
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

        var query = adapter.constructQuery(queryExpressions, features);

        var func = features.paginate ? "findAndCountAll" : "findAll";

        if (features.paginate && typeof features.limit === 'number') {
          query.limit = features.limit;
          query.offset = (features.page-1)*features.limit;
        }

        if (features.cache) {
          ObjectConstructor = withCache(ObjectConstructor);
          ObjectConstructor = ObjectConstructor.cache();
        }

        ObjectConstructor[func](query).then(function(result){
          var modelObjects = null;
          var pageCount = null;
          if (features.paginate && typeof features.limit === 'number') {
            modelObjects = result.rows;
            pageCount = result.count;
          }
          if (features.readonly) {
            modelObjects = Sequelize.getValues(result);
          }
          callback(modelObjects,null);
        }).catch(function(error){
          callback(null,error);
        });
    };

};

var openConnection = function(defaultURI, config) {
//check if config null, if null initialize, add define
    //if(config)
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
                getExecuteQuery(session)(queryExpressions, entity.getObjectConstructor(), features, callback);
            }
        });
    };
    self.save = function(callback, oldSession) {

        if (!checkConnection(defaultURI, callback)) return;
        var workingSession = (Array.isArray(oldSession) && oldSession) || session;
        var save = function(index) {

            setTimeout(function() {

                if (workingSession[index] instanceof sequelize.Model) workingSession[index].save(function(error, modelObject
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

/*var resovleTypeAttribute = function(attributes) {

    Object.keys(attributes).forEach(function(key) {

        var object = Array.isArray(attributes[key]) ? attributes[key][0] : typeof attributes[key] === 'object' ? attributes[key] : null;
        if (object) {

            switch (Object.keys(object).length) {

                case 2:
                    if (Object.keys(object).indexOf('ref') === -1) break;
                    /* falls through */
                /*case 1:
                    if (Object.keys(object).indexOf('type') > -1) {

                        attributes[key] = object.type;
                        return;
                    }
            }
            resovleTypeAttribute(object);
        }
    });
};*/

ModelController.defineEntity = function(constraints, attributes, plugins) {

    //name object changed to constraints and it has name string
    var config = null;
    var sequelizeAttributes = null;
    if (typeof constraints.name !== 'string') throw new Error('invalid entity name');
    if (typeof attributes !== 'object') throw new Error('invalid entity schema');

    for (var i = 0; Array.isArray(plugins) && i < plugins.length && typeof plugins[i] === 'function'; i++) {

      if(plugins[i] == 'TimestampsPlugin'){
        config = {
          timestamp: true
        }
      }
      if(plugins[i] == 'HashedpropertyPlugin'){
        config.instanceMethods: {
            generateHash(property) {
                return bcrypt.hash(property, bcrypt.genSaltSync(8));
            },
            validPassword(property) {
                return bcrypt.compare(password, this.password);
            }
        }
      }
    }
    sequelizeAttributes._id = {
      type: DataTypes.String,
      autoIncrement: true,
      primaryKey: true
    }
    sequelizeAttributes.recovery_token: {
            type: DataTypes.String,
            unique: true
        }
    Object.keys(attributes).forEach(function(key) {
      sequelizeAttributes.key = {
        type: DataTypes.attributes[key];
      }
    });
    var entityModel  = sequelize.define(constraints.name, attributes, config);
    if(plugins.indexOf('SequelizeTokenify')){
      SequelizeTokenify.tokenify(entityModel, {
        field: 'recovery_token'
      });
    }
    //associations
    Object.keys(attributes).forEach(function(key) {

        var object = Array.isArray(attributes[key]) ? attributes[key][0] : typeof attributes[key] === 'object' ? attributes[key] : null;
        if (object) {
          entityModel.belongsTo(object,{as: key});
          entityModel[constraints[key]](object);
        }
    });

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
