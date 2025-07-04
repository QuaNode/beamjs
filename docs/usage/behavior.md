## Advanced Behaviours

### Business Domain Naming Conventions

BeamJS allows you to customize operation naming conventions to match your business domain using the `operations` configuration object. This enables you to create domain-specific languages for your behaviours.

#### Basic Operation Customization

```javascript
// Define custom operation names for a payment domain
var paymentOperations = {
    authenticate: {
        key: 'Authentication',
        chain: {
            authenticatePayment: 'parameters',
            gateway: 'service',
        }
    },
    request: {
        key: 'Request',
        chain: {
            checkout: 'parameters',
            gateway: 'service'
        }
    },
    query: {
        key: 'Query',
        chain: {
            findCart: 'query',
            orders: 'entity',
        }
    },
    delete: { ... },
    insert: { ... }
}

// Apply to specific behaviour
module.exports.processPayment = behaviour({
    name: 'processPayment',
    operations: paymentOperations,
    // ... other options
}, function(init) {
    return function() {
        var self = init.apply(this, arguments).self();
        
        self.catch(function(e) {
            return e;
        }).next().gateway().authenticatePayment([ ... ]).then(function(result, error) {
            // result
        }).next().gateway().checkout([ ... ]).then(function(result, error) {
            // result
        }).next().orders().findCart(() => [ ... ]).then(function(cart, error) {
            // cart
        }).next().map(function(response) {
            response.cart = cart;
        }).end();
    };
});
```

#### Global Operation Configuration

```javascript
// server.js - Apply domain conventions globally
beam.database('main', {
    type: 'mongodb',
    name: 'ecommerce'
}).app(__dirname + '/behaviours', {
    path: '/api/v1',
    parser: 'json',
    port: 8282,
    operations: { ... }
});
```

#### Piping Operations to Response

BeamJS provides flexible options for piping operation results directly to the response, with or without property mapping.

#### Direct Piping Without Mapping

```javascript
module.exports.getUsers = behaviour({
    name: 'getUsers',
    version: '1',
    type: 'database',
    path: '/users',
    method: 'GET',
    // Direct piping - no mapping needed
}, function(init) {
    return function() {
        var self = init.apply(this, arguments).self();
        
        self.catch(function(e) {
            return e;
        }).next().entity(new User({
            readonly: true
        })).query(() => []).pipe(); // Enable direct piping
        // No .map() needed - results go directly to response
    };
});
```

#### Piping with Property Mapping

```javascript
module.exports.getOrderSummary = behaviour({
    name: 'getOrderSummary',
    version: '1', 
    type: 'database',
    path: '/orders/summary',
    method: 'GET',
    // Property mapping configuration
    map: function(property, superProperty) {
        var mappings = {
            'orders': 'orderData',
            'totalAmount': 'total',
            'customerInfo': 'customer.details'
        };
        return mappings[property] || property;
    }
}, function(init) {
    return function() {
        var self = init.apply(this, arguments).self();
        
        self.catch(function(e) {
            return e;
        }).next().entity(new Order({
            readonly: true
        })).query(() => []).pipe();
    };
});
```

#### Conditional Piping

```javascript
module.exports.getProducts = behaviour({
    name: 'getProducts',
    version: '1',
    type: 'database', 
    path: '/products',
    method: 'GET',
    returns: {
        products: {
            key: 'products',
            type: 'body'
        },
        count: {
            key: 'totalCount',
            type: 'body'
        }
    }
}, function(init) {
    return function() {
        var self = init.apply(this, arguments).self();
        var {
            includeCount
        } = self.parameters;
        
        self.catch(function(e) {
            return e;
        }).next().entity(new Product({
            readonly: true
        })).query(() => []).then(function(products, error) {
            // Products retrieved
        });
        
        // If piping is disabled
        if (!includeCount) self.pipe(); 
        
        // If piping is enabled, use manual mapping
        if (includeCount) {
            self.next().map(function(response) {
                response.products = products;
                response.count = count;
            }).end();
        }
    };
});
```

### Mapping Properties

