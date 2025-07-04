## 🎭 Behavior Types & Their Purpose

### 🌍 **Route Behaviors** - *Your Application's Face*
Handle HTTP requests and serve as the primary interface between your application and the outside world.

```javascript
// User-facing API endpoints
behaviours/user/profile/update/
behaviours/user/orders/create/
behaviours/admin/reports/generate/
```

### 🔧 **Internal Behaviors** - *Reusable Business Logic*
Encapsulate complex business operations that can be shared across multiple route behaviors.

```javascript
// Shared business logic
behaviours/internals/payment/process/
behaviours/internals/email/send/
behaviours/internals/inventory/update/
```

### 🛡️ **Policy Behaviors** - *Guardian Middleware*
Implement security, authentication, and cross-cutting concerns that protect your application.

```javascript
// Security and middleware
behaviours/policies/authentication/
behaviours/policies/authorization/
behaviours/policies/rate-limiting/
```

### ⚙️ **Job Behaviors** - *Background Workers*
Execute scheduled tasks, data cleanup, and maintenance operations automatically.

```javascript
// Scheduled operations
behaviours/jobs/daily-reports/
behaviours/jobs/cleanup-logs/
behaviours/jobs/send-notifications/
```

### 🔗 **Hook Behaviors** - *System Integration Points*
Handle external system integrations, webhooks, and third-party service callbacks.

```javascript
// System integrations
behaviours/hooks/payment/confirm/
behaviours/hooks/email/verify/
behaviours/hooks/shipping/update/
```

---

## 🔄 The Functional Chain Pattern

### Execution Flow Mastery

BeamJS behaviors follow a strict execution order that ensures predictable, secure, and maintainable code:

```
1. 🚨 catch     → Global error handling
2. 🛡️ guard     → Input validation & business rules  
3. 🔐 authenticate → Service authentication
4. 📡 request   → External service calls
5. 📖 query     → Database read operations
6. 🗑️ delete    → Database delete operations
7. ➕ insert    → Database create operations
8. 📋 map       → Response formatting
```

> 💡 **Note:**  
> The naming convention can be fully customized using a **business-domain operation definition language**, allowing it to align precisely with your domain logic and terminology.

### 🎯 Chain Rules & Best Practices

#### ⚠️ **Strict Operation Limits**
- **One** authentication operation per behavior
- **One** request operation per behavior  
- **One** query operation per behavior
- **One** insert operation per behavior
- **One** delete operation per behavior
- **One** map operation for response formatting
- **One** catch operation for error handling

#### 🔗 **Chain Separation with `.next()`**
Every operation must be properly separated:

```javascript
self.catch(function (e) {
    return error || e;
}).next()  // ← Essential separation
 .guard(function () {
    // Validation logic
}).next()  // ← Essential separation
 .authenticate([...])
 .then(function (result, error) {
    // Handle authentication
}).next()  // ← Essential separation
 .map(function (response) {
    // Final response
}).end();
```

#### 🎛️ **Conditional Execution**
Control flow with elegant conditional patterns:

```javascript
// Using .if() for simple conditions
.if(function () {
    return userHasPermission && !error;
}).entity(new SecureDocument())

// Using .async().skip() for complex conditions  
.async(function (next) {
    // Ensure all pre-conditions before integration
}).skip(function () {
    return shouldSkipOperation;
}).service(function () {
    return new PaymentService();
})
```

---

## 💾 Data Models & Database Operations

### 🎨 Elegant Model Definitions

BeamJS models provide a unified interface across different database engines while maintaining native performance:

```javascript
// models/user/index.js
var TimestampsPlugin = require('mongoose-timestamp');
var HashedPropertyPlugin = require('mongoose-hashed-property');
var backend = require('beamjs').backend();
var model = backend.model();

module.exports.user = model({
    name: 'user',
    features: {
        exclude: ['hashed_password', 'secret'] // 🔒 Security by default
    }
}, {
    _id: Number,
    name: String,
    email: String,
    subscription: String,
    credits: Number,
    status: String,
    preferences: {
        codeStyle: String,
        language: String,
        notifications: Boolean
    },
    // 🔐 Automatic security fields via plugins
    // hashed_password: (auto-generated)
    // secret: (auto-generated)
}, [TimestampsPlugin, HashedPropertyPlugin]);
```

### 🔍 Advanced Query Patterns

#### **Simple Queries**
```javascript
.entity(new User({
    readonly: true
})).query(() => [
    new QueryExpression({
        fieldName: 'status',
        comparisonOperator: EQUAL,
        fieldValue: 'active'
    })
]).then(function (users, error) {
    // Process active users
})
```

#### **Complex Queries with Logical Operators**
```javascript
.entity(new Order({
    readonly: true,
    paginate: true,
    page: 1,
    limit: 20
})).query(() => [
    new QueryExpression({
        fieldName: 'status',
        comparisonOperator: EQUAL,
        fieldValue: 'pending'
    }),
    new QueryExpression({
        fieldName: 'totalAmount',
        comparisonOperator: GT,
        fieldValue: 100,
        logicalOperator: AND,  // 🔗 Combine conditions
        contextualLevel: 0     // 📊 Query nesting level
    }),
    new QueryExpression({
        fieldName: 'priority',
        comparisonOperator: EQUAL,
        fieldValue: 'high',
        logicalOperator: OR,   // 🔀 Alternative condition
        contextualLevel: 1     // 📊 Nested query level
    })
]).then(function (result, error) {
    var orders = result.modelObjects;
    var pagination = {
        currentPage: 1,
        totalPages: Math.ceil(result.pageCount),
        totalItems: Math.round(result.pageCount * 20),
        itemsPerPage: 20
    };
})
```

