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

//         await page.authenticate('username', 'password'); //username and password are secrets stored in the environment and the names would be revealed by matching the url pattern to d1 table `site_config`      
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