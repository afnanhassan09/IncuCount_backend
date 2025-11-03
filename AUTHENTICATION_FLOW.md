# Authentication Flow Documentation
## Electron.js Application - Sign In & Sign Out Flow

This document describes the complete authentication flow for the Bacterial Colony Electron application.

---

## 📋 **SIGN IN FLOW**

### **Frontend (Renderer Process)**

#### **1. User Interface - `index.html`**
- **Location**: `BacterialColonyElectron/app/renderer/index.html`
- **Form**: Login form with email (usernameInput) and password fields
- **Elements**:
  - `loginFormElement` - Form element
  - `usernameInput` - Email/username input field
  - `passwordInput` - Password input field
  - `loginButton` - Submit button
  - `authMessage` - Message display area

#### **2. Auth Manager - `auth.js`**
- **Location**: `BacterialColonyElectron/app/renderer/js/auth.js`
- **Class**: `AuthManager`
- **Method**: `handleLogin()`

**Flow Steps**:
```javascript
1. User enters email/username and password in login form
2. User clicks "Continue" button (loginButton)
3. Form submission triggers handleLogin() method
4. Validates input fields are not empty
5. Sets button to loading state
6. Invokes IPC: ipcRenderer.invoke('auth-login', { username, password })
7. Waits for response from main process
8. On success:
   - Shows success message
   - After 1 second delay, calls appInstance.handleLogin(result.userData)
9. On failure:
   - Shows error message
10. Resets button loading state
```

**Key Code**:
```javascript
async handleLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
        this.showMessage('Please enter both username/email and password', 'error');
        return;
    }
    
    const result = await ipcRenderer.invoke('auth-login', { 
        username: username, 
        password: password 
    });
    
    if (result.success) {
        // Call app.handleLogin() with userData
        appInstance.handleLogin(result.userData);
    }
}
```

#### **3. App Manager - `app.js`**
- **Location**: `BacterialColonyElectron/app/renderer/js/app.js`
- **Class**: `IncuCountApp`
- **Method**: `handleLogin(userData)`

**Flow Steps**:
```javascript
1. Receives userData from auth manager
2. Sets this.currentUser = userData
3. Persists session to localStorage:
   - window.Utils.setLocalStorage('incucount_current_user', userData)
4. Shows main screen: this.showScreen('main')
5. Determines dashboard to show:
   - If admin (email === 'admin' && username === 'admin'):
     → Shows admin dashboard
   - Else:
     → Shows camera dashboard
```

**Key Code**:
```javascript
async handleLogin(userData) {
    this.currentUser = userData;
    
    // Persist session
    window.Utils.setLocalStorage('incucount_current_user', userData);
    
    this.showScreen('main');
    if (userData.email === 'admin' && userData.username === 'admin') {
        this.adminManager.showAdminDashboard();
    } else {
        await this.cameraManager.showCameraDashboard();
    }
}
```

---

### **Backend (Main Process)**

#### **4. IPC Handler - `main.js`**
- **Location**: `BacterialColonyElectron/app/main/main.js`
- **Method**: `setupLegacyHandlers()` → `auth-login` handler

**Flow Steps**:
```javascript
1. Receives IPC call: 'auth-login'
2. Extracts credentials: { username, password }
3. Calls: this.dbManager.authenticateUser(username, password)
4. Returns result to renderer process
```

**Key Code**:
```javascript
ipcMain.handle('auth-login', async (event, credentials) => {
    return await this.dbManager.authenticateUser(
        credentials.username, 
        credentials.password
    );
});
```

#### **5. Database Manager - `databaseManager.js`**
- **Location**: `BacterialColonyElectron/app/main/database/databaseManager.js`
- **Method**: `authenticateUser(usernameOrEmail, password)`

**Flow Steps**:
```javascript
1. Query database for user by username OR email:
   SELECT * FROM users WHERE username = ? OR email = ?

2. If user not found:
   → Return { success: false, message: 'Invalid credentials', userData: null }

3. Check if account is locked:
   - If locked_until exists and current time < locked_until:
     → Return { success: false, message: 'Account temporarily locked...', userData: null }

4. Verify password:
   - Uses bcrypt: verifyPassword(password, storedHash, salt)
   
5. If password valid:
   a. Reset failed attempts: UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = NOW()
   b. Log activity: await this.logActivity(user.id, 'login')
   c. Return { 
        success: true, 
        message: 'Login successful!', 
        userData: { id, username, email } 
      }

6. If password invalid:
   a. Increment failed attempts: failed_attempts + 1
   b. If failed_attempts >= 5:
      - Lock account for 15 minutes: locked_until = NOW() + 15 minutes
   c. Update database with new failed_attempts and locked_until
   d. Log activity: await this.logActivity(user.id, 'failed_login')
   e. Return appropriate error message
```

**Key Code**:
```javascript
async authenticateUser(usernameOrEmail, password) {
    // 1. Find user
    const user = await this.getQuery(
        'SELECT id, username, email, password_hash, salt, failed_attempts, locked_until 
         FROM users WHERE username = ? OR email = ?',
        [usernameOrEmail, usernameOrEmail]
    );
    
    // 2. Check if user exists
    if (!user) {
        return { success: false, message: 'Invalid credentials', userData: null };
    }
    
    // 3. Check if locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
        return { success: false, message: 'Account temporarily locked...', userData: null };
    }
    
    // 4. Verify password
    const isValid = await this.verifyPassword(password, user.password_hash, user.salt);
    
    if (isValid) {
        // 5. Success - reset counters and log
        await this.runQuery(
            'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ? WHERE id = ?',
            [new Date().toISOString(), user.id]
        );
        await this.logActivity(user.id, 'login');
        
        return {
            success: true,
            message: 'Login successful!',
            userData: { id: user.id, username: user.username, email: user.email }
        };
    } else {
        // 6. Failed - increment attempts
        const newFailedAttempts = user.failed_attempts + 1;
        let lockedUntil = null;
        
        if (newFailedAttempts >= 5) {
            lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }
        
        await this.runQuery(
            'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
            [newFailedAttempts, lockedUntil, user.id]
        );
        await this.logActivity(user.id, 'failed_login');
        
        return { success: false, message: 'Invalid credentials...', userData: null };
    }
}
```

