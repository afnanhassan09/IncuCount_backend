import mongoose from 'mongoose';

const LicenseKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    uppercase: true, // Forces VY3H-97QK...
    trim: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  downloadUrl: {
    type: String,
    required: true
  },
  usedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

export default mongoose.model('LicenseKey', LicenseKeySchema);