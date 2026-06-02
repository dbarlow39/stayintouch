# Compiled Paperwork Sync — Local Agent

Scans Gmail for emails with subject `Compiled Paperwork for <address>`,
compares against `C:\Users\dbarl\Dropbox\0 Sell for 1 Percent\Closed Deals`,
and for anything missing: saves every PDF attachment to a new subfolder,
uploads to Commission Central, auto-parses with AI, and inserts a closing
row with **Paperwork Received** marked.

## One-time setup

1. **Install Python 3.10+** from https://www.python.org/downloads/
   (during install, check **Add Python to PATH**).

2. **Install the one dependency** (open Command Prompt):
   ```
   pip install requests
   ```

3. **Copy this folder** to your PC, e.g. `C:\Tools\compiled-sync\`.

4. **Log in once** (this caches your credentials securely under `%APPDATA%\compiled-sync\`):
   ```
   cd C:\Tools\compiled-sync
   python compiled_paperwork_sync.py --login
   ```
   Enter your normal Commission Central email + password.

5. **Initial backfill run** (catches up any missing emails from last 90 days):
   ```
   python compiled_paperwork_sync.py
   ```
   Watch the output — every saved file and every created closing is logged.

## Schedule for 7am and 7pm daily

Open **Task Scheduler** (Win+R → `taskschd.msc`), then:

1. **Action → Create Task…**
2. **General** tab:
   - Name: `Compiled Paperwork Sync - Morning`
   - Check **Run whether user is logged on or not**
   - Check **Run with highest privileges**
3. **Triggers** tab → **New…**
   - Begin: **On a schedule**, Daily, Start time **7:00 AM**, Recur every 1 day.
4. **Actions** tab → **New…**
   - Program/script: `pythonw.exe`  *(use pythonw to run silently with no console window)*
   - Add arguments: `compiled_paperwork_sync.py`
   - Start in: `C:\Tools\compiled-sync`
5. **Conditions** tab: uncheck **Start the task only if the computer is on AC power** if it's a laptop.
6. Click **OK**, enter your Windows password.

Repeat steps 1–6 for the evening run:
- Name: `Compiled Paperwork Sync - Evening`
- Trigger start time: **7:00 PM**

## Where things go

| What | Where |
|---|---|
| Cached login token | `%APPDATA%\compiled-sync\token.json` |
| Run log | `%APPDATA%\compiled-sync\sync.log` |
| Print queue list | `C:\Users\dbarl\Dropbox\0 Sell for 1 Percent\Closed Deals\to_print.txt` |
| Downloaded PDFs | `…\Closed Deals\<property address>\<original filename>` |

## Troubleshooting

- **"No token file" / "Token refresh failed"** → re-run `python compiled_paperwork_sync.py --login`.
- **"Gmail not connected"** → reconnect Gmail in the Commission Central app first.
- **Nothing happens at scheduled time** → in Task Scheduler, open the task and check the **History** tab. Verify Start in folder is set correctly.
- **A closing was created but fields are wrong** → AI parsing isn't perfect; open the closing in Commission Central and edit. The PDFs are already attached.