#### **Data Modification Operations**
```javascript
// ➕ Creating Records
.entity(new Product()).insert(() => ({
    _id: new Date().getTime(),
    name: productName,
    price: productPrice,
    category: productCategory,
    status: 'active',
    createdDate: new Date()
})).then(function (products, error) {
    if (Array.isArray(products) && products.length > 0) {
        product = products[0];
    }
})

// 💾 Saving Modified Records
.async(function (next, models) {
    if (!error && modifiedObjects.length > 0) {
        models(modifiedObjects).save(function (e, savedObjects) {
            if (e) {
                error = e;
            } else {
                // Update local references with saved objects
                user = Array.isArray(savedObjects) && savedObjects[0];
            }
            next();
        });
    } else {
        next();
    }
})
```

---

## 🌐 Service Integration Architecture

### 🔌 External Service Patterns

BeamJS provides a standardized approach to integrating with external services while maintaining security and reliability:

```javascript
// services/payment/stripe.js
var backend = require('beamjs').backend();
var service = backend.service();
var stripe = require('stripe');

// Stripe Payment API Reference: https://stripe.com/docs/api/payment_intents
// Rate Limits: 100 requests per second in live mode
// Token Limits: Payment intents expire after 24 hours
// Cost: 2.9% + 30¢ per successful charge
// Special Considerations:
// - Always use cents for calculations to avoid floating point errors
// - 3D Secure authentication may require additional customer action
// - Payment confirmation is asynchronous via webhooks
// Corner Cases:
// - Declined cards return specific error codes in last_payment_error
// - Network timeouts may leave payments in processing state
// - Rate limiting returns 429 status codes

var clients = {};
var methods = {
    
    processPayment: function (client, amount, currency, paymentMethod) {
        // 💰 Convert to cents for Stripe API
        var amountInCents = Math.round(amount * 100);
        
        // ⚠️ Validate amount limits
        if (amountInCents < 50) {
            throw new Error('Amount must be at least $0.50');
        }
        if (amountInCents > 99999999) {
            throw new Error('Amount exceeds maximum limit');
        }
        
        var stripeClient = clients[client].stripe;
        return stripeClient.paymentIntents.create({
            amount: amountInCents,
            currency: currency.toLowerCase(),
            payment_method_data: paymentMethod,
            confirm: true
        }).then(function (paymentIntent) {
            return {
                success: true,
                transactionId: paymentIntent.id,
                status: paymentIntent.status,
                amount: amount
            };
        }).catch(function (error) {
            // 🚨 Handle specific Stripe errors
            if (error.type === 'StripeCardError') {
                throw new Error('Card was declined: ' + error.message);
            }
            if (error.type === 'StripeRateLimitError') {
                throw new Error('Rate limit exceeded. Please try again later.');
            }
            throw new Error('Payment processing failed: ' + error.message);
        });
    }
};

module.exports.stripePaymentService = service('stripePaymentService',
    function doReq(request, callback) {
        // 🔍 Request handler implementation
    },
    function doAuth(request, callback) {
        // 🔐 Authentication handler implementation
    }
);
```

### 🔐 Service Authentication & Usage

```javascript
// In behavior implementation
.service(function () {
    var StripeService_ENDPOINT = new StripePaymentService();
    return new StripeService_ENDPOINT();
}).authenticate([
    new ServiceParameter({
        key: 'client',
        value: serviceClient,
        type: DATA
    }),
    new ServiceParameter({
        key: 'apiKey',
        value: process.env.STRIPE_SECRET_KEY,
        type: DATA
    })
]).then(function (clientId, error) {
    if (error) {
        // Handle authentication failure
    } else {
        serviceClient = clientId;
    }
}).next().if(function () {
    return !error && serviceClient;
}).service(function () {
    var StripeService_ENDPOINT = new StripePaymentService();
    return new StripeService_ENDPOINT();
}).request(() => [
    new ServiceParameter({
        key: 'client',
        value: serviceClient,
        type: DATA
    }),
    new ServiceParameter({
        key: 'amount',
        value: orderTotal,
        type: DATA
    }),
    new ServiceParameter({
        key: 'currency',
        value: 'usd',
        type: DATA
    }),
    new ServiceParameter({
        key: 'method',
        value: 'processPayment',
        type: OPTION
    })
]).then(function (result, error) {
    if (error) {
        // Handle payment failure
    } else if (result && result.success) {
        paymentResult = result;
    }
})
```

---

## 🛡️ Security & Authentication

### 🔐 Enterprise-Grade Security

BeamJS implements security as a first-class citizen with multiple layers of protection:

#### **Policy-Based Authentication**
```javascript
// behaviours/policies/authentication/index.js
module.exports.authenticate = behavior({
    name: 'authenticate',
    inherits: FunctionalChainBehavior,
    version: '1',
    type: 'database',
    path: '/',
    parameters: {
        token: {
            key: 'X-Access-Token',
            type: 'header',
            alternativeKey: 'token',
            alternativeType: 'query'
        }
    },
    returns: {
        authenticated: { type: 'middleware' },
        user: { type: 'middleware' }
    },
    unless: ['login', 'register', 'health'] // 🚫 Skip for public routes
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        var { token } = self.parameters;
        var error = null;
        var authenticated = false;
        var user = null;

        self.catch(function (e) {
            return error || e;
        }).next()
         .guard(function () {
            // 🔍 Token validation
            if (!token) {
                error = new Error('Access token is required');
                error.code = 401;
                return false;
            }
            
            // 🕒 Check token expiration
            var decoded = jwt.decode(token);
            if (decoded.exp && Date.now() >= decoded.exp * 1000) {
                error = new Error('Token has expired');
                error.code = 401;
                return false;
            }
            
            return true;
        }).if(function () {
            return !error;
        }).entity(new User({
            exclude: undefined // 🔓 Access protected fields for auth
        })).query(() => [
            new QueryExpression({
                fieldName: '_id',
                comparisonOperator: EQUAL,
                fieldValue: decoded.jwtid
            })
        ]).then(function (users, e) {
            if (e) {
                error = e;
                return;
            }
            
            user = users[0];
            if (!user) {
                error = new Error('User not found');
                error.code = 401;
                return;
            }
            
            // 🔐 Verify JWT signature
            if (!user.secret) {
                error = new Error('Authentication secret missing');
                error.code = 401;
                return;
            }
        }).next()
         .async(function (next) {
            if (!error && user) {
                jwt.verify(token, user.secret, function (verifyError) {
                    if (verifyError) {
                        error = new Error('Token verification failed');
                        error.code = 401;
                    } else {
                        authenticated = true;
                    }
                    next();
                });
            } else {
                next();
            }
        }).map(function (response) {
            response.authenticated = authenticated;
            response.user = user;
        }).end();
    };
});
```

