# ⚡ Quick Start: Connect Wisp Bot to Vercel Panel

## **STEP 1: Find Your Wisp Bot URL** ✅

### Go to Wisp Dashboard:
1. Open your Wisp account at https://wisp.com
2. Click on your bot instance
3. Look for **"Public URL"** or **"External URL"**
4. Copy it (looks like: `https://bot-1234567.wisp.cloud`)
5. **Save it somewhere - you'll need this!**

⚠️ **Can't find it?** Check these places:
- Dashboard → Bot Name → Settings → URLs
- Dashboard → Bot Name → Console (look for URL in logs)
- Or ask Wisp support

---

## **STEP 2: Generate Security Secret** 🔐

### On Your Computer, Open Terminal/PowerShell:

```powershell
# Copy and paste this command:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**You'll get something like:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0
```

**Copy this entire string and save it** - you'll need it for Vercel!

---

## **STEP 3: Update Your Bot's .env File** 📝

### In your local project (`/bot/.env`):

Add these lines at the end (if they don't exist):

```env
BOT_API_URL=https://bot-1234567.wisp.cloud/api
BOT_API_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0
PANEL_API_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0
```

**Replace:**
- `bot-1234567.wisp.cloud` with your actual Wisp URL
- `a1b2c3...` with the secret you just generated

---

## **STEP 4: Push to Vercel** 🚀

### In Your Terminal:

```powershell
cd "c:\EU Tuning Crew ETC"
git add .
git commit -m "Connect Wisp bot to Vercel panel"
git push origin main
```

**Wait 2-3 minutes** for Vercel to deploy automatically.

---

## **STEP 5: Set Vercel Environment Variables** ⚙️

### Go to Vercel Dashboard:

1. Open https://vercel.com/dashboard
2. Click on your project (EU Tuning Crew or similar)
3. Click **Settings** (top menu)
4. Click **Environment Variables** (left sidebar)
5. Click **Add New**

### Add These Variables (one by one):

**Variable 1:**
- Name: `BOT_API_URL`
- Value: `https://bot-1234567.wisp.cloud/api` (your Wisp URL)
- Click **Add**

**Variable 2:**
- Name: `BOT_API_SECRET`
- Value: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0` (your secret)
- Click **Add**

**Variable 3:**
- Name: `WISPBYTE_BOT_API_URL`
- Value: `https://bot-1234567.wisp.cloud/api` (same as Variable 1)
- Click **Add**

**Variable 4:**
- Name: `PANEL_API_SECRET`
- Value: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0` (same as Variable 2)
- Click **Add**

---

## **STEP 6: Redeploy on Vercel** 🔄

### After adding all variables:

1. Click **Deployments** (top menu)
2. Find the latest deployment
3. Click the 3 dots **...** menu
4. Click **Redeploy**
5. Wait for it to finish (1-2 minutes)

---

## **STEP 7: Test the Connection** ✅

### Go to Your Panel:

1. Open your Vercel URL: `https://your-project.vercel.app/api/panel`
2. Click **Login**
3. Select **Admin**
4. Enter password: `etc-panel`
5. If you see **Bot Status** showing numbers, it worked! ✓

### If it shows "BOT_API_URL missing":
- Vercel didn't reload
- Go back to Deployments and redeploy again
- Wait 2 minutes and refresh

### If it shows "Connection Error":
- Your Wisp URL is wrong
- Wisp bot is offline (restart it)
- Wisp doesn't have the API endpoints (see Step 8)

---

## **STEP 8: Make Sure Wisp Bot Has API Endpoints** 🔌

### Check if your bot has these endpoints:

In your `bot/src/index.js`, find or add these functions:

```javascript
// Check if this code exists in your bot:

// Endpoint 1 - Get bot status
app.get("/api/panel-state", (req, res) => {
  res.json({
    config: botConfig,
    stats: {
      botTag: client.user?.tag || "Unknown",
      guilds: client.guilds.cache.size,
      openTickets: Object.keys(tickets).length || 0,
      activeWarns: Object.keys(warnings).length || 0
    }
  });
});

// Endpoint 2 - Update configuration
app.post("/api/panel-config", (req, res) => {
  const { config: configPatch } = req.body;
  if (!configPatch) {
    return res.status(400).json({ error: "No config provided" });
  }
  Object.assign(botConfig, configPatch);
  saveConfig(botConfig);
  res.json({ success: true });
});
```

**If they're NOT there:**
- Add them to your bot code
- Deploy to Wisp
- Try panel login again

---

## **STEP 9: Verify Everything Works** 🎉

### Test these in your browser:

**Test 1 - Check if Wisp API is responding:**
```
https://bot-1234567.wisp.cloud/api/panel-state
```
Should show JSON with bot stats

**Test 2 - Check if Panel Can See Bot:**
```
https://your-vercel-project.vercel.app/api/panel?panelPath=/login
```
Should show login page

---

## **Troubleshooting Quick Fixes** 🔧

| Problem | Solution |
|---------|----------|
| **Panel shows "BOT_API_URL missing"** | Redeploy on Vercel after adding env vars |
| **Panel shows "Connection Error"** | Check Wisp URL is correct and bot is running |
| **Can't login to panel** | Check password in `.env` (default: `etc-panel`) |
| **Settings don't save** | Check API endpoints exist in bot code |
| **Wisp bot is offline** | Restart bot in Wisp dashboard |

---

## **Testing with Commands** 💻

### Once connected, test with curl (PowerShell):

```powershell
# Test Wisp API
Invoke-WebRequest -Uri "https://bot-1234567.wisp.cloud/api/panel-state" | ConvertFrom-Json

# Test Vercel Panel
Invoke-WebRequest -Uri "https://your-vercel-project.vercel.app/api/panel?panelPath=/login"
```

---

## **Done! 🎊**

Your Wisp bot is now connected to your Vercel panel!

**What happens now:**
- Panel reads bot config from Wisp
- Panel changes appear in Vercel
- Bot auto-loads new config
- Everything syncs automatically

**You can now:**
- ✅ Login to panel at `https://your-vercel-project.vercel.app/api/panel`
- ✅ Change bot settings
- ✅ Enable/disable features
- ✅ See bot stats in real-time
- ✅ Manage modmail, tickets, auto-mod

---

## **Need More Help?**

Message me with:
1. What step you're stuck on
2. What error you see
3. Your Wisp URL (don't share the secret!)
