import mongoose from 'mongoose';

const colonySettingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
    },
    icon: {
        type: String,
        default: null,
    },
    image_path: {
        type: String,
        default: null,
    },
    parameters: {
        type: [{
            label: {
                type: String,
            },
            value: {
                type: String,
            }
        }],
        default: []
    },
    params: {
        threshold_type: String,
        threshold_value: Number,
        min_radius: Number,
        max_radius: Number,
        enable_color_grouping: Boolean,
        coarseness: Number,
        neighbours: Number,
        default: {}
    },

}, {timestamps: true});

const ColonySetting = mongoose.model('ColonySetting', colonySettingSchema);

export default ColonySetting;