const express = require('express');
const router = express.Router();

const responses = [
  "Asante kwa swali lako! Tutakusaidia.",
  "Nakuelewa. Hebu nikupe maelezo zaidi.",
  "Hiyo ni swali zuri! Natafuta jibu.",
  "Tunaweza kukusaidia na hilo. Subiri kidogo.",
  "Ndiyo, bidhaa hiyo inapatikana kwa bei nzuri.",
  "Tuna bidhaa mbalimbali zinazokufaa.",
  "Karibu CITYFIND! Tupo hapa kukusaidia."
];

router.post('/chat', (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ success: false, message: 'Message is required' });
  }
  
  let reply = responses[Math.floor(Math.random() * responses.length)];
  
  if (message.toLowerCase().includes('price') || message.toLowerCase().includes('bei')) {
    reply = "Bei zetu ni nafuu na zinashindana. Tuna ofa maalum kwa bidhaa nyingi!";
  } else if (message.toLowerCase().includes('delivery') || message.toLowerCase().includes('usafirishaji')) {
    reply = "Tunatoa huduma ya usafirishaji bure kwa maagizo zaidi ya TZS 100,000.";
  } else if (message.toLowerCase().includes('stock') || message.toLowerCase().includes('hisa')) {
    reply = "Bidhaa zetu zote ziko stock. Tunaweza kuthibitisha upatikanaji wa bidhaa yoyote.";
  }
  
  res.json({ success: true, data: { reply, timestamp: new Date().toISOString() } });
});

router.get('/status', (req, res) => {
  res.json({ success: true, data: { status: 'online', version: '1.0.0' } });
});

module.exports = router;
