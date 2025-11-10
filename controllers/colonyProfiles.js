import ColonySetting from '../models/colonySetting.js';

class ColonyProfilesController {
    async list(req, res) {
        try {
            const { userId } = req.query;

            const visibilityFilters = [
                { user: { $exists: false } },
                { user: null }
            ];

            if (userId) {
                visibilityFilters.push({ user: userId });
            }

            const profiles = await ColonySetting.find({
                $or: visibilityFilters
            })
            .sort({ createdAt: -1 })
            .lean();

            // If a userId is provided and both a global and user copy exist for the same "name",
            // prefer the user-owned copy and filter out the global duplicate.
            let filtered = profiles;
            if (userId) {
                const byName = new Map();
                for (const p of profiles) {
                    const key = (p.name || '').toLowerCase().trim();
                    const existing = byName.get(key);
                    if (!existing) {
                        byName.set(key, p);
                        continue;
                    }
                    // Prefer the user-owned profile when duplicates exist
                    const existingIsUser = existing.user && String(existing.user) === String(userId);
                    const currentIsUser = p.user && String(p.user) === String(userId);
                    if (!existingIsUser && currentIsUser) {
                        byName.set(key, p);
                    }
                }
                filtered = Array.from(byName.values());
            }

            return res.status(200).json({
                success: true,
                message: 'Colony profiles fetched successfully',
                profiles: filtered
            });
        } catch (error) {
            console.error('Failed to fetch colony profiles:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch colony profiles',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async create(req, res) {
        try {
            const {
                name,
                description,
                image_path,
                parameters,
                params,
                userId
            } = req.body || {};

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'Profile name is required'
                });
            }

            const newProfile = new ColonySetting({
                name,
                description,
                image_path: image_path || null,
                parameters: Array.isArray(parameters) ? parameters : [],
                params: params || {},
                ...(userId ? { user: userId } : {})
            });

            const savedProfile = await newProfile.save();

            return res.status(201).json({
                success: true,
                message: 'Colony profile created successfully',
                profile: savedProfile
            });
        } catch (error) {
            console.error('Failed to create colony profile:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to create colony profile',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const {
                name,
                description,
                image_path,
                parameters,
                params,
                // Optional: used to ensure only owner can edit; skip enforcement for now
                userId
            } = req.body || {};
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing userId'
                });
            }
            console.log('userId', userId);
            const existing = await ColonySetting.findById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: 'Colony profile not found'
                });
            }

            // If the profile is global (no user) OR belongs to a different user,
            // clone it for this user instead of modifying the original.
            const belongsToUser = existing.user && userId && String(existing.user) === String(userId);
            const isGlobal = !existing.user;

            if (isGlobal || (!belongsToUser && userId)) {
                const clone = new ColonySetting({
                    name: existing.name, // keep the original name
                    description: typeof description === 'string' ? description : existing.description,
                    image_path: (typeof image_path === 'string' || image_path === null) ? (image_path || null) : existing.image_path,
                    parameters: Array.isArray(parameters) ? parameters : existing.parameters,
                    params: params && typeof params === 'object' ? { ...existing.params, ...params } : existing.params,
                    user: userId || null
                });
                const savedClone = await clone.save();
                return res.status(201).json({
                    success: true,
                    message: 'Colony profile cloned for user',
                    profile: savedClone
                });
            } else {
                // Update in-place for the owner
                if (typeof name === 'string') existing.name = name;
                if (typeof description === 'string') existing.description = description;
                if (typeof image_path === 'string' || image_path === null) existing.image_path = image_path || null;
                if (Array.isArray(parameters)) existing.parameters = parameters;
                if (params && typeof params === 'object') {
                    existing.params = {
                        ...existing.params,
                        ...params
                    };
                }

                const saved = await existing.save();
                return res.status(200).json({
                    success: true,
                    message: 'Colony profile updated successfully',
                    profile: saved
                });
            }
        } catch (error) {
            console.error('Failed to update colony profile:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to update colony profile',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async remove(req, res) {
        try {
            const { id } = req.params;
            // Accept userId from query or body
            const userId = req.query.userId || (req.body && req.body.userId);

            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing profile id'
                });
            }
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing userId'
                });
            }

            const existing = await ColonySetting.findById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: 'Colony profile not found'
                });
            }

            // Only allow deleting profiles owned by the user
            if (!existing.user || String(existing.user) !== String(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Not allowed to delete this profile'
                });
            }

            await ColonySetting.deleteOne({ _id: id });
            return res.status(200).json({
                success: true,
                message: 'Colony profile deleted successfully'
            });
        } catch (error) {
            console.error('Failed to delete colony profile:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete colony profile',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

export default new ColonyProfilesController();
