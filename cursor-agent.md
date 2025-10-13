# Playwright Auth Demo: AI-Powered Scraping Agent

This document outlines the architecture and implementation of the AI-powered scraping agent.

**Worker Details:**
- **Name:** `playwright-auth-demo`
- **URL:** `https://playwright-auth-demo.hacolby.workers.dev`

## 1. Core Architecture

The project is a Cloudflare Worker that uses a combination of Browser Rendering (with Puppeteer), Durable Objects, WebSockets, and multiple AI models to perform robust, authenticated web scraping.

-   **Cloudflare Worker:** The main entry point for all requests. It handles WebSocket upgrades and serves the frontend monitoring UI.
-   **Durable Object (`WebSocketHandlerDO`):** Acts as a central hub for all WebSocket connections. It maintains a list of all connected clients (browsers, test scripts, etc.) and broadcasts messages to them, ensuring all observers see the same real-time updates.
-   **WebSocket API:** The primary interface for interacting with the scraper. Clients connect to the Durable Object and send `initiate_scrape` messages. The worker then pushes `status_update` and `vision_update` messages to all connected clients.
-   **Puppeteer with Browser Rendering:** The core of the browser automation. The worker launches a headless browser instance via the `BROWSER` binding and uses Puppeteer to control it.
-   **R2 Bucket:** Used to store all assets generated during a scrape, including screenshots and extracted data. A public URL is configured to allow the frontend to display the vision screenshots.
-   **D1 Database:** Persists the configuration for target sites (login URLs, secret variable names) and the metadata for each scraping job and its extracted assets.

## 2. The "See, Think, Act" Agentic Loop

The scraper's key innovation is its agentic workflow, which uses two distinct AI models to navigate and understand web pages. This makes the scraper more resilient to website changes than traditional scrapers that rely on hardcoded CSS selectors.

The loop consists of three main phases:

1.  **See (Vision):**
    -   At each critical step of the process (e.g., on the login page, after navigating), the agent takes a screenshot using `page.screenshot()`.
    -   This screenshot is sent to a specialized vision model (`@cf/llava-hf/llava-1.5-7b-hf`).
    -   The model is prompted to describe what it sees on the page in the context of the current goal (e.g., "I need to log in. What do I see?").
    -   The screenshot and the AI's description are broadcast to all connected clients via a `vision_update` message.

2.  **Think (Reasoning):**
    -   The textual description from the vision model is passed to a powerful reasoning model (`@cf/openai/gpt-oss-120b`).
    -   This model is given the overall goal (e.g., "Log in to the site," "Extract job details") and the vision analysis.
    -   It is prompted to return a single, specific action in a JSON format, such as `{ "action": "type", "selector": "input[name=session_key]" }` or `{ "action": "click", "selector": "button[type=submit]" }`.

3.  **Act (Execution):**
    -   The worker parses the JSON decision from the reasoning model.
    -   It then executes the specified action using Puppeteer's functions (`page.type()`, `page.click()`).
    -   The loop then repeats, starting with a new "See" phase to analyze the result of the action.

This loop makes the authentication process particularly robust, as it no longer relies on fragile, hardcoded selectors.

## 3. Real-Time Monitoring Frontend

A simple but effective `index.html` page is served from the worker's root URL. It uses Tailwind CSS for styling and immediately connects to the Durable Object via a WebSocket. It is designed to:

-   Display the WebSocket connection status.
-   Show a running log of all `status_update` messages from the worker.
-   Display the "AI Vision Feed," which renders the screenshots and the vision model's analysis in real-time as `vision_update` messages are received.

This provides an invaluable, real-time window into the agent's "mind" as it works.

## 4. Next Steps: A More Robust Scraping Methodology

The current implementation has successfully proven the "See, Think, Act" loop for authentication. The next phase of development should focus on making the data extraction phase equally intelligent.

-   **Agentic Extraction:** The `scrapingLoop` function should be expanded to be a true loop, similar to the authentication process. Instead of a single `extract` call, it should repeatedly "See, Think, Act" to navigate complex job pages, click "show more" buttons, open tabs, and handle pagination until it has gathered all the required information.
-   **Dynamic Schema Generation:** The reasoning model could be prompted to *generate* the extraction schema based on the agent's goal. For example, if the goal is "Extract all details about this job posting," the model could decide that the schema should be `{ "jobTitle": "...", "company": "...", "salary": "..." }` and then find the selectors for each of those fields.
-   **Error Recovery:** The agent could be made more resilient. If an action fails (e.g., a click does not lead to a navigation), it could re-evaluate the page and try a different approach, rather than immediately failing the job.
-   **State Management:** For very long-running or multi-page scrapes, the agent's state (e.g., what it has already extracted, what pages it has visited) could be persisted to the D1 database between steps.