BeamJS supports sophisticated property mapping for transforming operation results before sending to response.

#### Simple Property Mapping

```javascript
// Map database fields to API response fields
map: function(property, superProperty) {
    var fieldMappings = {
        '_id': 'id',
        'createdAt': 'created_date', 
        'updatedAt': 'modified_date',
        'userName': 'display_name'
    };
    return fieldMappings[property] || property;
}
```

#### Nested Property Mapping

```javascript
// Handle nested object property mapping
map: function(property, superProperty) {
    if (superProperty === 'user') {
        var userMappings = {
            'firstName': 'first_name',
            'lastName': 'last_name',
            'emailAddress': 'email'
        };
        return userMappings[property] || property;
    }
    
    if (superProperty === 'address') {
        var addressMappings = {
            'streetAddress': 'street',
            'postalCode': 'zip_code'
        };
        return addressMappings[property] || property;
    }
    
    return property;
}
```

#### Dynamic Mapping Based on Context

```javascript
map: function(property, superProperty) {
    
    // Role-based field mapping
    if (userRole === 'admin') {
        var adminMappings = {
            'internalId': 'id',
            'secretKey': 'api_key'
        };
        if (adminMappings[property]) {
            return adminMappings[property];
        }
    }
    
    // Version-based mapping
    if (apiVersion === 'v2') {
        var v2Mappings = {
            'user_id': 'userId',
            'created_at': 'createdAt'
        };
        if (v2Mappings[property]) {
            return v2Mappings[property];
        }
    }
    
    return property;
}
```

### Behaviour Definition Options

#### Complete Options Reference

```javascript
module.exports.myBehaviour = behaviour({
    // Core identification
    name: 'myBehaviour',                    // Required: Unique behaviour name
    version: '1',                           // Required: Behaviour version
    type: 'database_with_action',           // Required: Execution type
    
    // Routing (for route behaviours)
    path: '/api/endpoint',                  // URL path
    method: 'POST',                         // HTTP method
    host: 'api.domain.com',                 // Virtual host binding
    
    // Security and filtering  
    unless: ['login', 'register'],          // Skip for these behaviours
    for: ['authenticated'],                 // Only run for these behaviours
    origins: '*',                           // CORS origins
    
    // Performance and scaling
    queue: function(name, parameters) {     // Custom queueing logic
        return parameters.userId;           // Queue by user ID
    },
    priority: 1,                            // Execution priority (0-10)
    timeout: 30000,                         // Timeout in milliseconds
    memory: 5,                              // 5mb a memory usage note for memory optimization
    
    // Data handling
    paginate: true,                         // Enable built-in pagination
    storage: 'redis',                       // Storage selection
    database: function(req) {               // Dynamic database selection
        return req.tenantId;
    },
    
    // Event system
    events: [                               // Real-time event definitions
        function(name, parameters) {
            return { userId: parameters.userId };
        },
        'global_notifications'
    ],
    event: function(name, parameters) {     // Single event definition
        return `user_${parameters.userId}`;
    },
    
    // Scheduling (for job behaviours)
    schedule: '0 */6 * * *',               // Cron expression
    
    // Custom operations and naming
    operations: { ... },
    
    // Input/Output definition
    parameters: {                           // Input parameters
        userId: {
            key: 'userId',
            type: 'path',
            alternativeKey: 'user_id',
            alternativeType: 'query'
        },
        data: {
            key: 'data',
            type: 'body'
        },
        token: {
            key: 'X-Access-Token',
            type: 'header'
        }
    },
    
    returns: {                              // Output mapping
        success: {
            key: 'success',
            type: 'body'
        },
        data: {
            key: 'responseData', 
            type: 'body'
        },
        'X-Rate-Limit': {
            key: 'rateLimit',
            type: 'header'
        }
    },
    
    // Property mapping
    map: function(property, superProperty) {
        // Custom property transformation logic
        return property;
    },
    
    // Middleware and plugins
    plugins: [                              // Request/response plugins
        function(req, res, next) {
            // Pre-processing plugin
            next();
        }
    ],
    plugin: function(req, res, next) {      // Single plugin
        // Custom processing
        next();
    },
    
    // Advanced features
    fetcher: 'customFetcher',              // Custom data fetcher
    fetching: 'externalAPI',               // External data source
    logger: 'customLogger',                // Custom logging
    
    // Inheritance
    inherits: ParentBehaviour               // Inherit from parent behaviour
    
}, function(init) {
    return function() {
        var self = init.apply(this, arguments).self();
        // Behaviour implementation
    };
});
```

