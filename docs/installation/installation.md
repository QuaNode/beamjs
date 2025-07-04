## Installation Guide

### Prerequisites

- Node.js 12+ and npm 6+
- MongoDB 5.0+

### Quick Setup

#### 1. Initialize Project

```bash
mkdir my-beamjs-app
cd my-beamjs-app
npm init -y
```

#### 2. Install Dependencies

```bash
npm install beamjs functional-chain-behaviour mongoose-timestamp
```

#### 3. Package.json Configuration

```json
{
  "name": "my-beamjs-app",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "beamjs": "latest",
    "functional-chain-behaviour": "latest",
    "mongoose-timestamp": "latest"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

#### 4. Create Server

```javascript
// server.js
'use strict';

var beam = require('beamjs');

beam.database('main', {
  type: 'mongodb',
  name: 'myapp'
}).app(__dirname + '/behaviours', {
  path: '/api/v1',
  parser: 'json',
  port: 8282,
  origins: '*'
});
```

#### 5. Create First Behaviour

```bash
mkdir -p behaviours/app/health
```

```javascript
// behaviours/app/health/index.js
'use strict';

var backend = require('beamjs').backend();
var behaviour = backend.behaviour();
var { FunctionalChainBehaviour } = require('functional-chain-behaviour')();

module.exports.health = behaviour({
  name: 'health',
  inherits: FunctionalChainBehaviour,
  version: '1',
  type: 'database',
  path: '/health',
  method: 'GET',
  parameters: {},
  returns: {
    status: { key: 'status', type: 'body' }
  }
}, function (init) {
  return function () {
    var self = init.apply(this, arguments).self();
    
    self.catch(function (e) {
      return null;
    }).next().map(function (response) {
      response.status = 'healthy';
    }).end();
  };
});
```

#### 6. Register Behaviours

```javascript
// behaviours/index.js
'use strict';

require('./app/health');
```

#### 7. Start Application

```bash
npm start
```

Test: `curl http://localhost:8282/api/v1/health`

#### Environment Variables

```bash
# .env
DATABASE_NAME=myapp
PORT=8282
NODE_ENV=development
```

### Folder Structure

```
my-beamjs-app/
├── server.js
├── package.json
├── behaviours/
│   ├── index.js
│   ├── app/
│   │   └── health/
│   │       └── index.js
│   ├── user/
│   ├── internals/
│   ├── policies/
│   └── jobs/
├── models/
└── services/
```

You're ready to build with BeamJS! 🚀

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