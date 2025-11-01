## Entity Operations in Behaviors

### Query Operations

#### Basic Queries
```javascript
// Simple query
.entity(new User({ readonly: true })).query(() => [
    new QueryExpression({
        fieldName: 'status',
        comparisonOperator: EQUAL,
        fieldValue: 'active'
    })
]).then(function (users, e) {
    // Process results
})
```

#### Complex Queries with Multiple Conditions
```javascript
.entity(new Order({ 
    readonly: true,
    paginate: true,
    page: 1,
    limit: 20,
    sort: [{ order: 'desc', by: 'createdAt' }]
})).query(() => [
    new QueryExpression({
        fieldName: 'userId',
        comparisonOperator: EQUAL,
        fieldValue: user._id
    }),
    new QueryExpression({
        fieldName: 'status',
        comparisonOperator: IN,
        fieldValue: ['pending', 'processing'],
        logicalOperator: AND,
        contextualLevel: 0
    }),
    new QueryExpression({
        fieldName: 'totalAmount',
        comparisonOperator: GT,
        fieldValue: 100,
        logicalOperator: AND,
        contextualLevel: 0
    })
]).then(function (result, e) {
    if (result && Array.isArray(result.modelObjects)) {
        orders = result.modelObjects;
        pagination = {
            currentPage: 1,
            totalPages: Math.ceil(result.pageCount),
            totalItems: Math.round(result.pageCount * 20),
            itemsPerPage: 20
        };
    }
})
```

#### Nested Document Queries
```javascript
// Query embedded documents
.entity(new Project({ readonly: true })).query(() => [
    new QueryExpression({
        fieldName: 'tasks.status',              // Nested field query
        comparisonOperator: EQUAL,
        fieldValue: 'pending'
    }),
    new QueryExpression({
        fieldName: 'tasks.assignedTo',          // Multiple nested conditions
        comparisonOperator: EQUAL,
        fieldValue: user._id,
        logicalOperator: AND,
        contextualLevel: 0
    })
])
```

### Insert Operations

#### Single Document Creation
```javascript
.entity(new User()).insert(() => ({
    _id: new Date().getTime(),                  // Generate unique ID
    name: userData.name,
    email: userData.email,
    password: userData.password,                // Will be hashed automatically
    status: 'active',
    preferences: {
        theme: 'dark',
        notifications: true
    },
    roles: ['user']
})).then(function (users, e) {
    if (e) {
        error = e;
        return;
    }
    if (Array.isArray(users) && users.length > 0) {
        user = users[0];
    }
})
```

#### Batch Insert Operations
```javascript
.entity(new Product()).insert(() => productData.map(product => ({
    _id: new Date().getTime() + Math.random(),  // Ensure unique IDs
    name: product.name,
    price: product.price,
    category: product.category,
    inventory: product.inventory
}))).then(function (products, e) {
    if (e) {
        error = e;
        return;
    }
    createdProducts = products;
})
```

### Update Operations

#### Direct Object Modification
```javascript
// Query first, then modify
.entity(new User()).query(() => [
    new QueryExpression({
        fieldName: '_id',
        comparisonOperator: EQUAL,
        fieldValue: userId
    })
]).then(function (users, e) {
    if (Array.isArray(users) && users.length > 0) {
        user = users[0];
        
        // Modify properties directly
        user.lastLoginDate = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        
        // Modify nested objects
        user.preferences.theme = newTheme;
        
        // Add to arrays
        user.tags.push('frequent-user');
    }
})

// Save changes in async operation
.async(function (next, models) {
    if (user) {
        models([user]).save(function (e, savedUsers) {
            if (e) {
                error = e;
            } else {
                user = Array.isArray(savedUsers) && savedUsers[0];
            }
            next();
        });
    } else {
        next();
    }
})
```

### Delete Operations

#### Conditional Deletion
```javascript
.entity(new TempFile()).delete(() => [
    new QueryExpression({
        fieldName: 'createdAt',
        comparisonOperator: LT,
        fieldValue: cutoffDate
    }),
    new QueryExpression({
        fieldName: 'status',
        comparisonOperator: EQUAL,
        fieldValue: 'expired',
        logicalOperator: AND,
        contextualLevel: 0
    })
]).then(function (deletedCount, e) {
    if (e) {
        error = e;
        return;
    }
    console.log(`Deleted ${deletedCount} expired files`);
})

// Save operation required even for deletes
.async(function (next, models) {
    models().save(function (e, results) {
        if (e) error = e;
        next();
    });
})
```

## Performance Optimization

### Query Optimization
BeamJS automatically reconstructs queries in an optimized way, requiring no explicit effort.

#### Efficient Field Selection
```javascript
// Only load required fields
.entity(new User({
    readonly: true,
    include: ['_id', 'name', 'email', 'status']
}))

// Exclude heavy fields
.entity(new Project({
    readonly: true,
    exclude: ['largeData', 'binaryContent']
}))
```

#### Pagination Best Practices
```javascript
// Efficient pagination
.entity(new Article({
    readonly: true,
    paginate: true,
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 20, 100),    // Cap at 100
    sort: [{ 
        order: 'desc', 
        by: 'publishedAt'                           // Use indexed field
    }]
}))
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