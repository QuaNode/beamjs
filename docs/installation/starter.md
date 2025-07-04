## 🚀 Quick Start Guide

**Build secure, scalable APIs in minutes with behavior-first development**

### ⚡ Quick Setup

```bash
# 1. Create new project
mkdir my-beamjs-app && cd my-beamjs-app

# 2. Initialize & install
npm init -y
npm install beamjs mongoose-timestamp mongoose-hashed-property mongoose-secret

# 3. Create server.js
```

```javascript
// server.js
/*jslint node: true*/
'use strict';

var beam = require('beamjs');

beam.database('main', {
    type: 'mongodb',
    name: 'myapp'
}).app(__dirname + '/src/behaviours', {
    path: '/api/v1',
    parser: 'json',
    port: 8282,
    origins: '*'
});
```

### 📁 Project Structure

```
my-beamjs-app/
├── server.js
├── src/
│   ├── behaviours/
│   │   ├── index.js          # Route registry
│   │   ├── policies/         # Middleware (auth, etc.)
│   │   ├── user/            # Main routes
│   │   ├── internals/       # Business logic
│   │   └── jobs/            # Scheduled tasks
│   ├── models/              # Database schemas
│   ├── services/            # External APIs
│   └── helpers/             # Utilities
```

### 🎯 Your First Model

```javascript
// src/models/user/index.js
/*jslint node: true*/
'use strict';

var TimestampsPlugin = require('mongoose-timestamp');
var HashedPropertyPlugin = require('mongoose-hashed-property');
var SecretPlugin = require('mongoose-secret');
var backend = require('beamjs').backend();
var model = backend.model();

module.exports.user = model({
    name: 'user',
    features: {
        exclude: ['hashed_password', 'secret']
    }
}, {
    _id: Number,
    firstName: String,
    lastName: String,
    email: String,
    mobile: String,
    status: String
}, [TimestampsPlugin, HashedPropertyPlugin, SecretPlugin]);
```

### 🔒 Authentication Policy

```javascript
// src/behaviours/policies/authentication/index.js
/*jslint node: true*/
'use strict';

var jwt = require('jsonwebtoken');
var backend = require('beamjs').backend();
var behaviour = backend.behaviour();
var {
    ComparisonOperators,
    QueryExpression
} = require('beamjs');
var {
    EQUAL
} = ComparisonOperators;
var {
    FunctionalChainBehaviour
} = require('functional-chain-behaviour')();
var {
    user: User
} = require('../../../models/user');

module.exports.authenticate = behaviour({

    name: 'authenticate',
    inherits: FunctionalChainBehaviour,
    version: '1',
    type: 'database',
    path: '/',
    parameters: {
        token: {
            key: 'X-Access-Token',
            type: 'header'
        }
    },
    returns: {
        authenticated: {
            type: 'middleware'
        },
        user: {
            type: 'middleware'
        }
    },
    unless: ['login', 'register']
}, function (init) {

    return function () {
        var self = init.apply(this, arguments).self();
        var { token } = self.parameters;
        var error = null;
        var user = null;
        var authenticated = false;
        var decoded = jwt.decode(token);

        self.catch(function (e) {
            return error || e;
        }).next().guard(function () {
            if (!token) {
                error = new Error('Access token is required');
                error.code = 401;
                return false;
            }
            if (!decoded) {
                error = new Error('Invalid token format');
                error.code = 401;
                return false;
            }
            return true;
        }).if(function () {
            return !error && decoded && decoded.jwtid;
        }).entity(new User({
            exclude: undefined
        })).query([
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
            if (!Array.isArray(users) || users.length === 0) {
                error = new Error('User not found');
                error.code = 401;
                return;
            }
            user = users[0];
        }).next().async(function (next) {
            if (!error && user) {
                jwt.verify(token, user.secret, {
                    audience: user.email
                }, function (verifyError) {
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

### 🔑 Login Behavior

```javascript
// src/behaviours/user/auth/login/index.js
/*jslint node: true*/
'use strict';

var jwt = require('jsonwebtoken');
var backend = require('beamjs').backend();
var behaviour = backend.behaviour();
var {
    ComparisonOperators,
    QueryExpression
} = require('beamjs');
var {
    EQUAL
} = ComparisonOperators;
var {
    FunctionalChainBehaviour
} = require('functional-chain-behaviour')();
var {
    user: User
} = require('../../../../models/user');

