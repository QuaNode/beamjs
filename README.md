# beamjs [![Codacy Badge](https://app.codacy.com/project/badge/Grade/518c2b67f61142ca833c75c6c07ccd43)](https://www.codacy.com/gh/QuaNode/beamjs/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=QuaNode/beamjs&amp;utm_campaign=Badge_Grade)

![0_00](https://user-images.githubusercontent.com/3101473/227795966-12f87168-4b4a-454f-a806-0a72f5a1fe5d.png)

Private IoB & Enterprise full stack web development framework (Backend-JS - ExpressJS - AngularJS - MongoDB)

# Introduction

- BeamJS is built above Backend-JS to provide data controllers for SQL and No-SQL databases. It also includes file system controllers that work on a local file system or cloud storage.
- These data controllers are abstract adapters above ODM/ORM patterns of MongooseJS and SequelizeJS. The objective of these adapters is to define unified query APIs to work across different database engines even across NO-SQL and SQL.
- BeamJS is an abbreviation for the following technology stack:
  - Backend-JS - A NodeJS module and library built above ExpressJS [check here](https://github.com/quaNode/Backend-JS).
  - ExpressJS - A minimal and flexible Node.js web application framework [check here](https://github.com/expressjs/expressjs.com).
  - Angular - A single-page application front-end framework [check here](https://github.com/angular/angular).
  - MongoDB - A NO-SQL database engine [check here](https://github.com/mongodb/mongo).
- BeamJS can be configured to work within different technology stacks of database engines and front-end frameworks.

## Why BeamJS and Backend-JS?

- It is built for agility and highly configurable, modular, and adapting systems.
- It is enterprise-level and a declarative framework for private IoB so you can code your organizational and customer behaviors seamlessly and securely specially when integrating with AI agents.
- It supports DB encryption for pseudonymization and GDPR compliance.
- It provides a built-in data mapping pipeline.
- It supports CQRS architecture through mixed model definitions over different DBs.
- It supports Horizontal/DB multi-tenancy by automatically handling multi-DB connection mapping.
- It provides a deep route-based load balancing through a built-in queuing service.
- It provides a built-in static files server decoupling the file source that could be a local file system or cloud storage from HTTP static request handling. 
- It supports complex file streaming and transformations within the built-in queue system and load balancing.
- It provides a built-in forward- and reverse-proxy server utilizing the queuing system for fast load-balancing, virtual hosts, and complex domain routing. 
- It supports connectionless long-polling HTTP requests.
- It supports event-driven architecture above mixed protocols HTTP/WebSocket for pulling and pushing.
- It provides abstract HTTP-secured WebSockets for highly secured and scalable real-time events and other unique features like sub-rooms.
- It is ready for event-sourcing applications.
- Backend-JS introduces the terminology of API **Behavior** represents organizational and customer behavior that is implemented vertically based on a built-in customizable enterprise algorithmic mental model inspired by BDD applying Behavior-first pattern [check here](https://github.com/QuaNode/Backend-JS/wiki/Behavior-first-design).
- It supports micro-services architecture by vertically implementing **Behaviors** (APIs) besides the built-in services abstraction layer.
- To define a **Behavior** (API), The framework drives you to write the contract/specification first which can be viewed later by integrators for simple REST integrations. Designing APIs as organizational and customer behaviors is a technical design-mix to combine behavioural science, API-first, and headless architecture for a very robust and modern applications.
- Integrating applications made using BeamJS and Backend-JS is a **SOAP-like above REST APIs**. It comes with 7 front-end integration libraries as follows:
  - [ng-behaviours](https://github.com/QuaNode/ng-behaviours) for Angular and Angular-based (e,g, ionic) applications.
  - [js-behaviours](https://github.com/QuaNode/js-behaviours) for NodeJS, NodeJS-based (e.g. ElectronJS), and browser.
  - [dotnet-behaviours](https://github.com/QuaNode/dotnet-behaviours) for .Net core.
  - [droid-behaviours](https://github.com/QuaNode/droid-behaviours) for Android.
  - [ios-behaviours](https://github.com/QuaNode/ios-behaviours) for iOS.
  - [php-behaviours](https://github.com/QuaNode/php-behaviours) for PHP.
  - titanium-behaviours for Appcelerator Titanium.
  - [more coming.](https://github.com/QuaNode)
- Integration between applications made using BeamJS and Backend-JS is like calling internal functions and RPC in distributed systems.
- The whole framework is the backbone of the Behaviours product where code is generated just by writing user stories. Taking in mind that the code generated is downloadable, editable, and maintainable not like other code generators you know.

## Benchmarking

- The code of the framework is scoring between class **A and C** in the static analyzer of [Codacy](https://github.com/marketplace/codacy).
- The load testing of applications made using this framework with heavy server workload scored **10k** sessions per minute and above **1K** concurrent connections on 1G RAM 1vCPU AWS EC2.
- The dependencies of the framework do not exceed **30** and vulnerabilities **0 or 1**.

## Installation

    npm install beamjs functional-chain-behaviour

## Usage

```js
var backend = require("beamjs").backend();
var behaviour = backend.behaviour("/api/v1");
var {
    FunctionalChainBehaviour
} = require('functional-chain-behaviour')();

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
    inherits: FunctionalChainBehaviour,
    version: "1",
    path: "/users",
    method: "GET",
  },
  function (init) {
    return function () {
      var self = init.apply(this, arguments).self();
      self.entity(new User()).query().pipe();
    };
  }
);
```

## Starter project

A sample project that you can learn from examples of how to use BeamJS.

#### [https://github.com/QuaNode/BeamJS-Start](https://github.com/QuaNode/BeamJS-Start)

####
