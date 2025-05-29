// api/telegram-webhook.js
import TelegramBot from 'node-telegram-bot-api';

// Environment Variables (These must be set on Vercel under Project Settings -> Environment Variables)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// NEWS_API_URL_BASE should be something like 'https://airshorts.vercel.app/news'
// The bot will append '?category=<category_name>' to this base URL.
const NEWS_API_BASE_URL = process.env.NEWS_API_URL_BASE;

// Initialize bot (no polling, as we'll use webhooks for incoming updates)
// The 'polling: false' option is usually implicit when no polling options are provided,
// but explicitly setting it can be clearer for webhook-based bots.
const bot = TELEGRAM_BOT_TOKEN ? new TelegramBot(TELEGRAM_BOT_TOKEN) : null;

// This is the main serverless function handler that Vercel will call
// when Telegram sends an update to your webhook URL.
export default async function handler(req, res) {
    // Ensure the request method is POST, as Telegram sends updates via POST.
    if (req.method !== 'POST') {
        // Return 405 Method Not Allowed for any other request method.
        return res.status(405).send('Method Not Allowed');
    }

    // Basic check to ensure bot token is available
    if (!bot) {
        console.error("TELEGRAM_BOT_TOKEN is not set. Cannot initialize bot.");
        return res.status(500).send("Bot not configured. Check environment variables.");
    }

    try {
        // Parse the incoming update from Telegram's request body.
        const update = req.body;
        console.log('Received Telegram update:', JSON.stringify(update, null, 2));

        // Use bot.processUpdate to pass the update to the 'node-telegram-bot-api' library.
        // This will trigger the appropriate 'onText' or 'on' event listeners defined below.
        bot.processUpdate(update);

        // Respond quickly to Telegram with a 200 OK to acknowledge receipt.
        // This prevents Telegram from retrying the update.
        res.status(200).send('OK');

    } catch (error) {
        // Log any errors that occur during the processing of the webhook.
        console.error('Error processing Telegram webhook:', error);
        res.status(500).send('Error processing update.');
    }
}

// --- Bot Command Handlers (These listen for specific commands/messages) ---

// Handler for the /start command.
// When a user sends /start, this function sends a welcome message.
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id; // Get the ID of the chat where the message originated.
    await bot.sendMessage(chatId, "Hello! I'm your AirShorts news bot. Send me a command like /news or /news <category> to get the latest headlines. Try /news all, /news technology, or /news sports!");
});

// Handler for the /news command. It can optionally take a category.
// The regex `/\/news(?:\s+(.+))?/` matches "/news" followed by optional whitespace and any characters after that.
// `match[1]` will capture the text after "/news ".
bot.onText(/\/news(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    // Extract the category from the command. Default to 'all' if no category is provided.
    let category = match[1] ? match[1].toLowerCase().trim() : 'all';

    await bot.sendMessage(chatId, `Fetching latest news for category: *${category}*...`, { parse_mode: 'Markdown' });

    // Define the list of valid categories your API supports.
    const allowedCategories = [
        'all', 'national', 'business', 'sports', 'world', 'politics',
        'technology', 'startup', 'entertainment', 'miscellaneous',
        'hatke', 'science', 'automobile'
    ];

    // Validate the requested category against the allowed list.
    if (!allowedCategories.includes(category)) {
        await bot.sendMessage(chatId, `Sorry, "${category}" is not a valid category. Please try one of these: \n\`${allowedCategories.join('`, `')}\`.`, { parse_mode: 'Markdown' });
        return; // Stop execution if category is invalid.
    }

    // Ensure NEWS_API_BASE_URL is set before attempting to fetch.
    if (!NEWS_API_BASE_URL) {
        console.error("NEWS_API_URL_BASE environment variable is not set.");
        await bot.sendMessage(chatId, "Bot configuration error: News API URL is not set. Please inform the bot administrator.");
        return;
    }

    try {
        // Construct the full news API URL with the chosen category.
        const newsApiUrl = `${NEWS_API_BASE_URL}?category=${encodeURIComponent(category)}`;
        console.log(`Fetching news from: ${newsApiUrl}`);
        const newsResponse = await fetch(newsApiUrl);

        // Check if the API response was successful (HTTP status 2xx).
        if (!newsResponse.ok) {
            const errorText = await newsResponse.text();
            console.error(`Failed to fetch news from AirShorts API: ${newsResponse.status} - ${errorText}`);
            await bot.sendMessage(chatId, "Sorry, I'm having trouble fetching news right now from the source. Please try again later.");
            return;
        }

        const newsData = await newsResponse.json();

        // Check if the news data contains any articles.
        if (!newsData || !newsData.data || newsData.data.length === 0) {
            await bot.sendMessage(chatId, `No news found for category: *${category}*. Please try another category or check back later.`, { parse_mode: 'Markdown' });
            return;
        }

        // Get the most recent news article from the data array.
        // You could loop through `newsData.data` to send multiple articles if desired.
        const latestNews = newsData.data[0];

        // Format the message for Telegram using HTML parse_mode for rich text (bold, links).
        // Max message length is 4096 characters. Substring content for safety.
        // `.replace(/\n/g, ' ')` is used to remove newlines within text to avoid Telegram HTML parsing issues.
        const htmlMessage = `
<b>${latestNews.title ? latestNews.title.replace(/\n/g, ' ').trim() : 'No Title Available'}</b>

${latestNews.content ? latestNews.content.replace(/\n/g, ' ').substring(0, 1000).trim() : 'No content available.'}${latestNews.content && latestNews.content.length > 1000 ? '...' : ''}

<a href="${latestNews.readMoreUrl}">Read More</a>
Source: Inshorts by ${latestNews.author ? latestNews.author.trim() : 'Unknown Author'}
`;

        // Send the formatted message to the user/chat.
        await bot.sendMessage(chatId, htmlMessage, { parse_mode: 'HTML', disable_web_page_preview: false });
        console.log(`News for '${category}' successfully sent to chat ${chatId}.`);

    } catch (error) {
        // Catch any unexpected errors during the process.
        console.error('Error in /news command handler:', error);
        await bot.sendMessage(chatId, "An unexpected error occurred while processing your request. Please try again.");
    }
});

// Fallback handler for any messages that are not commands.
// This provides a helpful message to the user if they type something the bot doesn't understand.
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    // Ignore empty messages or messages that are already handled by a command handler (e.g., messages starting with '/')
    if (!msg.text || msg.text.startsWith('/')) {
        return;
    }
    await bot.sendMessage(chatId, "I'm not sure how to respond to that. Try sending /news or /news <category> (e.g., /news technology).");
});
