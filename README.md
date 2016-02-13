# beamjs
A new full stack web development framework (BackendJS - ExpressJS - AngularJS - MongoDB)

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


