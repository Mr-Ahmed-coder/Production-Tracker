# Local MongoDB setup

ProdTrack uses the locally installed MongoDB Windows service. No Atlas account is needed.

Verified on 22 October 2026: the MongoDB Windows service is running, the application initializes its model indexes successfully, the database responds to ping, and the normal backend health endpoint reports `database: "connected"`.

The ignored `backend/.env` contains:

```dotenv
PORT=4000
NODE_ENV=development
CLIENT_ORIGIN=http://127.0.0.1:5173
MONGODB_URI=mongodb://127.0.0.1:27017/prodtrack
```

Start the app from PowerShell:

```powershell
cd "C:\Users\HP\OneDrive\Desktop\Production Track\ProdTrack"
npm run dev
```

Open http://127.0.0.1:5173 and register your account. Accounts and productivity records are stored in the local `prodtrack` database and remain after restarting the app. The installed MongoDB service manages the database files; ProdTrack does not replace or clear them.

If you use MongoDB Compass, connect with `mongodb://127.0.0.1:27017` and select `prodtrack`.

To check the service:

```powershell
Get-Service MongoDB
```

If it is stopped, start it from an administrator PowerShell window:

```powershell
Start-Service MongoDB
```

Use `npm run dev` for normal work. The `dev:isolated` helper is only for disposable QA; its test accounts and records are separate from this persistent database.
