# beamjs [![Codacy Badge](https://app.codacy.com/project/badge/Grade/518c2b67f61142ca833c75c6c07ccd43)](https://www.codacy.com/gh/QuaNode/beamjs/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=QuaNode/beamjs&amp;utm_campaign=Badge_Grade)

![0_00](https://user-images.githubusercontent.com/3101473/227795966-12f87168-4b4a-454f-a806-0a72f5a1fe5d.png)

**Private IoB & Enterprise Full-Stack Web Development Framework**  
(Backend-JS – ExpressJS – AngularJS – MongoDB)

---

## Introduction

- BeamJS is built on top of Backend-JS, offering data controllers for both SQL and NoSQL databases. It also provides file system controllers that work with local or cloud storage.
- These data controllers act as abstract adapters over ODM/ORM patterns from MongooseJS and SequelizeJS. Their purpose is to define a unified query API that works across different database engines—including both NoSQL and SQL.
- **BeamJS** stands for the following technology stack:
  - **Backend-JS** – A Node.js module built on ExpressJS. [Check it out](https://github.com/quaNode/Backend-JS).
  - **ExpressJS** – A minimal and flexible Node.js web application framework. [Visit repo](https://github.com/expressjs/expressjs.com).
  - **Angular** – A single-page front-end application framework. [View here](https://github.com/angular/angular).
  - **MongoDB** – A NoSQL database engine. [More info](https://github.com/mongodb/mongo).
- BeamJS is flexible and can be configured to work with different database engines and front-end frameworks.

---

## Why BeamJS and Backend-JS?

- Designed for agility, BeamJS supports highly configurable, modular, and adaptive systems.
- It is an enterprise-grade, declarative framework for private IoB, allowing you to implement organizational and customer behaviors seamlessly and securely—especially when integrating with AI agents.
- Features include:
  - Database encryption for pseudonymization and GDPR compliance.
  - A built-in data mapping pipeline.
  - Support for CQRS architecture with mixed model definitions across different databases.
  - Horizontal/database multi-tenancy with automatic multi-DB connection mapping.
  - Deep route-based load balancing using an integrated queuing system.
  - A built-in static file server that decouples file sources (local or cloud) from HTTP static request handling.
  - Complex file streaming and transformations managed within the queue system and load balancer.
  - A built-in forward and reverse proxy server using the queue system for efficient load balancing, virtual hosting, and advanced domain routing.
  - Support for connectionless long-polling HTTP requests.
  - Event-driven architecture over mixed HTTP/WebSocket protocols for pulling and pushing data.
  - Abstract, secure WebSocket handling for scalable real-time events, including features like sub-rooms.
  - It is ready for event-sourcing applications.

- Backend-JS introduces the concept of **API Behaviors**—organizational and customer behaviors implemented vertically using a customizable enterprise algorithmic mental model. This model follows a *Behavior-First* approach inspired by BDD. [Read more](https://github.com/QuaNode/Backend-JS/wiki/Behavior-first-design).

- It supports a microservices architecture by vertically implementing **Behaviors** (APIs), along with a built-in service abstraction layer.
- The framework encourages defining the API contract first. These contracts can then be viewed by integrators for straightforward REST integration. This Behavioral model combines behavioral science, API-first, and headless architecture principles to deliver highly robust and modern applications.

- Integration between applications built with BeamJS and Backend-JS is akin to internal function calls or RPC in distributed systems. It supports SOAP-like behavior on top of REST APIs and provides several front-end integration libraries:
  - [ng-behaviours](https://github.com/QuaNode/ng-behaviours) – For Angular and Ionic.
  - [js-behaviours](https://github.com/QuaNode/js-behaviours) – For Node.js, ElectronJS, and browser.
  - [dotnet-behaviours](https://github.com/QuaNode/dotnet-behaviours) – For .NET Core.
  - [droid-behaviours](https://github.com/QuaNode/droid-behaviours) – For Android.
  - [ios-behaviours](https://github.com/QuaNode/ios-behaviours) – For iOS.
  - [php-behaviours](https://github.com/QuaNode/php-behaviours) – For PHP.
  - **titanium-behaviours** – For Appcelerator Titanium.
  - [More coming soon](https://github.com/QuaNode)

- The framework powers the **Behaviours** product, where code is generated directly from user stories. Importantly, the generated code is fully editable and maintainable—unlike most other code generators.

---

## Benchmarking

- Codacy static analysis rates the framework between **A and C**.
- Load testing of applications built with BeamJS reached over **10,000 sessions per minute** and more than **1,000 concurrent connections** on a 1 GB RAM / 1 vCPU AWS EC2 instance.
- The total number of dependencies is under **30**, with **0 or 1 known vulnerabilities**.

---

## Installation

```bash
npm install beamjs functional-chain-behaviour
```

## Starter project

Explore a sample project with usage examples:

👉 [https://github.com/QuaNode/BeamJS-Start](https://github.com/QuaNode/BeamJS-Start)

---

## Documentation

### Table of Contents

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

  ---

## 📄 License

- [licensed as MIT](./LICENSE).
