import express from 'express';
import axios from 'axios';
import LicenseKey from '../models/productKey.js';

const router = express.Router();

// In-memory store for single-use download tokens
// Map<token, { fileId: string, expiresAt: number }>
const activeDownloads = new Map();

// Helper: generate a random alphanumeric token of given length
function generateToken(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// POST /validate-key
// Validates a license key and issues a single-use download token
router.post('/validate-key', async (req, res) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({ success: false, message: 'Key required' });
    }

    const normalizedKey = key.toUpperCase().trim();

    const license = await LicenseKey.findOne({ key: normalizedKey });

    if (!license) {
      return res.status(404).json({ success: false, message: 'Key not found' });
    }

    if (license.isUsed) {
      return res.status(403).json({ success: false, message: 'Key already redeemed' });
    }

    // Mark the key as used and record the timestamp
    // license.isUsed = true;
    // license.usedAt = new Date();
    // await license.save();

    // Generate a short-lived, single-use download token
    const downloadToken = generateToken(12);
    const fileId = '1v5s4-bcxOjD7n0hM_aanpgoeQLAoLNhy';
    const expiresAt = Date.now() + 60 * 1000; // 60 seconds from now

    activeDownloads.set(downloadToken, { fileId, expiresAt });

    console.log(`✅ Key redeemed. Download token issued (expires in 60s): ${downloadToken}`);

    return res.status(200).json({ success: true, downloadToken });
  } catch (err) {
    console.error('❌ Error validating license key:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /stream/:token
// Validates the one-time token and proxies the file from Google Drive
router.get('/stream/:token', async (req, res) => {
  const { token } = req.params;

  const entry = activeDownloads.get(token);

  // Validate token existence and expiry
  if (!entry) {
    return res.status(403).json({ success: false, message: 'Invalid or expired download token' });
  }

  if (Date.now() > entry.expiresAt) {
    activeDownloads.delete(token);
    return res.status(403).json({ success: false, message: 'Download token has expired' });
  }

  // Consume the token immediately — single-use
  activeDownloads.delete(token);

  const { fileId } = entry;
  const apiKey = process.env.GDRIVE_API_KEY;
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}&acknowledgeAbuse=true`;

  try {
    console.log(`📦 Streaming file ${fileId} for token ${token}...`);

    const driveResponse = await axios.get(driveUrl, { responseType: 'stream' });

    res.setHeader('Content-Disposition', 'attachment; filename="IncuCount_Setup.exe"');
    res.setHeader('Content-Type', 'application/octet-stream');

    driveResponse.data.pipe(res);

    driveResponse.data.on('end', () => {
      console.log(`✅ File stream complete for token ${token}`);
    });

    driveResponse.data.on('error', (streamErr) => {
      console.error('❌ Stream error:', streamErr);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'File stream error' });
      }
    });
  } catch (err) {
    console.error('❌ Error fetching file from Google Drive:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to fetch file from storage' });
    }
  }
});

export default router;