#### Parameter Types and Sources

```javascript
parameters: {
    // Path parameters from URL segments
    userId: {
        key: 'userId',
        type: 'path'
    },
    
    // Query string parameters
    limit: {
        key: 'limit', 
        type: 'query'
    },
    
    // Request body data
    userData: {
        key: 'userData',
        type: 'body'
    },
    
    // HTTP headers
    authToken: {
        key: 'X-Auth-Token',
        type: 'header'
    },
    
    // Middleware injected data
    currentUser: {
        key: 'user',
        type: 'middleware'
    },
    
    // Alternative parameter sources
    identifier: {
        key: 'id',
        type: 'path',
        alternativeKey: 'identifier', 
        alternativeType: 'query'
    }
}
```

#### Return Types and Destinations

```javascript
returns: {
    // Response body data
    users: {
        key: 'users',
        type: 'body'
    },
    
    // HTTP response headers  
    'X-Total-Count': {
        key: 'totalCount',
        type: 'header'
    },
    
    // Middleware data (for policy behaviours)
    authenticatedUser: {
        key: 'user',
        type: 'middleware'
    },
    
    // Purpose-driven returns with conditions
    token: {
        key: 'accessToken',
        type: 'header',
        purpose: ['constant', {
            as: 'parameter',
            unless: ['login', 'register']
        }]
    }
}
```

### Advanced Configuration

#### Multi-tenant Configuration

```javascript
// Global tenant configuration
beam.app(__dirname + '/behaviours', {
    tenants: {
        'tenant1': {
            host: 'tenant1.api.com',
            path: '/tenant1/*',
            id: 'tenant_1'
        },
        'tenant2': function(req) {
            return req.get('X-Tenant-ID') === 'tenant2';
        }
    }
});

// Behaviour-specific database selection
database: function(req) {
    var tenantId = req.get('X-Tenant-ID');
    return tenantId ? `db_${tenantId}` : 'default_db';
}
```

#### Microservices Integration

```javascript
// remotes are other BeamJS services
beam.app({
  local: __dirname + '/behaviours',
  notificationService: 'http://localhost:8192/api/v1'
});
```

#### Behaviour Inheritance

```javascript
// Base behaviour with common functionality
var BaseCRUDBehaviour = behaviour({
    version: '1',
    type: 'database_with_action',
    operations: { ... }
}, function(init) {
    return function() {
        var self = init.apply(this, arguments).self();
        
        // Common error handling
        self.catch(function(e) {
            return e;
        });
        
        return self;
    };
});

// Child behaviour inheriting from base
module.exports.userBehaviour = behaviour({
    name: 'userBehaviour',
    inherits: BaseCRUDBehaviour,
    path: '/users',
    method: 'GET'
}, function(init) {
    return function() {
        var self = init.apply(this, arguments).self();
        
        // Inherits common functionality
        self.next().entity(new User()).query(() => [])
        .then(function(users, error) {
            // User-specific logic
        }).next().map(function(response) {
            response.users = users;
        }).end();
    };
});
```

---

### Next Steps

Continue reading the documentation:

- **[Getting Started](../installation/installation.md)**
  - [Installation](../installation/installation.md)
  - [Starter](../installation/starter.md)
  - [Architecture](../architecture.md)
  - [Behaviors](../behaviors.md)
- **[Usage](./backend.md)**
  - [Backend](./backend.md)
  - [Model](./model.md)
  - [Entity](./entity.md)
  - [Query](./query.md)
  - [Service](./service.md)
  - [Data](./data.md)
  - [Behavior](./behavior.md)