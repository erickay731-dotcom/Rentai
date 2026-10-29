// Vercel Serverless - M-Pesa Daraja STK Push
// Set env vars in Vercel dashboard: DARAJA_KEY, DARAJA_SECRET, DARAJA_PASSKEY, SHORTCODE
const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.url.includes('/callback')) {
    const result = req.body?.Body?.stkCallback;
    console.log('M-Pesa Callback:', JSON.stringify(result));
    if (result?.ResultCode === 0) {
      // TODO: Save to DB - unlock AI
      // For now log success
    }
    return res.json({ ResultCode: 0, ResultDesc: 'Success' });
  }

  const { phone, amount, aiId, businessName } = req.body;
  if (!phone || !amount) return res.status(400).json({ success: false, error: 'phone and amount required' });

  try {
    const consumerKey = process.env.DARAJA_KEY;
    const consumerSecret = process.env.DARAJA_SECRET;
    const shortCode = process.env.SHORTCODE || '174379';
    const passkey = process.env.DARAJA_PASSKEY;

    if (!consumerKey) {
      // Sandbox simulation if no keys - for testing without Daraja
      await new Promise(r => setTimeout(r, 2000));
      return res.json({ 
        success: true, 
        simulated: true,
        CheckoutRequestID: 'ws_CO_'+Date.now(),
        message: 'STK Push simulated (add Daraja keys for real M-Pesa)',
        transactionId: 'QGH'+Math.random().toString(36).substr(2,8).toUpperCase()
      });
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const tokenRes = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: { Authorization: `Basic ${auth}` }
    });
    const token = tokenRes.data.access_token;
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0,14);
    const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
    const callbackUrl = `https://${req.headers.host}/api/mpesa/callback`;

    const stkRes = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: shortCode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: `RentAI-${aiId}`,
      TransactionDesc: `Rent ${aiId} for ${businessName}`
    }, { headers: { Authorization: `Bearer ${token}` } });

    return res.json({ success: true, CheckoutRequestID: stkRes.data.CheckoutRequestID, message: 'STK pushed - Enter PIN' });
  } catch (e) {
    console.error(e.response?.data || e.message);
    return res.status(500).json({ success: false, error: e.response?.data || e.message });
  }
};
