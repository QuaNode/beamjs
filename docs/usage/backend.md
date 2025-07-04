## BeamJS Configuration

### Overview

BeamJS provides three main configuration methods to set up your application: `beam.app()`, `beam.database()`, and `beam.storage()`. This documentation covers all options and usage patterns.

### beam.app(paths, options)

The main application configuration method that sets up your BeamJS server with behaviors, middleware, and routing.

#### Parameters

- **paths** (string | object): Path to behaviors directory or configuration object
- **options** (object): Application configuration options

#### Basic Usage

```javascript
var beam = require('beamjs');

// Simple setup
beam.app(__dirname + '/src/behaviours', {
    path: '/api/v1',
    port: 8282,
    parser: 'json'
});

// Advanced setup with proxy
beam.app({
    local: __dirname + '/src/behaviours',
    proxy: __dirname + '/proxy-config.js'
}, {
    path: '/api/v1',
    port: 8282,
    parser: 'json',
    origins: '*'
});
```

#### Options Object

##### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | string | '/' | Base API path for all routes |
| `port` | number | 80/443 | Server port (uses PORT env var if available) |
| `parser` | string\|object | 'json' | Body parser type or configuration |
| `origins` | string\|boolean | false | CORS origins configuration |

##### Security Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `https` | object | undefined | HTTPS/TLS configuration |
| `https.key` | string | undefined | Path to private key file |
| `https.cert` | string | undefined | Path to certificate file |
| `https.ca` | string | undefined | Path to CA certificate file |
| `https.domains` | object | undefined | Multi-domain SSL configuration |
| `proxy` | boolean\|string | false | Trust proxy headers |
| `maxAge` | number | undefined | CORS preflight cache duration |

##### Performance Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `operations` | object | undefined | Operation-specific configurations |
| `tenants` | object | undefined | Multi-tenant configuration |
| `schedule` | boolean | true | Enable scheduled behaviors |

##### Parser Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | string | undefined | Response format (json, xml, etc.) |
| `parserOptions` | object | undefined | Body parser specific options |

##### Static Files

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `static` | object | undefined | Static file serving configuration |
| `static.path` | string | required | Path to static files directory |
| `static.route` | string | undefined | Route prefix for static files |

##### Session Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cookie` | object | undefined | Session cookie configuration |
| `cookie.store` | object | MemoryStore | Session store instance |
| `cookie.name` | string | 'behaviours.sid' | Cookie name |
| `cookie.secret` | string | timestamp | Session secret |
| `cookie.resave` | boolean | false | Force session save |
| `cookie.saveUninitialized` | boolean | true | Save uninitialized sessions |

##### WebSocket Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `websocket` | object | undefined | Socket.IO configuration |
| `websocket.cors` | object | corsDelegate | CORS configuration for WebSocket |
| `websocket.allowEIO3` | boolean | true | Allow Engine.IO v3 clients |

#### Complete Example

```javascript
var beam = require('beamjs');

beam.database('main', {
    type: 'mongodb',
    name: 'myapp',
    uri: 'mongodb://localhost:27017/myapp'
}).app(__dirname + '/src/behaviours', {
    path: '/api/v1',
    port: 8282,
    parser: {
        format: 'json',
        limit: '50mb'
    },
    origins: process.env.NODE_ENV === 'production' ? 'https://myapp.com' : '*',
    https: {
        key: './ssl/private.key',
        cert: './ssl/certificate.crt',
        ca: './ssl/ca_bundle.crt'
    },
    static: {
        path: './resources/www',
        route: '/'
    },
    cookie: {
        secret: process.env.SESSION_SECRET,
        store: new RedisStore({
            host: 'localhost',
            port: 6379
        })
    },
    websocket: {
        cors: {
            origin: "https://myapp.com",
            credentials: true
        }
    },
    proxy: true,
    maxAge: 86400
});
```

### beam.database(key, options)

Configures database connections and ORM settings.

#### Parameters

- **key** (string): Database connection identifier
- **options** (object): Database configuration options

#### Supported Database Types

- `mongodb` - MongoDB with Mongoose ODM
- `mysql` - MySQL with Sequelize ORM
- `postgres` - PostgreSQL with Sequelize ORM
- All SQL databases supported by Sequelize

#### MongoDB Configuration

```javascript
beam.database('main', {
    type: 'mongodb',
    name: 'myapp',
    uri: 'mongodb://localhost:27017/myapp'
});
```

##### MongoDB Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | required | Must be 'mongodb' |
| `name` | string | required | Database name |
| `uri` | string | localhost | MongoDB connection string |

#### MySQL Configuration

```javascript
beam.database('main', {
    type: 'mysql',
    name: 'myapp',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'password',
    dialect: 'mysql',
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});
```

##### MySQL/PostgreSQL Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | required | 'mysql' or 'postgres' |
| `name` | string | required | Database name |
| `host` | string | 'localhost' | Database host |
| `port` | number | 3306/5432 | Database port |
| `username` | string | required | Database username |
| `password` | string | required | Database password |
| `dialect` | string | auto | SQL dialect |
| `pool` | object | undefined | Connection pool options |

#### Multiple Database Connections

```javascript
// Main application database
beam.database('main', {
    type: 'mongodb',
    name: 'myapp'
});

// Analytics database
beam.database('analytics', {
    type: 'postgres',
    name: 'analytics',
    host: 'analytics-db.company.com',
    username: 'analytics_user',
    password: process.env.ANALYTICS_DB_PASSWORD
});

// Cache database
beam.database('cache', {
    type: 'mongodb',
    name: 'cache',
    uri: 'mongodb://cache-cluster:27017/cache'
});
```

### beam.storage(key, options)

Configures file storage and resource management.

#### Parameters

- **key** (string): Storage connection identifier

#### Supported Storage Types

- `fs` - Local filesystem storage

#### Filesystem Configuration

```javascript
beam.storage('local', {
    type: 'fs'
});
```

##### Filesystem Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | required | Must be 'fs' |

#### Multiple Storage Configurations

```javascript
// Local development storage
beam.storage('local', {
    type: 'fs'
});
```

### Complete Application Setup

```javascript
var beam = require('beamjs');

// Configure database
beam.database('main', {
    type: 'mongodb',
    name: process.env.DATABASE_NAME || 'behaviours2',
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/behaviours2'
});

// Configure storage
beam.storage('local', {
    type: 'fs'
});

// Configure and start application
beam.app(__dirname + '/src/behaviours', {
    path: '/api/v1',
    port: process.env.PORT || 8282,
    parser: 'json',
    origins: process.env.CORS_ORIGINS || '*',
    static: {
        path: './resources/www',
        route: '/'
    },
    https: process.env.NODE_ENV === 'production' ? {
        key: process.env.SSL_KEY_PATH,
        cert: process.env.SSL_CERT_PATH
    } : undefined,
    proxy: process.env.NODE_ENV === 'production',
    websocket: {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:4200",
            credentials: true
        }
    }
});
```

### Best Practices

1. **Use environment variables** for sensitive configuration
2. **Separate configurations** by environment (development/production)
3. **Configure database first**, then storage, then app
4. **Use meaningful connection names** for multiple databases
5. **Enable HTTPS in production** with valid SSL certificates
6. **Configure appropriate CORS origins** for security

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