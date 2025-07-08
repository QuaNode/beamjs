## Models - Unified Data Layer Architecture

BeamJS provides a unified interface for both SQL and NoSQL databases through its model system. It abstracts the complexity of different database engines while maintaining consistency across MongoDB (via Mongoose) and SQL databases (via Sequelize).

### Key Features

- **Unified API**: Same interface for both SQL and NoSQL databases
- **Type Safety**: Automatic data type validation and conversion
- **Relationship Management**: Simplified handling of database relations
- **Plugin System**: Extensible architecture for custom functionality
- **Query Abstraction**: Database-agnostic query expressions
- **Performance Optimization**: Built-in caching and connection pooling

### Database Agnostic Design

BeamJS models are designed with database independence as a core principle. This means:
- **Consistent API**: The same model definition works across MongoDB, PostgreSQL, MySQL, and other supported databases
- **Native Performance**: Despite abstraction, models leverage native database optimizations
- **Seamless Migration**: Change database engines without rewriting application logic
- **Unified Syntax**: Single learning curve regardless of underlying database technology

### Native JavaScript Integration

Models use native JavaScript data types as the foundation for database attribute definitions:
- **String**: Text fields, IDs, enums
- **Number**: Integers, floats, counters
- **Boolean**: Flags, status indicators
- **Date**: Timestamps, scheduling
- **Object**: Nested documents, complex structures
- **Array**: Collections, lists, embedded documents

### Plugin Architecture

The plugin system allows extending model functionality through reusable components:
- **TimestampsPlugin**: Automatic createdAt/updatedAt management
- **HashedPropertyPlugin**: Secure password handling
- **SecretPlugin**: JWT secret generation and management
- **ValidationPlugin**: Advanced validation rules
- **AuditPlugin**: Change tracking and history

## Model Definition Structure

### Basic Syntax

```javascript
var backend = require('beamjs').backend();
var model = backend.model();

module.exports.modelName = model({
    name: 'modelName',
    constraints: { /* Constraints as defined in in Sequelize and Mongoose*/ },
    features: { /* Optional built-in features used when executing a query*/ },
    query: { /* Optional query expressions merged when executing a query*/ }
}, {
    // Schema definition
    fieldName: DataType,
    relationField: RelatedModel
}, [
    // Plugins array
    Plugin1, Plugin2
]);
```

### Schema Definition Patterns

#### Primitive Types
```javascript
{
    _id: Number,                    // Primary key
    name: String,                   // Text field
    age: Number,                    // Numeric field
    isActive: Boolean,              // Boolean flag
    birthDate: Date,                // Date field
    metadata: {}                    // Schemaless
}
```

#### Complex Nested Structures
```javascript
{
    profile: {
        firstName: String,
        lastName: String,
        preferences: {
            theme: String,
            notifications: Boolean,
            language: String
        }
    },
    addresses: [{
        _id: Number,                // Explicit ID for nested arrays
        type: String,               // home, work, billing
        street: String,
        city: String,
        coordinates: {
            latitude: Number,
            longitude: Number
        }
    }]
}
```

### Supported Data Types

#### JavaScript Native Types
- `String` - Text data
- `Number` - Numeric values (integers and floats)
- `Boolean` - True/false values
- `Date` - Date and time objects
- `Buffer` - Binary data (MongoDB only)

#### Special Types
- `Map` - Key-value pairs with typed values
- Custom types via generator functions and classes
- Array types using `[DataType]` syntax

### Example Model Definition

```javascript
// models/user/index.js
var TimestampsPlugin = require('mongoose-timestamp');
var backend = require('beamjs').backend();
var model = backend.model();

module.exports.user = model({
    name: 'user',
    constraints: {
        freezeTableName: true,  // SQL: Prevents table name pluralization
        id: true,               // SQL: Auto-increment primary key
        email: { unique: true } // SQL: Unique values, MongoDB: Unique index
    },
    features: {
        exclude: ['password', 'secret'] // Default excluded fields
    }
}, {
    _id: Number,
    name: String,
    email: String,
    status: String,
    profile: { // MongoDB
        bio: String,
        avatar: String,
        preferences: {
            language: String,
            notifications: Boolean
        }
    },
    posts: [LazyPost], // SQL: Lazy-loaded relation
    createdAt: Date
}, [TimestampsPlugin]);
```

#### Reserved Word Handling
When using reserved database words as field names, use the object notation:
```javascript
{
    name: String,
    type: {                         // MongoDB: 'type' is reserved
        type: String                // Use this pattern
    },
    status: String
}
```

## Constraints System

Constraints provide database-specific configuration for SQL and NoSQL databases.

### SQL Constraints

```javascript
module.exports.user = model({
    name: 'user',
    constraints: {
        // Table configuration
        freezeTableName: true,      // Prevent automatic pluralization
        
        // Primary key configuration
        id: true,                   // Auto-increment integer primary key
        
        // Field constraints
        email: {
            unique: true,           // Unique constraint
            allowNull: false        // NOT NULL constraint
            ....                    
            // It accepts all options available when defining attribute or relation 
            // in Sequelize or Mongoose
        }
    }
}, {
    // Schema definition
}, []);
```

