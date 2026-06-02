# 🚀 Connecting Wisp-Hosted Bot with Vercel Panel

## Overview
Your Discord bot runs on **Wisp** (bot hosting), while the control panel is hosted on **Vercel**. They communicate through an API bridge.

---

## **Step 1: Get Your Wisp Bot API Credentials**

### 1.1 From Wisp Dashboard:
1. Go to your Wisp dashboard
2. Find your bot instance
3. Look for **API Key** or **Bot Token**
4. Note down:
   - Bot Token (already in your `.env`)
   - Wisp API Key (if available)

### 1.2 Create an API Secret (for security):
```bash
# Generate a random secret on your local machine
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Save this value - you'll need it for Vercel environment variables.

---

## **Step 2: Set Up Vercel Environment Variables**

### 2.1 Go to Vercel Project Settings:
1. Open [vercel.com/dashboard](https://vercel.com/dashboard)
2. Find your project (likely named after your bot)
3. Go to **Settings → Environment Variables**

### 2.2 Add These Variables:

```env
# Discord Bot Credentials
DISCORD_TOKEN=MTQ4MzM4OTc0NjkyMjM5MzcyMA.GP37Ou.tEsSH-y6VqV5xoGGnrimjgGTUYINE5jeOM7MxQ
CLIENT_ID=1483389746922393720

# Panel Passwords
PANEL_PASSWORD=etc-panel
OWNER_PASSWORD=your-secure-owner-password
ADMIN_PASSWORD=your-secure-admin-password

# ⭐ IMPORTANT: Wisp Bot Connection
BOT_API_URL=https://your-wisp-bot-url/api
BOT_API_SECRET=your-generated-api-secret
WISPBYTE_BOT_API_URL=https://your-wisp-bot-url/api
PANEL_API_SECRET=your-generated-api-secret

# Panel Configuration
COOKIE_SECRET=your-cookie-secret
BOT_PANEL_PORT=3002
```

### 2.3 Where to Find Wisp Bot URL:
- Check your Wisp dashboard for the bot's public URL
- It usually looks like: `https://bot-name-123.wisp.cloud` or similar
- Or check your `.env` file in the Wisp project for `BOT_API_URL`

---

## **Step 3: Configure Wisp Bot to Expose API**

### 3.1 In Your Wisp Bot (`/bot/src/index.js`):

The bot already has endpoints for this. Make sure these exist:

```javascript
// API endpoint to get panel state
app.get("/api/panel-state", (req, res) => {
  res.json({
    config: botConfig,
    stats: {
      botTag: client.user?.tag || "Unknown",
      guilds: client.guilds.cache.size,
      openTickets: Object.keys(tickets).length,
      activeWarns: Object.keys(warnings).length
    }
  });
});

// API endpoint to update config
app.post("/api/panel-config", (req, res) => {
  const { config: configPatch } = req.body;
  Object.assign(botConfig, configPatch);
  saveConfig(botConfig);
  res.json({ success: true });
});
```

### 3.2 Verify Server Endpoints:
```bash
# Test if your bot API is accessible
curl https://your-wisp-bot-url/api/panel-state
```

---

## **Step 4: Deploy to Vercel**

### 4.1 Push Changes:
```bash
git add .
git commit -m "Add feature configurations and Wisp API connection"
git push origin main
```

### 4.2 Vercel Auto-Deploy:
- Vercel will automatically redeploy when you push to main
- Check deployment status at vercel.com/dashboard

### 4.3 Verify Panel Access:
```
https://your-vercel-project.vercel.app/api/panel
```

---

## **Step 5: Testing the Connection**

### 5.1 Test Login:
1. Go to your Vercel URL
2. Click "Login" in the panel
3. Enter credentials (admin or owner)
4. If successful, you should see bot stats

### 5.2 If Stats Show "Connection Error":

**Issue**: `BOT_API_URL missing` or connection failed