#### **6. Activity Logging**
- **Method**: `logActivity(userId, actionType, ...)`
- **Log Entry**: Creates entry in `activity_logs` table with:
  - `user_id`: User ID
  - `action_type`: 'login' or 'failed_login'
  - `timestamp`: Current timestamp

---

## 📋 **SIGN OUT FLOW**

### **Frontend (Renderer Process)**

#### **1. App Manager - `app.js`**
- **Location**: `BacterialColonyElectron/app/renderer/js/app.js`
- **Method**: `handleLogout()`

**Flow Steps**:
```javascript
1. User clicks "Back" button (or closes window)
2. Triggers handleLogout() method
3. If currentUser exists:
   - Invokes IPC: ipcRenderer.invoke('auth-logout', this.currentUser.id)
   - Note: This handler may not be implemented in main process
4. Clears currentUser: this.currentUser = null
5. Removes persisted session from localStorage:
   - window.Utils.removeLocalStorage('incucount_current_user')
6. Shows auth screen: this.showScreen('auth')
```

**Key Code**:
```javascript
async handleLogout() {
    if (this.currentUser) {
        await ipcRenderer.invoke('auth-logout', this.currentUser.id);
    }
    
    this.currentUser = null;
    window.Utils.removeLocalStorage('incucount_current_user');
    this.showScreen('auth');
}
```

#### **2. Session Persistence**
- **Location**: `app.js` → `handleLogin()` and `handleLogout()`
- **Storage**: localStorage via `window.Utils.setLocalStorage()` / `removeLocalStorage()`
- **Key**: `'incucount_current_user'`
- **Purpose**: Restore session on app restart (within same window lifecycle)

---

### **Backend (Main Process)**

#### **3. Database Manager - `databaseManager.js`**
- **Method**: `logLogout(userId)`
- **Note**: Currently only logs the activity, doesn't handle IPC directly

**Flow Steps**:
```javascript
1. Receives userId
2. Calls: await this.logActivity(userId, 'logout')
3. Creates log entry in activity_logs table
```

**Key Code**:
```javascript
async logLogout(userId) {
    await this.logActivity(userId, 'logout');
}
```

#### **4. Missing IPC Handler**
- **Issue**: The `auth-logout` IPC handler is NOT implemented in `main.js`
- **Current State**: The renderer calls `ipcRenderer.invoke('auth-logout', userId)` but there's no handler
- **Expected Handler** (should be added):
```javascript
ipcMain.handle('auth-logout', async (event, userId) => {
    try {
        await this.dbManager.logLogout(userId);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
```

---

## 📊 **FLOW DIAGRAMS**

### **Sign In Flow**
```
User Input (index.html)
    ↓
AuthManager.handleLogin() (auth.js)
    ↓
ipcRenderer.invoke('auth-login', credentials)
    ↓
IPC: 'auth-login' Handler (main.js)
    ↓
DatabaseManager.authenticateUser() (databaseManager.js)
    ↓
[Database Query] → [Password Verification]
    ↓
[Log Activity: 'login' or 'failed_login']
    ↓
Return Result
    ↓
AppManager.handleLogin(userData) (app.js)
    ↓
[Persist to localStorage]
    ↓
Show Main Screen / Dashboard
```

### **Sign Out Flow**
```
User Action (Back button / Close)
    ↓
AppManager.handleLogout() (app.js)
    ↓
ipcRenderer.invoke('auth-logout', userId) [⚠️ Handler Missing]
    ↓
[Clear currentUser]
    ↓
[Remove from localStorage]
    ↓
Show Auth Screen
```

---

## 🔑 **KEY COMPONENTS**

### **IPC Channels**
- `auth-login` ✅ Implemented
- `auth-logout` ❌ **NOT Implemented** (handler missing)

### **Database Tables**
- **users**: Stores user credentials and login state
- **activity_logs**: Stores login/logout/failed_login events

### **Session Management**
- **Frontend**: localStorage (`incucount_current_user`)
- **Backend**: SQLite database (users.last_login)

### **Security Features**
- Password hashing with bcrypt + salt
- Failed login attempt tracking (max 5 attempts)
- Account locking (15 minutes after 5 failed attempts)
- Activity logging for audit trail

---

## 🐛 **KNOWN ISSUES**

1. **Missing Logout Handler**: The `auth-logout` IPC handler is not implemented in `main.js`
   - **Impact**: Logout activity is not logged to database
   - **Fix**: Add handler in `setupLegacyHandlers()` method

2. **Session Restoration**: Session is restored from localStorage on app init
   - **Location**: `app.js` → `init()` method
   - **Note**: This happens automatically without re-authentication

---

## 📝 **RECOMMENDATIONS**

1. **Add Logout Handler**: Implement `auth-logout` IPC handler in `main.js`
2. **Token-based Auth**: Consider implementing JWT tokens for better session management
3. **Session Expiry**: Add session timeout functionality
4. **Refresh Tokens**: Implement token refresh mechanism
5. **Better Error Handling**: Add more detailed error messages for different failure scenarios