### Unified Features And Query

```javascript
module.exports.user = model({
    name: 'user',
    features: {
        // Field exclusion (security)
        exclude: ['password', 'secret', 'tokens'],
        include: [...],
        
        // MongoDB: Return distinct values of this field
        distinct: 'fieldName',
            
        // Array of field options to sort this model by default
        sort: [{ order: 'desc', by: 'createdAt' }],

        // MongoDB: Return records with populated refs
        populate: [{ 
          path: "profile.preferences"
        }],
        
        // To activate built-in caching
        cache: true,

        // Make the model readonly (security)
        readonly: true

        // MongoDB: To activate map-reduce pipeline by default on this model
        mapReduce: { ... }

        // MongoDB: To activate aggregation pipeline by default on this model
        aggregate: { ... }

        // SQL: To define default having, selecting, and grouping in SELECT statements
        having: { ... },
        including: { ... },
        group: { ... },

        // SQL: To allow nested SELECT statements
        subFilter: true

        // Paginate this model by default
        paginate: true,
        limit: 100
    },
    // Default query merged with later queries
    query: [/* Array of query expressions*/]
}, {
    // Schema definition
}, []);
```

---

## Relationship Management

### SQL Database Relationships
For SQL databases, BeamJS provides foreign key and relationship management:

```javascript
var LazyDepartment = model('department');    // Lazy loading reference
var LazyUser = model('user');                // Prevents circular dependencies

module.exports.team = model({
    name: 'team',
    constraints: {
        freezeTableName: true,
        id: true,
        department: {
            foreignKey: 'department'            // Foreign key relationship
        },
        manager: {
            foreignKey: 'manager'               // Self-referential relationship
        }
    }
}, {
    name: String,
    department: LazyDepartment,                 // Belongs to relationship
    manager: LazyUser,                          // Belongs to relationship
    members: [LazyUser],                        // Has many relationship
    budget: Number,
    isActive: Boolean
}, [TimestampsPlugin]);
```

#### One-to-One Relationship
```javascript
// User model
module.exports.user = model({
    name: 'user',
    constraints: {
        profile: {
            foreignKey: 'userId'
        }
    }
}, {
    email: String,
    profile: LazyProfile // Lazy-loaded relation
});

// Usage
user.profile.get()(function(profile, error) {
    if (!error) {
        console.log('Profile loaded:', profile.bio);
    }
});

// Setting relation
user.profile.set(newProfile)(function(result, error) {
    console.log('Profile updated');
});
```

#### One-to-Many Relationship
```javascript
// User model with posts
module.exports.user = model({
    name: 'user',
    constraints: {
        posts: {
            foreignKey: 'authorId'
        }
    }
}, {
    email: String,
    posts: [LazyPost] // Array indicates one-to-many
});

// Usage
user.posts.get()(function(posts, error) {
    posts.forEach(function(post) {
        console.log('Post:', post.title);
    });
});

// Adding to relation
user.posts.add(newPost)(function(result, error) {
    console.log('Post added');
});

// Removing from relation
user.posts.remove(postId)(function(result, error) {
    console.log('Post removed');
});
```

#### Many-to-Many Relationship
```javascript
// User model with roles
module.exports.user = model({
    name: 'user',
    constraints: {
        roles: {
            through: 'UserRoles',  // Junction table
            foreignKey: 'userId',
            otherKey: 'roleId'
        }
    }
}, {
    email: String,
    roles: [LazyRole]
});

// Usage - same as one-to-many
user.roles.get()(function(roles, error) {
    console.log('User roles:', roles.length);
});
```

### NoSQL Document Relationships
For NoSQL databases, relationships are managed through embedded documents and references:

```javascript
module.exports.project = model({
    name: 'project'
}, {
    _id: Number,
    userId: Number,                             // Reference to user
    collaborators: [Number],                    // Array of user IDs
    tasks: [{                                   // Embedded documents
        _id: Number,                            // Explicit ID required
        title: String,
        assignedTo: Number,                     // Reference to user
        status: String,
        comments: [{                            // Nested embedded documents
            _id: Number,
            userId: Number,
            text: String,
            timestamp: Date
        }]
    }],
    settings: {                                 // Embedded object
        isPublic: Boolean,
        allowComments: Boolean,
        theme: String
    }
}, [TimestampsPlugin]);
```

```javascript
// User model with embedded documents
module.exports.user = model({
    name: 'user'
}, {
    email: String,
    profile: {
        bio: String,
        social: {
            twitter: String,
            linkedin: String
        }
    },
    posts: [{
        _id: Number,
        title: String,
        content: String,
        publishedAt: Date
    }]
});

// Accessing nested documents
behaviour.entity(new User()).query(/* query */).then(function(users) {
    var user = users[0];
    
    // Direct property access
    console.log('Bio:', user.profile.bio);
    console.log('Twitter:', user.profile.social.twitter);
    
    // Array access
    user.posts.forEach(function(post) {
        console.log('Post:', post.title);
    });
});

// Using self setter for nested updates specially nested arrays
user.self.set('profile.bio', 'New bio');
user.self.set('profile.social.twitter', '@username');
user.self.set('posts.0.title', 'Updated title');
```

