# Java Modules

`modules/` contains reusable domain, application and infrastructure boundaries.

```text
Domain ← Application ← Infrastructure ← Runtime
```

Domain code cannot depend on Spring Web, Kafka, Redis, JPA, SQL mappers or device clients. Application modules define use cases and ports; infrastructure modules implement those ports.
