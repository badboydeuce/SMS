// Load environment variables from .env file
require('dotenv').config();
const chalk = require('chalk');  // Import chalk for colored console output
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const https = require('https');

// Environment variables for sensitive data
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;  // Admin chat ID for approving users

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Load approved users from file
let approvedUsers = [];  // Dynamically manage approved users
const approvedUsersFile = './approved_users.json';

// Helper function to load approved users from JSON file
function loadApprovedUsers() {
    if (fs.existsSync(approvedUsersFile)) {
        approvedUsers = JSON.parse(fs.readFileSync(approvedUsersFile, 'utf8'));
    }
}

// Helper function to save approved users to JSON file
function saveApprovedUsers() {
    fs.writeFileSync(approvedUsersFile, JSON.stringify(approvedUsers, null, 2));
}

// Call the function to load approved users when the bot starts
loadApprovedUsers();

// Helper functions for user management

// Function to approve a user and save persistently
function approveUser(userId) {
    userId = userId.toString();  // Convert to string for consistency
    if (!approvedUsers.includes(userId)) {
        approvedUsers.push(userId);
        saveApprovedUsers();  // Save user approval persistently
        console.log(chalk.green(`User ${userId} approved.`));
        bot.sendMessage(userId, "You have been approved to use the bot. You can now upload a .txt file containing phone numbers.");
    }
}

// Function to remove a user and save persistently
function removeUser(userId) {
    userId = userId.toString();  // Convert to string for consistency
    const index = approvedUsers.indexOf(userId);
    if (index > -1) {
        approvedUsers.splice(index, 1);
        saveApprovedUsers();  // Save user removal persistently
        console.log(chalk.red(`User ${userId} removed.`));
    }
}

// Function to check if a user is approved
function isUserApproved(userId) {
    userId = userId.toString();  // Convert userId to string
    return approvedUsers.includes(userId);
}

// Command handlers
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Welcome! Your access is being verified.");
    const chatId = msg.chat.id.toString();  // Convert chatId to string
    if (!isUserApproved(chatId)) {
        bot.sendMessage(chatId, "You are not approved to use this bot. Please contact the admin.");
    } else {
        bot.sendMessage(chatId, "You are approved to use this bot.");
    }
});

// Approve command (admin-only)
bot.onText(/\/approve (\d+)/, (msg, match) => {
    const chatId = msg.chat.id.toString();  // Convert chatId to string
    const userId = match[1];  // User ID from the command

    if (chatId == ADMIN_CHAT_ID) {
        approveUser(userId);
        bot.sendMessage(chatId, `User ${userId} has been approved.`);
    } else {
        bot.sendMessage(chatId, "You are not authorized to approve users.");
    }
});

// Remove command (admin-only)
bot.onText(/\/remove (\d+)/, (msg, match) => {
    const chatId = msg.chat.id.toString();  // Convert chatId to string
    const userId = match[1];  // User ID from the command

    if (chatId == ADMIN_CHAT_ID) {
        removeUser(userId);
        bot.sendMessage(chatId, `User ${userId} has been removed.`);
    } else {
        bot.sendMessage(chatId, "You are not authorized to remove users.");
    }
});

// File upload and processing
bot.on('document', async (msg) => {
    const chatId = msg.chat.id.toString();  // Convert chatId to string

    // Check if the user is approved before allowing file upload
    if (!isUserApproved(chatId)) {
        bot.sendMessage(chatId, "You are not authorized to upload files.");
        return;
    }

    console.log(chalk.yellow(`Received file from chat: ${chatId}`));
    const fileId = msg.document.file_id;
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

// Express server setup (optional if hosting)
const express = require('express');
const app = express();

app.listen(5000, () => {
    console.log(chalk.yellow("Server is listening on port 5000"));
});