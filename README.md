# beamjs [![Codacy Badge](https://api.codacy.com/project/badge/Grade/518c2b67f61142ca833c75c6c07ccd43)](https://www.codacy.com/project/quanode/beamjs/dashboard?utm_source=github.com&utm_medium=referral&utm_content=QuaNode/beamjs&utm_campaign=Badge_Grade_Dashboard) [![NPM](https://nodei.co/npm/beamjs.png)](https://npmjs.org/package/beamjs)

Enterprise full stack web development framework (Backend-JS - ExpressJS - AngularJS - MongoDB)

# Introduction

- BeamJS is built above Backend-JS to provide data controllers for SQL and No-SQL databases. It also provides file system controllers that works on local file system or on cloud storage.
- These data controllers are abstract adapters above ODM/ORM patterns of MongooseJS and SequelizeJS. The objective of these adapters is to define a unified query APIs to work across different database engines even across NO-SQL and SQL.
- BeamJS is an abbreviation for the following technology stack:
  - Backend-JS - A NodeJS module and library built above ExpressJS [check here](https://github.com/quaNode/Backend-JS).
  - ExpressJS - A minimal and flexible Node.js web application framework [check here](https://github.com/expressjs/expressjs.com).
  - Angular - A single page application front-end framework [check here](https://github.com/angular/angular).
  - MongoDB - A NO-SQL database engine [check here](https://github.com/mongodb/mongo).
- BeamJS can be configured to work with different technology stacks regard database engines and front-end frameworks.

## Why BeamJS and Backend-JS?

- Backend-JS is built to provide a unified syntax of business logic where the core of any business process exists. This makes the idea to unify the way of writing that logic across applications is like keeping your office organized.
- **Backend-JS is providing a deep route-based load balancing through a built-in queuing service.**
- It provides a built-in static files server decoubling the file source that could be local file system or cloud storage from http static request handling. Also it supports complex files streaming and transformations within the built-in queue system and load balancing.
- It provides a built-in forward and reverse proxy server utilizing the queuing system for fast load-balancing, virtual hosts and complex domain routing. 
- It provides a built-in data mapping pipeline.
- It supports long pulling HTTP requests.
- Introducing a new terminology in technology space is not hard as the age of whole digital industry is still young but making so is not easy. Considering this, Backend-JS introduces the terminology of **Behavior** coming from the business space specially marketing where users/customers have behaviors. These behaviors are sometimes functional on the digital product/service and sometimes unrelated to the product. Simply the functional behaviors are called by developers business logic or APIs so our Behavior means normal API but implemented vertically and the objective is to narrow the space between business and technology as inspired by BDD, apply Behavior-first pattern [check here](https://github.com/QuaNode/Backend-JS/wiki/Behavior-first-design), and ensure it is ready for the micro-services architecture or serverless architecture.
- To define a **Behavior** (API), The framework drives you to write the contract/specification first which can be viewed later by integrators for simple REST integrations.
- Integrating to applications made using BeamJS and Backend-JS are a **SOAP-like above REST APIs**. It comes with 7 front-end integration libraries as following:
  - [ng-behaviours](https://github.com/QuaNode/ng-behaviours) for Angular and Angular-based (e,g, ionic) applications.
  - [js-behaviours](https://github.com/QuaNode/js-behaviours) for NodeJS, NodeJS-based (e.g. ElectronJS), and browser.
  - [dotnet-behaviours](https://github.com/QuaNode/dotnet-behaviours) for .Net core.
  - [droid-behaviours](https://github.com/QuaNode/droid-behaviours) for Android.
  - [ios-behaviours](https://github.com/QuaNode/ios-behaviours) for iOS.
  - [php-behaviours](https://github.com/QuaNode/php-behaviours) for PHP.
  - titanium-behaviours for Appcelerator Titanium.
  - [more coming.](https://github.com/QuaNode)
- Integration between applications made using BeamJS and Backend-JS is like calling internal function.
- The whole framework is the backbone of Behaviours product where code is generated by dragging and dropping. Taking in mind that the code generated is downloadable, editable, and maintainable not like other code generators you know.

## Benchmarking

- The code of the framework is scoring between class **A and C** in the static analyzer of [Codacy](https://github.com/marketplace/codacy).
- The load testing of applications made using this framework scored **10k** sessions per minute on 1G RAM 1vCPU AWS EC2.
- The dependencies of the framework do not exceed **30** and vulnerabilities **0 or 1**.

## Installation

    npm install beamjs

## Usage

```js
var backend = require("beamjs").backend();
var behaviour = backend.behaviour("/api/v1");

var model = backend.model();
var User = model(
  {
    name: "User",
  },
  {
    username: String,
    password: String,
  }
);

behaviour(
  {
    name: "GetUsers",
    version: "1",
    path: "/users",
    method: "GET",
  },
  function (init) {
    return function () {
      var self = init.apply(this, arguments).self();
      self.begin("Query", function (key, businessController, operation) {
        operation.entity(new User()).append(true).apply();
      });
    };
  }
);
```

## Starter project

A sample project that you can learn from examples how to use BeamJS.

#### [https://github.com/QuaNode/BeamJS-Start](https://github.com/QuaNode/BeamJS-Start)

####