#### **Input Validation & Sanitization**
```javascript
.guard(function () {
    // 📧 Email validation with regex
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        error = new Error('Valid email address is required');
        error.code = 400;
        return false;
    }
    
    // 🔢 Numeric validation with range checking
    if (!amount || isNaN(parseFloat(amount)) || amount <= 0 || amount > 999999) {
        error = new Error('Amount must be between $0.01 and $999,999');
        error.code = 400;
        return false;
    }
    
    // 📝 String validation with length limits
    if (typeof description !== 'string' || description.length > 2000) {
        error = new Error('Description must be under 2000 characters');
        error.code = 400;
        return false;
    }
    
    // 🔒 Business rule validation
    if (user.credits < MINIMUM_CREDITS_REQUIRED) {
        error = new Error('Insufficient credits for this operation');
        error.code = 402;
        return false;
    }
    
    return true;
})
```

---

## ⚡ Advanced Patterns & Best Practices

### 🔄 Behavior Composition

Create powerful, reusable behaviors by composing smaller ones:

```javascript
module.exports.completeOrderWorkflow = behavior({
    name: 'completeOrderWorkflow',
    type: 'integration_with_action'
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        
        self.catch(function (e) {
            return error || e;
        }).next()
         .async(function (next) {
            
            // 🛒 Step 1: Validate cart
            let validateCart = function () {
                return new Promise(function (resolve, reject) {
                    let cartValidation = new ValidateCart({
                        type: 1,
                        priority: 0,
                        inputObjects: {
                            cartId: cartId,
                            userId: userId,
                            authenticated: authenticated
                        }
                    });
                    
                    self.run(cartValidation, function (res, error) {
                        if (error) reject(error);
                        else resolve(res);
                    });
                });
            };
            
            // 💳 Step 2: Process payment
            let processPayment = function (cartData) {
                return new Promise(function (resolve, reject) {
                    let payment = new ProcessPayment({
                        type: 1,
                        priority: 0,
                        inputObjects: {
                            amount: cartData.totalAmount,
                            paymentMethod: paymentMethod,
                            authenticated: authenticated
                        }
                    });
                    
                    self.run(payment, function (res, error) {
                        if (error) reject(error);
                        else resolve({ ...cartData, payment: res });
                    });
                });
            };
            
            // 📦 Step 3: Create shipment
            let createShipment = function (orderData) {
                return new Promise(function (resolve, reject) {
                    let shipment = new CreateShipment({
                        type: 1,
                        priority: 0,
                        inputObjects: {
                            orderId: orderData.orderId,
                            shippingAddress: shippingAddress,
                            authenticated: authenticated
                        }
                    });
                    
                    self.run(shipment, function (res, error) {
                        if (error) reject(error);
                        else resolve({ ...orderData, shipment: res });
                    });
                });
            };
            
            // 🔄 Execute workflow
            validateCart()
                .then(processPayment)
                .then(createShipment)
                .then(function (result) {
                    workflowResult = result;
                    next();
                })
                .catch(function (error) {
                    workflowError = error;
                    next();
                });
        }).map(function (response) {
            response.success = !workflowError;
            response.order = workflowResult;
        }).end();
    };
});
```

### 📊 Real-Time Events & WebSocket Integration

```javascript
module.exports.createProject = behavior({
    name: 'createProject',
    // 📡 Real-time event configuration
    events: [function (_, parameters) {
        var { user, authenticated } = parameters;
        if (!authenticated) return;
        return { userId: user._id }; // 🎯 Event targeting
    }],
    queue: function (_, parameters) {
        return parameters.token; // 🚦 Request queuing
    }
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        
        // ... behavior implementation ...
        
        .map(function (response) {
            if (success && project) {
                // 🚀 Trigger real-time event
                self.trigger({ userId: user._id }, {
                    projectId: project._id,
                    action: 'project_created',
                    timestamp: new Date().toISOString()
                });
            }
            response.project = project;
        }).end();
    };
});
```

### 📁 File Organization & Modularization

When behavior functions become complex (>50 lines), extract them:

```
behaviors/
└── user/
    └── checkout/
        ├── index.js           # 🏠 Main behavior
        ├── guard.js           # 🛡️ Validation logic
        ├── async.js           # ⚙️ Async operations
        └── helpers/
            ├── validation.js  # 🔍 Input validation
            ├── calculation.js # 🧮 Business calculations
            └── formatting.js  # 📝 Data formatting
```

**guard.js** - Pure validation function:
```javascript
/*jslint node: true*/
'use strict';

module.exports = function () {
    var [cartId, userId, paymentMethod, authenticated] = arguments;
    
    // 🔐 Authentication check
    if (!authenticated) {
        let error = new Error('Unauthorized access');
        error.code = 401;
        return { error };
    }
    
    // 🛒 Cart validation
    if (!cartId || isNaN(parseInt(cartId))) {
        let error = new Error('Invalid cart ID');
        error.code = 400;
        return { error };
    }
    
    // 💳 Payment method validation
    if (!paymentMethod || typeof paymentMethod !== 'object') {
        let error = new Error('Invalid payment method');
        error.code = 400;
        return { error };
    }
    
    return {}; // ✅ No error
};
```

