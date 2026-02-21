# ⚡ DevFormat (JSON & YAML Compare)

**Live Preview**: [https://yaml.zee.im](https://yaml.zee.im)

DevFormat is a lightning-fast, privacy-first, client-side application designed to format, validate, and highlight errors in **JSON** and **YAML** data natively in your browser.

## ✨ Features

- **JSON & YAML Support**: Dual-pane editor interface for managing both formats seamlessly.
- **Client-Side Only**: 100% of the formatting and validation happens in your browser. No data is ever sent to a server, ensuring complete privacy.
- **Real-Time Validation**: Instantly catches and highlights syntax errors with precise line and column markers.
- **Vibrant Syntax Highlighting**: Custom CodeMirror 6 integrations explicitly colorizing standard tokens, boolean types, numbers, and null values for immediate visual parsing.
- **Auto/Dark/Light Modes**: Natively adapts to your system preferences with a sleek toggle.
- **Smart 2-Way Synchronization**: 
  - Paste messy data into the Input pane to automatically format it in the Output pane.
  - Tweak the formatted Output pane, and changes instantly sync back to the Input pane.
- **Preserves Comments**: Securely retains all YAML comments during structural reformatting.
- **Persistence**: Automatically restores your tabs, inputs, and outputs across reloads using `localStorage`.

---

## 🚀 Getting Started Locally

DevFormat is built using Vanilla JS, HTML, CSS, and Vite.

### Prerequisites
- Node.js (v20+ recommended)

### Installation
1. Clone the repository and navigate to the directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173`.

---

## 🐳 Running with Docker

You can easily containerize and run DevFormat using Docker and Nginx. This is perfect for self-hosting on a home lab or internal team network.

### Using Docker Compose (Recommended)
1. Ensure both Docker and Docker Compose are installed.
2. From the root directory, run:
   ```bash
   docker-compose up -d
   ```
3. The app will be available at `http://localhost:8080`.

### Using Standard Docker
1. Build the multi-stage image:
   ```bash
   docker build -t devformat .
   ```
2. Run the container:
   ```bash
   docker run -d -p 8080:80 --name devformat-app devformat
   ```

---

## ☁️ Deploying to Cloudflare

Because DevFormat is entirely client-side, it is optimized for free deployment to Cloudflare Pages / Workers using Static Assets routing.

### Option A: Using Cloudflare Console (Recommended)
The easiest way to set up automatic deployments is by connecting your GitHub repository directly to Cloudflare Pages:
1. Log into the [Cloudflare Dashboard](https://dash.cloudflare.com) and navigate to **Workers & Pages**.
2. Click **Create Application** -> **Pages** -> **Connect to Git**.
3. Select your GitHub repository containing DevFormat.
4. Configure the build settings:
   - **Framework preset**: None
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Click **Save and Deploy**. Cloudflare will now automatically build and publish your app every time you push to your repository.

### Option B: Using Wrangler CLI
For manual or CLI-based deployments:
1. Ensure you have the Cloudflare `wrangler` CLI installed:
   ```bash
   npm install -g wrangler
   ```
2. Authenticate your CLI with Cloudflare:
   ```bash
   wrangler login
   ```
3. Build the production bundle:
   ```bash
   npm run build
   ```
4. Deploy using the provided `wrangler.toml` configuration:
   ```bash
   npx wrangler deploy
   ```

Your app will be deployed to the Cloudflare edge network globally in seconds!