module.exports.login = behaviour({

    name: 'login',
    inherits: FunctionalChainBehaviour,
    version: '1',
    type: 'database',
    path: '/auth/login',
    method: 'POST',
    parameters: {
        email: {
            key: 'email',
            type: 'body'
        },
        password: {
            key: 'password',
            type: 'body'
        }
    },
    returns: {
        success: {
            key: 'success',
            type: 'body'
        },
        'X-Access-Token': {
            key: 'token',
            type: 'header',
            purpose: ['constant', {
                as: 'parameter',
                unless: ['login', 'register']
            }]
        },
        user: {
            key: 'user',
            type: 'body'
        }
    }
}, function (init) {

    return function () {
        var self = init.apply(this, arguments).self();
        var { email, password } = self.parameters;
        var error = null;
        var success = false;
        var token = null;
        var user = null;

        self.catch(function (e) {
            return error || e;
        }).next().guard(function () {
            if (typeof email !== 'string' || email.length === 0) {
                error = new Error('Invalid email');
                error.code = 400;
                return false;
            }
            if (typeof password !== 'string' || password.length === 0) {
                error = new Error('Invalid password');
                error.code = 400;
                return false;
            }
            return true;
        }).if(function () {
            return !error && email && password;
        }).entity(new User({
            exclude: undefined
        })).query([
            new QueryExpression({
                fieldName: 'email',
                comparisonOperator: EQUAL,
                fieldValue: email
            })
        ]).then(function (users, e) {
            if (e) {
                error = e;
                return;
            }
            if (!Array.isArray(users) || users.length === 0) {
                error = new Error('Invalid email or password');
                error.code = 401;
                return;
            }
            user = users[0];
            if (!user.verifyPassword(password)) {
                error = new Error('Invalid email or password');
                error.code = 401;
                return;
            }
        }).next().async(function (next, models) {
            if (!error && user) {
                var tokenPayload = {
                    jwtid: user._id,
                    iat: Math.floor(Date.now() / 1000),
                    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
                    aud: user.email
                };

                jwt.sign(tokenPayload, user.secret, function (signError, signedToken) {
                    if (signError) {
                        error = new Error('Token generation failed');
                        error.code = 500;
                        next();
                        return;
                    }
                    token = signedToken;
                    success = true;
                    next();
                });
            } else {
                next();
            }
        }).map(function (response) {
            if (error) {
                response.success = false;
                response.error = error.message;
                response.code = error.code || 500;
            } else {
                response.success = success;
                response.token = token;
                response.user = {
                    _id: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email
                };
            }
        }).end();
    };
});
```

### 📝 Register Behavior

```javascript
// src/behaviours/user/auth/register/index.js
/*jslint node: true*/
'use strict';

var backend = require('beamjs').backend();
var behaviour = backend.behaviour();
var {
    ComparisonOperators,
    QueryExpression
} = require('beamjs');
var {
    EQUAL
} = ComparisonOperators;
var {
    FunctionalChainBehaviour
} = require('functional-chain-behaviour')();
var {
    user: User
} = require('../../../../models/user');

