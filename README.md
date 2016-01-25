# beamjs
A new full stack web development framework (BackendJS - ExpressJS - AngularJS - MongoDB)

## Installation

    npm install beamjs

## Usage

``` js

var express = require('express');
var app = express();

var backend = require('beamjs').backend(app);
var model = backend.model();
var behaviour = backend.behaviour('/api/v1');

var User = model({
  name : 'User'
}, {
  username : String
});

behaviour({
  name : 'GetUser',
  version : '1',
  path : '/user'
}, function (init) {

    return function () {

        var self = init.apply(this, arguments).self();
        self.begin('QUERY', function (key, businessController, operation) {

            var queryExpressions = [new QueryExpression({

                fieldName: 'username',
                comparisonOperator: ComparisonOperators.EQUAL,
                fieldValue: 'test'
            })];
            operation
                .query(queryExpressions)
                .entity(new User())
                .apply();
        })
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


