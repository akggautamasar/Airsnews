// api/send-news.js
// Note: Vercel's Node.js runtime has `fetch` globally,
// so `node-fetch` might not be strictly necessary if targeting only Vercel.
// If running locally with `node`, ensure `node-fetch` is installed and imported like below.

import TelegramBot from 'node-telegram-bot-api';

// IMPORTANT: These will be populated from Vercel Environment Variables
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID;
// You can change the category in the URL below if you want specific news,
// or keep 'all' as a default if no specific category is desired.
const NEWS_API_URL = process.env.NEWS_API_URL || 'https://airshorts.vercel.app/news?category=all';

// Initialize bot outside the handler to reuse connection (best practice for serverless)
// polling: false is crucial for serverless functions, as they run in response to a trigger
const bot = TOKEN ? new TelegramBot(TOKEN, { polling: false }) : null;

export default async function handler(req, res) {
    // Only allow POST requests for cron jobs for security.
    // Vercel Cron Jobs send POST requests to the function path.
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // Basic check for environment variables being set
    if (!TOKEN || !CHAT_ID || !bot) {
        console.error("Critical: TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is not set in Vercel environment variables.");
        return res.status(500).send("Bot not configured. Check environment variables on Vercel.");
    }

    try {
        console.log(`[${new Date().toISOString()}] Attempting to fetch news from: ${NEWS_API_URL}`);
        const newsResponse = await fetch(NEWS_API_URL);

        // Check if the news API call was successful
        if (!newsResponse.ok) {
            const errorText = await newsResponse.text();
            console.error(`[${new Date().toISOString()}] Failed to fetch news from AirShorts API: ${newsResponse.status} - ${errorText}`);
            return res.status(newsResponse.status).send(`Failed to fetch news from API: ${errorText}`);
        }

        const newsData = await newsResponse.json();

        // Check if there's any news data returned
        if (!newsData || !newsData.data || newsData.data.length === 0) {
            console.log(`[${new Date().toISOString()}] No news found to post from API.`);
            return res.status(200).send('No news found to post.');
        }

        // For simplicity, we'll just take the first news item.
        // In a more advanced setup, you might:
        // - Loop through multiple news items.
        // - Store the ID of the last sent news to avoid duplicates (e.g., in a small database like Vercel Postgres or Upstash Redis).
        // - Filter news based on certain criteria.
        const latestNews = newsData.data[0];

        // Format the message for Telegram using HTML parse_mode for rich text.
        // Telegram message length limit is 4096 characters. Substring content for safety.
        // Replace newlines within content to avoid issues with HTML parsing in Telegram if they break tags.
        const htmlMessage = `
<b>${latestNews.title ? latestNews.title.replace(/\n/g, ' ').trim() : 'No Title'}</b>

${latestNews.content ? latestNews.content.replace(/\n/g, ' ').substring(0, 1000).trim() : 'No content available.'}${latestNews.content && latestNews.content.length > 1000 ? '...' : ''}

<a href="${latestNews.readMoreUrl}">Read More</a>
Source: Inshorts by ${latestNews.author ? latestNews.author.trim() : 'Unknown'}
`;

        console.log(`[${new Date().toISOString()}] Sending news to channel ${CHAT_ID}. Title: "${latestNews.title}"`);
        await bot.sendMessage(CHAT_ID, htmlMessage, { parse_mode: 'HTML', disable_web_page_preview: false });
        console.log(`[${new Date().toISOString()}] News successfully posted to Telegram.`);

        // Respond to Vercel that the function executed successfully
        res.status(200).send('News posted successfully to Telegram channel.');

    } catch (error) {
        // Log any errors that occur during fetching or sending
        console.error(`[${new Date().toISOString()}] An unexpected error occurred in send-news handler:`, error);
        res.status(500).send('An error occurred while posting news.');
    }
}
