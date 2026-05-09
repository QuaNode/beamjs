## 🚀 Welcome to BeamJS

BeamJS represents a revolutionary approach to backend development, combining the power of **behavior-first architecture** with enterprise-grade security and performance. Built from the ground up for modern applications, BeamJS transforms complex business logic into simpler, maintainable vertical code through its innovative high-level declarative programming model, which truly aligns with human developers and seamlessly integrates with vibe coding and context engineering.

### ✨ Why BeamJS Changes Everything

**🎯 Behavior-First Architecture**  
Every piece of business logic is encapsulated in discrete, testable customer or organizational behaviors that promote code reusability and maintainability.

**🔒 Security by Design**  
Enterprise-grade security is considered into every layer, from validations to sophisticated authentication mechanisms.

**🌐 Database and Architecture Agnostic**  
Write once, run on top of any database, and support a wide range of architectures without changing the code. BeamJS provides a unified API that works seamlessly across SQL and NoSQL databases. It also supports networked multi-process microservices, single-process implicit microservices with a clear standard contract, SOA, event-driven architectures with security and scalable performance, monolithic layers, headless with API-first, Lambda, CQRS, event sourcing, hexagonal architecture, multi-tenancy, federation, backend for frontend (BFF), and a wide range of distributed-system architectures.

**🤖 Unified AI Runtime for Hybrid Intelligence**  
Host diverse AI computational models, from LLMs and symbolic AI to neuro-symbolic systems. BeamJS functions as an event-driven, declarative actor-model framework designed for building secure, fully autonomous agentic systems powered by both human and artificial intelligence.

**⚡ Performance Optimized**  
Query optimization, caching, and built-in queueing to distribute work efficiently and to ensure your applications scale effortlessly.

**🔧 Developer Experience**  
Hot and live reloading, comprehensive error messages, and intuitive APIs make development a pleasure.

---

## 🏗️ Core Architecture

### The Behavior-First Paradigm

BEAMJS introduces a processor-oriented architecture and a groundbreaking approach in which behaviors act as the fundamental building blocks of the application. These behaviors can be iteratively edited or replaced within modern agile, AI-assisted software development and dynamic runtime environments. Each behavior encapsulates a complete business operation, including input validation, processing, and response formatting.

BEAMJS is inherently designed to support **Behavior-Driven Development (BDD)** and serves as an **executable translation of behavioral modeling**. It seamlessly integrates with and empowers **Chain-of-Thought (CoT)** and **Tree-of-Thought (ToT)** reasoning engines to enable advanced, context-aware decision logic and behavior algebra.

```javascript
module.exports.processOrder = behavior({
    name: 'processOrder',
    inherits: FunctionalChainBehavior,
    version: '1',
    type: 'integration_with_action',
    path: '/orders/:id/process',
    method: 'POST'
}, function (init) {
    return function () {
        var self = init.apply(this, arguments).self();
        
        self.catch(function (e) {
            return error || e;
        }).next()
         .guard(function () {
            // ✅ Input validation
         })
         .authenticate([...])
         .then(function (result, error) {
            // 🔐 Secure authentication
         }).next()
         .request(() => [...])
         .then(function (result, error) {
            // 🌐 External service integration
         }).next()
         .entity(new Order())
         .insert(() => ({...}))
         .then(function (orders, error) {
            // 💾 Database operations
         }).next()
         .map(function (response) {
            // 📤 Response formatting
         }).end();
    };
});
```

---

### Next Steps

Continue reading the documentation:

- **[Getting Started](./installation/installation.md)**
  - [Installation](./installation/installation.md)
  - [Starter](./installation/starter.md)
  - [Architecture](./architecture.md)
  - [Behaviors](./behaviors.md)
- **[Usage](./usage/backend.md)**
  - [Backend](./usage/backend.md)
  - [Model](./usage/model.md)
  - [Entity](./usage/entity.md)
  - [Query](./usage/query.md)
  - [Service](./usage/service.md)
  - [Data](./usage/data.md)
  - [Behavior](./usage/behavior.md)