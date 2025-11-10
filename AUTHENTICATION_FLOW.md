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
6. Calls API service: window.apiService.login(username, password)
7. Waits for HTTP response from backend
8. On success:
   - Shows success message
   - After 1 second delay, calls appInstance.handleLogin(result.userData, result.token)
9. On failure:
   - Shows error message
10. Resets button loading state
```

**Key Code**:
```javascript
async handleLogin() {
    const result = await window.apiService.login(username, password);

    if (result.success) {
        appInstance.handleLogin(result.userData, result.token);
    } else {
        this.showMessage(result.message, 'error');
    }
}
```

#### **3. API Service - `api.js`**
- **Location**: `BacterialColonyElectron/app/renderer/js/api.js`
- **Class**: `APIService`
- **Role**: Wraps fetch calls to REST backend, automatically attaching the persisted JWT token (Authorization header) when present.

```javascript
const storedToken = Utils.getLocalStorage('incucount_auth_token', null);
if (storedToken) {
    defaultOptions.headers.Authorization = `Bearer ${storedToken}`;
}
```

#### **4. App Manager - `app.js`**
- **Location**: `BacterialColonyElectron/app/renderer/js/app.js`
- **Class**: `IncuCountApp`
- **Method**: `handleLogin(userData)`

**Flow Steps**:
```javascript
1. Receives userData and optional token from auth manager
2. Builds `sessionUser` object and persists fresh token (if provided) under `incucount_auth_token`
3. Persists sessionUser to localStorage under `incucount_current_user`
4. Shows main screen: this.showScreen('main')
5. Determines dashboard to show:
   - If admin (email === 'admin' && username === 'admin'):
     → Shows admin dashboard
   - Else:
     → Shows camera dashboard
```

**Key Code**:
```javascript
async handleLogin(userData, token = null) {
    const sessionUser = { ...userData };
    if (token) {
        sessionUser.token = token;
        window.Utils.setLocalStorage('incucount_auth_token', token);
    }
    this.currentUser = sessionUser;
    window.Utils.setLocalStorage('incucount_current_user', sessionUser);
    
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
Backend authentication is now handled entirely by the Express/Mongo service:

#### **5. Backend Controller - `Backend/controllers/authController.js`**
- Validates credentials, enforces lockout logic, and on success issues a JWT:

```javascript
const token = createAuthToken(user);
res.status(200).json({
    success: true,
    message: 'Login successful!',
    userData: { ... },
    token
});
```

#### **6. Activity Logging**
- **Model**: `Backend/models/logs.js`
- **Entry**: Uses MongoDB to persist login/failed-login/logout events.

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
   - window.Utils.removeLocalStorage('incucount_auth_token')
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
- `auth-login` ⛔️ Legacy IPC call, superseded by REST API (`/auth/login`)
- `auth-logout` ⛔️ Legacy IPC call, superseded by REST API (`/auth/logout`)

### **Database Tables**
- **MongoDB `users` collection**: Stores user credentials and login state
- **MongoDB `logs` collection**: Stores login/logout/failed_login events

### **Session Management**
- **Frontend**: localStorage (`incucount_current_user` plus `incucount_auth_token`)
- **Backend**: MongoDB (users.last_login, lock metadata)

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

- **Token refresh & expiry**: Introduce refresh tokens or silent re-auth when JWT nears expiration.
- **Guarded API requests**: Ensure backend enforces Authorization header on protected routes.
- **Session expiry UX**: Add UI prompts when token is invalid/expired.
- **Improved offline handling**: Decide how the app should behave when API is unreachable but cached token exists.

