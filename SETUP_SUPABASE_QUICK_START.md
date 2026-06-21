# Quick Setup Guide: Supabase Storage for Material Attachments

## 1. Install Dependencies

```bash
cd backend
pip install --upgrade -r requirements.txt
```

## 2. Set Up Supabase (If Not Already Done)

### If you have a Supabase account:

**Get your credentials:**
1. Go to your Supabase project: https://app.supabase.com
2. Click **Project Settings** (gear icon)
3. Click **API** tab
4. Copy your **Project URL** (This is SUPABASE_URL)
5. Scroll down to **Service role secret** and copy it (This is SUPABASE_SERVICE_KEY)
6. ⚠️ **NEVER commit the service key to git!**

**Create the storage bucket:**
1. Go to **Storage** tab in Supabase
2. Click **+ Create a new bucket**
3. Name it: `classnest-uploads`
4. Toggle off "Public bucket" (keep it private)
5. Click **Create bucket**

### If you don't have a Supabase account:

1. Go to https://supabase.com and sign up (free tier available)
2. Create a new project
3. Follow steps above

## 3. Configure Environment Variables

Edit `backend/.env` and add:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-secret-key-here
SUPABASE_BUCKET=classnest-uploads
```

**Replace** `your-project-id` and `your-service-role-secret-key-here` with your actual values.

## 4. Test Locally

```bash
cd backend
python -m uvicorn main:app --reload
```

Then:
1. Create a material in ClassNest UI
2. Upload an attachment
3. Check that the file was uploaded to Supabase Storage (Dashboard → Storage → classnest-uploads)
4. Download the attachment - it should work!

## 5. Deploy to Render

1. Go to your Render service dashboard
2. Click **Environment** tab
3. Add these environment variables:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-secret-key-here
   SUPABASE_BUCKET=classnest-uploads
   ```
4. Click **Save Changes** (service will auto-redeploy)
5. Check logs to see "✅ Database ready"
6. Test by uploading and downloading a material

## 6. Verify It Works

- ✅ Upload a material with attachment
- ✅ See file in Supabase Storage dashboard
- ✅ Download the file from ClassNest
- ✅ Restart Render service
- ✅ Try downloading again - file should still work!

## Rollback to Local Storage

If you need to revert to local storage:

1. Remove or comment out the Supabase env vars in `.env`
2. Restart the backend
3. New uploads will use local storage
4. Existing Supabase uploads will still be in Supabase (but new ones won't)

## For Development Without Supabase

Just leave out the Supabase env vars:

```bash
# Don't add SUPABASE_URL or SUPABASE_SERVICE_KEY
# Files will be saved to backend/uploads/materials/
```

## Troubleshooting

### "Failed to initialize Supabase client"

- Check that SUPABASE_URL and SUPABASE_SERVICE_KEY are correct
- Make sure there are no extra spaces
- Verify bucket name is exactly `classnest-uploads`

### Upload fails

- Check Supabase service key is valid (not expired)
- Verify bucket exists and is private
- Check file size is under 10MB

### Download returns 404

- Check if file exists in Supabase Storage dashboard
- Verify you're logged in and have access
- Try re-uploading the file

## Next Steps

1. Read [SUPABASE_STORAGE_MIGRATION.md](./SUPABASE_STORAGE_MIGRATION.md) for detailed docs
2. Test uploading and downloading files
3. Deploy to production
4. Monitor uploads in Supabase dashboard

**Done! Your ClassNest attachments are now persistent!** 🎉