**Solutions**:
1. ✅ Check Vercel environment variables are set correctly
2. ✅ Verify Wisp bot URL is accessible and public
3. ✅ Ensure `BOT_API_SECRET` matches what's expected by Wisp bot
4. ✅ Check Wisp firewall/security settings allow external requests
5. ✅ Verify Wisp bot server is running

### 5.3 Check Logs:
- **Vercel logs**: `vercel.com/dashboard → Deployments → Logs`
- **Wisp logs**: Check your Wisp dashboard console

---

## **Step 6: Communication Flow**

```
Discord Server
     ↓
Discord Bot (Wisp)
     ↓ (API calls)
Vercel Panel
     ↓ (Reads/Writes config)
Wisp Bot Database (/bot/data/)
```

### Data Flow:
1. **Reading Config**: Panel → Bot API → Wisp Bot reads `/bot/data/config.json`
2. **Updating Config**: Panel → Bot API → Wisp Bot writes to `/bot/data/config.json`
3. **Getting Stats**: Panel → Bot API → Wisp Bot returns current stats

---

## **Step 7: Troubleshooting**

### Panel Shows "0 Guilds":
- Bot API is connected but bot isn't in any servers
- Have the bot join your server via Discord Developer Portal

### Config Changes Don't Save:
- Check API Secret matches between Vercel and Wisp
- Verify `/bot/data/` directory has write permissions
- Check Wisp bot console for errors

### Connection Timeout:
- Wisp bot server might be offline
- Check Wisp dashboard - restart bot if needed
- Verify firewall allows HTTPS requests on port 443

### CORS Issues:
Add CORS headers to your Wisp bot API:
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});
```

---

## **Step 8: Security Best Practices**

### 🔒 Passwords:
- Use strong, unique passwords for Owner and Admin
- Change them periodically
- Don't share `.env` files

### 🔐 API Secret:
- Generate using cryptographic methods
- Keep it secret - don't commit to Git
- Use Vercel's secret environment variables

### 🛡️ Bot Permissions:
- Only grant needed permissions in Discord
- Use role-based access (Owner vs Admin)
- Monitor panel access logs

### ✅ HTTPS Only:
- Always use HTTPS for panel access
- Never expose API over HTTP
- Enable secure cookies in production

---

## **Step 9: Useful Curl Commands for Testing**

```bash
# Test panel state endpoint
curl -H "Authorization: Bearer YOUR_API_SECRET" \
  https://your-wisp-bot-url/api/panel-state

# Update config remotely
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -d '{"config": {"activityText": "New Activity"}}' \
  https://your-wisp-bot-url/api/panel-config

# Test Vercel panel
curl https://your-vercel-project.vercel.app/api/panel?panelPath=/login
```

---

## **Step 10: Advanced - Custom Bot API Endpoints**

If you want to add more endpoints, add to your Wisp bot:

```javascript
// Get server info
app.get("/api/servers", (req, res) => {
  const servers = client.guilds.cache.map(g => ({
    id: g.id,
    name: g.name,
    members: g.memberCount
  }));
  res.json(servers);
});

// Get user stats
app.get("/api/stats", (req, res) => {
  res.json({
    botUptime: client.uptime,
    serverCount: client.guilds.cache.size,
    userCount: client.users.cache.size,
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
    cpuUsage: process.cpuUsage()
  });
});
```

---

## **Quick Reference**

| Component | Location | Port |
|-----------|----------|------|
| **Bot** | Wisp Cloud | Custom |
| **Panel UI** | Vercel | 443 (HTTPS) |
| **Panel API** | Vercel | 443 (HTTPS) |
| **Bot Config** | Wisp `/bot/data/` | N/A |
| **Panel Data** | Vercel Serverless | N/A |

---

## **Need Help?**

1. Check Vercel deployment logs
2. Check Wisp bot console
3. Verify all environment variables
4. Test API endpoints with curl
5. Ensure both services are running
6. Check firewall/network settings

Good luck! 🚀
