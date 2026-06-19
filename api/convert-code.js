export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  try {
    const { code } = req.body || {};

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        error: 'Codice mancante',
      });
    }

    const apiUrl = process.env.CONVERSION_API_URL;
    const apiUsername = process.env.CONVERSION_API_USERNAME;
    const apiPassword = process.env.CONVERSION_API_PASSWORD;

    if (!apiUrl || !apiUsername || !apiPassword) {
      return res.status(500).json({
        error: 'Variabili API conversione mancanti',
      });
    }

    const cleanCode = code.trim();
    const basicAuth = Buffer.from(`${apiUsername}:${apiPassword}`).toString('base64');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify(cleanCode),
    });

    const rawText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Errore API conversione',
        detail: rawText,
      });
    }

    let publicCode = rawText;

    try {
      const parsed = JSON.parse(rawText);

      if (typeof parsed === 'string') {
        publicCode = parsed;
      } else {
        publicCode =
          parsed.final_code ||
          parsed.public_code ||
          parsed.code ||
          parsed.itemCode ||
          parsed.result ||
          rawText;
      }
    } catch {
      publicCode = rawText;
    }

    publicCode = String(publicCode).replace(/^"|"$/g, '').trim();

    if (!publicCode) {
      return res.status(404).json({
        error: 'Codice pubblico non trovato',
      });
    }

    return res.status(200).json({
      input_code: cleanCode,
      public_code: publicCode,
      final_code: publicCode,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Errore server',
    });
  }
}
