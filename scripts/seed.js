import 'dotenv/config';
import mongoose from 'mongoose';
import LicenseKey from '../models/productKey.js';

const seedData = {
  key: 'VY3H-97QK-T1ZP-4MA8',
  isUsed: false,
  downloadUrl: 'https://drive.google.com/file/d/1v5s4-bcxOjD7n0hM_aanpgoeQLAoLNhy/view?usp=drive_link',
};

async function seed() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB.');

    // Remove existing record with the same key to avoid duplicate conflicts
    const existing = await LicenseKey.findOne({ key: seedData.key });
    if (existing) {
      console.log(`⚠️  Existing record found for key "${seedData.key}". Deleting it...`);
      await LicenseKey.deleteOne({ key: seedData.key });
      console.log('🗑️  Existing record deleted.');
    }

    const licenseKey = await LicenseKey.create(seedData);
    console.log('🌱 Seed record created successfully:', licenseKey);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

seed();