**async.js** - Complex async operations:
```javascript
/*jslint node: true*/
'use strict';

module.exports = function () {
    var [
        self, next, models,
        cartData, paymentMethod, shippingAddress,
        setOrder, setPayment, setShipment, setError
    ] = arguments;
    
    let processWorkflow = function () {
        return cartValidation()
            .then(paymentProcessing)
            .then(shipmentCreation)
            .then(function (result) {
                setOrder(result.order);
                setPayment(result.payment);
                setShipment(result.shipment);
            })
            .catch(function (error) {
                setError(error);
            });
    };
    
    processWorkflow().finally(function () {
        next();
    });
};
```

---

## 🎛️ Configuration & Environment Management

### 📂 Project Structure Excellence

```
my-beamjs-app/
├── 🚀 server.js                 # Application entry point
├── 📦 package.json              # Dependencies & scripts  
├── 🌍 .env                      # Environment variables
├── 📋 README.md                 # Project documentation
├── 📁 src/                      # Source code
│   ├── 🎭 behaviors/            # Business logic
│   │   ├── 📜 index.js          # Behavior registration
│   │   ├── 🛡️ policies/         # Security & middleware
│   │   ├── 🔧 internals/        # Reusable logic
│   │   ├── 👤 user/             # User operations
│   │   ├── 👑 admin/            # Admin operations
│   │   ├── 🔗 hooks/            # System integrations
│   │   └── ⚙️ jobs/             # Background tasks
│   ├── 📊 models/               # Data models
│   ├── 🌐 services/             # External integrations
│   ├── 🛠️ helpers/              # Utility functions
│   └── ⚙️ config/               # Configuration
├── 🧪 tests/                    # Test suites
├── 📖 docs/                     # Documentation
├── 📁 resources/                # Static assets
└── 📋 logs/                     # Application logs
```

### 🌍 Environment Configuration

**.env** - Environment variables:
```bash
# 🗄️ Database Configuration
DATABASE_TYPE=mongodb
DATABASE_NAME=myapp_production
DATABASE_HOST=cluster0.mongodb.net
DATABASE_PORT=27017
DATABASE_USER=myapp_user
DATABASE_PASSWORD=secure_password_here

# 🔐 Security Configuration  
JWT_SECRET=your_super_secure_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here

# 🌐 Server Configuration
NODE_ENV=production
PORT=3000
API_BASE_PATH=/api/v1
ALLOWED_ORIGINS=https://myapp.com,https://www.myapp.com

# 📧 Email Service
EMAIL_SERVICE=sendgrid
EMAIL_API_KEY=your_sendgrid_api_key
EMAIL_FROM_ADDRESS=noreply@myapp.com

# 💳 Payment Services
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key

# 📁 File Storage
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
S3_BUCKET_NAME=myapp-uploads

# 📊 Monitoring & Logging
LOG_LEVEL=info
SENTRY_DSN=your_sentry_dsn_here
```

**server.js** - Application bootstrap:
```javascript
/*jslint node: true*/
'use strict';

var beam = require('beamjs');

// 🗄️ Database configuration with environment variables
beam.database('main', {
    type: process.env.DATABASE_TYPE || 'mongodb',
    name: process.env.DATABASE_NAME || 'myapp_dev',
    host: process.env.DATABASE_HOST || 'localhost', 
    port: parseInt(process.env.DATABASE_PORT) || 27017,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD
});

// 🚀 Application configuration
beam.app(__dirname + '/src/behaviors', {
    path: process.env.API_BASE_PATH || '/api/v1',
    parser: 'json',
    port: parseInt(process.env.PORT) || 3000,
    origins: process.env.ALLOWED_ORIGINS || '*'
});
```

## 🎨 Behavior Execution Types

### 📊 **Database Type** - *Pure Data Operations*
For behaviors that only perform database operations without external integrations.

```javascript
module.exports.getUserProfile = behavior({
    name: 'getUserProfile',
    inherits: FunctionalChainBehavior,
    version: '1',
    type: 'database',  // 🗄️ Database operations only
    path: '/users/:userId/profile',
    method: 'GET',
    parameters: {
        userId: { key: 'userId', type: 'path' },
        authenticated: { key: 'authenticated', type: 'middleware' }
    },
    returns: {
        user: { key: 'user', type: 'body' },
        profile: { key: 'profile', type: 'body' }
    }
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        var { userId, authenticated } = self.parameters;
        var error = null;
        var user = null;

        self.catch(function (e) {
            return error || e;
        }).next()
         .guard(function () {
            if (!authenticated) {
                error = new Error('Unauthorized access');
                error.code = 401;
                return false;
            }
            if (!userId || isNaN(parseInt(userId))) {
                error = new Error('Invalid user ID');
                error.code = 400;
                return false;
            }
            return true;
        }).if(function () {
            return !error;
        }).entity(new User({
            readonly: true  // 🔒 Read-only database operation
        })).query(() => [
            new QueryExpression({
                fieldName: '_id',
                comparisonOperator: EQUAL,
                fieldValue: parseInt(userId)
            })
        ]).then(function (users, e) {
            if (e) {
                error = e;
                return;
            }
            if (Array.isArray(users) && users.length > 0) {
                user = users[0];
            } else {
                error = new Error('User not found');
                error.code = 404;
            }
        }).next()
         .map(function (response) {
            response.user = user;
            response.profile = user ? {
                id: user._id,
                name: user.name,
                email: user.email,
                status: user.status
            } : null;
        }).end();
    };
});
```

### 🛠️ **Database With Action Type** - *Data Manipulation*
For behaviors that perform create, update, or delete operations on the database.

