/**
 * AUTHENTICATION APPROACHES IN PUPPETEER/PLAYWRIGHT
 * 
 * There are two main approaches to handling authentication:
 * 
 * 1. HTTP BASIC AUTHENTICATION (page.authenticate)
 *    - For sites using browser's native HTTP authentication dialog
 *    - NOT for form-based logins like LinkedIn, Indeed, etc.
 *    - Example: await page.authenticate({ username: 'user', password: 'pass' })
 *    - This sets Authorization header for HTTP Basic Auth
 * 
 * 2. FORM-BASED AUTHENTICATION (DOM manipulation)
 *    - For sites with login forms (username/password fields)
 *    - Most job sites use this approach
 *    - Two methods:
 *      a) Direct selectors (faster, more reliable)
 *      b) AI vision (flexible, slower)
 * 
 * RECOMMENDED HYBRID APPROACH (implemented in auth-service.ts):
 * 1. Try common selectors first (input[type="email"], input[type="password"], etc.)
 * 2. Use page.evaluate() for DOM visibility checks
 * 3. Fall back to AI vision only if common selectors fail
 * 
 * This provides:
 * - Speed: Most sites work with common selectors
 * - Reliability: Direct DOM manipulation is faster than AI
 * - Flexibility: AI vision handles edge cases
 * - Cost: Minimize expensive AI calls
 */

// import { runWithTools } from "@cloudflare/ai-utils";
// import puppeteer from 'puppeteer';

// type Env = {
//   AI: Ai;
// };

// export default {
//   async fetch(request, env): Promise<Response> {
//     // Launch a new browser instance
//     const browser = await puppeteer.launch();
//     const page = await browser.newPage();

//     // Define function
//     const scrapeWebsite = async (args: { url: string }): Promise<string> => {

//         // NOTE: page.authenticate() is for HTTP BASIC AUTH only, NOT form-based login
//         // For form-based login, use DOM manipulation as shown below:
//         
//         // Example: Simple form-based authentication
//         // await page.type('input[type="email"]', username);
//         // await page.type('input[type="password"]', password);
//         // await page.click('button[type="submit"]');
//         // await page.waitForNavigation();      
//       // Navigate to the website
//       await page.goto(args.url);

//       // Get the HTML content of the page
//       const html = await page.content();

//       // Close the browser instance
//       await browser.close();

//       return html;
//     };

//     // Run AI inference with function calling
//     const response = await runWithTools(
//       env.AI,
//       // Model with function calling support
//       "@hf/nousresearch/hermes-2-pro-mistral-7b",
//       {
//         // Messages
//         messages: [
//           {
//             role: "user",
//             content: "What is the HTML content of https://example.com?",
//           },
//         ],
//         // Definition of available tools the AI model can leverage
//         tools: [
//           {
//             name: "scrapeWebsite",
//             description: "Scrape the HTML content of a website",
//             parameters: {
//               type: "object",
//               properties: {
//                 url: { type: "string", description: "the URL of the website" },
//               },
//               required: ["url"],
//             },
//             // reference to previously defined function
//             function: scrapeWebsite,
//           },
//         ],
//       },
//     );

//     return new Response(JSON.stringify(response));
//   },
// } satisfies ExportedHandler<Env>;