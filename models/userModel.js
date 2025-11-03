import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: true,
    },
    failedLoginAttempts: {
        type: Number,
        default: 0,
    },
    lockedUntil: {
        type: Date,
        default: null,
    },
    locked: {
        type: Boolean,
        default: false,
    },
    lastLogin: {
        type: Date,
        default: null,
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user',
    }
}, {timestamps: true});

// Index for faster lookups
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

// Method to check if account is locked
userSchema.methods.isLocked = async function() {
    // Check if account has a lock expiration date
    if (this.lockedUntil) {
        const now = new Date();
        // If lock has expired, auto-unlock
        if (now >= this.lockedUntil) {
            this.locked = false;
            this.lockedUntil = null;
            this.failedLoginAttempts = 0;
            await this.save();
            return false;
        }
        // If lock is still active
        return true;
    }
    // No lock set
    return this.locked || false;
};

// Method to lock account for 30 minutes
userSchema.methods.lockAccount = function() {
    this.locked = true;
    this.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    this.failedLoginAttempts = 5;
    return this.save();
};

// Method to unlock account and reset failed attempts
userSchema.methods.unlockAccount = function() {
    this.locked = false;
    this.lockedUntil = null;
    this.failedLoginAttempts = 0;
    return this.save();
};

// Method to increment failed attempts
userSchema.methods.incrementFailedAttempts = function() {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= 5) {
        return this.lockAccount();
    }
    return this.save();
};

const User = mongoose.model('User', userSchema);

export default User;