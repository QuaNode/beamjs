## Query Features

Features control how queries are executed and what data is returned.

### Common Features (SQL & MongoDB)

```javascript
behaviour.entity(new Model({
    // Pagination
    paginate: true,
    page: 1,
    limit: 20,
    
    // Field selection
    include: ['name', 'email'],     // Only these fields
    exclude: ['password', 'secret'], // Exclude these fields
    
    // Sorting
    sort: [
        { by: 'createdAt', order: 'desc' },
        { by: 'name', order: 'asc' }
    ],
    
    // Performance
    cache: true,                    // Enable query caching
    readonly: true,                 // Return plain objects (faster)
    
    // Population/Joins
    populate: [{
        path: 'posts',
        model: 'Post',
        include: ['title', 'content'],
        exclude: ['draft']
    }]
}));
```

### MongoDB-Specific Features
BeamJS enables advanced query pipelines—such as aggregation followed by map-reduce, or any combination ending in a standard query—allowing for powerful and flexible data processing in a unified manner.

```javascript
behaviour.entity(new Model({
    // Aggregation
    aggregate: {
        include: [{
            get: 'posts',
            as: 'postCount',
            of: '$size'  // Count array elements
        }],
        group: ['status'],
        flatten: ['tags'], // Unwind arrays
        filter: true,      // Apply filter query as $match   
        output: true       // Store result in collection
    },
    
    // MapReduce
    mapReduce: {
        map: function() {
            emit(this.category, this.price);
        },
        reduce: function(key, values) {
            return values.reduce((sum, price) => sum + price, 0);
        },
        finalize: function(key, value) {
            return { category: key, total: value };
        },
        filter: true,      // Apply filter query as before map-reduce
        output: true       // Store result in collection
    },
    
    // Distinct values
    distinct: 'category'
}));
```

### SQL-Specific Features

```javascript
behaviour.entity(new Model({
    // Subqueries
    include: [{
        get: subQueryEntity,
        as: 'calculatedField'
    }],
    
    // Having clause (with GROUP BY)
    having: [
        new QueryExpression({
            fieldName: 'count',
            comparisonOperator: ComparisonOperators.GT,
            fieldValue: 5
        })
    ],
    
    // Join conditions
    required: false,        // LEFT JOIN vs INNER JOIN
    marked: true,          // Include soft-deleted records
    subFilter: false,      // Disable subquery optimization
    
    // Advanced includes with functions
    including: [{
        get: 'price',
        of: ['AVG'],       // SQL function
        as: 'averagePrice'
    }]
}));
```

---

## Operators

BeamJS provides three categories of declarative operators for database operations.

### Logical Operators

Used to combine multiple query expressions.

```javascript
var { LogicalOperators } = require('beamjs');
var { AND, OR, NOT } = LogicalOperators;

// Usage in query expressions
behaviour.entity(new User()).query([
    new QueryExpression({
        fieldName: 'status',
        comparisonOperator: EQUAL,
        fieldValue: 'active'
    }),
    new QueryExpression({
        fieldName: 'role',
        comparisonOperator: EQUAL,
        fieldValue: 'admin',
        logicalOperator: AND,
        contextualLevel: 0
    })
]);
```

**Available Logical Operators:**
- `AND` - Logical AND operation
- `OR` - Logical OR operation  
- `NOT` - Logical NOT operation

### Comparison Operators

Used to compare field values in queries.

```javascript
var { ComparisonOperators } = require('beamjs');
var {
    EQUAL, NE, LT, LE, GT, GE,
    IN, NIN, LIKE, REGEX, BETWEEN,
    EQUALIGNORECASE, CONTAINS, ANY, ALL
} = ComparisonOperators;

// Basic comparisons
new QueryExpression({
    fieldName: 'age',
    comparisonOperator: GT,
    fieldValue: 18
});

// Case-insensitive comparison
new QueryExpression({
    fieldName: 'email',
    comparisonOperator: EQUALIGNORECASE,
    fieldValue: 'user@example.com'
});

// Array operations
new QueryExpression({
    fieldName: 'tags',
    comparisonOperator: ANY,
    fieldValue: ['javascript', 'nodejs']
});
```

**Available Comparison Operators:**