module.exports.register = behaviour({

    name: 'register',
    inherits: FunctionalChainBehaviour,
    version: '1',
    type: 'database_with_action',
    path: '/auth/register',
    method: 'POST',
    parameters: {
        firstName: {
            key: 'firstName',
            type: 'body'
        },
        lastName: {
            key: 'lastName',
            type: 'body'
        },
        email: {
            key: 'email',
            type: 'body'
        },
        mobile: {
            key: 'mobile',
            type: 'body'
        },
        password: {
            key: 'password',
            type: 'body'
        }
    },
    returns: {
        success: {
            key: 'success',
            type: 'body'
        },
        user: {
            key: 'user',
            type: 'body'
        }
    }
}, function (init) {

    return function () {
        var self = init.apply(this, arguments).self();
        var { firstName, lastName, email, mobile, password } = self.parameters;
        var error = null;
        var success = false;
        var user = null;

        self.catch(function (e) {
            return error || e;
        }).next().guard(function () {
            if (typeof firstName !== 'string' || firstName.length === 0) {
                error = new Error('First name is required');
                error.code = 400;
                return false;
            }
            if (typeof lastName !== 'string' || lastName.length === 0) {
                error = new Error('Last name is required');
                error.code = 400;
                return false;
            }
            if (typeof email !== 'string' || !email.includes('@')) {
                error = new Error('Valid email is required');
                error.code = 400;
                return false;
            }
            if (typeof password !== 'string' || password.length < 6) {
                error = new Error('Password must be at least 6 characters');
                error.code = 400;
                return false;
            }
            return true;
        }).if(function () {
            return !error && email;
        }).entity(new User({
            readonly: true
        })).query([
            new QueryExpression({
                fieldName: 'email',
                comparisonOperator: EQUAL,
                fieldValue: email
            })
        ]).then(function (users, e) {
            if (e) {
                error = e;
                return;
            }
            if (Array.isArray(users) && users.length > 0) {
                error = new Error('Email already registered');
                error.code = 409;
                return;
            }
        }).next().if(function () {
            return !error;
        }).entity(new User()).insert(() => ({
            _id: new Date().getTime(),
            firstName: firstName,
            lastName: lastName,
            email: email,
            mobile: mobile || '',
            password: password,
            status: 'active'
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
        }).next().async(function (next, models) {
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
            if (error) {
                response.success = false;
                response.error = error.message;
                response.code = error.code || 500;
            } else {
                response.success = success;
                response.user = {
                    _id: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email
                };
            }
        }).end();
    };
});
```

### 🔌 Route Registry

```javascript
// src/behaviours/index.js
/*jslint node: true*/
'use strict';

// Authentication Policy (always first)
require('./policies/authentication');

// Auth Routes
require('./user/auth/login');
require('./user/auth/register');
require('./user/auth/logout');

// User Routes
require('./user/profile/get');
require('./user/profile/update');
```

### 🎯 CRUD Operations

```javascript
// src/behaviours/user/profile/get/index.js
/*jslint node: true*/
'use strict';

var backend = require('beamjs').backend();
var behaviour = backend.behaviour();
var {
    FunctionalChainBehaviour
} = require('functional-chain-behaviour')();

module.exports.getProfile = behaviour({

    name: 'getProfile',
    inherits: FunctionalChainBehaviour,
    version: '1',
    type: 'database',
    path: '/user/profile',
    method: 'GET',
    parameters: {
        authenticated: {
            key: 'authenticated',
            type: 'middleware'
        },
        user: {
            key: 'user',
            type: 'middleware'
        }
    },
    returns: {
        user: {
            key: 'user',
            type: 'body'
        }
    }
}, function (init) {

    return function () {
        var self = init.apply(this, arguments).self();
        var { authenticated, user } = self.parameters;
        var error = null;

        self.catch(function (e) {
            return error || e;
        }).next().guard(function () {
            if (!authenticated) {
                error = new Error('Unauthorized access');
                error.code = 401;
                return false;
            }
            return true;
        }).map(function (response) {
            response.user = {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                mobile: user.mobile,
                status: user.status
            };
        }).end();
    };
});
```

### 🚀 Run Your App

```bash
# Start the server
node server.js

# Test your endpoints
curl -X POST http://localhost:8282/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"John","lastName":"Doe","email":"john@example.com","password":"123456"}'

curl -X POST http://localhost:8282/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"123456"}'
```

### 🎉 What's Next?

- **Add business logic** in `src/behaviours/internals/`
- **Integrate external APIs** in `src/services/`
- **Schedule tasks** in `src/behaviours/jobs/`
- **Add real-time features** with behavior events
- **Scale with microservices** using behavior composition

### 📚 Key Concepts

| Concept | Description |
|---------|-------------|
| **Behavior** | Smart route handler with built-in auth, validation, and DB operations |
| **Guard** | Input validation and business rule checking |
| **Entity** | Database model operations (query, insert, delete) |
| **Service** | External API integrations with auto-retry and caching |
| **Pipeline** | Chain operations with `.next()` separators |

---

**🎯 Result:** Production-ready API with authentication, validation, and database operations in under 100 lines of code!

---

### Next Steps

Continue reading the documentation:

- **[Getting Started](./installation.md)**
  - [Installation](./installation.md)
  - [Starter](./starter.md)
  - [Architecture](../architecture.md)
  - [Behaviors](../behaviors.md)
- **[Usage](../usage/backend.md)**
  - [Backend](../usage/backend.md)
  - [Model](../usage/model.md)
  - [Entity](../usage/entity.md)
  - [Query](../usage/query.md)
  - [Service](../usage/service.md)
  - [Data](../usage/data.md)
  - [Behavior](../usage/behavior.md)