---

## Advanced Model Features

### Automatic Field Management
BeamJS automatically adds a default primary key to the root schema—id for SQL databases and _id for NoSQL databases. It also handles auto-incrementing without any explicit configuration. 

#### Timestamps Plugin
```javascript
var TimestampsPlugin = require('mongoose-timestamp'); // MongoDB
var TimestampsPlugin = require('beamjs').SQLTimestamps; // SQL

// Automatically adds and manages:
// - createdAt: Date (set on creation)
// - updatedAt: Date (updated on every save)

module.exports.user = model({
    name: 'user'
}, {
    _id: Number,
    name: String,
    email: String
    // createdAt and updatedAt are added automatically
}, [TimestampsPlugin]);
```

#### Hashed Property Plugin
```javascript
var HashedPropertyPlugin = require('mongoose-hashed-property');

// Automatically adds:
// - hashed_password: String (bcrypt hashed)
// - verifyPassword(plaintext): Boolean method

module.exports.user = model({
    name: 'user',
    features: {
        exclude: ['hashed_password']            // Hide from queries by default
    }
}, {
    _id: Number,
    email: String,
    // hashed_password field and vritual password field are added automatically
}, [HashedPropertyPlugin]);

// Usage in behavior:
user.verifyPassword(plaintextPassword)          // Returns boolean
```

#### Secret Plugin
```javascript
var SecretPlugin = require('mongoose-secret'); // MongoDB
var SecretPlugin = require('beamjs').SQLSecret; // SQL

// Automatically adds:
// - secret: String (JWT signing secret)
// - generateNewSecret(callback): Function

module.exports.user = model({
    name: 'user',
    features: {
        exclude: ['secret']                     // Hide from queries by default
    }
}, {
    _id: Number,
    email: String
    // secret field added automatically
}, [SecretPlugin]);

// Usage in behavior:
user.generateNewSecret(function (error) {
    // New secret generated, old JWT tokens invalidated
});
```

### Plugin Pattern
BeamJS supports a unified plugin system for extending model functionality.

### MongoDB Plugins (Mongoose)

```javascript
// Custom MongoDB plugin
function customMongoPlugin(schema, options) {
    var { database } = options; // database key when multi-tenancy activated
    
    // Add virtual fields
    schema.virtual('fullName').get(function() {
        return this.firstName + ' ' + this.lastName;
    });
    
    // Add instance methods
    schema.methods.authenticate = function(password) {
        return bcrypt.compare(password, this.password);
    };
    
    // Add static methods
    schema.statics.findByEmail = function(email) {
        return this.findOne({ email: email });
    };
    
    // Add pre/post hooks
    schema.pre('save', function(next) {
        if (this.isModified('password')) {
            this.password = bcrypt.hash(this.password, 10);
        }
        next();
    });
    
    // Add indexes
    schema.index({ email: 1 }, { unique: true });
    schema.index({ createdAt: -1 });
}

// Usage in model
module.exports.user = model({
    name: 'user'
}, {
    firstName: String,
    lastName: String,
    email: String,
    password: String
}, [customMongoPlugin]);
```

### SQL Plugins (Sequelize)

```javascript
// Custom SQL plugin
function customSQLPlugin(name, hooks, sequelize, database /* database key when multi-tenancy activated */) {
    
    // Add model-level hooks
    hooks.on('beforeCreate', function(instance, options) {
        instance.createdBy = options.userId;
    });
    
    hooks.on('afterCreate', function(instance, options) {
        console.log('User created:', instance.email);
    });
    
    // Add global hooks (affects all models)
    hooks.on('beforeDefine', function(attributes, options) {
        // Add common fields to all models
        attributes.createdAt = {
            type: sequelize.DataTypes.DATE,
            defaultValue: sequelize.DataTypes.NOW
        };
    }, true); // true = global hook
    
    // Add custom instance methods
    hooks.on('afterDefine', function(model) {
        model.prototype.toPublic = function() {
            var data = this.toJSON();
            delete data.password;
            delete data.secret;
            return data;
        };
    });
}

// Usage in model
module.exports.user = model({
    name: 'user',
    constraints: { id: true }
}, {
    email: String,
    password: String
}, [customSQLPlugin]);
```

### Field Exclusion and Security

#### Default Exclusions
```javascript
module.exports.user = model({
    name: 'user',
    features: {
        exclude: ['hashed_password', 'secret', 'internalNotes']
    }
}, schemaDefinition, pluginsArray);

// Normal query (excludes sensitive fields)
.entity(new User()).query(queryExpressions)

// Query with sensitive fields (when needed)
.entity(new User({ exclude: undefined })).query(queryExpressions)
```

#### Conditional Field Access
```javascript
// Different exclusion sets for different contexts
.entity(new User({
    exclude: ['secret']                         // Show password hash but not secret
})).query(queryExpressions)

// Public API response (minimal fields)
.entity(new User({
    include: ['_id', 'name', 'email']           // Only show specific fields
})).query(queryExpressions)
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