```javascript
module.exports.createUser = behavior({
    name: 'createUser',
    inherits: FunctionalChainBehavior,
    version: '1',
    type: 'database_with_action',  // 🔧 Database modifications allowed
    path: '/users',
    method: 'POST',
    parameters: {
        name: { key: 'name', type: 'body' },
        email: { key: 'email', type: 'body' },
        password: { key: 'password', type: 'body' }
    },
    returns: {
        success: { key: 'success', type: 'body' },
        userId: { key: 'userId', type: 'body' }
    }
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        var { name, email, password } = self.parameters;
        var error = null;
        var user = null;
        var success = false;

        self.catch(function (e) {
            return error || e;
        }).next()
         .guard(function () {
            // 📧 Email validation
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                error = new Error('Valid email is required');
                error.code = 400;
                return false;
            }
            // 📝 Name validation
            if (!name || typeof name !== 'string' || name.length < 2) {
                error = new Error('Name must be at least 2 characters');
                error.code = 400;
                return false;
            }
            // 🔒 Password validation
            if (!password || password.length < 6) {
                error = new Error('Password must be at least 6 characters');
                error.code = 400;
                return false;
            }
            return true;
        }).if(function () {
            return !error;
        }).entity(new User()).insert(() => ({
            _id: new Date().getTime(),
            name: name,
            email: email,
            password: password,  // 🔐 Auto-hashed by mongoose plugin
            status: 'active',
            credits: 100,
            subscription: 'free'
        })).then(function (users, e) {
            if (e) {
                error = e;
                return;
            }
            if (Array.isArray(users) && users.length > 0) {
                user = users[0];
                success = true;
            } else {
                error = new Error('Failed to create user');
                error.code = 500;
            }
        }).next()
         .async(function (next, models) {
            if (!error && user) {
                models([user]).save(function (e, savedUsers) {
                    if (e) {
                        error = e;
                        success = false;
                    } else {
                        user = Array.isArray(savedUsers) && savedUsers[0];
                    }
                    next();
                });
            } else {
                next();
            }
        }).map(function (response) {
            response.success = success;
            response.userId = user ? user._id : null;
        }).end();
    };
});
```

### 🌐 **Integration Type** - *External Service Communication*
For behaviors that primarily interact with external services for data retrieval.

```javascript
module.exports.getWeatherData = behavior({
    name: 'getWeatherData',
    inherits: FunctionalChainBehavior,
    version: '1',
    type: 'integration',  // 🌐 External service integration
    path: '/weather/:city',
    method: 'GET',
    parameters: {
        city: { key: 'city', type: 'path' },
        units: { key: 'units', type: 'query' }
    },
    returns: {
        weather: { key: 'weather', type: 'body' },
        forecast: { key: 'forecast', type: 'body' }
    }
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        var { city, units } = self.parameters;
        var error = null;
        var weatherData = null;
        var forecastData = null;

        self.catch(function (e) {
            return error || e;
        }).next()
         .guard(function () {
            if (!city || typeof city !== 'string' || city.length < 2) {
                error = new Error('Valid city name is required');
                error.code = 400;
                return false;
            }
            if (units && !['metric', 'imperial', 'kelvin'].includes(units)) {
                error = new Error('Invalid units. Use: metric, imperial, or kelvin');
                error.code = 400;
                return false;
            }
            return true;
        }).if(function () {
            return !error;
        }).service(function () {
            var WeatherService_ENDPOINT = new WeatherService();
            return new WeatherService_ENDPOINT();
        }).authenticate([
            new ServiceParameter({
                key: 'client',
                value: weatherServiceClient,
                type: DATA
            }),
            new ServiceParameter({
                key: 'apiKey',
                value: process.env.WEATHER_API_KEY,
                type: DATA
            })
        ]).then(function (clientId, er) {
            if (er) {
                error = er;
                return;
            }
            weatherServiceClient = clientId;
        }).next()
         .if(function () {
            return !error && weatherServiceClient;
        }).service(function () {
            var WeatherService_ENDPOINT = new WeatherService();
            return new WeatherService_ENDPOINT();
        }).request(() => [
            new ServiceParameter({
                key: 'client',
                value: weatherServiceClient,
                type: DATA
            }),
            new ServiceParameter({
                key: 'city',
                value: city,
                type: DATA
            }),
            new ServiceParameter({
                key: 'units',
                value: units || 'metric',
                type: DATA
            }),
            new ServiceParameter({
                key: 'method',
                value: 'getCurrentWeather',
                type: OPTION
            })
        ]).then(function (result, er) {
            if (er) {
                error = er;
                return;
            }
            if (result && result.success) {
                weatherData = result.current;
                forecastData = result.forecast;
            } else {
                error = new Error('Weather service unavailable');
                error.code = 503;
            }
        }).next()
         .map(function (response) {
            response.weather = weatherData;
            response.forecast = forecastData;
        }).end();
    };
});
```

### ⚡ **Integration With Action Type** - *Service Integration with Data Persistence*
For behaviors that integrate with external services AND perform database operations.

