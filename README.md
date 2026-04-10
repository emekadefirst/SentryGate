## 🛡️ SentryGate: The Fortress for Your APIs

![SentryGate Logo](./public/assets/sentrygatelogo.png)

**SentryGate** is a high-performance, minimalist API Gateway built on **Bun**. It acts as a secure "front door" for your microservices, providing routing, authentication, and rate-limiting with near-zero latency.

Designed for developers who value **Scale, Security, and Simplicity**, SentryGate turns a simple `.toml` file into a battle-hardened entry point for production traffic.

---

## 🚀 Pillars of the Engine

* **⚡ Performance:** Leverages Bun's ultra-fast JavaScript runtime and native Fetch API.
* **🛡️ Security:** Built-in Auth shielding, header masking, and rate limiting to protect your backends.
* **📈 Scale:** Stateless architecture that handles thousands of concurrent requests without breaking a sweat.
* **🛠️ Simplicity:** Configure your entire infrastructure in one human-readable TOML file. No complex UIs or heavy databases required.

---

## 📦 Features

* **Zero-Config Routing:** Map paths to services in seconds.
* **Identity Masking:** Automatically strips `Server` and `X-Powered-By` headers to hide your tech stack.
* **Token-Bucket Rate Limiting:** Prevent DDoS attacks with in-memory IP tracking.
* **Persistent Logging:** High-speed, non-blocking JSON logging to `sentrygate.log`.
* **SSL/TLS Ready:** Native support for secure HTTPS connections.
* **Path Management:** Easy prefix stripping (e.g., `/api/users` -> `/users`).

---

## 🛠️ Quick Start

### 1. Installation
Ensure you have [Bun](https://bun.sh) installed.

```bash
# Clone the repository
git clone https://github.com/emekadefirst/sentrygate.git
cd sentrygate

# Install dependencies
bun install
```

### 2. Configure Your Gate
Create a `sentrygate.toml` in the root directory:

```toml
[base]
logging = true
default_rate_limit = true
custom_rate_limit = false

[server]
port = 3000
name = "Lagos-Main-Gateway"

[services.products]
target = "http://localhost:3001"
strip_prefix = true
auth_required = true
```

### 3. Stand Guard
Start the engine:

```bash
bun run src/index.ts
```

---

## 📊 Monitoring
SentryGate comes with a built-in health check and status reporter. Access it at:
`http://localhost:3000/sentry-status`

---

## 🏗️ Architecture
The project is modularized for easy contribution:
* `src/core`: The Heart (Engine and Routing)
* `src/middleware`: The Shields (Auth, Rate Limiting, Logging)
* `src/utils`: The Tools (Config Loader, Header Masking)

---

## ⚖️ License
MIT © 2026 Victor Chibuogwu Chukwuemeka