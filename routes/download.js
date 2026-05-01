import express from 'express';
const router = express.Router();
import LicenseKey from '../models/productKey.js';

// POST /validate-key
// Validates a license key and returns the download URL if unused
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
    license.isUsed = true;
    license.usedAt = new Date();
    await license.save();

    return res.status(200).json({ success: true, downloadUrl: license.downloadUrl });
  } catch (err) {
    console.error('❌ Error validating license key:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