```javascript
module.exports.processPayment = behavior({
    name: 'processPayment',
    inherits: FunctionalChainBehavior,
    version: '1',
    type: 'integration_with_action',  // 🔄 External + Database operations
    path: '/payments/process',
    method: 'POST',
    queue: function (_, parameters) {
        return parameters.token;  // 🚦 Queue by user token
    },
    parameters: {
        orderId: { key: 'orderId', type: 'body' },
        paymentMethod: { key: 'paymentMethod', type: 'body' },
        amount: { key: 'amount', type: 'body' },
        token: { key: 'X-Access-Token', type: 'header' },
        authenticated: { key: 'authenticated', type: 'middleware' },
        user: { key: 'user', type: 'middleware' }
    },
    returns: {
        success: { key: 'success', type: 'body' },
        transactionId: { key: 'transactionId', type: 'body' },
        paymentStatus: { key: 'paymentStatus', type: 'body' }
    }
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        var {
            orderId, paymentMethod, amount,
            authenticated, user
        } = self.parameters;
        var error = null;
        var paymentResult = null;
        var transaction = null;
        var success = false;

        self.catch(function (e) {
            return error || e;
        }).next()
         .guard(function () {
            if (!authenticated) {
                error = new Error('Unauthorized access');
                error.code = 401;
                return false;
            }
            if (!orderId || isNaN(parseInt(orderId))) {
                error = new Error('Invalid order ID');
                error.code = 400;
                return false;
            }
            if (!amount || isNaN(parseFloat(amount)) || amount <= 0) {
                error = new Error('Invalid amount');
                error.code = 400;
                return false;
            }
            if (!paymentMethod || typeof paymentMethod !== 'object') {
                error = new Error('Invalid payment method');
                error.code = 400;
                return false;
            }
            return true;
        }).if(function () {
            return !error;
        }).service(function () {
            var StripeService_ENDPOINT = new StripePaymentService();
            return new StripeService_ENDPOINT();
        }).authenticate([
            new ServiceParameter({
                key: 'client',
                value: stripeServiceClient,
                type: DATA
            })
        ]).then(function (clientId, er) {
            if (er) {
                error = er;
                return;
            }
            stripeServiceClient = clientId;
        }).next()
         .if(function () {
            return !error && stripeServiceClient;
        }).service(function () {
            var StripeService_ENDPOINT = new StripePaymentService();
            return new StripeService_ENDPOINT();
        }).request(() => [
            new ServiceParameter({
                key: 'client',
                value: stripeServiceClient,
                type: DATA
            }),
            new ServiceParameter({
                key: 'amount',
                value: amount,
                type: DATA
            }),
            new ServiceParameter({
                key: 'currency',
                value: 'usd',
                type: DATA
            }),
            new ServiceParameter({
                key: 'paymentMethod',
                value: paymentMethod,
                type: DATA
            }),
            new ServiceParameter({
                key: 'method',
                value: 'processPayment',
                type: OPTION
            })
        ]).then(function (result, er) {
            if (er) {
                error = er;
                return;
            }
            if (result && result.success) {
                paymentResult = result;
                success = true;
            } else {
                error = new Error('Payment processing failed');
                error.code = 402;
            }
        }).next()
         .if(function () {
            return !error && paymentResult;
        }).entity(new Transaction()).insert(() => ({
            _id: new Date().getTime(),
            userId: user._id,
            orderId: parseInt(orderId),
            amount: amount,
            type: 'payment',
            status: paymentResult.status,
            transactionId: paymentResult.transactionId,
            paymentMethod: paymentMethod.type,
            gatewayResponse: {
                request: {
                    headers: {},
                    body: paymentMethod
                },
                response: {
                    headers: {},
                    body: paymentResult
                }
            }
        })).then(function (transactions, e) {
            if (e) {
                error = e;
                return;
            }
            if (Array.isArray(transactions) && transactions.length > 0) {
                transaction = transactions[0];
            } else {
                error = new Error('Failed to save transaction');
                error.code = 500;
            }
        }).next()
         .async(function (next, models) {
            if (!error && transaction) {
                models([transaction]).save(function (e, savedTransactions) {
                    if (e) {
                        error = e;
                        success = false;
                    } else {
                        transaction = Array.isArray(savedTransactions) && savedTransactions[0];
                    }
                    next();
                });
            } else {
                next();
            }
        }).map(function (response) {
            response.success = success;
            response.transactionId = transaction ? transaction._id : null;
            response.paymentStatus = paymentResult ? paymentResult.status : 'failed';
        }).end();
    };
});
```

---

## 🎛️ Behavior Configuration Options

### 📊 **Core Behavior Properties**

```javascript
module.exports.exampleBehavior = behavior({
    // 🏷️ Required: Unique behavior identifier
    name: 'exampleBehavior',
    
    // 🧬 Inheritance: Extend existing behavior patterns
    inherits: FunctionalChainBehavior,
    
    // 📈 Version control for API versioning
    version: '1',
    
    // 🎯 Execution type determines available operations
    type: 'integration_with_action',
    
    // 🛣️ HTTP routing configuration
    path: '/api/example/:id',
    method: 'POST',
    
    // 🚦 Request queuing for performance optimization
    queue: function (_, parameters) {
        return parameters.userId;  // Queue by user
    },
    
    // 📡 Real-time events for WebSocket notifications
    events: [function (_, parameters) {
        var { user, authenticated } = parameters;
        if (!authenticated) return;
        return { userId: user._id };
    }],
    
    // 📥 Input parameter definitions
    parameters: {
        id: { key: 'id', type: 'path' },
        data: { key: 'data', type: 'body' },
        token: { key: 'X-Access-Token', type: 'header' },
        filter: { key: 'filter', type: 'query' },
        authenticated: { key: 'authenticated', type: 'middleware' },
        user: { key: 'user', type: 'middleware' }
    },
    
    // 📤 Response structure definition
    returns: {
        success: { key: 'success', type: 'body' },
        data: { key: 'data', type: 'body' },
        'X-Rate-Limit': { key: 'rateLimit', type: 'header' }
    },
    
    // 🚫 Authentication bypass for specific routes
    unless: ['health', 'status'],
    
    // 🔌 Advanced request/response handling
    plugin: responder('json'),
    plugins: [
        validator('strict'),
        compressor('gzip'),
        rateLimit({ max: 100, window: '15m' })
    ]
}, function (init) {
    // Behavior implementation
});
```

## 🎓 Learning Path & Best Practices

### 🌟 BeamJS Development Principles

#### **1. 🎯 Behavior-First Thinking**
- Every business operation should be a behavior
- Behaviors should be atomic and focused
- Complex operations should compose simpler behaviors