#### Basic Comparisons
- `EQUAL` (=) - Equality check
- `NE` (≠) - Not equal
- `LT` (<) - Less than
- `LE` (≤) - Less than or equal
- `GT` (>) - Greater than
- `GE` (≥) - Greater than or equal

#### Array/Set Operators
- `IN` - Value in array
- `NIN` - Value not in array
- `ALL` - All values match
- `ANY` - Any value matches

#### Text Operators
- `LIKE` - Pattern matching (SQL)
- `REGEX` - Regular expression
- `CONTAINS` - Contains substring
- `EQUALIGNORECASE` - Case-insensitive equality

#### Range Operators
- `BETWEEN` - Value within range
- `NBETWEEN` - Value outside range

#### Advanced Operators
- `FROM` - Subquery source
- `THROUGH` - Many-to-many relation
- `SELECT` - Subquery selection
- `SOME` - Conditional array filtering

### Computation Operators (Aggregation)

Used in aggregation pipelines and computed fields.

```javascript
var { ComputationOperators } = require('beamjs');
var {
    FIELD, EQUAL, ADD, MULTIPLY,
    CONCAT, SUBSTR, SUM, AVG,
    IF, ELSE, FUNCTION
} = ComputationOperators;

// Field references
FIELD('username')           // $username in MongoDB, column in SQL

// Mathematical operations
[FIELD('price'), ADD, FIELD('tax')]
[FIELD('quantity'), MULTIPLY, FIELD('unitPrice')]

// String operations
[FIELD('firstName'), CONCAT, ' ', CONCAT, FIELD('lastName')]
[FIELD('description'), SUBSTR, 0, 100]

// Conditional operations
[FIELD('activeDate'), IF, FIELD('status'), EQUAL, 'active', ELSE, null]

// Aggregation functions
[SUM, FIELD('amount')]
[AVG, FIELD('rating')]

// Custom functions (SQL)
FUNCTION({
    get: 'UPPER',
    of: FIELD('name')
})
```

**Available Computation Operators:**

#### Field Operators
- `FIELD(name)` - Reference database field
- `VAR(name)` - Reference aggregation variable
- `LITERAL(value)` - Literal value

#### Mathematical Operators
- `ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE`
- `MOD`, `POW`, `SQRT`, `ABS`
- `CEIL`, `FLOOR`, `ROUND`, `TRUNC`
- Trigonometric: `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`
- Logarithmic: `LN`, `LOG`, `LOG10`, `EXP`

#### String Operators
- `CONCAT` - String concatenation
- `SUBSTR` - Substring extraction
- `STRLENGTH` - String length
- `UPPERCASE`, `LOWERCASE` - Case conversion
- `TRIM`, `LTRIM`, `RTRIM` - Whitespace removal
- `SPLIT` - String splitting

#### Array Operators
- `INDEXAT` - Element at index
- `INDEXOF` - Find element index
- `APPEND` - Concatenate arrays
- `LENGTH` - Array size
- `SLICE` - Array subset

#### Set Operators
- `DIFF` - Set difference
- `SAME` - Set equality
- `INTERSECT` - Set intersection
- `SUBSET` - Subset check
- `UNION` - Set union

#### Aggregation Functions
- `SUM`, `AVG` - Sum and average
- `MIN`, `MAX` - Minimum and maximum
- `FIRST`, `LAST` - First and last values
- `DEV`, `DEVSAMP` - Standard deviation

#### Conditional Operators
- ` , IF, , ELSE, ` - Conditional expression
- ` , IFNULL, ` - Null coalescing

#### Date Operators
- `YEAR`, `MONTH`, `DAY` - Date components
- `HOUR`, `MINUTE` - Time components
- `WEEK` - Week of year

#### Utility Operators
- `CONVERT(type)` - Type conversion
- `FUNCTION(options)` - Custom SQL functions
- `OPERATOR(name, fn)` - Custom operations

---

### Multiple Conditions with Logical Operators

```javascript
// AND conditions with contextual levels
.entity(new Product()).query([
    new QueryExpression({
        fieldName: 'category',
        comparisonOperator: EQUAL,
        fieldValue: 'electronics'
    }),
    new QueryExpression({
        fieldName: 'price',
        comparisonOperator: BETWEEN,
        fieldValue: [100, 500],
        logicalOperator: AND,
        contextualLevel: 0
    }),
    new QueryExpression({
        fieldName: 'inStock',
        comparisonOperator: EQUAL,
        fieldValue: true,
        logicalOperator: AND,
        contextualLevel: 0
    })
]).then(function(products, error) {
    // Returns electronics products priced between $100-$500 that are in stock
});
```

