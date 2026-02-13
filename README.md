***

# Moleculer TypeScript Web Template

A minimal template for building web applications with **MoleculerJS** and **TypeScript**.

This template provides a solid foundation for projects that require a backend API and a static frontend, pre-configured for a fast and efficient development experience.

## ✨ Features

*   **MoleculerJS v0.14**: The latest stable version of the framework.
*   **TypeScript First**: Full type support for robust and maintainable code.
*   **API Gateway**: A single `gateway.service.ts` to serve your static frontend and expose a REST API.
*   **Clean Structure**: A logical and scalable project layout.
*   **Ready-to-Use Scripts**: Simple npm commands for development, building, and linting.
*   **Interactive REPL**: Debug and inspect your services in real-time.

## 📦 What's Inside?

```
.
├── public/               # Your frontend assets (HTML, CSS, JS)
│   └── index.html
├── src/
│   ├── services/         # Application services (business logic)
│   │   ├── gateway.service.ts  # Exposes API and serves the frontend
│   │   └── app.service.ts      # Core application logic
│   ├── index.ts              # Application entry point
│   └── moleculer.config.ts   # Moleculer broker configuration
├── package.json
└── tsconfig.json
```

## 🚀 Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (v16 or higher)
*   [npm](https://www.npmjs.com/)

### 1. Create Your Project

Clone the repo

### 2. Install

```bash

# Install dependencies
npm install
```

### 3. Run in Development Mode

This command starts the application with live-reloading and an interactive REPL.

```bash
npm run dev
```

Your application is now running:
*   **Frontend**: `http://localhost:4005`



## ✍️ How to Use

1.  **Build Your Frontend**: Place your HTML, CSS, and JS files in `public`, now there's a Beer CSS template.
2.  **Add Your Logic**: Implement your application's features by adding new actions to `src/services/app.service.ts`.
3.  **Create New Services**: For more complex features, create new `*.service.ts` files inside the `src/services` folder. They will be loaded automatically.
