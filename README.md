# EU Tuning Crew

Run the site locally with live TrucksBook km:

```powershell
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Discloud Bot Setup

A separate Discloud-ready bot project now lives in [bot](C:/EU%20Tuning%20Crew%20ETC/bot).

Files:

- [bot/discloud.config](C:/EU%20Tuning%20Crew%20ETC/bot/discloud.config)
- [bot/package.json](C:/EU%20Tuning%20Crew%20ETC/bot/package.json)
- [bot/src/index.js](C:/EU%20Tuning%20Crew%20ETC/bot/src/index.js)
- [bot/.env.example](C:/EU%20Tuning%20Crew%20ETC/bot/.env.example)

To prepare it:

1. Copy `bot/.env.example` to `bot/.env`
2. Put your bot token in `DISCORD_TOKEN`
3. Put your application ID in `CLIENT_ID`
4. Zip the contents of the `bot` folder
5. Upload that zip to Discloud with `.upconfig`

This bot is only a starter scaffold for now. It includes:

- `/ping`
- `/status`
- `/panel`
- Discloud root config
- auto install and start commands

### Website And Bot Panel Run Mode

You can now start the website and bot panel together from VS Code with `Run Without Debugging` by choosing:

- `Run ETC Website + Bot Panel`

Then open:

```text
http://localhost:3000
http://localhost:3000/login
```

### Modmail

The bot now has a basic modmail flow:

- members can DM the bot
- the bot explains what to do
- the member can press `Open Modmail`
- the bot creates a modmail channel in your configured server
- the member and staff can talk through the bot
- the member or staff can close modmail with `./close modmail` or `/close modmail`
- closed modmail channels delete themselves

Before modmail works, put these in the bot panel:

- `Modmail guild ID`
- optional `Modmail category ID`
- optional `Modmail panel channel`, then run `/modmail panel` in Discord

No-ping can be set up in Discord with `/noping setup role:@your-staff-role`.