### Complex OR Conditions

```javascript
// OR conditions with nested contexts
.entity(new Order()).query([
    new QueryExpression({
        fieldName: 'status',
        comparisonOperator: EQUAL,
        fieldValue: 'pending'
    }),
    new QueryExpression({
        fieldName: 'status',
        comparisonOperator: EQUAL,
        fieldValue: 'processing',
        logicalOperator: OR,
        contextualLevel: 1
    }),
    new QueryExpression({
        fieldName: 'priority',
        comparisonOperator: EQUAL,
        fieldValue: 'urgent',
        logicalOperator: AND,
        contextualLevel: 0
    })
]).then(function(orders, error) {
    // Returns urgent orders that are either pending OR processing
});
```

### JOIN Expression using FROM (SQL)

```javascript
// Join with related models
.entity(new Invoice()).query([
    new QueryExpression({
        fieldName: 'customer',
        comparisonOperator: FROM,
        fieldValue: new Customer({
            include: ['id', 'name', 'email']
        })
    }),
    new QueryExpression({
        fieldName: 'amount',
        comparisonOperator: GT,
        fieldValue: 1000,
        logicalOperator: AND,
        contextualLevel: 0
    })
]).then(function(invoices, error) {
    // Returns invoices > $1000 with customer details
});
```

### Advanced Search with LIKE and Functions

```javascript
// Text search with functions
.entity(new Article()).query([
    new QueryExpression({
        fieldName: FUNCTION({
            get: 'lower',
            of: COLUMN('title')
        }),
        comparisonOperator: LIKE,
        fieldValue: '%javascript%'
    }),
    new QueryExpression({
        fieldName: FUNCTION({
            get: 'lower', 
            of: COLUMN('content')
        }),
        comparisonOperator: LIKE,
        fieldValue: '%beamjs%',
        logicalOperator: OR,
        contextualLevel: 1
    })
]).then(function(articles, error) {
    // Returns articles with 'javascript' in title OR 'beamjs' in content
});
```

### IN and NOT IN Expression

```javascript
// Multiple value matching
.entity(new Employee()).query([
    new QueryExpression({
        fieldName: 'departmentId',
        comparisonOperator: IN,
        fieldValue: [1, 3, 5, 7]
    }),
    new QueryExpression({
        fieldName: 'employment.status', // Non-SQL
        comparisonOperator: NIN,
        fieldValue: ['terminated', 'suspended'],
        logicalOperator: AND,
        contextualLevel: 0
    })
]).then(function(employees, error) {
    // Returns active employees from specific departments
});
```

## NoSQL Aggregation Expression

### Basic Aggregation Pipeline

```javascript
// Simple aggregation with field computations
.entity(new SalesRecord()).aggregate([
    new AggregateExpression({
        fieldName: 'totalRevenue',
        fieldValue: [
            FIELD('quantity'),
            MULTIPLY,            
            FIELD('unitPrice')
        ],
        contextualLevels: [0]
    }),
    new AggregateExpression({
        fieldName: 'discountAmount',
        fieldValue: [
            VAR('totalRevenue'),           
            MULTIPLY,             
            FIELD('discountPercent'),
            DIVIDE,
            100
        ],
        contextualLevels: [1, 0]
    })
]).then(function(records, error) {
    // Returns sales records with computed revenue and discount amounts
});
```

### String Expression and Transformation

```javascript
// Advanced string manipulation
.entity(new UserProfile()).aggregate([
    new AggregateExpression({
        fieldName: 'searchIndex',
        fieldValue: [
            LOWERCASE,
            FIELD('firstName'),
            IFNULL,
            '',
            CONCAT,
            FIELD('lastName'),
            IFNULL,
            '',
            CONCAT,
            FIELD('email'),
            IFNULL,
            '',
            SUBSTRINDEX,
            VAR('searchTerm').toLowerCase()
        ],
        contextualLevels: [1, 3, 2, 3, 2, 3, 0]
    })
]).then(function(profiles, error) {
    // Creates searchable index from user fields
});
```

