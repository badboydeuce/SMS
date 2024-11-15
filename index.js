require('dotenv').config();
const chalk = require('chalk');  // For colored console output
const TelegramBot = require('node-telegram-bot-api');
const Twilio = require('twilio');
const express = require('express');
const fs = require('fs');
const https = require('https');

// Environment variables for sensitive data
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;  // Admin chat ID for approving users

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const app = express();

// Load approved users from the JSON file
let approvedUsers = [];

// Load approved users from file (if available)
const loadApprovedUsers = () => {
    try {
        const data = fs.readFileSync('./approved_users.json', 'utf8');
        approvedUsers = JSON.parse(data);
        console.log(chalk.blue('Loaded approved users:', approvedUsers));
    } catch (err) {
        console.log(chalk.red('Error loading approved users:', err));
    }
};

// Save approved users to the file
const saveApprovedUsers = () => {
    try {
        fs.writeFileSync('./approved_users.json', JSON.stringify(approvedUsers, null, 2));
        console.log(chalk.green('Approved users saved.'));
    } catch (err) {
        console.error(chalk.red('Error saving approved users:', err));
    }
};

// Helper functions for user management
function approveUser(userId) {
    if (!approvedUsers.includes(userId)) {
        approvedUsers.push(userId);
        saveApprovedUsers();  // Save the updated list to the file
        console.log(chalk.green(`User ${userId} approved.`));
        bot.sendMessage(userId, "You have been approved to use the bot. You can now upload a .txt file containing phone numbers.");
    }
}

function removeUser(userId) {
    const index = approvedUsers.indexOf(userId);
    if (index > -1) {
        approvedUsers.splice(index, 1);
        saveApprovedUsers();  // Save the updated list to the file
        console.log(chalk.red(`User ${userId} removed.`));
    }
}

function isUserApproved(userId) {
    console.log(chalk.yellow(`Checking if user ${userId} is approved...`));
    const approved = approvedUsers.includes(userId);
    console.log(chalk.blue(`User ${userId} approval status: ${approved}`));
    return approved;
}

// Command handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log(chalk.yellow(`User ${chatId} sent /start command.`));
    
    if (!isUserApproved(chatId)) {
        bot.sendMessage(chatId, "You are not approved to use this bot. Please contact the admin.");
    } else {
        bot.sendMessage(chatId, "You are approved to use this bot.");
    }
});

// Admin-only commands for approving and removing users
bot.onText(/\/approve (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];

    if (chatId == ADMIN_CHAT_ID) {
        approveUser(userId);
        bot.sendMessage(chatId, `User ${userId} has been approved.`);
    } else {
        bot.sendMessage(chatId, "You are not authorized to approve users.");
    }
});

bot.onText(/\/remove (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];

    if (chatId == ADMIN_CHAT_ID) {
        removeUser(userId);
        bot.sendMessage(chatId, `User ${userId} has been removed.`);
    } else {
        bot.sendMessage(chatId, "You are not authorized to remove users.");
    }
});

// File upload and processing
bot.on('document', async (msg) => {
    const fileId = msg.document.file_id;
    const chatId = msg.chat.id;

    console.log(chalk.yellow(`Received document from user: ${chatId}`));

    if (!isUserApproved(chatId)) {
        bot.sendMessage(chatId, "You are not authorized to upload files.");
        return;
    }

    console.log(chalk.green(`User ${chatId} is authorized to upload files.`));

    const file = await bot.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const filePath = './phone_numbers.txt';
    
    https.get(url, (response) => {
        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
            bot.sendMessage(chatId, "File received. Use the command /send <message> to send bulk SMS.");
            console.log(chalk.yellow('File successfully downloaded and saved.'));
        });
    }).on('error', (error) => {
        console.error(chalk.red(`Error downloading file: ${error.message}`));
        bot.sendMessage(chatId, "There was an error downloading the file.");
    });
});

// Sending SMS via Twilio
async function sendBulkSMS(numbers, message, chatId) {
    console.log(chalk.yellow("Sending...."));

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    for (const number of numbers) {
        try {
            await delay(1000);
            const sendOne = await twilioClient.messages.create({
                body: message,
                from: TWILIO_PHONE_NUMBER,
                to: number
            });
            console.log(chalk.green(`SMS sent to ${number} with SID ${sendOne.sid}`));
        } catch (error) {
            console.error(chalk.red(`Error sending SMS to ${number}: ${error.message}`));
        }
    }

    bot.sendMessage(chatId, `All SMS messages have been sent to ${numbers.length} recipients.`);
    console.log(chalk.yellow(`All SMS messages have been sent to ${numbers.length} recipients.`));
}

// Sending SMS command
bot.onText(/\/send (.+)/, (msg, match) => {
    const chatId = msg.chat.id;

    if (!isUserApproved(chatId)) {
        bot.sendMessage(chatId, "You are not authorized to use this command.");
        return;
    }

    const message = match[1];
    fs.readFile('./phone_numbers.txt', 'utf8', (err, data) => {
        if (err) {
            bot.sendMessage(chatId, "Failed to read the phone numbers file.");
            console.error(chalk.red("Failed to read the phone numbers file."));
            return;
        }

        const numbers = data.split('\n').filter(Boolean);
        bot.sendMessage(chatId, `Sending SMS to ${numbers.length} recipients...`);
        console.log(chalk.yellow(`Sending SMS to ${numbers.length} recipients...`));

        sendBulkSMS(numbers, message, chatId);
    });
});

// Express server setup (for webhook if needed)
app.listen(5000, () => {
    console.log(chalk.yellow("Server is listening on port 5000"));
});

// Load approved users when the bot starts
loadApprovedUsers();