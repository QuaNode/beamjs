## Data Access Layer Guide

### Overview

BeamJS uses a pluggable data access layer architecture that allows support for different databases through custom ModelController implementations. This guide shows how to create a compatible ModelController for new databases like ClickHouse.

### Basic Structure

```javascript
var backend = require('beamjs').backend();

var ModelController = function (connectionString, callback, options, databaseKey) {
    var self = this;
    
    // Initialize your database connection here
    self.connection = createConnection(connectionString, options);
    self.databaseKey = databaseKey;
    
    // Handle connection success/failure
    self.connection.on('connect', () => callback(null));
    self.connection.on('error', (err) => callback(err));
};
```

### Required Methods

#### 1. getObjects(queryWrapper, entity, callback)
Retrieves data from database based on query expressions.

```javascript
self.getObjects = function (queryWrapper, entity, callback) {
    try {
        var queryExpressions = queryWrapper.getObjectQuery() || [];
        var features = entity.getObjectFeatures() || {};
        
        // Convert BeamJS query to your database query
        var sql = buildSelectQuery(queryExpressions, features, entity);
        
        self.connection.query(sql, function(err, results) {
            if (err) return callback(null, err);
            
            // Handle pagination if needed
            if (features.paginate) {
                return callback({
                    modelObjects: results.rows,
                    pageCount: results.totalCount / features.limit
                });
            }
            
            callback(results);
        });
    } catch (error) {
        callback(null, error);
    }
};
```

#### 2. addObjects(objectsAttributes, entity, callback)
Inserts new records into database.

```javascript
self.addObjects = function (objectsAttributes, entity, callback) {
    try {
        var tableName = entity.getTableName();
        var insertData = Array.isArray(objectsAttributes) ? 
            objectsAttributes : [objectsAttributes];
        
        var sql = buildInsertQuery(tableName, insertData);
        
        self.connection.query(sql, function(err, results) {
            if (err) return callback(null, err);
            callback(results.insertedObjects || insertData);
        });
    } catch (error) {
        callback(null, error);
    }
};
```

#### 3. removeObjects(queryWrapper, entity, callback)
Deletes records from database.

```javascript
self.removeObjects = function (queryWrapper, entity, callback) {
    try {
        var queryExpressions = queryWrapper.getObjectQuery() || [];
        var tableName = entity.getTableName();
        
        var sql = buildDeleteQuery(tableName, queryExpressions);
        
        self.connection.query(sql, function(err, results) {
            if (err) return callback(null, err);
            callback(results.deletedCount || 0);
        });
    } catch (error) {
        callback(null, error);
    }
};
```

#### 4. save(callback, session)
Persists changes to database (for update operations).

```javascript
self.save = function (callback, session) {
    if (!session || session.length === 0) {
        return callback(null, []);
    }
    
    var savedObjects = [];
    var saveNext = function(index) {
        if (index >= session.length) {
            return callback(null, savedObjects);
        }
        
        var obj = session[index];
        var sql = buildUpdateQuery(obj);
        
        self.connection.query(sql, function(err, result) {
            if (err) return callback(err);
            savedObjects.push(result);
            saveNext(index + 1);
        });
    };
    
    saveNext(0);
};
```

#### Static Method: defineEntity

```javascript
ModelController.defineEntity = function (name, attributes, plugins, constraints, databaseKey) {
    // Create table schema for your database
    var schema = convertAttributesToSchema(attributes, constraints);
    
    // Execute CREATE TABLE if needed
    var connection = getConnection(databaseKey);
    var sql = buildCreateTableQuery(name, schema);
    
    connection.query(sql, function(err) {
        if (err) console.error('Table creation failed:', err);
    });
    
    // Return entity constructor if needed
    return function EntityConstructor(data) {
        Object.assign(this, data);
    };
};
```

### ClickHouse Example

```javascript
// clickhouse-controller.js
var ClickHouse = require('@clickhouse/client');

var ClickHouseController = function (connectionString, callback, options, databaseKey) {
    var self = this;
    
    self.client = ClickHouse.createClient({
        host: options.host || 'localhost:8123',
        username: options.username,
        password: options.password,
        database: options.database
    });
    
    // Test connection
    self.client.ping().then(() => {
        callback(null);
    }).catch(callback);
    
    self.getObjects = function (queryWrapper, entity, callback) {
        var queryExpressions = queryWrapper.getObjectQuery() || [];
        var sql = `SELECT * FROM ${entity.getTableName()}`;
        
        // Build sql from queryExpressions
        
        self.client.query({ query: sql }).then(result => {
            result.json().then(data => callback(data));
        }).catch(err => callback(null, err));
    };
    
    // Implement other required methods...
};

ClickHouseController.defineEntity = function (name, attributes) {
    // ClickHouse table creation logic
    return function(data) { Object.assign(this, data); };
};

module.exports = ClickHouseController;
```

### Integration

```javascript
// In your BeamJS application
var ClickHouseController = require('./clickhouse-controller');
var backend = require('beamjs').backend();

// Set up the controller
backend.setModelController(new ClickHouseController(
    connectionString,
    function(err) {
        if (err) console.error('Database connection failed:', err);
        else console.log('ClickHouse connected successfully');
    },
    options,
    'clickhouse'
));
```

### Requirements Checklist

- ✅ Implement all 4 required methods
- ✅ Handle BeamJS query expressions
- ✅ Support pagination features
- ✅ Implement defineEntity static method
- ✅ Handle errors properly with callback pattern
- ✅ Convert BeamJS operators to database-specific syntax
- ✅ Support basic CRUD operations

### Contributing

1. Fork the BeamJS repository
2. Create your ModelController in `src/database/your-database/`
3. Add tests in `tests/database/your-database.test.js`
4. Update documentation
5. Submit pull request

For questions, open an issue on the BeamJS GitHub repository.

---

### Next Steps

Continue reading the documentation:

- **[Getting Started](./docs/installation/installation.md)**
  - [Installation](./docs/installation/installation.md)
  - [Starter](./docs/installation/starter.md)
  - [Architecture](./docs/architecture.md)
  - [Behaviors](./docs/behaviors.md)
- **[Usage](./docs/usage/backend.md)**
  - [Backend](./docs/usage/backend.md)
  - [Model](./docs/usage/model.md)
  - [Entity](./docs/usage/entity.md)
  - [Query](./docs/usage/query.md)
  - [Service](./docs/usage/service.md)
  - [Data](./docs/usage/data.md)
  - [Behavior](./docs/usage/behavior.md)