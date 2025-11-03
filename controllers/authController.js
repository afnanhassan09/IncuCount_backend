import bcrypt from 'bcrypt';
import User from '../models/userModel.js';
import Log from '../models/logs.js';

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide username, email, and password'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address'
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long'
            });
        }

        // Check if username already exists
        const existingUsername = await User.findOne({ 
            username: username.trim().toLowerCase() 
        });
        
        if (existingUsername) {
            return res.status(409).json({
                success: false,
                message: 'Username already exists. Please choose a different username'
            });
        }

        // Check if email already exists
        const existingEmail = await User.findOne({ 
            email: email.toLowerCase().trim() 
        });
        
        if (existingEmail) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered. Please use a different email or login'
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const newUser = await User.create({
            username: username.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
        });

        // Log user creation activity
        try {
            await Log.create({
                user_id: newUser._id,
                action_type: 'user_created',
                status: 'success',
                additional_info: {
                    username: newUser.username,
                    email: newUser.email,
                    role: newUser.role
                }
            });
        } catch (logError) {
            console.error('Error logging user creation:', logError);
            // Don't fail registration if logging fails
        }

        // Return user data (excluding password)
        res.status(201).json({
            success: true,
            message: 'Account created successfully!',
            userData: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
                createdAt: newUser.createdAt
            }
        });

    } catch (error) {
        console.error('Registration error:', error);

        // Handle duplicate key error (MongoDB unique constraint)
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({
                success: false,
                message: `${field} already exists`
            });
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }

        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again later.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Authenticate user and login
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req, res) => {
    try {
        const { usernameOrEmail, password } = req.body;

        // Validation
        if (!usernameOrEmail || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide username/email and password'
            });
        }

        // Find user by username or email
        const user = await User.findOne({
            $or: [
                { username: usernameOrEmail.trim() },
                { email: usernameOrEmail.toLowerCase().trim() }
            ]
        });

        // If user not found, don't reveal that the user doesn't exist
        if (!user) {
            // Log failed login attempt (without user_id since user doesn't exist)
            try {
                await Log.create({
                    action_type: 'failed_login',
                    status: 'failure',
                    additional_info: {
                        attempted_login: usernameOrEmail,
                        reason: 'User not found'
                    }
                });
            } catch (logError) {
                console.error('Error logging failed login:', logError);
            }

            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if account is locked
        const isLocked = await user.isLocked();
        if (isLocked) {
            // If still locked, calculate remaining time
            const minutesRemaining = user.lockedUntil ? Math.ceil((user.lockedUntil - new Date()) / (1000 * 60)) : 30;
            
            // Log locked account login attempt
            try {
                await Log.create({
                    user_id: user._id,
                    action_type: 'failed_login',
                    status: 'failure',
                    additional_info: {
                        reason: 'Account locked',
                        lockedUntil: user.lockedUntil,
                        minutesRemaining: minutesRemaining
                    }
                });
            } catch (logError) {
                console.error('Error logging locked account attempt:', logError);
            }

            return res.status(403).json({
                success: false,
                message: `Account temporarily locked due to multiple failed attempts. Please try again in ${minutesRemaining} minutes.`
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            // Increment failed login attempts
            await user.incrementFailedAttempts();

            // Log failed login attempt
            try {
                await Log.create({
                    user_id: user._id,
                    action_type: 'failed_login',
                    status: 'failure',
                    additional_info: {
                        failedAttempts: user.failedLoginAttempts,
                        reason: 'Invalid password'
                    }
                });
            } catch (logError) {
                console.error('Error logging failed login:', logError);
            }

            // Check if account got locked after incrementing attempts
            const updatedUser = await User.findById(user._id);
            const isNowLocked = await updatedUser.isLocked();
            
            if (isNowLocked && updatedUser.lockedUntil) {
                const minutesRemaining = Math.ceil((updatedUser.lockedUntil - new Date()) / (1000 * 60));
                return res.status(403).json({
                    success: false,
                    message: `Account locked for 30 minutes due to multiple failed attempts. Please try again in ${minutesRemaining} minutes.`
                });
            }

            // Calculate remaining attempts
            const remainingAttempts = 5 - updatedUser.failedLoginAttempts;

            return res.status(401).json({
                success: false,
                message: `Invalid credentials. ${remainingAttempts} attempts remaining before account lock.`
            });
        }

        // Password is valid - successful login
        // Update last login and reset failed attempts
        user.lastLogin = new Date();
        user.failedLoginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;
        await user.save();

        // Log successful login
        try {
            await Log.create({
                user_id: user._id,
                action_type: 'login',
                status: 'success',
                ip_address: req.ip || req.connection.remoteAddress,
                user_agent: req.get('user-agent') || null,
                additional_info: {
                    loginMethod: 'username_or_email',
                    lastLogin: user.lastLogin
                }
            });
        } catch (logError) {
            console.error('Error logging successful login:', logError);
            // Don't fail login if logging fails
        }

        // Return user data (excluding password)
        res.status(200).json({
            success: true,
            message: 'Login successful!',
            userData: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again later.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private (requires authentication middleware)
 */
export const logout = async (req, res) => {
    try {
        const userId = req.user?.id || req.body.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Log logout activity
        try {
            await Log.create({
                user_id: user._id,
                action_type: 'logout',
                status: 'success',
                ip_address: req.ip || req.connection.remoteAddress,
                user_agent: req.get('user-agent') || null,
                additional_info: {
                    logoutTime: new Date()
                }
            });
        } catch (logError) {
            console.error('Error logging logout:', logError);
            // Don't fail logout if logging fails
        }

        res.status(200).json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('Logout error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Logout failed. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private (requires authentication middleware)
 */
export const getMe = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        const user = await User.findById(userId).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            userData: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });

    } catch (error) {
        console.error('Get me error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to get user profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

