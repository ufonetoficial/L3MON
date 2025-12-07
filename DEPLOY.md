# L3MON Deployment Guide

## 🚀 Deploy to Railway

Railway is the recommended platform for deploying L3MON as it supports WebSockets natively.

### Prerequisites

1. A [Railway](https://railway.app) account
2. [Git](https://git-scm.com/) installed locally
3. [Railway CLI](https://docs.railway.app/develop/cli) (optional, for CLI deployment)

### Step 1: Prepare Your Repository

1. Initialize git (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Push to GitHub (or any git provider):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/l3mon.git
   git push -u origin main
   ```

### Step 2: Deploy on Railway

#### Option A: Via Railway Dashboard (Recommended)

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Connect your GitHub account and select the L3MON repository
5. Railway will auto-detect the configuration and start deploying

#### Option B: Via Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Deploy
railway up
```

### Step 3: Configure Environment Variables

In Railway Dashboard:

1. Go to your project → **Variables**
2. Add these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-set by Railway) | `3000` |
| `NODE_ENV` | Environment | `production` |

### Step 4: Get Your Public URL

1. In Railway Dashboard, go to **Settings** → **Domains**
2. Click **"Generate Domain"** to get a `.railway.app` URL
3. Or add a custom domain

Your L3MON server will be available at:
- `https://your-app-name.railway.app`

### Step 5: Build APK for Your Railway Server

1. Open your L3MON dashboard: `https://your-app-name.railway.app`
2. Login with your credentials
3. Go to **APK Builder**
4. The URL will be auto-populated with your Railway domain
5. Select **https://** protocol
6. Port should be **443** (or leave empty for default HTTPS)
7. Click **Build APK**
8. Download and install the APK on target devices

---

## 🖥️ Local Development

### Prerequisites

- Node.js 18+ 
- Java 17+ (OpenJDK recommended)
- npm or yarn

### Installation

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/l3mon.git
cd l3mon

# Install dependencies
npm install

# Create maindb.json with your credentials
# Use MD5 hash for password
cp maindb.json.example maindb.json
# Edit maindb.json with your username and password

# Start server
npm start
```

### Generate MD5 Password Hash

```bash
# Linux/Mac
echo -n "your_password" | md5sum

# Windows PowerShell
$md5 = [System.Security.Cryptography.MD5]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes("your_password")
$hash = $md5.ComputeHash($bytes)
[BitConverter]::ToString($hash).Replace("-","").ToLower()

# Or use Node.js
node -e "console.log(require('crypto').createHash('md5').update('your_password').digest('hex'))"
```

### Access Local Server

- Dashboard: `http://localhost:22533`
- Socket: `ws://localhost:22533` (same port)

---

## 🔧 Configuration

### maindb.json Structure

```json
{
  "admin": {
    "username": "admin",
    "password": "MD5_HASH_OF_PASSWORD",
    "loginToken": ""
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `22533` | Server port |
| `CONTROL_PORT` | `22533` | Control panel port (legacy) |
| `SOCKET_PORT` | `22222` | Socket port (legacy, now same as PORT) |
| `NODE_ENV` | `development` | Environment mode |
| `RAILWAY_PUBLIC_DOMAIN` | - | Auto-set by Railway |

---

## 🐳 Docker Deployment

### Using Docker Compose

```yaml
version: '3.8'
services:
  l3mon:
    build: .
    ports:
      - "22533:22533"
    volumes:
      - ./maindb.json:/app/maindb.json
      - ./clientData:/app/clientData
    environment:
      - PORT=22533
      - NODE_ENV=production
```

### Using Dockerfile

```bash
docker build -t l3mon -f L3mon_Dockerfile .
docker run -d -p 22533:22533 --name l3mon l3mon
```

---

## 📱 APK Building Notes

### HTTPS Requirements

When using HTTPS (Railway, Heroku, etc.):
- The APK will connect via `https://` 
- Port 443 is used by default
- No need to open firewall ports

### HTTP (Local Network)

When using HTTP locally:
- Specify your local IP (e.g., `192.168.1.100`)
- Specify your port (e.g., `22533`)
- Make sure firewall allows the port

### Java Version

The APK builder requires Java 17 or higher. Railway's nixpacks configuration includes OpenJDK 17.

---

## 🔒 Security Notes

1. **Never commit `maindb.json`** with real credentials
2. Use strong passwords (12+ characters)
3. For production, always use HTTPS
4. Consider IP whitelisting if possible
5. Regularly rotate your login credentials

---

## 📝 Troubleshooting

### Build Failed - Java Not Found

Make sure Java 17+ is installed and in PATH:
```bash
java -version
```

### APK Won't Connect

1. Check the URL in APK builder is correct
2. For Railway, ensure you're using `https://` with port 443
3. Check Railway logs for connection errors

### Socket Connection Issues

Railway uses a single port for both HTTP and WebSocket. The app is configured to work with this setup automatically.

---

## 📄 License

MIT License - See LICENSE file for details
