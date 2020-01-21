
# beamjs [![Known Vulnerabilities](https://snyk.io/test/github/QuaNode/beamjs/badge.svg?targetFile=package.json)](https://snyk.io/test/github/QuaNode/beamjs?targetFile=package.json) [![Codacy Badge](https://api.codacy.com/project/badge/Grade/518c2b67f61142ca833c75c6c07ccd43)](https://www.codacy.com/project/quanode/beamjs/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=QuaNode/beamjs&amp;utm_campaign=Badge_Grade_Dashboard) [![NPM](https://nodei.co/npm/beamjs.png)](https://npmjs.org/package/beamjs)
Full stack web development framework (BackendJS - ExpressJS - AngularJS - MongoDB)

## Installation

    npm install beamjs

## Usage

``` js

var backend = require('beamjs').backend();
var behaviour = backend.behaviour('/api/v1');

var model = backend.model();
var User = model({

  name: 'User'
}, {

  username: String,
  password: String
});

behaviour({

  name: 'GetUsers',
  version: '1',
  path: '/users',
  method: 'GET'
}, function(init) {

  return function() {

    var self = init.apply(this, arguments).self();
    self.begin('Query', function(key, businessController, operation) {

        operation
          .entity(new User())
          .append(true)
          .apply();
      });
  };
});

```

## Note

you should define process.env.MONGODB_URI otherwise beamjs will try to connect to mongodb://localhost:27017/test

## ToDo

1. create angular services when create behaviours
2. add plugins support
3. add user management plugin
4. add cli


