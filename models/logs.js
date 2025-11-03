import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false, // Some logs might be system-level without a user
    },
    action_type: {
        type: String,
        required: true,
        enum: [
            // Authentication logs
            'login',
            'logout',
            'failed_login',
            
            // Colony counting/processing logs
            'count_colony_processing',
            'colony_detection',
            
            // Export logs
            'export_results',
            
            // Camera settings logs
            'camera_settings_change',
            
            // Additional log types for future extensibility
            'profile_created',
            'profile_updated',
            'profile_deleted',
            'user_created',
            'user_deleted',
            'error',
            'system_event'
        ],
        index: true, // Index for faster queries on action_type
    },
    image_path: {
        type: String,
        default: null,
    },
    output_image_path: {
        type: String,
        default: null,
    },
    image_name: {
        type: String,
        default: null,
    },
    colonies_detected: {
        type: Number,
        default: null,
    },
    additional_info: {
        type: mongoose.Schema.Types.Mixed, // Can store JSON objects directly
        default: null,
    },
    // Additional metadata fields
    ip_address: {
        type: String,
        default: null,
    },
    user_agent: {
        type: String,
        default: null,
    },
    session_id: {
        type: String,
        default: null,
    },
    // For error logs
    error_message: {
        type: String,
        default: null,
    },
    error_stack: {
        type: String,
        default: null,
    },
    // Status for tracking success/failure
    status: {
        type: String,
        enum: ['success', 'failure', 'pending', 'error'],
        default: 'success',
    },
}, {
    timestamps: true, // Adds createdAt and updatedAt automatically
});

// Indexes for common queries
logSchema.index({ user_id: 1, createdAt: -1 }); // User activity logs sorted by date
logSchema.index({ action_type: 1, createdAt: -1 }); // Action type queries
logSchema.index({ createdAt: -1 }); // General date-based queries
logSchema.index({ user_id: 1, action_type: 1 }); // Combined user and action type queries

// Virtual for formatted timestamp (if needed)
logSchema.virtual('formattedTimestamp').get(function() {
    return this.createdAt.toISOString();
});

// Method to get log summary
logSchema.methods.getSummary = function() {
    return {
        id: this._id,
        user_id: this.user_id,
        action_type: this.action_type,
        status: this.status,
        colonies_detected: this.colonies_detected,
        image_name: this.image_name,
        createdAt: this.createdAt,
    };
};

// Static method to get logs by action type
logSchema.statics.getLogsByActionType = function(actionType, limit = 100) {
    return this.find({ action_type: actionType })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user_id', 'username email')
        .exec();
};

// Static method to get user activity logs
logSchema.statics.getUserLogs = function(userId, limit = 100) {
    return this.find({ user_id: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user_id', 'username email')
        .exec();
};

// Static method to get logs by date range
logSchema.statics.getLogsByDateRange = function(startDate, endDate, limit = 1000) {
    return this.find({
        createdAt: {
            $gte: startDate,
            $lte: endDate
        }
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user_id', 'username email')
        .exec();
};

// Static method to get statistics
logSchema.statics.getLogStatistics = async function(userId = null) {
    const matchStage = userId ? { user_id: mongoose.Types.ObjectId(userId) } : {};
    
    const stats = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: '$action_type',
                count: { $sum: 1 },
                lastOccurrence: { $max: '$createdAt' }
            }
        },
        { $sort: { count: -1 } }
    ]);
    
    return stats;
};

const Log = mongoose.model('Log', logSchema);

export default Log;