#### **2. 🔒 Security by Default**
- Always validate inputs in guard operations
- Use policies for authentication and authorization  
- Never expose sensitive data in responses
- Implement rate limiting and request queuing

#### **3. 📊 Data-Driven Architecture**
- Use proper query expressions with logical operators
- Implement pagination for large datasets
- Leverage database-agnostic model definitions
- Always handle database errors gracefully

#### **4. 🔧 Service Integration Excellence**
- Document external API limitations and corner cases
- Implement proper error handling for service failures
- Use client session management for service authentication
- Handle rate limiting and timeout scenarios

#### **5. ⚡ Performance Consciousness**
- Use readonly queries when data won't be modified
- Implement proper field selection to minimize data transfer
- Leverage caching for frequently accessed data
- Monitor and log slow operations

### 🛣️ Development Roadmap

#### **📚 Beginner Level (Days 1-2)**
```javascript
// ✅ Master basic behavior structure
module.exports.simpleUser = behavior({
    name: 'simpleUser',
    version: '1',
    type: 'database',
    path: '/users/:id',
    method: 'GET'
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        var error = null;
        var user = null;

        self.catch(function (e) {
            return error || e;
        }).next()
         .guard(function () {
            // 🔍 Learn input validation
            if (!self.parameters.id) {
                error = new Error('User ID is required');
                error.code = 400;
                return false;
            }
            return true;
        }).if(function () {
            return !error;
        }).entity(new User({
            readonly: true
        })).query(() => [
            new QueryExpression({
                fieldName: '_id',
                comparisonOperator: EQUAL,
                fieldValue: self.parameters.id
            })
        ]).then(function (users, e) {
            if (e) error = e;
            if (users && users.length > 0) {
                user = users[0];
            }
        }).next()
         .map(function (response) {
            response.user = user;
        }).end();
    };
});
```

**Learning Objectives:**
- ✅ Understand behavior structure and naming conventions
- ✅ Master basic error handling with catch and guard
- ✅ Learn simple database queries with QueryExpression
- ✅ Practice response mapping patterns

#### **🔧 Intermediate Level (Days 3-6)**
```javascript
// 🔗 Master behavior composition and service integration
module.exports.processUserOrder = behavior({
    name: 'processUserOrder',
    version: '1',
    type: 'integration_with_action',
    path: '/users/:userId/orders',
    method: 'POST',
    queue: function (_, parameters) {
        return parameters.token; // 🚦 Request queuing
    }
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        var { userId, items, paymentMethod, authenticated } = self.parameters;
        var error = null;
        var order = null;
        var paymentResult = null;

        self.catch(function (e) {
            return error || e;
        }).next()
         .guard(function () {
            // 🛡️ Advanced validation patterns
            if (!authenticated) {
                error = new Error('Unauthorized access');
                error.code = 401;
                return false;
            }
            
            if (!Array.isArray(items) || items.length === 0) {
                error = new Error('Order must contain at least one item');
                error.code = 400;
                return false;
            }
            
            // 💰 Business rule validation
            var totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            if (totalAmount < 0.01) {
                error = new Error('Order total must be greater than $0.01');
                error.code = 400;
                return false;
            }
            
            return true;
        }).if(function () {
            return !error && items.length > 0;
        }).service(function () {
            // 🔌 Service integration
            var PaymentService_ENDPOINT = new PaymentService();
            return new PaymentService_ENDPOINT();
        }).authenticate([
            new ServiceParameter({
                key: 'client',
                value: paymentServiceClient,
                type: DATA
            }),
            new ServiceParameter({
                key: 'apiKey',
                value: process.env.PAYMENT_API_KEY,
                type: DATA
            })
        ]).then(function (clientId, er) {
            if (er) error = er;
            if (clientId) paymentServiceClient = clientId;
        }).next()
         .if(function () {
            return !error && paymentServiceClient;
        }).service(function () {
            var PaymentService_ENDPOINT = new PaymentService();
            return new PaymentService_ENDPOINT();
        }).request(() => [
            new ServiceParameter({
                key: 'client',
                value: paymentServiceClient,
                type: DATA
            }),
            new ServiceParameter({
                key: 'amount',
                value: totalAmount,
                type: DATA
            }),
            new ServiceParameter({
                key: 'paymentMethod',
                value: paymentMethod,
                type: DATA
            }),
            new ServiceParameter({
                key: 'method',
                value: 'processPayment',
                type: OPTION
            })
        ]).then(function (result, er) {
            if (er) error = er;
            if (result && result.success) {
                paymentResult = result;
            }
        }).next()
         .if(function () {
            return !error && paymentResult;
        }).entity(new Order()).insert(() => ({
            _id: new Date().getTime(),
            userId: parseInt(userId),
            items: items,
            totalAmount: totalAmount,
            paymentId: paymentResult.transactionId,
            status: 'confirmed',
            orderDate: new Date()
        })).then(function (orders, e) {
            if (e) error = e;
            if (orders && orders.length > 0) {
                order = orders[0];
            }
        }).next()
         .async(function (next, models) {
            // 💾 Save operations
            if (!error && order) {
                models([order]).save(function (e, savedOrders) {
                    if (e) {
                        error = e;
                    } else {
                        order = Array.isArray(savedOrders) && savedOrders[0];
                    }
                    next();
                });
            } else {
                next();
            }
        }).map(function (response) {
            response.success = !error;
            response.order = order;
            response.payment = paymentResult;
        }).end();
    };
});
```

**Learning Objectives:**
- ✅ Master service integration patterns with authentication
- ✅ Understand complex validation and business rules
- ✅ Learn database insertion and model saving
- ✅ Practice async operations and error handling

