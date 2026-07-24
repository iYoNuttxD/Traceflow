# Shared backend

Esta pasta é reservada a código realmente transversal e independente de domínio. Na E2 não foi criada infraestrutura compartilhada de erro, validação ou persistência, pois isso pertence às etapas posteriores e criaria abstração prematura.

Módulos não devem colocar regras de negócio aqui. Um utilitário só deve migrar para `shared` após possuir pelo menos dois consumidores reais e não depender de controller, route, repository ou domínio específico.
