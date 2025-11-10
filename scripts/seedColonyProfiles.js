import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ColonySetting from '../models/colonySetting.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/bacterial-colony';

const defaultProfiles = [
    {
        name: 'Anarobic Count Film',
        description: 'Used for detecting and quantifying anaerobic bacteria that grow in oxygen-free environments.',
        image_path: 'Trays/AC.png',
        icon: 'anaerobic',
        parameters: [
            { label: 'Incubation', value: '37°C' },
            { label: 'Duration', value: '48 hrs' },
        ],
        params: {
            threshold_type: 'regular',
            threshold_value: 15,
            min_radius: 3,
            max_radius: 50,
            enable_color_grouping: false,
            coarseness: 10.0,
            neighbours: 10,
        },
    },
    {
        name: 'Coliform (CC) Film',
        description: 'Designed to detect coliform bacteria, commonly used for testing water and food safety.',
        image_path: 'Trays/CF.png',
        icon: 'coliform',
        parameters: [
            { label: 'Incubation', value: '35°C' },
            { label: 'Duration', value: '24 hrs' },
        ],
        params: {
            threshold_type: 'regular',
            threshold_value: 15,
            min_radius: 3,
            max_radius: 50,
            enable_color_grouping: false,
            coarseness: 10.0,
            neighbours: 10,
        },
    },
    {
        name: 'MacConkey Plates',
        description: 'Selective medium for isolating and differentiating Gram-negative bacteria based on lactose fermentation.',
        image_path: 'Trays/MacConkey.png',
        icon: 'maconkey',
        parameters: [
            { label: 'Medium', value: 'Agar Plate' },
            { label: 'Indicator', value: 'Neutral Red' },
        ],
        params: {
            threshold_type: 'regular',
            threshold_value: 15,
            min_radius: 3,
            max_radius: 50,
            enable_color_grouping: true,
            coarseness: 10.0,
            neighbours: 10,
        },
    },
    {
        name: 'Nutrient Plates',
        description: 'General-purpose medium supporting the growth of a wide range of non-fastidious organisms.',
        image_path: 'Trays/NP.png',
        icon: 'nutrient',
        parameters: [
            { label: 'Medium', value: 'Agar Plate' },
            { label: 'Use case', value: 'General growth' },
        ],
        params: {
            threshold_type: 'regular',
            threshold_value: 15,
            min_radius: 3,
            max_radius: 50,
            enable_color_grouping: false,
            coarseness: 10.0,
            neighbours: 10,
        },
    },
];

const seedColonyProfiles = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        for (const profile of defaultProfiles) {
            const result = await ColonySetting.findOneAndUpdate(
                { name: profile.name },
                {
                    $set: {
                        ...profile,
                        user: null,
                    },
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true,
                }
            );

            console.log(`Seeded profile: ${result.name}`);
        }

        console.log('Colony profiles seeding completed');
    } catch (error) {
        console.error('Failed to seed colony profiles:', error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
};

seedColonyProfiles();