### Array Expression and Indexing

```javascript
// Array manipulation and indexing
.entity(new Project()).aggregate([
    new AggregateExpression({
        fieldName: 'memberIndex',
        fieldValue: [
            teamMembers.length,
            IF,
            teamMembers,
            INDEXOF,
            FIELD('assignedTo'),
            EQUAL,
            -1,
            ELSE,
            teamMembers,
            INDEXOF,
            FIELD('assignedTo')
        ],
        contextualLevels: [1, 2, 3, 0, 3]
    }),
    new AggregateExpression({
        fieldName: 'priorityScore',
        fieldValue: [
            priorityWeights,
            INDEXAT,
            VAR('memberIndex'),
            IFNULL,
            0,
            MULTIPLY,
            FIELD('complexity'),
            IFNULL,
            1
        ],
        contextualLevels: [1, 2, 0, 2]
    })
]).then(function(projects, error) {
    // Calculates priority scores based on team member assignments
});
```

## Advanced Query Patterns

### Subqueries with SELECT Operations

```javascript
// Using subqueries for complex filtering
.entity(new Customer()).query([
    new QueryExpression({
        fieldName: 'id',
        comparisonOperator: IN,
        comparisonOperatorOptions: SELECT('customerId'),
        fieldValue: new Order({
            group: ['customerId'],
            include: ['customerId'],
            subFilter: false
        }, [
            new QueryExpression({
                fieldName: 'orderDate',
                comparisonOperator: GTE,
                fieldValue: new Date('2024-01-01')
            }),
            new QueryExpression({
                fieldName: 'status',
                comparisonOperator: EQUAL,
                fieldValue: 'completed',
                logicalOperator: AND,
                contextualLevel: 0
            })
        ])
    })
]).then(function(customers, error) {
    // Returns customers who placed completed orders since 2024
});
```

### Nested Model Relationships

```javascript
// Deep relationship queries
.entity(new BlogPost()).query([
    new QueryExpression({
        fieldName: 'author',
        comparisonOperator: FROM,
        fieldValue: new User({
            include: ['id', 'name', 'email']
        }, [
            new QueryExpression({
                fieldName: 'profile',
                comparisonOperator: FROM,
                fieldValue: new UserProfile({
                    include: ['bio', 'expertise']
                })
            })
        ])
    }),
    new QueryExpression({
        fieldName: 'category',
        comparisonOperator: FROM,
        fieldValue: new Category({
            include: ['name', 'slug']
        }),
        logicalOperator: AND,
        contextualLevel: 0
    })
]).then(function(posts, error) {
    // Returns blog posts with author details and categories
});
```

### Dynamic Query Building

```javascript
// Building queries programmatically
var buildSearchQuery = function(searchTerms, categories, dateRange) {
    var query = [
        new QueryExpression({
            fieldName: 'published',
            comparisonOperator: EQUAL,
            fieldValue: true
        })
    ];

    if (searchTerms && searchTerms.length > 0) {
        searchTerms.forEach(function(term, index) {
            query.push(new QueryExpression({
                fieldName: FUNCTION({
                    get: 'lower',
                    of: COLUMN('title')
                }),
                comparisonOperator: LIKE,
                fieldValue: '%' + term.toLowerCase() + '%',
                logicalOperator: index === 0 ? AND : OR,
                contextualLevel: index === 0 ? 0 : 1
            }));
        });
    }

    if (categories && categories.length > 0) {
        query.push(new QueryExpression({
            fieldName: 'categoryId',
            comparisonOperator: IN,
            fieldValue: categories,
            logicalOperator: AND,
            contextualLevel: 0
        }));
    }

    if (dateRange) {
        query.push(new QueryExpression({
            fieldName: 'publishedAt',
            comparisonOperator: BETWEEN,
            fieldValue: [dateRange.start, dateRange.end],
            logicalOperator: AND,
            contextualLevel: 0
        }));
    }

    return query;
};

// Usage
.entity(new Article()).query(
    buildSearchQuery(
        ['javascript', 'nodejs'],
        [1, 3, 5],
        { start: '2024-01-01', end: '2024-12-31' }
    )
).then(function(articles, error) {
    // Returns filtered articles based on dynamic criteria
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