#### **🎓 Advanced Level (Days 7-12)**
```javascript
// 🚀 Advanced patterns: Real-time events, complex workflows, monitoring
module.exports.advancedWorkflowManager = behavior({
    name: 'advancedWorkflowManager',
    version: '1',
    type: 'integration_with_action',
    path: '/workflows/:workflowId/execute',
    method: 'POST',
    queue: function (_, parameters) {
        return parameters.workflowId + ':' + parameters.token;
    },
    events: [function (_, parameters) {
        // 📡 Real-time event targeting
        return { 
            workflowId: parameters.workflowId,
            userId: parameters.user?._id 
        };
    }]
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        var startTime = process.hrtime.bigint();
        var { workflowId, steps, authenticated, user } = self.parameters;
        var error = null;
        var workflowResult = null;
        var performanceMetrics = [];

        self.catch(function (e) {
            return error || e;
        }).next()
         .guard(function () {
            // 🔒 Advanced security validation
            if (!authenticated) {
                error = new Error('Unauthorized access');
                error.code = 401;
                return false;
            }
            
            if (!user || user.role !== 'admin') {
                error = new Error('Administrator role required');
                error.code = 403;
                return false;
            }
            
            if (!workflowId || isNaN(parseInt(workflowId))) {
                error = new Error('Invalid workflow ID');
                error.code = 400;
                return false;
            }
            
            if (!Array.isArray(steps) || steps.length === 0) {
                error = new Error('Workflow must contain at least one step');
                error.code = 400;
                return false;
            }
            
            // 📊 Validate step structure
            var invalidStep = steps.find(function (step) {
                return !step.type || !step.config;
            });
            if (invalidStep) {
                error = new Error('Invalid step configuration detected');
                error.code = 400;
                return false;
            }
            
            return true;
        }).async(function (next) {
            if (!error) {
                // 🔄 Complex workflow execution with monitoring
                var executeWorkflowSteps = function () {
                    return steps.reduce(function (promise, step, index) {
                        return promise.then(function (previousResults) {
                            var stepStartTime = process.hrtime.bigint();
                            
                            return new Promise(function (resolve, reject) {
                                // 📊 Step execution with different types
                                var stepBehavior;
                                switch (step.type) {
                                    case 'validation':
                                        stepBehavior = new ValidateData({
                                            type: 1,
                                            priority: 0,
                                            inputObjects: {
                                                data: step.config.data,
                                                rules: step.config.rules,
                                                authenticated: authenticated
                                            }
                                        });
                                        break;
                                    case 'transformation':
                                        stepBehavior = new TransformData({
                                            type: 1,
                                            priority: 0,
                                            inputObjects: {
                                                input: previousResults[index - 1] || step.config.input,
                                                transformations: step.config.transformations,
                                                authenticated: authenticated
                                            }
                                        });
                                        break;
                                    case 'integration':
                                        stepBehavior = new IntegrateWithService({
                                            type: 1,
                                            priority: 0,
                                            inputObjects: {
                                                service: step.config.service,
                                                endpoint: step.config.endpoint,
                                                data: previousResults[index - 1] || step.config.data,
                                                authenticated: authenticated
                                            }
                                        });
                                        break;
                                    default:
                                        reject(new Error(`Unknown step type: ${step.type}`));
                                        return;
                                }
                                
                                self.run(stepBehavior, function (res, e) {
                                    var stepEndTime = process.hrtime.bigint();
                                    var stepDuration = Number(stepEndTime - stepStartTime) / 1000000;
                                    
                                    // 📈 Performance tracking
                                    performanceMetrics.push({
                                        stepIndex: index,
                                        stepType: step.type,
                                        duration: stepDuration,
                                        success: !e,
                                        timestamp: new Date()
                                    });
                                    
                                    if (e) {
                                        reject(e);
                                    } else {
                                        resolve([...previousResults, res]);
                                    }
                                });
                            });
                        });
                    }, Promise.resolve([]));
                };
                
                executeWorkflowSteps()
                    .then(function (results) {
                        workflowResult = {
                            workflowId: parseInt(workflowId),
                            status: 'completed',
                            results: results,
                            executedSteps: steps.length,
                            performanceMetrics: performanceMetrics,
                            completedAt: new Date()
                        };
                        
                        // 🚀 Trigger real-time event
                        self.trigger({ 
                            workflowId: parseInt(workflowId),
                            userId: user._id 
                        }, {
                            type: 'workflow_completed',
                            workflowId: parseInt(workflowId),
                            duration: performanceMetrics.reduce((sum, m) => sum + m.duration, 0),
                            timestamp: new Date().toISOString()
                        });
                        
                        next();
                    })
                    .catch(function (workflowError) {
                        error = workflowError;
                        
                        // 🚨 Trigger error event
                        self.trigger({ 
                            workflowId: parseInt(workflowId),
                            userId: user._id 
                        }, {
                            type: 'workflow_failed',
                            workflowId: parseInt(workflowId),
                            error: error.message,
                            timestamp: new Date().toISOString()
                        });
                        
                        next();
                    });
            } else {
                next();
            }
        }).map(function (response) {
            var endTime = process.hrtime.bigint();
            var totalDuration = Number(endTime - startTime) / 1000000;
            
            response.success = !error;
            response.workflow = workflowResult;
            response.performance = {
                totalDuration: totalDuration,
                stepsExecuted: performanceMetrics.length,
                averageStepDuration: performanceMetrics.length > 0 
                    ? performanceMetrics.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.length 
                    : 0
            };
            
            // 📊 Log performance warning for slow workflows
            if (totalDuration > 5000) {
                console.warn(`Slow workflow detected: ${totalDuration}ms for workflow ${workflowId}`);
            }
        }).end();
    };
});
```

**Learning Objectives:**
- ✅ Master complex async workflows with multiple behaviors
- ✅ Implement real-time events and WebSocket integration
- ✅ Add performance monitoring and metrics collection
- ✅ Practice advanced error handling and recovery patterns
- ✅ Understand queueing and caching strategies and optimization techniques

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